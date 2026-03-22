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
}

/** Нормализация названия для сравнения */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/гб|gb/gi, 'gb')
    .replace(/тб|tb/gi, 'tb')
    .trim()
}

/** Маппинг объявлений Avito → Product по названию */
export async function mapAvitoToProducts(): Promise<AvitoMapping[]> {
  const avitoItems = await getAvitoItems()
  const products = await prisma.product.findMany({
    where: { isAvailable: true },
    select: { id: true, name: true, avitoItemId: true },
  })

  const result: AvitoMapping[] = []

  for (const item of avitoItems) {
    const normTitle = normalize(item.title)

    // 1. Уже смаплен в БД?
    let match = products.find(p => p.avitoItemId === BigInt(item.id))

    // 2. Точное совпадение по названию
    if (!match) {
      match = products.find(p => normalize(p.name) === normTitle)
    }

    // 3. Один содержит другой
    if (!match) {
      match = products.find(p => {
        const normName = normalize(p.name)
        return normTitle.includes(normName) || normName.includes(normTitle)
      })
    }

    let confidence: 'exact' | 'fuzzy' | 'none' = 'none'
    if (match) {
      confidence = normalize(match.name) === normTitle ? 'exact' : 'fuzzy'
    }

    result.push({
      avitoId: item.id,
      avitoTitle: item.title,
      avitoPrice: item.price,
      productId: match?.id ?? null,
      productName: match?.name ?? null,
      confidence,
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
