/**
 * PR-6 — батчи разбора прайсов, СТРОГО READ-ONLY (реальная БД, INTEGRATION_DB=1).
 * AI-парсер подменяется мок-функцией (parseFn) — формат входа реальный,
 * структура выхода 1-в-1 AIParsedProduct; сам LLM в CI не дёргаем.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const RUN = process.env.INTEGRATION_DB === '1'

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any
let createPriceBatch: any, getBatchPreview: any

function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try { host = new URL(url).hostname } catch { /* noop */ }
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
    throw new Error(`INTEGRATION_DB=1 с не-локальной БД (host="${host}") — отказ.`)
  }
}

// Реальный формат прайса поставщика
const PRICE_TEXT = [
  '🔥 iPhone 17 Pro 256 Black — 88.500 (Индия)',
  'iPhone 17 Pro 256 White — 89.000',
  'Крутой неизвестный девайс 512 — 55.000',
].join('\n')

// Мок AI-парсера: структура 1-в-1 AIParsedProduct
const mockParse = async () => ([
  { model: 'PB6 iPhone 17 Pro', storage: '256', ram: null, color: 'Black', country: 'Индия', simType: null, price: 88500, rawLine: '🔥 iPhone 17 Pro 256 Black — 88.500 (Индия)' },
  { model: 'PB6 iPhone 17 Pro', storage: '256', ram: null, color: 'White', country: null, simType: null, price: 89000, rawLine: 'iPhone 17 Pro 256 White — 89.000' },
  { model: 'Крутой неизвестный девайс', storage: '512', ram: null, color: null, country: null, simType: null, price: 55000, rawLine: 'Крутой неизвестный девайс 512 — 55.000' },
])

