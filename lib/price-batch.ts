/**
 * Батчи разбора прайсов (ADMIN-DESIGN §7.2, Этап 1 / PR-6). СТРОГО READ-ONLY:
 * этот модуль НИКОГДА не меняет цены вариантов и не пишет в Google-таблицу.
 * Жизненный цикл здесь: parsing → preview. applied/discarded/rolled_back — PR-7.
 *
 * Строки батча пишутся в SupplierPrice с isActive=false: до применения они
 * не участвуют ни в «свежих ценах», ни в автовыборе минимальной. PR-7 при
 * apply включит isActive=true.
 *
 * Идемпотентность: повторный разбор того же текста тем же поставщиком в
 * пределах 24ч возвращает существующий preview-батч (сравнение по sha256
 * текста в stats.contentHash) — мусорные дубли не плодятся.
 */
import crypto from 'crypto'
import { prisma } from './prisma'
import { log } from './logger'
import { parseSupplierMessage, AIParsedProduct } from './ai-parser'
import { matchVariants, ParsedLine, MatchedVariant } from './price-matching'
import { applyMarkupRules, loadRules, MarkupRuleData } from './markup-rules'
import { logAdminAction } from './audit'

/** Коридор автоприменения (утверждено §9.1): |Δ розничной| ≤ 15% — «в коридоре». */
export const CORRIDOR_PCT = 15

export type CorridorClass = 'in' | 'out'

/**
 * Классификация для гейта PR-7: manager сможет авто-применять только 'in'.
 * Считается по изменению РОЗНИЧНОЙ цены: текущая vs пересчитанная из новой
 * закупки цепочкой наценки. currentPrice=0 (у товара ещё нет цены) → 'out':
 * непонятную базу не даём применять молча.
 */
export function classifyCorridor(currentPrice: number, proposedPrice: number): CorridorClass {
  if (!(currentPrice > 0)) return 'out'
  const deltaPct = Math.abs((proposedPrice - currentPrice) / currentPrice) * 100
  return deltaPct <= CORRIDOR_PCT ? 'in' : 'out'
}

export function priceDeltaPct(currentPrice: number, proposedPrice: number): number | null {
  if (!(currentPrice > 0)) return null
  return Math.round(((proposedPrice - currentPrice) / currentPrice) * 1000) / 10
}

export function contentHash(text: string): string {
  return crypto.createHash('sha256').update(text.trim()).digest('hex')
}

export function computeExpiresAt(parsedAt: Date, ttlDays: number): Date {
  return new Date(parsedAt.getTime() + ttlDays * 24 * 60 * 60 * 1000)
}

export function toParsedLine(p: AIParsedProduct): ParsedLine {
  return {
    model: p.model,
    storage: p.storage ?? undefined,
    color: p.color ?? undefined,
    price: p.price,
    rawLine: p.rawLine,
  }
}

export interface BatchStats {
  rows: number            // строк распарсено
  matchedRows: number     // строк, узнанных хотя бы одним вариантом
  matchedVariants: number // пар строка×вариант (алиас на продукт даёт fan-out)
  unmatchedRows: number   // в очередь «не узнал» (PR-8)
  ignoredRows: number     // PriceAlias.isIgnored — «это не наш товар»
  outOfCorridor: number   // пар вне ±15% — потребуют owner в PR-7
  contentHash: string
  [k: string]: unknown
}

export interface CreateBatchResult {
  batchId: number
  stats: BatchStats
  reused: boolean
}

type ParseFn = (text: string) => Promise<AIParsedProduct[]>

