/**
 * PR-7 — применение/откат батча цен (реальная БД, INTEGRATION_DB=1).
 * Writeback подменяется writebackFn (лист-мок с записью вызовов / бросающий).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const RUN = process.env.INTEGRATION_DB === '1'

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any
let createPriceBatch: any
let applyPriceBatch: any, rollbackPriceBatch: any, retryWriteback: any
let getFrozenVariantIds: any

function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try { host = new URL(url).hostname } catch { /* noop */ }
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
    throw new Error(`INTEGRATION_DB=1 с не-локальной БД (host="${host}") — отказ.`)
  }
}

const mockParse = async () => ([
  // Black: 100 000 → предложение 103 490 (+3.5%, в коридоре)
  { model: 'PA7 iPhone 17 Pro', storage: '256', ram: null, color: 'Black', country: null, simType: null, price: 88500, rawLine: 'PA7 256 Black — 88.500' },
  // White: 140 000 → предложение 103 990 (−25.7%, ВНЕ коридора)
  { model: 'PA7 iPhone 17 Pro', storage: '256', ram: null, color: 'White', country: null, simType: null, price: 89000, rawLine: 'PA7 256 White — 89.000' },
])

const OWNER = { telegramId: '900', role: 'owner' as const }
const MANAGER = { telegramId: '901', role: 'manager' as const }

function recordingWriteback() {
  const calls: any[] = []
  const fn = async (rows: any[]) => { calls.push(rows); return { missing: [] } }
  return { fn, calls }
}
const failingWriteback = async () => { throw new Error('Google API down') }