describe.skipIf(!RUN)('createPriceBatch / getBatchPreview (read-only)', () => {
  let productId: number, vBlackId: number, vWhiteId: number, supplierId: number

  beforeAll(async () => {
    assertDisposableDb()
    ;({ prisma } = await import('../../lib/prisma'))
    ;({ createPriceBatch, getBatchPreview } = await import('../../lib/price-batch'))
  })

  beforeEach(async () => {
    await prisma.supplierPrice.deleteMany()
    await prisma.priceApplyBatch.deleteMany()
    await prisma.markupRule.deleteMany()
    await prisma.productVariant.deleteMany()
    await prisma.product.deleteMany()
    await prisma.supplier.deleteMany()
    await prisma.auditLog.deleteMany({ where: { entity: 'PriceApplyBatch' } })

    // Тестовый каталог: Black продаётся за 100 000 (новая закупка 88 500 →
    // розница ~101к, в коридоре), White за 140 000 (розница от 89 000 → ~102к,
    // просадка > 15% — вне коридора)
    const product = await prisma.product.create({
      data: { sku: 'pb6-test', name: 'PB6 iPhone 17 Pro', price: 100000, attributes: {} },
    })
    productId = product.id
    vBlackId = (await prisma.productVariant.create({
      data: { productId, sku: 'pb6-black', price: 100000, quantity: 3, inStock: true, attributes: { 'Цвет': 'Black', 'Память': '256GB', fullName: 'PB6 iPhone 17 Pro 256 Black' } },
    })).id
    vWhiteId = (await prisma.productVariant.create({
      data: { productId, sku: 'pb6-white', price: 140000, quantity: 3, inStock: true, attributes: { 'Цвет': 'White', 'Память': '256GB', fullName: 'PB6 iPhone 17 Pro 256 White' } },
    })).id
    supplierId = (await prisma.supplier.create({
      data: { name: 'PB6-поставщик', chatId: 'web:pb6-test', priceTtlDays: 5 },
    })).id
    // Простое правило наценки: +15 000 фикс на всё
    await prisma.markupRule.create({ data: { minCost: 0, maxCost: null, mode: 'fixed', value: 15000, enabled: true } })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.supplierPrice.deleteMany()
    await prisma.priceApplyBatch.deleteMany()
    await prisma.markupRule.deleteMany()
    await prisma.productVariant.deleteMany()
    await prisma.product.deleteMany()
    await prisma.supplier.deleteMany()
    await prisma.$disconnect()
  })

  it('разбор: батч preview, строки с batchId/expiresAt/isActive=false, матчинг, коридор', async () => {
    const before = await prisma.productVariant.findMany({ orderBy: { id: 'asc' } })

    const r = await createPriceBatch({ source: 'paste', text: PRICE_TEXT, supplierId, createdBy: '111', parseFn: mockParse })
    expect(r.reused).toBe(false)
    expect(r.stats).toMatchObject({ rows: 3, matchedRows: 2, unmatchedRows: 1, ignoredRows: 0, ttlDays: 5 })
    expect(r.stats.outOfCorridor).toBe(1) // White: 140 000 → 104 000 — просадка 25.7%

    const batch = await prisma.priceApplyBatch.findUnique({ where: { id: r.batchId } })
    expect(batch.status).toBe('preview') // apply — только PR-7

    const rows = await prisma.supplierPrice.findMany({ where: { batchId: r.batchId }, orderBy: { id: 'asc' } })
    expect(rows).toHaveLength(3)
    expect(rows.every((x: any) => x.isActive === false)).toBe(true) // не участвуют в «свежих ценах»
    const ttlMs = rows[0].expiresAt.getTime() - rows[0].parsedAt.getTime()
    expect(Math.round(ttlMs / 86400000)).toBe(5) // TTL поставщика
    expect(rows.filter((x: any) => x.variantId !== null)).toHaveLength(2)

    // ГЛАВНЫЙ КОНТРАКТ PR-6: ни одна реальная цена не изменилась
    const after = await prisma.productVariant.findMany({ orderBy: { id: 'asc' } })
    expect(after.map((v: any) => [v.id, String(v.price), String(v.costPrice)]))
      .toEqual(before.map((v: any) => [v.id, String(v.price), String(v.costPrice)]))

    // Предпросмотр полный: PR-7 dry-run обопрётся ровно на него
    const preview = await getBatchPreview(r.batchId)
    const black = preview.rows.find((x: any) => x.variantId === vBlackId)
    expect(black.supplierPrice).toBe(88500)
    expect(black.proposedPrice).toBe(103490) // 88500+15000 → roundPrice90
    expect(black.corridor).toBe('in')        // 100 000 → 103 490 = +3.5%
    const white = preview.rows.find((x: any) => x.variantId === vWhiteId)
    expect(white.corridor).toBe('out')       // 140 000 → 104 090 = −25.7%
    expect(white.deltaPct).toBeLessThan(-15)
    const unknown = preview.rows.find((x: any) => !x.matched)
    expect(unknown.rawLine).toContain('неизвестный девайс')
    // Розница у «не узнал» — справочно для экрана заведения (кусок 3);
    // применять нечего: corridor/deltaPct остаются null
    expect(unknown.proposedPrice).toBeGreaterThan(unknown.supplierPrice)
    expect(unknown.corridor).toBeNull()
    expect(unknown.deltaPct).toBeNull()
  })

  it('идемпотентность: тот же текст + поставщик → реюз батча, дубли не плодятся', async () => {
    const first = await createPriceBatch({ source: 'paste', text: PRICE_TEXT, supplierId, createdBy: '111', parseFn: mockParse })
    const second = await createPriceBatch({ source: 'paste', text: '  ' + PRICE_TEXT + '\n', supplierId, createdBy: '111', parseFn: mockParse })
    expect(second.reused).toBe(true)
    expect(second.batchId).toBe(first.batchId)
    expect(await prisma.priceApplyBatch.count()).toBe(1)
    expect(await prisma.supplierPrice.count()).toBe(3)
    // другой текст → новый батч
    const third = await createPriceBatch({ source: 'paste', text: PRICE_TEXT + '\nещё строка — 60.000', supplierId, createdBy: '111', parseFn: async () => (await mockParse()).slice(0, 1) })
    expect(third.reused).toBe(false)
    expect(third.batchId).not.toBe(first.batchId)
  })

  it('AuditLog: price_batch_parse со stats, БЕЗ мутаций цен', async () => {
    const r = await createPriceBatch({ source: 'paste', text: PRICE_TEXT, supplierId, createdBy: '924498094', parseFn: mockParse })
    await new Promise(res => setTimeout(res, 300))
    const logs = await prisma.auditLog.findMany({ where: { entity: 'PriceApplyBatch' } })
    expect(logs).toHaveLength(1)
    expect(logs[0].action).toBe('price_batch_parse')
    expect(logs[0].entityId).toBe(String(r.batchId))
    expect((logs[0].after as any).rows).toBe(3)
  })

  it('без поставщика: TTL по умолчанию 3 дня', async () => {
    const r = await createPriceBatch({ source: 'paste', text: PRICE_TEXT, supplierId: null, createdBy: '111', parseFn: mockParse })
    expect(r.stats.ttlDays).toBe(3)
    const row = await prisma.supplierPrice.findFirst({ where: { batchId: r.batchId } })
    expect(Math.round((row.expiresAt.getTime() - row.parsedAt.getTime()) / 86400000)).toBe(3)
  })
})
