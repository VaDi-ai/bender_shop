/**
 * lib/avito-sync.ts — Маппинг Avito объявлений ↔ Google Sheets и синхронизация цен
 */
import { prisma } from './prisma'
import { getAvitoItems, updateAvitoPrice, isAvitoConfigured } from './avito'
import { readSheet, getSheetNames } from './google-sheets'

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
    .trim()
}

function extractTokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter(t => t.length > 1)
    .filter(t => !['new', 'новый', 'sim', 'esim', 'strap', 'silicon', 'band', 'the', 'and'].includes(t))
}

function matchScore(a: string, b: string): number {
  const tokensA = extractTokens(a)
  const tokensB = extractTokens(b)
  if (tokensA.length === 0 || tokensB.length === 0) return 0
  const overlap = tokensA.filter(t => tokensB.includes(t)).length
  return overlap / Math.min(tokensA.length, tokensB.length)
}

// ─── Load sheet data ──────────────────────────────────────────────────────────

async function loadSheetProducts(): Promise<SheetProduct[]> {
  const allSheets = await getSheetNames()
  const sheetName = allSheets[0]
  if (!sheetName) return []

  const data = await readSheet(sheetName)
  const items: SheetProduct[] = []

  for (let i = 1; i < data.length; i++) {
    const row = data[i]
    const fullName = (row[4] ?? '').toString().trim()    // E: Название модели
    const priceRaw = (row[11] ?? '').toString().replace(/\s/g, '')  // L: Цена
    const price = parseFloat(priceRaw)
    if (!fullName || isNaN(price) || price <= 0) continue

    items.push({
      rowIndex: i + 1,
      sheetName,
      fullName,
      color: (row[5] ?? '').toString().trim(),
      memory: (row[6] ?? '').toString().trim(),
      size: (row[7] ?? '').toString().trim(),
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

    // 2. Token-based scoring по Google Sheets (полные названия)
    let bestScore = 0
    let bestSheet: SheetProduct | null = null

    for (const sp of sheetProducts) {
      // Сравнение с полным названием
      const score1 = matchScore(item.title, sp.fullName)
      if (score1 > bestScore) {
        bestScore = score1
        bestSheet = sp
      }
      // Расширенное: fullName + color + memory + size
      const extended = [sp.fullName, sp.color, sp.memory, sp.size].filter(Boolean).join(' ')
      const score2 = matchScore(item.title, extended)
      if (score2 > bestScore) {
        bestScore = score2
        bestSheet = sp
      }
    }

    let confidence: 'exact' | 'fuzzy' | 'none' = 'none'
    if (bestSheet && bestScore >= 0.85) confidence = 'exact'
    else if (bestSheet && bestScore >= 0.5) confidence = 'fuzzy'

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
