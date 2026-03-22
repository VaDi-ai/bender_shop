/**
 * lib/avito-sync.ts — Маппинг Avito объявлений ↔ Product и синхронизация цен
 */
import { prisma } from './prisma'
import { getAvitoItems, updateAvitoPrice, isAvitoConfigured } from './avito'

export interface AvitoMapping {
  avitoId: number
  avitoTitle: string
  avitoPrice: number | null
  productId: number | null
  productName: string | null
  confidence: 'exact' | 'fuzzy' | 'none'
  score: number  // 0-1, процент совпадения токенов
}

/** Нормализация названия для сравнения */
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

/** Извлечь ключевые токены из названия для сравнения */
function extractTokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter(t => t.length > 1)
    .filter(t => !['new', 'новый', 'sim', 'esim', 'strap', 'silicon', 'band', 'the', 'and'].includes(t))
}

/** Процент совпадения токенов */
function matchScore(avitoTitle: string, productName: string): number {
  const tokensA = extractTokens(avitoTitle)
  const tokensB = extractTokens(productName)
  if (tokensA.length === 0 || tokensB.length === 0) return 0
  const overlap = tokensA.filter(t => tokensB.includes(t)).length
  // Нормализуем по меньшему набору (короткое название в БД не штрафуется)
  return overlap / Math.min(tokensA.length, tokensB.length)
}

/** Маппинг объявлений Avito → Product по названию (read-only) */
export async function mapAvitoToProducts(): Promise<AvitoMapping[]> {
  const avitoItems = await getAvitoItems()
  const products = await prisma.product.findMany({
    where: { isAvailable: true },
    select: { id: true, name: true, avitoItemId: true },
  })

  const result: AvitoMapping[] = []

  for (const item of avitoItems) {
    // 1. Уже смаплен в БД?
    let match = products.find(p => p.avitoItemId === BigInt(item.id))
    let confidence: 'exact' | 'fuzzy' | 'none' = match ? 'exact' : 'none'
    let score = match ? 1 : 0

    if (!match) {
      // 2. Точное совпадение нормализованных названий
      const normTitle = normalize(item.title)
      match = products.find(p => normalize(p.name) === normTitle)
      if (match) { confidence = 'exact'; score = 1 }
    }

    if (!match) {
      // 3. Token-based scoring — найти лучшее совпадение
      let bestScore = 0
      let bestProduct: typeof products[0] | null = null

      for (const p of products) {
        const s = matchScore(item.title, p.name)
        if (s > bestScore) {
          bestScore = s
          bestProduct = p
        }
      }

      // Порог: минимум 60% токенов совпадает
      if (bestProduct && bestScore >= 0.6) {
        match = bestProduct
        confidence = bestScore >= 0.9 ? 'exact' : 'fuzzy'
        score = bestScore
      }
    }

    result.push({
      avitoId: item.id,
      avitoTitle: item.title,
      avitoPrice: item.price,
      productId: match?.id ?? null,
      productName: match?.name ?? null,
      confidence,
      score,
    })
  }
  return result
}

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
    // Задержка 500ms между запросами (rate limit 150/мин = 2.5/сек)
    await new Promise(r => setTimeout(r, 500))
    const ok = await updateAvitoPrice(Number(p.avitoItemId), price)
    if (ok) updated++; else failed++
  }
  console.log(`[Avito Sync] Prices: ${updated} updated, ${failed} failed, ${skipped} skipped`)
  return { updated, failed, skipped }
}