describe.skipIf(!RUN)('applyPriceBatch / rollbackPriceBatch', () => {
  let vBlackId: number, vWhiteId: number, supplierId: number, batchId: number

  beforeAll(async () => {
    assertDisposableDb()
    ;({ prisma } = await import('../../lib/prisma'))
    ;({ createPriceBatch } = await import('../../lib/price-batch'))
    ;({ applyPriceBatch, rollbackPriceBatch, retryWriteback } = await import('../../lib/price-apply'))
    ;({ getFrozenVariantIds } = await import('../../lib/price-sync-policy'))
  })

  beforeEach(async () => {
    for (const t of ['supplierPrice', 'priceChange', 'priceApplyBatch', 'markupRule', 'productVariant', 'product', 'supplier']) {
      await prisma[t].deleteMany()
    }
    await prisma.auditLog.deleteMany({ where: { entity: 'PriceApplyBatch' } })
    await prisma.securityLog.deleteMany({ where: { event: { in: ['price_batch_applied', 'price_out_of_corridor_applied'] } } })

    const product = await prisma.product.create({ data: { sku: 'pa7', name: 'PA7 iPhone 17 Pro', price: 100000, attributes: {} } })
    vBlackId = (await prisma.productVariant.create({
      data: { productId: product.id, sku: 'pa7-b', price: 100000, costPrice: 80000, quantity: 3, inStock: true, attributes: { 'Цвет': 'Black', 'Память': '256GB', fullName: 'PA7 iPhone 17 Pro 256 Black' } },
    })).id
    vWhiteId = (await prisma.productVariant.create({
      data: { productId: product.id, sku: 'pa7-w', price: 140000, quantity: 3, inStock: true, attributes: { 'Цвет': 'White', 'Память': '256GB', fullName: 'PA7 iPhone 17 Pro 256 White' } },
    })).id
    supplierId = (await prisma.supplier.create({ data: { name: 'PA7-QA', chatId: 'web:pa7' } })).id
    await prisma.markupRule.create({ data: { minCost: 0, maxCost: null, mode: 'fixed', value: 15000, enabled: true } })
    batchId = (await createPriceBatch({ source: 'paste', text: 'pa7 batch text', supplierId, createdBy: '900', parseFn: mockParse })).batchId
  })

  afterAll(async () => {
    if (!prisma) return
    for (const t of ['supplierPrice', 'priceChange', 'priceApplyBatch', 'markupRule', 'productVariant', 'product', 'supplier']) {
      await prisma[t].deleteMany()
    }
    await prisma.$disconnect()
  })

  const snap = async () => (await prisma.productVariant.findMany({ orderBy: { id: 'asc' } }))
    .map((v: any) => [v.id, String(v.price), String(v.costPrice), String(v.lastSyncedCostPrice)])

  it('dry-run НИЧЕГО не пишет: БД, лист, статус, PriceChange — нетронуты', async () => {
    const before = await snap()
    const wb = recordingWriteback()
    const r = await applyPriceBatch({ batchId, actor: OWNER, dryRun: true, includeOutOfCorridor: true, mode: 'on', writebackFn: wb.fn })
    expect(r.ok).toBe(true)
    expect(r.applied).toBe(2) // отчёт полный (owner+includeOut)
    expect(await snap()).toEqual(before)
    expect(wb.calls).toHaveLength(0)
    expect(await prisma.priceChange.count()).toBe(0)
    expect((await prisma.priceApplyBatch.findUnique({ where: { id: batchId } })).status).toBe('preview')
  })

  it('режим off → только dry-run; test → чужой батч не применяется физически', async () => {
    const before = await snap()
    const off = await applyPriceBatch({ batchId, actor: OWNER, dryRun: false, mode: 'off' })
    expect(off.status).toBe(403)
    const test = await applyPriceBatch({ batchId, actor: OWNER, dryRun: false, mode: 'test', qaSupplierId: supplierId + 999 })
    expect(test.status).toBe(403)
    expect(await snap()).toEqual(before)
    expect(await prisma.priceChange.count()).toBe(0)
    // а батч QA-поставщика под test — применяется
    const wb = recordingWriteback()
    const ok = await applyPriceBatch({ batchId, actor: OWNER, dryRun: false, mode: 'test', qaSupplierId: supplierId, writebackFn: wb.fn })
    expect(ok.ok).toBe(true)
  })

  it('manager в коридоре применяет; вне коридора — skip; цены/PriceChange/writeback корректны', async () => {
    const wb = recordingWriteback()
    const r = await applyPriceBatch({ batchId, actor: MANAGER, dryRun: false, mode: 'on', writebackFn: wb.fn })
    expect(r.applied).toBe(1)
    expect(r.skippedOutOfCorridor).toBe(1)

    const black = await prisma.productVariant.findUnique({ where: { id: vBlackId } })
    expect(Number(black.price)).toBe(103500)
    expect(Number(black.costPrice)).toBe(88500)
    expect(Number(black.lastSyncedCostPrice)).toBe(88500) // согласованно — синк-инвариант
    const white = await prisma.productVariant.findUnique({ where: { id: vWhiteId } })
    expect(Number(white.price)).toBe(140000) // вне коридора — не тронут

    const pc = await prisma.priceChange.findMany({ where: { batchId } })
    expect(pc).toHaveLength(1)
    expect(pc[0].variantId).toBe(vBlackId)
    expect(Number(pc[0].oldPrice)).toBe(100000)
    expect(Number(pc[0].newPrice)).toBe(103500)

    // O/P едут вместе с ценой: поставщик батча и «дата время» по-магазинному
    expect(wb.calls[0]).toEqual([{
      fullName: 'PA7 iPhone 17 Pro 256 Black', cost: 88500, price: 103500,
      supplier: 'PA7-QA', updatedAt: expect.stringMatching(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/),
    }])
    const appliedBlack = await prisma.productVariant.findUnique({ where: { id: vBlackId } })
    expect(appliedBlack.bestSupplierName).toBe('PA7-QA')
    expect(appliedBlack.priceUpdatedAt).toBeInstanceOf(Date)
    const rows = await prisma.supplierPrice.findMany({ where: { batchId }, orderBy: { id: 'asc' } })
    expect(rows.find((x: any) => x.variantId === vBlackId).isActive).toBe(true)
    expect(rows.find((x: any) => x.variantId === vWhiteId).isActive).toBe(false)

    // идемпотентность: повторный apply → no-op
    const again = await applyPriceBatch({ batchId, actor: OWNER, dryRun: false, mode: 'on', writebackFn: wb.fn })
    expect(again.alreadyApplied).toBe(true)
    expect(await prisma.priceChange.count({ where: { batchId } })).toBe(1)
  })

  it('manager с includeOutOfCorridor → 403; owner + confirm применяет вне коридора + CRITICAL SecurityLog', async () => {
    expect((await applyPriceBatch({ batchId, actor: MANAGER, dryRun: false, mode: 'on', includeOutOfCorridor: true })).status).toBe(403)

    const wb = recordingWriteback()
    const r = await applyPriceBatch({ batchId, actor: OWNER, dryRun: false, mode: 'on', includeOutOfCorridor: true, writebackFn: wb.fn })
    expect(r.applied).toBe(2)
    expect(Number((await prisma.productVariant.findUnique({ where: { id: vWhiteId } })).price)).toBe(104000)
    await new Promise(res => setTimeout(res, 300))
    expect(await prisma.securityLog.count({ where: { event: 'price_out_of_corridor_applied' } })).toBe(1)
    expect(await prisma.securityLog.count({ where: { event: 'price_batch_applied' } })).toBe(1)
  })

  it('свежесть: строка «уехала» in→out между preview и apply → у manager скипается', async () => {
    // Black был in (+3.5%); после preview цену подняли руками до 130 000 →
    // предложение 103 490 теперь −20.4% — вне коридора на момент apply
    await prisma.productVariant.update({ where: { id: vBlackId }, data: { price: 130000 } })
    const r = await applyPriceBatch({ batchId, actor: MANAGER, dryRun: false, mode: 'on', writebackFn: recordingWriteback().fn })
    expect(r.applied).toBe(0)
    expect(r.skippedOutOfCorridor).toBe(2)
    expect(Number((await prisma.productVariant.findUnique({ where: { id: vBlackId } })).price)).toBe(130000)
  })

  it('фейл writeback: БД-транзакция НЕ откатывается, батч помечен, синк замораживает, retry снимает', async () => {
    const r = await applyPriceBatch({ batchId, actor: OWNER, dryRun: false, mode: 'on', writebackFn: failingWriteback })
    expect(r.writebackFailed).toBe(true)
    expect(Number((await prisma.productVariant.findUnique({ where: { id: vBlackId } })).price)).toBe(103500) // применено
    const b = await prisma.priceApplyBatch.findUnique({ where: { id: batchId } })
    expect(b.status).toBe('applied')
    expect(b.stats.writebackFailed).toBe(true)

    // п.2: синк видит замороженные варианты — но ТОЛЬКО применённые
    // (White скипнут вне коридора — его листовые правки не подвешиваем)
    const frozen = await getFrozenVariantIds(prisma)
    expect(frozen.has(vBlackId)).toBe(true)
    expect(frozen.has(vWhiteId)).toBe(false)

    // retry с рабочим листом снимает флаг → заморозка уходит
    const wb = recordingWriteback()
    const retry = await retryWriteback(batchId, OWNER, wb.fn)
    expect(retry.ok).toBe(true)
    expect((await getFrozenVariantIds(prisma)).size).toBe(0)
  })

  it('advisory-lock синка занят → 409, ничего не записано', async () => {
    const before = await snap()
    await prisma.$transaction(async (tx: any) => {
      const got = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(73001) as "l"` // лок до конца tx
      expect(got[0].l).toBe(true)
      const r = await applyPriceBatch({ batchId, actor: OWNER, dryRun: false, mode: 'on', writebackFn: recordingWriteback().fn })
      expect(r.status).toBe(409)
      expect(r.error).toContain('синхронизация')
    })
    expect(await snap()).toEqual(before)
    expect(await prisma.priceChange.count()).toBe(0)
  })

  it('rollback: цена И закупка восстановлены, конфликтная строка не тронута, писбэк отката, статус-гарды', async () => {
    const wb = recordingWriteback()
    await applyPriceBatch({ batchId, actor: OWNER, dryRun: false, mode: 'on', includeOutOfCorridor: true, writebackFn: wb.fn })
    // конфликт: White после apply тронул «кто-то ещё»
    await prisma.productVariant.update({ where: { id: vWhiteId }, data: { price: 99999 } })

    const r = await rollbackPriceBatch({ batchId, actor: OWNER, writebackFn: wb.fn })
    expect(r.ok).toBe(true)
    expect(r.applied).toBe(1) // откатили только Black
    expect(r.conflicts).toHaveLength(1)
    expect(r.conflicts[0].variantId).toBe(vWhiteId)

    const black = await prisma.productVariant.findUnique({ where: { id: vBlackId } })
    expect(Number(black.price)).toBe(100000)      // цена восстановлена
    expect(Number(black.costPrice)).toBe(80000)    // и закупка из applyResult.oldCost
    expect(Number(black.lastSyncedCostPrice)).toBe(80000)
    expect(Number((await prisma.productVariant.findUnique({ where: { id: vWhiteId } })).price)).toBe(99999) // чужая правка цела

    const lastWb = wb.calls.at(-1)
    // Откат честно снимает поставщика (O чистится) и ставит новую метку P
    expect(lastWb).toEqual([{
      fullName: 'PA7 iPhone 17 Pro 256 Black', cost: 80000, price: 100000,
      supplier: '', updatedAt: expect.stringMatching(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/),
    }])
    expect((await prisma.productVariant.findUnique({ where: { id: vBlackId } })).bestSupplierName).toBeNull()

    const b = await prisma.priceApplyBatch.findUnique({ where: { id: batchId } })
    expect(b.status).toBe('rolled_back')
    expect((await prisma.supplierPrice.findMany({ where: { batchId } })).every((x: any) => !x.isActive)).toBe(true)

    // статус-гарды: повторный rollback → 409; apply rolled_back-батча → 409
    expect((await rollbackPriceBatch({ batchId, actor: OWNER, writebackFn: wb.fn })).status).toBe(409)
    expect((await applyPriceBatch({ batchId, actor: OWNER, dryRun: false, mode: 'on' })).status).toBe(409)
  })

  it('БЛОКЕР #31: oldCost=null — откат чистит закупку в листе и НЕ переприменяется синком', async () => {
    // White до применения: costPrice = null (создан без закупки)
    expect((await prisma.productVariant.findUnique({ where: { id: vWhiteId } })).costPrice).toBeNull()

    const wb = recordingWriteback()
    await applyPriceBatch({ batchId, actor: OWNER, dryRun: false, mode: 'on', includeOutOfCorridor: true, writebackFn: wb.fn })
    // применён: price 103 990, costPrice 89 000
    expect(Number((await prisma.productVariant.findUnique({ where: { id: vWhiteId } })).costPrice)).toBe(89000)

    const r = await rollbackPriceBatch({ batchId, actor: OWNER, writebackFn: wb.fn })
    expect(r.ok).toBe(true)
    expect(r.applied).toBe(2) // обе строки восстановлены (конфликтов нет)

    const white = await prisma.productVariant.findUnique({ where: { id: vWhiteId } })
    expect(Number(white.price)).toBe(140000)
    expect(white.costPrice).toBeNull()          // закупка вернулась к null
    expect(white.lastSyncedCostPrice).toBeNull()

    // Писбэк отката содержит null-cost строку → в листе колонка L очищается
    const lastWb = wb.calls.at(-1)!
    const whiteRow = lastWb.find((x: any) => x.fullName === 'PA7 iPhone 17 Pro 256 White')
    expect(whiteRow).toEqual({
      fullName: 'PA7 iPhone 17 Pro 256 White', cost: null, price: 140000,
      supplier: '', updatedAt: expect.stringMatching(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/),
    })

    // Синк-путь после отката: лист = то, что записал писбэк (L пустая → null,
    // M = 140 000). Пересчёт НЕ срабатывает, mirror — откат прилипает.
    const { decidePriceSync } = await import('../../lib/price-sync-policy')
    expect(decidePriceSync({
      sheetCost: null, lastSyncedCost: null,
      dbPrice: 140000, sheetPrice: 140000, frozen: false,
    })).toBe('mirror_sheet_price')
    // и для Black (oldCost=80000) симметрично:
    expect(decidePriceSync({
      sheetCost: 80000, lastSyncedCost: 80000,
      dbPrice: 100000, sheetPrice: 100000, frozen: false,
    })).toBe('mirror_sheet_price')
  })
})
