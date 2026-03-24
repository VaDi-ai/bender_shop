/**
 * lib/avito-sync.ts — Маппинг Avito объявлений ↔ Google Sheets и синхронизация цен
 */
import { prisma } from './prisma'
import { getAvitoItems, updateAvitoPrice, isAvitoConfigured } from './avito'
import { readSheet, getSheetNames } from './google-sheets'
import { mapHeaders } from './sheets-sync'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SheetProduct {
  rowIndex: number
  sheetName: string
  fullName: string   // колонка E (index 4)
  color: string      // колонка F (index 5)
  memory: string     // колонка G (index 6)
  size: string       // колонка H (index 7)
  price: number      // колонка L (index 11)
}

export interface AvitoMapping {
  avitoId: number
  avitoTitle: string
  avitoPrice: number | null
  productId: number | null
  productName: string | null
  confidence: 'exact' | 'fuzzy' | 'none'
  score: number
  sheetMatch: {
    rowIndex: number
    sheetName: string
    price: number
  } | null
}

// ─── Normalization & scoring ──────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[()[\].,]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/гб|gb/gi, 'gb')
    .replace(/тб|tb/gi, 'tb')
    .replace(/sim\s*\+\s*esim?/gi, '')
    .replace(/wi\s*-?\s*fi/gi, 'wifi')
    .replace(/\s*(ревизия|rev)\s*/gi, ' ')
    .replace(/go\s*pro/gi, 'gopro')
    .replace(/ray[\s-]*ban/gi, 'rayban')
    .replace(/умные\s*очки/gi, '')
    // Dyson model aliases: commercial name → article code
    .replace(/\bairwrap\b/gi, 'hs09')
    .replace(/\bsupersonic\b/gi, 'hd15')
    .trim()
}

function extractTokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter(t => t.length > 1)
    .filter(t => !['new', 'новый', 'sim', 'esim', 'strap', 'silicon', 'band', 'the', 'and'].includes(t))
}

/** Извлечь якорные токены — бренд + модель + модификация + чип */
function extractAnchorTokens(s: string): string[] {
  const norm = normalize(s)
  const anchors: string[] = []

  const brandPatterns = [
    /iphone\s*(\d+\s*)?(air|pro|max|plus|e|se|mini)?\w*/i,
    /ipad\s*(pro|air|mini)?\s*\d*/i,
    /macbook\s*(air|pro|neo)\s*\d*/i,
    /mac\s*(mini|studio)\s*\w*/i,
    /imac/i,
    /airpods\s*(pro|max)?\s*\d*/i,
    /apple\s*watch\s*(se|ultra|s\d+|series\s*\d+)\s*\d*/i,
    /apple\s*tv/i,
    /samsung\s*galaxy\s*z\s*(fold|flip)\s*\d*/i,
    /samsung\s*galaxy\s*[szaf]\d+\s*(ultra|plus|\+|fe)?/i,
    /xiaomi\s*(mi\s*)?\d+\w*/i,
    /poco\s*\w+/i,
    /redmi\s*\w+/i,
    /honor\s*\w+/i,
    /huawei\s*(mate|nova|pura|matepad)\w*/i,
    /google\s*pixel\s*\d+\w*/i,
    /oneplus\s*\d+\w*/i,
    /sony\s*(playstation|ps\d|wh-?\d|wf-?\d)\w*/i,
    /nintendo\s*switch/i,
    /steam\s*deck/i,
    /dyson\s*(airwrap|supersonic|airstrait|purifier|hs\d+|hd\d+|sv\d+|v\d+)\w*/i,
    /garmin\s*(fenix|venu|forerunner|lily|tactix|index)\s*\w*/i,
    /dji\s*(mavic|osmo|avata|mini|air|lito|mic)\s*\w*/i,
    /jbl\s*(charge|clip|flip|go|xtreme|boombox|partybox)\s*\w*/i,
    /oculus\s*quest\s*\w*/i,
    /rayban\s*(meta\s*)?(wayfarer|skyler|headliner)?\w*/i,
    /oakley\s*\w*/i,
    /beats\s*(solo|studio|powerbeats|fit|flex)\w*/i,
    /gopro\s*hero\s*\d*/i,
    /marshall\s*(emberton|kilburn|acton|major|minor|monitor|motif|middleton|tufton|willen)\w*/i,
    /whoop\s*\d*/i,
    /bowers\s*&?\s*wilkins/i,
    /medicube\s*\w*/i,
    /insta360\s*\w*/i,
    /fujifilm\s*instax\s*\w*/i,
    /hisense\s*\w*/i,
    /plaud\s*\w*/i,
  ]

  for (const pat of brandPatterns) {
    const match = norm.match(pat)
    if (match) {
      anchors.push(...match[0].trim().split(/\s+/).filter(t => t.length > 0))
      break
    }
  }

  // Fallback — первые 2-3 слова
  if (anchors.length === 0) {
    anchors.push(...norm.split(/\s+/).slice(0, 3).filter(t => t.length > 1))
  }

  // MacBook NEO: якорь только ["macbook", "neo"] — числа и чипы = конфигурация
  const isNeo = /\bneo\b/i.test(anchors.join(' '))
  if (isNeo) {
    const filtered = anchors.filter(t => !/^\d+$/.test(t))
    anchors.length = 0
    anchors.push(...filtered)
  }
  if (!isNeo) {
    // Чип/процессор — обязательный якорь (m3, m4, m5, a16, a18)
    const chipMatch = norm.match(/\b(m\d+|a\d+)\b/i)
    if (chipMatch) anchors.push(chipMatch[1].toLowerCase())
    // Модификатор чипа (Pro/Max после m4/m5) — различает M4 vs M4 Pro vs M4 Max
    const chipMod = norm.match(/\bm\d+\s+(pro|max)\b/i)
    if (chipMod) anchors.push(chipMod[1].toLowerCase())
  }

  return [...new Set(anchors)]
}

