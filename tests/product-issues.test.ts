/**
 * «Ошибки в товарах»: считаем только видимое покупателю — иначе 800+ скрытых
 * дублей утопят раздел и владелец перестанет в него смотреть.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({ prisma: { product: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))

import { prisma } from '../lib/prisma'
import { listProductIssues } from '../lib/product-admin'

/* eslint-disable @typescript-eslint/no-explicit-any */
const pp = prisma.product as any

const variant = (over: Record<string, unknown> = {}) => ({
  id: 1, inStock: true, quantity: 3, photoUrls: ['/photos/a.webp'],
  attributes: { fullName: 'iPhone 17 Pro 256 (Япония)', SIM: 'eSIM' }, ...over,
})
const product = (over: Record<string, unknown> = {}) => ({
  id: 1, name: 'iPhone 17 Pro', description: 'Описание', photoUrl: '/photos/a.webp', photos: ['/photos/a.webp'],
  category: { name: 'iPhone' }, variants: [variant()], ...over,
})

beforeEach(() => pp.findMany.mockReset())

describe('какие ошибки видит владелец', () => {
  it('здоровый товар ошибок не даёт', async () => {
    pp.findMany.mockResolvedValue([product()])
    const d = await listProductIssues()
    expect(d.groups).toEqual([])
    expect(d.visibleProducts).toBe(1)
  })

  it('нет фото / нет описания / нет SIM — каждая своя группа', async () => {
    pp.findMany.mockResolvedValue([
      product({ id: 1, photoUrl: null, photos: [] }),
      product({ id: 2, description: '   ' }),
      product({ id: 3, variants: [variant({ attributes: { fullName: 'iPhone 17 Pro 256 (Япония)' } })] }),
    ])
    const d = await listProductIssues()
    expect(d.counts).toMatchObject({ no_photo: 1, no_description: 1, no_sim: 1 })
  })

  it('«показывается, но купить нельзя» — когда все остатки нулевые', async () => {
    pp.findMany.mockResolvedValue([product({ variants: [variant({ quantity: 0, inStock: false })] })])
    const d = await listProductIssues()
    expect(d.counts.no_stock).toBe(1)
    expect(d.visibleProducts).toBe(0)
    // у такого товара не ищем остальные проблемы — сначала остатки
    expect(d.counts.no_photo).toBe(0)
  })

  it('битая ссылка на фото ловится отдельно от «нет фото»', async () => {
    pp.findMany.mockResolvedValue([product({ photoUrl: 'AgACAgIAAxkBfileid', photos: ['AgACAgIAAxkBfileid'] })])
    const d = await listProductIssues()
    expect(d.counts.bad_photo).toBe(1)
    expect(d.counts.no_photo).toBe(0)
  })

  it('скрытые товары в выборку не попадают вовсе', async () => {
    await listProductIssues()
    expect(pp.findMany.mock.calls[0][0].where).toEqual({ isAvailable: true })
  })

  it('не-телефону пустой SIM не в укор', async () => {
    pp.findMany.mockResolvedValue([product({
      name: 'Apple Watch Ultra 3', category: { name: 'Часы' },
      variants: [variant({ attributes: { fullName: 'Apple Watch Ultra 3 49mm' } })],
    })])
    expect((await listProductIssues()).counts.no_sim).toBe(0)
  })

  it('группы отсортированы по величине и режутся лимитом', async () => {
    pp.findMany.mockResolvedValue([
      ...Array.from({ length: 25 }, (_, i) => product({ id: 100 + i, photoUrl: null, photos: [] })),
      product({ id: 200, description: '' }),
    ])
    const d = await listProductIssues(20)
    expect(d.groups[0].kind).toBe('no_photo')
    expect(d.groups[0].count).toBe(25)
    expect(d.groups[0].rows).toHaveLength(20)
  })
})
