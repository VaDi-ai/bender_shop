/**
 * PR-8 — очередь «не узнал» + обучение алиасами (реальная БД, INTEGRATION_DB=1).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const RUN = process.env.INTEGRATION_DB === '1'

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any
let createPriceBatch: any, linkSupplierPriceRow: any, listUnmatched: any

function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try { host = new URL(url).hostname } catch { /* noop */ }
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
    throw new Error(`INTEGRATION_DB=1 с не-локальной БД (host="${host}") — отказ.`)
  }
}

const mockParse = async () => ([
  { model: 'Неведома Зверушка', storage: '256', ram: null, color: 'Black', country: null, simType: null, price: 50000, rawLine: 'Неведома Зверушка 256 Black — 50.000' },
])

describe.skipIf(!RUN)('price alias: связать → пере-матч → запомнила', () => {
  let variantId: number, supplierId: number

  beforeAll(async () => {
    assertDisposableDb()
    ;({ prisma } = await import('../../lib/prisma'))
    ;({ createPriceBatch } = await import('../../lib/price-batch'))
    ;({ linkSupplierPriceRow, listUnmatched } = await import('../../lib/price-alias'))
  })

  beforeEach(async () => {
    for (const t of ['supplierPrice', 'priceApplyBatch', 'priceAlias', 'productVariant', 'product', 'supplier']) {
      await prisma[t].deleteMany()
    }
    const product = await prisma.product.create({ data: { sku: 'pa8', name: 'PA8 Товар', price: 60000, attributes: {} } })
    variantId = (await prisma.productVariant.create({
      data: { productId: product.id, sku: 'pa8-v', price: 60000, quantity: 1, inStock: true, attributes: { 'Цвет': 'Black', fullName: 'PA8 Товар 256 Black' } },
    })).id
    supplierId = (await prisma.supplier.create({ data: { name: 'PA8-пост', chatId: 'web:pa8' } })).id
  })

  afterAll(async () => {
    if (!prisma) return
    for (const t of ['supplierPrice', 'priceApplyBatch', 'priceAlias', 'productVariant', 'product', 'supplier']) {
      await prisma[t].deleteMany()
    }
    await prisma.$disconnect()
  })

  it('связывание: алиасы по rawLine и композиту, пере-матч unmatched, stats батча обновлены', async () => {
    const b = await createPriceBatch({ source: 'message', text: 'зверушка прайс', supplierId, createdBy: 'webhook', parseFn: mockParse })
    expect(b.stats.unmatchedRows).toBe(1)

    const q = await listUnmatched()
    expect(q).toHaveLength(1)
    expect(q[0].supplierName).toBe('PA8-пост')

    const r = await linkSupplierPriceRow({ supplierPriceId: q[0].supplierPriceId, variantId, actor: { telegramId: '111' } })
    expect(r.ok).toBe(true)
    expect(r.rematched).toBe(1)
    expect(r.aliases).toEqual(expect.arrayContaining(['неведома зверушка 256 black — 50.000', 'неведома зверушка 256 black']))

    // строка довязана (isActive остаётся false — read-only контракт)
    const row = await prisma.supplierPrice.findUnique({ where: { id: q[0].supplierPriceId } })
    expect(row.variantId).toBe(variantId)
    expect(row.isActive).toBe(false)
    // stats пересчитаны
    const batch = await prisma.priceApplyBatch.findUnique({ where: { id: b.batchId } })
    expect(batch.stats.unmatchedRows).toBe(0)
    expect(batch.stats.matchedRows).toBe(1)
    // очередь пуста
    expect(await listUnmatched()).toHaveLength(0)

    // «запомнила»: следующий батч матчится сам (третий ключ матчера — rawLine)
    const b2 = await createPriceBatch({ source: 'message', text: 'зверушка прайс v2', supplierId, createdBy: 'webhook', parseFn: mockParse })
    expect(b2.stats.matchedRows).toBe(1)
    expect(b2.stats.unmatchedRows).toBe(0)
  })

  it('ignore: будущие разборы пропускают строку (ignoredRows), в вариант не пишется', async () => {
    const b = await createPriceBatch({ source: 'paste', text: 'зверушка прайс', supplierId, createdBy: '111', parseFn: mockParse })
    const q = await listUnmatched()
    const r = await linkSupplierPriceRow({ supplierPriceId: q[0].supplierPriceId, ignore: true, actor: { telegramId: '111' } })
    expect(r.ok).toBe(true)

    const b2 = await createPriceBatch({ source: 'paste', text: 'зверушка прайс v2', supplierId, createdBy: '111', parseFn: mockParse })
    expect(b2.stats.ignoredRows).toBe(1)
    expect(b2.stats.matchedRows).toBe(0)
    expect(b.batchId).not.toBe(b2.batchId)
  })
})
