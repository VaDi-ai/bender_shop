/**
 * Очередь «не узнал» и применённые разборы.
 *
 * Была дыра: очередь брала только preview-батчи, и непривязанная строка
 * исчезала из неё в момент применения батча — применение проводит УЗНАННЫЕ
 * строки, а неузнанные так и остаются без варианта, но показать их было уже
 * негде. Так из очереди выпали 39 строк, включая все «MacBook Air 15 M5»:
 * завести на них правило стало невозможно.
 *
 * Отменённые батчи (discarded/rolled_back) в очередь не берём осознанно.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: { supplierPrice: { findMany: vi.fn() } },
}))

import { prisma } from '../lib/prisma'
import { listUnmatched, UNMATCHED_BATCH_STATUSES } from '../lib/price-alias'

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = prisma as any

describe('listUnmatched — какие батчи попадают в очередь', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    p.supplierPrice.findMany.mockResolvedValue([])
  })

  it('берёт preview И applied', async () => {
    await listUnmatched()
    const where = p.supplierPrice.findMany.mock.calls[0][0].where
    expect(where.variantId).toBeNull()
    expect(where.batch.status.in).toEqual(['preview', 'applied'])
  })

  it('отменённые разборы в очередь не тянет', () => {
    expect(UNMATCHED_BATCH_STATUSES).not.toContain('discarded')
    expect(UNMATCHED_BATCH_STATUSES).not.toContain('rolled_back')
  })

  it('строка из применённого разбора помечена статусом — UI отличит её', async () => {
    p.supplierPrice.findMany.mockResolvedValue([{
      id: 813, batchId: 59, rawMessage: 'MacBook MDVH4 Air 15 Midnight (M5, 16GB, 512GB) 2026 131500',
      model: 'MacBook Air 15 M5', price: 131500, parsedAt: new Date('2026-08-28T00:00:00Z'),
      supplier: { name: 'Ланский' }, batch: { status: 'applied' },
    }])
    const [row] = await listUnmatched()
    expect(row.batchStatus).toBe('applied')
    expect(row.supplierPriceId).toBe(813)
    expect(row.supplierName).toBe('Ланский')
  })
})
