/**
 * Применение батча: аудит «кто/когда» (bestSupplierName/priceUpdatedAt + O/P
 * в писбэке), owner-гейт движка «лучший поставщик», откат снимает имя.
 * Checkout цен не касается — цена заказа как читалась из variant.price, так и
 * читается (эти тесты фиксируют, что apply меняет ровно price/cost+аудит).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    priceApplyBatch: { findUnique: vi.fn(), update: vi.fn() },
    supplierPrice: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    productVariant: { findMany: vi.fn(), update: vi.fn() },
    priceChange: { create: vi.fn(), findMany: vi.fn() },
    supplier: { findUnique: vi.fn(), update: vi.fn() },
    markupRule: { findMany: vi.fn() },
  },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/security-log', () => ({ logSecurityEvent: vi.fn() }))
// Лок синка: выполняем колбэк на том же моке prisma — транзакционная семантика
// здесь не предмет теста
vi.mock('../lib/sync-lock', async () => {
  const { prisma } = await import('../lib/prisma')
  return {
    withSyncLock: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
    SyncLockBusy: class SyncLockBusy extends Error {},
    SYNC_LOCK_BUSY_MESSAGE: 'busy',
  }
})

import { prisma } from '../lib/prisma'
import { applyPriceBatch, rollbackPriceBatch } from '../lib/price-apply'

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = prisma as any
const OWNER = { telegramId: '900', role: 'owner' as const }
const MANAGER = { telegramId: '901', role: 'manager' as const }

const batchRow = (over: Record<string, unknown> = {}) => ({
  id: 5, source: 'best_supplier', status: 'preview', supplierId: null,
  createdBy: '900', createdAt: new Date(), appliedAt: null, stats: {}, ...over,
})

beforeEach(() => {
  Object.values(p).forEach((tbl: any) => Object.values(tbl).forEach((f: any) => f.mockReset?.()))
  p.markupRule.findMany.mockResolvedValue([]) // retail = roundPrice(cost)
  p.priceApplyBatch.update.mockResolvedValue({})
  p.supplierPrice.update.mockResolvedValue({})
  p.supplierPrice.updateMany.mockResolvedValue({})
  p.productVariant.update.mockResolvedValue({})
  p.priceChange.create.mockResolvedValue({})
  p.supplier.update.mockResolvedValue({})
})

describe('движок «лучший поставщик» — применяет только владелец', () => {
  it('менеджеру реальное применение закрыто (403), dry-run разрешён', async () => {
    p.priceApplyBatch.findUnique.mockResolvedValue(batchRow())
    p.supplierPrice.findMany.mockResolvedValue([])
    p.productVariant.findMany.mockResolvedValue([])

    const real = await applyPriceBatch({ batchId: 5, actor: MANAGER, dryRun: false, mode: 'on' })
    expect(real).toMatchObject({ ok: false, status: 403 })
    expect(real.error).toContain('владелец')

    const dry = await applyPriceBatch({ batchId: 5, actor: MANAGER, dryRun: true, mode: 'on' })
    expect(dry).toMatchObject({ ok: true, dryRun: true })
  })
})

describe('apply пишет аудит «кто/когда» и O/P в писбэк', () => {
  const arm = () => {
    p.priceApplyBatch.findUnique.mockResolvedValue(batchRow())
    p.supplierPrice.findMany.mockResolvedValue([{
      id: 71, batchId: 5, variantId: 10, price: 90_000, supplierName: 'Гонконг-трейд',
      rawMessage: 'iPhone 17 256 Black 90000',
    }])
    p.productVariant.findMany.mockResolvedValue([{
      id: 10, price: 95_000, costPrice: 95_000,
      attributes: { fullName: 'iPhone 17 256 Black' },
    }])
  }

  it('variant.update получает bestSupplierName + priceUpdatedAt; писбэк несёт O/P', async () => {
    arm()
    const wb = vi.fn(async () => ({ missing: [] }))
    const r = await applyPriceBatch({ batchId: 5, actor: OWNER, dryRun: false, mode: 'on', writebackFn: wb })
    expect(r.ok).toBe(true)
    expect(r.applied).toBe(1)

    const upd = p.productVariant.update.mock.calls[0][0]
    expect(upd.where).toEqual({ id: 10 })
    expect(upd.data).toMatchObject({ price: 90_000, costPrice: 90_000, bestSupplierName: 'Гонконг-трейд' })
    expect(upd.data.priceUpdatedAt).toBeInstanceOf(Date)

    const rows = wb.mock.calls[0][0] as any[]
    expect(rows[0]).toMatchObject({ fullName: 'iPhone 17 256 Black', cost: 90_000, price: 90_000, supplier: 'Гонконг-трейд' })
    expect(rows[0].updatedAt).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/) // дата И время
  })

  it('строка без поставщика → O уходит пустой строкой, не undefined', async () => {
    arm()
    p.supplierPrice.findMany.mockResolvedValue([{
      id: 71, batchId: 5, variantId: 10, price: 90_000, supplierName: null,
      rawMessage: 'iPhone 17 256 Black 90000',
    }])
    const wb = vi.fn(async () => ({ missing: [] }))
    await applyPriceBatch({ batchId: 5, actor: OWNER, dryRun: false, mode: 'on', writebackFn: wb })
    expect((wb.mock.calls[0][0] as any[])[0].supplier).toBe('')
  })
})

describe('rollback снимает имя поставщика', () => {
  it('variant.update: bestSupplierName=null + свежий priceUpdatedAt; писбэк чистит O', async () => {
    p.priceApplyBatch.findUnique.mockResolvedValue(batchRow({
      status: 'applied',
      stats: { applyResult: { rows: [{ action: 'applied', variantId: 10, oldCost: 95_000, supplierName: 'Гонконг-трейд' }] } },
    }))
    p.priceChange.findMany.mockResolvedValue([{ variantId: 10, oldPrice: 95_000, newPrice: 90_000 }])
    p.productVariant.findMany.mockResolvedValue([{
      id: 10, price: 90_000, attributes: { fullName: 'iPhone 17 256 Black' },
    }])
    const wb = vi.fn(async () => ({ missing: [] }))

    const r = await rollbackPriceBatch({ batchId: 5, actor: OWNER, writebackFn: wb })
    expect(r.ok).toBe(true)
    expect(r.applied).toBe(1)

    const upd = p.productVariant.update.mock.calls[0][0]
    expect(upd.data).toMatchObject({ price: 95_000, bestSupplierName: null })
    expect(upd.data.priceUpdatedAt).toBeInstanceOf(Date)

    const rows = wb.mock.calls[0][0] as any[]
    expect(rows[0]).toMatchObject({ fullName: 'iPhone 17 256 Black', price: 95_000, supplier: '' })
    expect(rows[0].updatedAt).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/)
  })
})
