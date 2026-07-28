/**
 * Аналитика и клиенты: деньги и ПДн — по роли. Менеджеру не «пусто без
 * объяснений», а честно сказано, что скрыто.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    order: { findMany: vi.fn() },
    orderItem: { findMany: vi.fn() },
    client: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock('../lib/client-crypto', () => ({
  decryptClientField: (v: string | null) => (v ? v.replace('enc:', '') : null),
}))

import { prisma } from '../lib/prisma'
import { getInsights, findClients, getClientCard, maskPhone, maskEmail } from '../lib/insights-admin'

/* eslint-disable @typescript-eslint/no-explicit-any */
const order = prisma.order as any
const orderItem = prisma.orderItem as any
const client = prisma.client as any

beforeEach(() => {
  ;[order.findMany, orderItem.findMany, client.count, client.findMany, client.findUnique].forEach(f => f.mockReset())
  order.findMany.mockResolvedValue([
    { id: 1, createdAt: new Date(), totalAmount: 100000, status: 'new' },
    { id: 2, createdAt: new Date(), totalAmount: 50000, status: 'cancelled' },
  ])
  orderItem.findMany.mockResolvedValue([
    { productName: 'iPhone 17 Pro', quantity: 2, priceAtPurchase: 100000 },
    { productName: 'AirPods 4', quantity: 1, priceAtPurchase: 10000 },
  ])
  client.count.mockResolvedValue(5)
})

describe('аналитика', () => {
  it('владелец видит деньги', async () => {
    const d = await getInsights('owner', 30)
    expect(d.revenue).toBe(150000)
    expect(d.orders).toMatchObject({ total: 2, paid: 1, avgCheck: 75000 })
    expect(d.topProducts[0]).toMatchObject({ name: 'iPhone 17 Pro', qty: 2, revenue: 200000 })
    expect(d.hiddenForRole).toEqual([])
  })

  it('менеджер видит количества, но не суммы — и знает, что скрыто', async () => {
    const d = await getInsights('manager', 30)
    expect(d.revenue).toBeNull()
    expect(d.orders.avgCheck).toBeNull()
    expect(d.orders.total).toBe(2)                       // количество не прячем
    expect(d.topProducts[0].revenue).toBeNull()
    expect(d.topProducts[0].qty).toBe(2)
    expect(d.byDay.every(x => x.revenue === null)).toBe(true)
    expect(d.hiddenForRole).toContain('выручка')
  })

  it('период зажимается в разумные рамки', async () => {
    expect((await getInsights('owner', 0)).range).toBe(1)
    expect((await getInsights('owner', 9999)).range).toBe(90)
    expect((await getInsights('owner', 30)).byDay).toHaveLength(30)
  })

  it('пустой период не ломает средний чек', async () => {
    order.findMany.mockResolvedValue([])
    orderItem.findMany.mockResolvedValue([])
    const d = await getInsights('owner', 7)
    expect(d.orders).toMatchObject({ total: 0, avgCheck: null })
    expect(d.revenue).toBe(0)
  })
})

describe('маскирование ПДн', () => {
  it('телефон и почта показываются частично', () => {
    expect(maskPhone('+7 (999) 123-45-67')).toBe('···4567')
    expect(maskPhone(null)).toBeNull()
    expect(maskPhone('12')).toBe('···')
    expect(maskEmail('ivan.petrov@example.com')).toBe('iv···@example.com')
    expect(maskEmail('мусор')).toBe('···')
  })

  it('менеджер получает маску, владелец — полное значение', async () => {
    client.findMany.mockResolvedValue([{
      id: 1, name: 'Иван', source: 'telegram', telegramUsername: 'ivan',
      phone: 'enc:+79991234567', email: 'enc:ivan@example.com',
      totalPurchases: 2, totalRevenue: 5000, lastPurchaseDate: null, pdnConsentAt: null,
      _count: { orders: 2 },
    }])
    const asManager = await findClients('manager', 'Иван')
    expect(asManager[0]).toMatchObject({ phone: '···4567', email: 'iv···@example.com', totalRevenue: null })
    const asOwner = await findClients('owner', 'Иван')
    expect(asOwner[0]).toMatchObject({ phone: '+79991234567', email: 'ivan@example.com', totalRevenue: 5000 })
  })

  it('короткий запрос в базу не ходит', async () => {
    expect(await findClients('owner', 'и')).toEqual([])
    expect(client.findMany).not.toHaveBeenCalled()
  })

  it('битый шифротекст не роняет выдачу', async () => {
    client.findMany.mockResolvedValue([{
      id: 1, name: 'Иван', source: 'telegram', telegramUsername: null,
      phone: 'мусор-который-не-расшифровать', email: null,
      totalPurchases: 0, totalRevenue: 0, lastPurchaseDate: null, pdnConsentAt: null,
      _count: { orders: 0 },
    }])
    const r = await findClients('owner', 'Иван')
    expect(r).toHaveLength(1)
  })
})

describe('карточка клиента', () => {
  it('менеджеру суммы заказов не показываем', async () => {
    client.findUnique.mockResolvedValue({
      id: 1, name: 'Иван', source: 'telegram', telegramUsername: null, phone: null, email: null,
      totalPurchases: 1, totalRevenue: 1000, lastPurchaseDate: null, pdnConsentAt: new Date(),
      _count: { orders: 1 },
      orders: [{ id: 9, createdAt: new Date(), status: 'new', totalAmount: 1000, items: [{ productName: 'iPhone', quantity: 1 }] }],
    })
    const asManager = await getClientCard('manager', 1)
    expect(asManager!.orders[0].total).toBeNull()
    expect(asManager!.orders[0].items[0]).toEqual({ name: 'iPhone', qty: 1 })
    const asOwner = await getClientCard('owner', 1)
    expect(asOwner!.orders[0].total).toBe(1000)
  })

  it('нет клиента — null', async () => {
    client.findUnique.mockResolvedValue(null)
    expect(await getClientCard('owner', 999)).toBeNull()
  })
})