export async function createPriceBatch(opts: {
  source: 'message' | 'file' | 'paste'
  text: string
  supplierId?: number | null
  createdBy: string
  /** тестам/боту можно подменить AI-парсер */
  parseFn?: ParseFn
}): Promise<CreateBatchResult> {
  const hash = contentHash(opts.text)

  // Идемпотентность: тот же текст + тот же поставщик + preview < 24ч → реюз
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const existing = await prisma.priceApplyBatch.findFirst({
    where: {
      status: 'preview',
      supplierId: opts.supplierId ?? null,
      createdAt: { gte: dayAgo },
      stats: { path: ['contentHash'], equals: hash },
    },
    select: { id: true, stats: true },
  })
  if (existing) {
    return { batchId: existing.id, stats: existing.stats as unknown as BatchStats, reused: true }
  }

  const parse = opts.parseFn ?? parseSupplierMessage
  const parsedRaw = await parse(opts.text)
  const parsed = parsedRaw.map(toParsedLine)
  const { matched, unmatched, ignored } = await matchVariants(parsed)

  const supplier = opts.supplierId
    ? await prisma.supplier.findUnique({ where: { id: opts.supplierId }, select: { priceTtlDays: true } })
    : null
  const ttlDays = supplier?.priceTtlDays ?? 3
  const now = new Date()
  const expiresAt = computeExpiresAt(now, ttlDays)

  // Коридор считаем уже в предпросмотре — dry-run PR-7 обопрётся ровно на него
  const rules = await loadRules()
  let outOfCorridor = 0
  for (const m of matched) {
    if (classifyCorridor(m.currentPrice, applyMarkupRules(m.supplierPrice, rules)) === 'out') outOfCorridor++
  }

  const stats: BatchStats = {
    rows: parsed.length,
    matchedRows: new Set(matched.map(m => m.rawLine)).size,
    matchedVariants: matched.length,
    unmatchedRows: unmatched.length,
    ignoredRows: ignored.length,
    outOfCorridor,
    contentHash: hash,
    ttlDays,
  }

  const batch = await prisma.$transaction(async tx => {
    const batch = await tx.priceApplyBatch.create({
      data: {
        source: opts.source,
        status: 'preview',
        supplierId: opts.supplierId ?? null,
        createdBy: opts.createdBy,
        stats: stats as object,
      },
      select: { id: true },
    })
    const rawByLine = new Map(parsedRaw.map(p => [p.rawLine, p]))
    const rowData = (p: ParsedLine, variantId: number | null) => {
      const raw = rawByLine.get(p.rawLine)
      return {
        batchId: batch.id,
        supplierId: opts.supplierId ?? null,
        model: p.model,
        storage: p.storage ?? null,
        ram: raw?.ram ?? null,
        color: p.color ?? null,
        simType: raw?.simType ?? null,
        country: raw?.country ?? null,
        price: p.price,
        rawMessage: p.rawLine,
        variantId,
        // READ-ONLY контракт PR-6: строки неактивны до применения (PR-7)
        isActive: false,
        expiresAt,
      }
    }
    await tx.supplierPrice.createMany({
      data: [
        ...matched.map(m => rowData(m.parsed, m.variantId)),
        ...unmatched.map(p => rowData(p, null)),
      ],
    })
    return batch
  })

  void logAdminAction({
    adminTelegramId: opts.createdBy,
    action: 'price_batch_parse',
    entity: 'PriceApplyBatch',
    entityId: batch.id,
    after: stats,
  })
  log.info('Price batch parsed', { batchId: batch.id, ...stats })

  return { batchId: batch.id, stats, reused: false }
}

export interface PreviewRow {
  supplierPriceId: number
  rawLine: string
  matched: boolean
  variantId: number | null
  productName: string | null
  variantAttrs: Record<string, string> | null
  currentPrice: number | null
  currentCost: number | null
  supplierPrice: number     // новая закупка из прайса
  proposedPrice: number | null // розничная после цепочки наценки
  deltaPct: number | null
  corridor: CorridorClass | null
}

export async function getBatchPreview(batchId: number): Promise<{
  batch: { id: number; source: string; status: string; supplierId: number | null; createdAt: Date; stats: BatchStats }
  rows: PreviewRow[]
} | null> {
  const batch = await prisma.priceApplyBatch.findUnique({
    where: { id: batchId },
    select: { id: true, source: true, status: true, supplierId: true, createdAt: true, stats: true },
  })
  if (!batch) return null

  const rows = await prisma.supplierPrice.findMany({
    where: { batchId },
    orderBy: { id: 'asc' },
  })
  const variantIds = rows.map(r => r.variantId).filter((v): v is number => v !== null)
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, price: true, costPrice: true, attributes: true, product: { select: { name: true } } },
  })
  const byId = new Map(variants.map(v => [v.id, v]))
  const rules: MarkupRuleData[] = await loadRules()

  const preview: PreviewRow[] = rows.map(r => {
    const v = r.variantId !== null ? byId.get(r.variantId) : undefined
    const supplierPrice = Number(r.price)
    if (!v) {
      return {
        supplierPriceId: r.id, rawLine: r.rawMessage, matched: false,
        variantId: null, productName: null, variantAttrs: null,
        currentPrice: null, currentCost: null,
        supplierPrice, proposedPrice: null, deltaPct: null, corridor: null,
      }
    }
    const currentPrice = Number(v.price)
    const proposedPrice = applyMarkupRules(supplierPrice, rules)
    return {
      supplierPriceId: r.id,
      rawLine: r.rawMessage,
      matched: true,
      variantId: v.id,
      productName: v.product.name,
      variantAttrs: (v.attributes ?? null) as Record<string, string> | null,
      currentPrice,
      currentCost: v.costPrice !== null ? Number(v.costPrice) : null,
      supplierPrice,
      proposedPrice,
      deltaPct: priceDeltaPct(currentPrice, proposedPrice),
      corridor: classifyCorridor(currentPrice, proposedPrice),
    }
  })

  return { batch: { ...batch, stats: batch.stats as unknown as BatchStats }, rows: preview }
}
