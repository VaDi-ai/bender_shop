/**
 * Движок «лучший поставщик» (решение владельца, 2026-08).
 *
 * «Лучший» = МИНИМАЛЬНАЯ закупка среди активных SupplierPrice варианта, чья
 * цена ещё свежа: expiresAt > now, а при expiresAt=null — parsedAt +
 * supplier.priceTtlDays > now (без поставщика TTL = 3 дня, как в батчах).
 * Протухшие в выбор не входят. Тай-брейк при равном минимуме — самый свежий
 * parsedAt. Цены выключенных поставщиков не участвуют (поставщик не возит).
 *
 * Применение — ТОЛЬКО через превью, существующей машинерией батчей
 * (price-apply): движок лишь собирает preview-батч source='best_supplier' из
 * КОПИЙ строк-победителей. Дальше владелец видит старая→новая закупка/розница
 * и дельту, применяет кнопкой; лок синка, freeze непроехавшего writeback и
 * откат одной кнопкой — ровно как у обычных батчей. Никакого авто-применения.
 *
 * Копии сохраняют parsedAt/expiresAt оригинала: после apply они становятся
 * isActive и попадают в пул кандидатов следующего выбора — с оригинальной
 * свежестью они дублируют победителя, не искажая ни минимум, ни тай-брейк.
 */
import { prisma } from './prisma'
import { log } from './logger'
import { logAdminAction } from './audit'
import { applyMarkupRules, loadRules } from './markup-rules'

export const DEFAULT_TTL_DAYS = 3

export interface FreshnessInput {
  parsedAt: Date
  expiresAt: Date | null
  /** TTL поставщика; null = поставщик не указан → дефолтные 3 дня */
  ttlDays: number | null
}

/** Свежа ли цена: expiresAt главнее; без него — parsedAt + TTL. */
export function isFreshPrice(c: FreshnessInput, now: Date): boolean {
  if (c.expiresAt !== null) return c.expiresAt.getTime() > now.getTime()
  const ttl = c.ttlDays ?? DEFAULT_TTL_DAYS
  return c.parsedAt.getTime() + ttl * 24 * 60 * 60 * 1000 > now.getTime()
}

export interface BestCandidate extends FreshnessInput {
  price: number
}

/**
 * Победитель: минимальная цена среди свежих; тай-брейк — самый свежий parsedAt.
 * Протухшие отсеиваются ДО выбора. Пусто → null.
 */
export function pickBestSupplierPrice<T extends BestCandidate>(candidates: T[], now: Date): T | null {
  const fresh = candidates.filter(c => isFreshPrice(c, now))
  if (!fresh.length) return null
  return fresh.reduce((best, c) =>
    c.price < best.price || (c.price === best.price && c.parsedAt.getTime() > best.parsedAt.getTime())
      ? c
      : best,
  )
}

export interface BuildOutcome {
  ok: boolean
  status: number
  error?: string
  batchId: number | null
  stats?: {
    variantsWithOffers: number  // вариантов с хотя бы одной активной свежей ценой
    rows: number                // строк в превью (где победитель меняет закупку/розницу)
    unchanged: number           // победитель уже применён — менять нечего
  }
}

/**
 * Собирает preview-батч «лучший поставщик» по всему каталогу.
 * Ничего не применяет: батч уходит в обычный флоу «Проверьте и примените».
 * Прежние best_supplier-превью помечаются discarded — актуально только последнее.
 */
export async function buildBestSupplierBatch(createdBy: string): Promise<BuildOutcome> {
  const now = new Date()
  const candidates = await prisma.supplierPrice.findMany({
    where: { isActive: true, variantId: { not: null } },
    select: {
      id: true, variantId: true, price: true, parsedAt: true, expiresAt: true,
      supplierId: true, supplierName: true,
      model: true, storage: true, ram: true, color: true, simType: true, country: true,
      rawMessage: true,
      supplier: { select: { name: true, priceTtlDays: true, isActive: true } },
    },
  })

  type Cand = Omit<(typeof candidates)[number], 'price'> & BestCandidate
  const byVariant = new Map<number, Cand[]>()
  for (const c of candidates) {
    // Выключенный поставщик не возит — его цены не выигрывают
    if (c.supplier && !c.supplier.isActive) continue
    const enriched: Cand = {
      ...c,
      price: Number(c.price),
      ttlDays: c.supplier?.priceTtlDays ?? null,
    }
    const list = byVariant.get(c.variantId!) ?? []
    list.push(enriched)
    byVariant.set(c.variantId!, list)
  }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: [...byVariant.keys()] } },
    select: { id: true, price: true, costPrice: true },
  })
  const variantById = new Map(variants.map(v => [v.id, v]))
  const rules = await loadRules('site')

  let variantsWithOffers = 0
  let unchanged = 0
  const rows: Array<{ winner: Cand; supplierName: string | null }> = []
  for (const [variantId, cands] of byVariant) {
    const v = variantById.get(variantId)
    if (!v) continue // вариант исчез — строку не заводим
    const winner = pickBestSupplierPrice(cands, now)
    if (!winner) continue // все цены протухли
    variantsWithOffers++
    const newCost = winner.price
    const newRetail = applyMarkupRules(newCost, rules)
    const curCost = v.costPrice !== null ? Number(v.costPrice) : null
    if (newCost === curCost && newRetail === Number(v.price)) { unchanged++; continue }
    rows.push({ winner, supplierName: winner.supplier?.name ?? winner.supplierName ?? null })
  }

  if (!rows.length) {
    return { ok: true, status: 200, batchId: null, stats: { variantsWithOffers, rows: 0, unchanged } }
  }

  const stats = {
    rows: rows.length,
    matchedRows: rows.length,
    matchedVariants: rows.length,
    unmatchedRows: 0,
    ignoredRows: 0,
    variantsWithOffers,
    unchanged,
    engine: 'best_supplier',
  }

  const batch = await prisma.$transaction(async tx => {
    // Старые непринятые превью движка теряют смысл — новое всегда полнее
    await tx.priceApplyBatch.updateMany({
      where: { source: 'best_supplier', status: 'preview' },
      data: { status: 'discarded' },
    })
    const batch = await tx.priceApplyBatch.create({
      data: { source: 'best_supplier', status: 'preview', supplierId: null, createdBy, stats },
      select: { id: true },
    })
    await tx.supplierPrice.createMany({
      data: rows.map(({ winner, supplierName }) => ({
        batchId: batch.id,
        variantId: winner.variantId,
        supplierId: winner.supplierId,
        supplierName,
        model: winner.model,
        storage: winner.storage,
        ram: winner.ram,
        color: winner.color,
        simType: winner.simType,
        country: winner.country,
        price: winner.price,
        rawMessage: winner.rawMessage,
        // Свежесть оригинала: копия не должна выглядеть «свежее» победителя
        parsedAt: winner.parsedAt,
        expiresAt: winner.expiresAt,
        isActive: false, // до применения — вне пула кандидатов, как у батчей разбора
      })),
    })
    return batch
  })

  void logAdminAction({
    adminTelegramId: createdBy, action: 'best_supplier_preview', entity: 'PriceApplyBatch', entityId: batch.id,
    after: stats,
  })
  log.info('Best-supplier preview batch built', { batchId: batch.id, ...stats })
  return { ok: true, status: 201, batchId: batch.id, stats: { variantsWithOffers, rows: rows.length, unchanged } }
}
