/**
 * Движок «лучший поставщик»: минимум среди СВЕЖИХ активных цен, тай-брейк —
 * самый свежий parsedAt, протухшие не участвуют. Применение — только через
 * превью-батч (машинерия price-apply), сборка ничего не применяет.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    supplierPrice: { findMany: vi.fn(), createMany: vi.fn() },
    productVariant: { findMany: vi.fn() },
    priceApplyBatch: { updateMany: vi.fn(), create: vi.fn() },
    markupRule: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))

import { prisma } from '../lib/prisma'
import { isFreshPrice, pickBestSupplierPrice, buildBestSupplierBatch } from '../lib/best-supplier'

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = prisma as any
const NOW = new Date('2026-08-06T12:00:00Z')
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000)

const cand = (over: Record<string, unknown> = {}) => ({
  price: 100_000, parsedAt: days(-1), expiresAt: null as Date | null, ttlDays: 3, ...over,
})

describe('isFreshPrice', () => {
  it('expiresAt главнее: в будущем — свежая, в прошлом — нет (даже при живом TTL)', () => {
    expect(isFreshPrice(cand({ expiresAt: days(1) }), NOW)).toBe(true)
    expect(isFreshPrice(cand({ expiresAt: days(-0.5), parsedAt: days(-0.1) }), NOW)).toBe(false)
  })

  it('без expiresAt — parsedAt + TTL поставщика; null TTL = дефолтные 3 дня', () => {
    expect(isFreshPrice(cand({ parsedAt: days(-2), ttlDays: 3 }), NOW)).toBe(true)
    expect(isFreshPrice(cand({ parsedAt: days(-4), ttlDays: 3 }), NOW)).toBe(false)
    expect(isFreshPrice(cand({ parsedAt: days(-2), ttlDays: null }), NOW)).toBe(true)
    expect(isFreshPrice(cand({ parsedAt: days(-4), ttlDays: null }), NOW)).toBe(false)
    expect(isFreshPrice(cand({ parsedAt: days(-8), ttlDays: 10 }), NOW)).toBe(true)
  })
})

describe('pickBestSupplierPrice', () => {
  it('выбирает минимальную закупку среди свежих', () => {
    const win = pickBestSupplierPrice([
      cand({ price: 105_000 }), cand({ price: 99_000 }), cand({ price: 101_000 }),
    ], NOW)
    expect(win!.price).toBe(99_000)
  })

  it('протухшая минимальная НЕ выигрывает — берём минимум среди свежих', () => {
    const win = pickBestSupplierPrice([
      cand({ price: 90_000, parsedAt: days(-10) }),          // протухла
      cand({ price: 95_000, expiresAt: days(-1) }),          // протухла по expiresAt
      cand({ price: 99_000 }),
    ], NOW)
    expect(win!.price).toBe(99_000)
  })

  it('тай-брейк при равном минимуме — самый свежий parsedAt', () => {
    const older = cand({ price: 99_000, parsedAt: days(-2), tag: 'older' })
    const newer = cand({ price: 99_000, parsedAt: days(-1), tag: 'newer' })
    expect((pickBestSupplierPrice([older, newer], NOW) as any).tag).toBe('newer')
    expect((pickBestSupplierPrice([newer, older], NOW) as any).tag).toBe('newer')
  })

  it('все протухли → null', () => {
    expect(pickBestSupplierPrice([cand({ parsedAt: days(-30) })], NOW)).toBeNull()
  })
})

describe('buildBestSupplierBatch', () => {
  const sp = (over: Record<string, unknown> = {}) => ({
    id: 1, variantId: 10, price: 90_000, parsedAt: days(-1), expiresAt: null,
    supplierId: 5, supplierName: null,
    model: 'iPhone 17', storage: '256GB', ram: null, color: 'Black', simType: null, country: 'Япония',
    rawMessage: 'iPhone 17 256 Black 90000',
    supplier: { name: 'Дубай-опт', priceTtlDays: 3, isActive: true },
    ...over,
  })

  beforeEach(() => {
    ;[p.supplierPrice.findMany, p.supplierPrice.createMany, p.productVariant.findMany,
      p.priceApplyBatch.updateMany, p.priceApplyBatch.create, p.markupRule.findMany, p.$transaction]
      .forEach(f => f.mockReset())
    p.markupRule.findMany.mockResolvedValue([]) // нет правил → roundPrice(cost)
    p.$transaction.mockImplementation(async (fn: any) => fn(p))
    p.priceApplyBatch.updateMany.mockResolvedValue({ count: 0 })
    p.priceApplyBatch.create.mockResolvedValue({ id: 77 })
    p.supplierPrice.createMany.mockResolvedValue({ count: 1 })
  })

  it('собирает превью из победителя: копия строки с оригинальными parsedAt/expiresAt, isActive=false', async () => {
    p.supplierPrice.findMany.mockResolvedValue([
      sp({ id: 1, price: 95_000 }),
      sp({ id: 2, price: 90_000, supplier: { name: 'Гонконг-трейд', priceTtlDays: 5, isActive: true }, parsedAt: days(-2), expiresAt: days(2) }),
    ])
    p.productVariant.findMany.mockResolvedValue([{ id: 10, price: 120_000, costPrice: 95_000 }])

    const r = await buildBestSupplierBatch('900', NOW)
    expect(r).toMatchObject({ ok: true, batchId: 77, stats: { rows: 1, variantsWithOffers: 1 } })

    const created = p.supplierPrice.createMany.mock.calls[0][0].data
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      batchId: 77, variantId: 10, price: 90_000,
      supplierName: 'Гонконг-трейд', isActive: false,
      parsedAt: days(-2), expiresAt: days(2), // свежесть оригинала, не «сейчас»
    })
    // прежние best_supplier-превью сброшены
    expect(p.priceApplyBatch.updateMany).toHaveBeenCalledWith({
      where: { source: 'best_supplier', status: 'preview' },
      data: { status: 'discarded' },
    })
  })

  it('цены выключенного поставщика не участвуют в выборе', async () => {
    p.supplierPrice.findMany.mockResolvedValue([
      sp({ id: 1, price: 80_000, supplier: { name: 'Спящий', priceTtlDays: 3, isActive: false } }),
      sp({ id: 2, price: 90_000 }),
    ])
    p.productVariant.findMany.mockResolvedValue([{ id: 10, price: 120_000, costPrice: null }])

    await buildBestSupplierBatch('900', NOW)
    const created = p.supplierPrice.createMany.mock.calls[0][0].data
    expect(created[0].price).toBe(90_000)
    expect(created[0].supplierName).toBe('Дубай-опт')
  })

  it('победитель уже применён (та же закупка и розница) → изменений нет, батч не создаётся', async () => {
    p.supplierPrice.findMany.mockResolvedValue([sp({ price: 90_000 })])
    // roundPrice(90000)=90000 при пустых правилах
    p.productVariant.findMany.mockResolvedValue([{ id: 10, price: 90_000, costPrice: 90_000 }])

    const r = await buildBestSupplierBatch('900', NOW)
    expect(r).toMatchObject({ ok: true, batchId: null, stats: { rows: 0, unchanged: 1 } })
    expect(p.priceApplyBatch.create).not.toHaveBeenCalled()
  })

  it('все цены варианта протухли → вариант пропускается целиком', async () => {
    p.supplierPrice.findMany.mockResolvedValue([sp({ parsedAt: days(-30) })])
    p.productVariant.findMany.mockResolvedValue([{ id: 10, price: 120_000, costPrice: null }])

    const r = await buildBestSupplierBatch('900', NOW)
    expect(r.batchId).toBeNull()
    expect(r.stats).toMatchObject({ variantsWithOffers: 0, rows: 0 })
  })
})