/** Извлечь конфигурационные токены — память, объём, размер экрана */
function extractConfigTokens(s: string): string[] {
  const norm = normalize(s)
  const config: string[] = []

  // Память: 128gb, 256gb, 512gb, 1tb, 12/256gb
  const memMatches = norm.match(/\b\d+(?:\/\d+)?\s*(?:gb|tb)\b/gi)
  if (memMatches) config.push(...memMatches.map(m => m.replace(/\s/g, '').toLowerCase()))

  // Размер экрана (для iPad/MacBook): 11, 13, 14, 15, 16
  if (/ipad|macbook/i.test(norm)) {
    const sizeMatch = norm.match(/\b(11|13|14|15|16)\b/)
    if (sizeMatch) config.push(sizeMatch[1])
  }

  return config
}

/** Weighted match score: 50% anchors + 30% config + 20% general tokens */
function matchScoreWeighted(avitoTitle: string, sheetName: string): number {
  const avitoAnchors = extractAnchorTokens(avitoTitle)
  const sheetAnchors = extractAnchorTokens(sheetName)

  // Якоря должны совпадать — иначе это разные товары
  const anchorMin = Math.min(avitoAnchors.length, sheetAnchors.length)
  if (anchorMin === 0) return 0
  const anchorOverlap = avitoAnchors.filter(t => sheetAnchors.includes(t)).length
  const anchorScore = anchorOverlap / anchorMin
  if (anchorScore < 0.7) return 0  // MacBook ≠ AirPods

  // Конфигурация (память, размер) — различает 128gb vs 256gb
  const avitoConfig = extractConfigTokens(avitoTitle)
  const sheetConfig = extractConfigTokens(sheetName)
  let configScore = 1.0
  if (avitoConfig.length > 0 && sheetConfig.length > 0) {
    const configOverlap = avitoConfig.filter(t => sheetConfig.includes(t)).length
    configScore = configOverlap / Math.max(avitoConfig.length, sheetConfig.length)
  }

  // Общие токены — цвет, страна, год (бонус)
  const allAvito = extractTokens(avitoTitle)
  const allSheet = extractTokens(sheetName)
  const allOverlap = allAvito.filter(t => allSheet.includes(t)).length
  const allScore = allOverlap / Math.max(allAvito.length, allSheet.length)

  return anchorScore * 0.5 + configScore * 0.3 + allScore * 0.2
}

// ─── Load sheet data ──────────────────────────────────────────────────────────

async function loadSheetProducts(): Promise<SheetProduct[]> {
  const allSheets = await getSheetNames()
  const sheetName = allSheets[0]
  if (!sheetName) return []

  const data = await readSheet(sheetName)
  if (data.length === 0) return []

  const COL = mapHeaders(data[0])
  const items: SheetProduct[] = []

  for (let i = 1; i < data.length; i++) {
    const row = data[i]
    const fullName = (row[COL.fullName] ?? '').toString().trim()
    const priceRaw = (row[COL.price] ?? '').toString().replace(/\s/g, '')
    const price = parseFloat(priceRaw)
    if (!fullName || isNaN(price) || price <= 0) continue

    items.push({
      rowIndex: i + 1,
      sheetName,
      fullName,
      color: COL.color !== undefined ? (row[COL.color] ?? '').toString().trim() : '',
      memory: COL.memory !== undefined ? (row[COL.memory] ?? '').toString().trim() : '',
      size: COL.size !== undefined ? (row[COL.size] ?? '').toString().trim() : '',
      price,
    })
  }
  return items
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

/** Маппинг объявлений Avito → Google Sheets строки (read-only) */
export async function mapAvitoToProducts(): Promise<AvitoMapping[]> {
  const avitoItems = await getAvitoItems()
  const sheetProducts = await loadSheetProducts()

  // DB products — для проверки уже смапленных
  const dbProducts = await prisma.product.findMany({
    where: { isAvailable: true },
    select: { id: true, name: true, avitoItemId: true },
  })

  const result: AvitoMapping[] = []

  for (const item of avitoItems) {
    // 1. Уже смаплен в БД?
    const dbMatch = dbProducts.find(p => p.avitoItemId && p.avitoItemId === BigInt(item.id))
    if (dbMatch) {
      result.push({
        avitoId: item.id,
        avitoTitle: item.title,
        avitoPrice: item.price,
        productId: dbMatch.id,
        productName: dbMatch.name,
        confidence: 'exact',
        score: 1,
        sheetMatch: null,
      })
      continue
    }

    // 2. Weighted scoring по Google Sheets (полные названия)
    let bestScore = 0
    let bestSheet: SheetProduct | null = null

    for (const sp of sheetProducts) {
      const score1 = matchScoreWeighted(item.title, sp.fullName)
      if (score1 > bestScore) {
        bestScore = score1
        bestSheet = sp
      }
      // Расширенное: fullName + color + memory + size
      const extended = [sp.fullName, sp.color, sp.memory, sp.size].filter(Boolean).join(' ')
      const score2 = matchScoreWeighted(item.title, extended)
      if (score2 > bestScore) {
        bestScore = score2
        bestSheet = sp
      }
    }

    let confidence: 'exact' | 'fuzzy' | 'none' = 'none'
    if (bestSheet && bestScore >= 0.80) confidence = 'exact'
    else if (bestSheet && bestScore >= 0.50) confidence = 'fuzzy'

    result.push({
      avitoId: item.id,
      avitoTitle: item.title,
      avitoPrice: item.price,
      productId: null,
      productName: bestSheet?.fullName ?? null,
      confidence,
      score: bestScore,
      sheetMatch: bestSheet ? {
        rowIndex: bestSheet.rowIndex,
        sheetName: bestSheet.sheetName,
        price: bestSheet.price,
      } : null,
    })
  }
  return result
}

// ─── Apply & sync (for future use) ───────────────────────────────────────────

/** Применить маппинг — записать avitoItemId + avitoEnabled в Product */
export async function applyAvitoMapping(mappings: AvitoMapping[]): Promise<number> {
  let applied = 0
  for (const m of mappings) {
    if (m.productId && m.confidence !== 'none') {
      await prisma.product.update({
        where: { id: m.productId },
        data: {
          avitoItemId: BigInt(m.avitoId),
          avitoEnabled: true,
        },
      })
      applied++
    }
  }
  return applied
}

/** Синхронизировать цены БД → Avito (МГНОВЕННО через REST API) */
export async function syncPricesToAvito(): Promise<{ updated: number; failed: number; skipped: number }> {
  if (!isAvitoConfigured()) return { updated: 0, failed: 0, skipped: 0 }

  const products = await prisma.product.findMany({
    where: {
      avitoItemId: { not: null },
      avitoEnabled: true,
      isAvailable: true,
    },
    select: { id: true, name: true, avitoItemId: true, price: true },
  })

  let updated = 0, failed = 0, skipped = 0
  for (const p of products) {
    if (!p.avitoItemId) { skipped++; continue }
    const price = Number(p.price)
    if (price <= 0) { skipped++; continue }
    await new Promise(r => setTimeout(r, 500))
    const ok = await updateAvitoPrice(Number(p.avitoItemId), price)
    if (ok) updated++; else failed++
  }
  console.log(`[Avito Sync] Prices: ${updated} updated, ${failed} failed, ${skipped} skipped`)
  return { updated, failed, skipped }
}
