/**
 * Аналитика и клиенты для веб-админки. Только чтение.
 *
 * Два правила проекта, которые тут решают:
 *   • деньги видит владелец: менеджеру суммы и выручку не показываем (как в
 *     дашборде §hardening-2), только количества;
 *   • ПДн: телефон и почта клиента лежат зашифрованными; менеджер видит их
 *     замаскированными, полностью — только владелец. Ничего не выдумываем:
 *     нет данных → так и пишем.
 */
import { prisma } from './prisma'
import { decryptClientField } from './client-crypto'

export type Role = 'owner' | 'manager'

const DAY = 24 * 60 * 60 * 1000

export interface SalesPoint { date: string; orders: number; revenue: number | null }

export interface Insights {
  range: number
  orders: { total: number; paid: number; avgCheck: number | null }
  revenue: number | null
  byDay: SalesPoint[]
  topProducts: Array<{ name: string; qty: number; revenue: number | null }>
  clients: { total: number; withOrders: number; newInRange: number }
  /** Воронка — расчёт один в один с ботом (bot/admin/analytics.ts buildFunnelReport) */
  funnel: {
    newClients: number
    reservations: number
    orders: number
    conversionPct: string
    repeatClients: number
    revenue: number | null
  }
  /** Топ клиентов — ранжирование как в боте (buildTopClients): по выручке за период */
  topClients: Array<{ name: string; orders: number; revenue: number | null }>
  /** Что именно скрыто из-за роли — честно, а не молча пусто */
  hiddenForRole: string[]
}

export async function getInsights(role: Role, days = 30): Promise<Insights> {
  const range = Math.min(Math.max(days, 1), 90)
  const since = new Date(Date.now() - range * DAY)
  const showMoney = role === 'owner'

  const [orders, items, clientsTotal, clientsWithOrders, clientsNew, reservations, repeatClients, clientOrders] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, createdAt: true, totalAmount: true, status: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.orderItem.findMany({
      where: { order: { createdAt: { gte: since } } },
      select: { productName: true, quantity: true, priceAtPurchase: true },
    }),
    prisma.client.count(),
    prisma.client.count({ where: { orders: { some: {} } } }),
    prisma.client.count({ where: { createdAt: { gte: since } } }),
    // Воронка (как в боте): резервы за период
    prisma.reservation.count({ where: { createdAt: { gte: since } } }),
    // Повторные (как в боте): заказ в периоде + totalPurchases >= 2
    prisma.client.count({
      where: { orders: { some: { createdAt: { gte: since } } }, totalPurchases: { gte: 2 } },
    }),
    // Топ клиентов (как в боте): заказы периода с привязкой к клиенту
    prisma.order.findMany({
      where: { clientId: { not: null }, createdAt: { gte: since } },
      select: { clientId: true, totalAmount: true, client: { select: { name: true } } },
    }),
  ])

  const paid = orders.filter(o => o.status !== 'cancelled').length
  const revenue = orders.reduce((s, o) => s + Number(o.totalAmount), 0)

  const dayMap = new Map<string, { orders: number; revenue: number }>()
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10)
    dayMap.set(d, { orders: 0, revenue: 0 })
  }
  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 10)
    const cur = dayMap.get(key)
    if (!cur) continue
    cur.orders++
    cur.revenue += Number(o.totalAmount)
  }

  const byProduct = new Map<string, { qty: number; revenue: number }>()
  for (const it of items) {
    const cur = byProduct.get(it.productName) ?? { qty: 0, revenue: 0 }
    cur.qty += it.quantity
    cur.revenue += Number(it.priceAtPurchase) * it.quantity
    byProduct.set(it.productName, cur)
  }

  // Воронка — формулы из бота: конверсия = заказы/новые клиенты
  const conversionPct = clientsNew > 0 ? ((orders.length / clientsNew) * 100).toFixed(1) : '0'

  // Топ клиентов — группировка и сортировка как в боте
  const clientMap = new Map<number, { name: string; count: number; revenue: number }>()
  for (const o of clientOrders) {
    if (!o.clientId) continue
    const cur = clientMap.get(o.clientId) ?? { name: o.client?.name ?? 'Неизвестный', count: 0, revenue: 0 }
    cur.count++
    cur.revenue += Number(o.totalAmount)
    clientMap.set(o.clientId, cur)
  }
  const topClients = [...clientMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(c => ({ name: c.name, orders: c.count, revenue: showMoney ? c.revenue : null }))

  return {
    range,
    orders: {
      total: orders.length,
      paid,
      avgCheck: showMoney && orders.length ? Math.round(revenue / orders.length) : null,
    },
    revenue: showMoney ? revenue : null,
    byDay: [...dayMap.entries()].map(([date, v]) => ({ date, orders: v.orders, revenue: showMoney ? v.revenue : null })),
    topProducts: [...byProduct.entries()]
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 10)
      .map(([name, v]) => ({ name, qty: v.qty, revenue: showMoney ? v.revenue : null })),
    clients: { total: clientsTotal, withOrders: clientsWithOrders, newInRange: clientsNew },
    funnel: {
      newClients: clientsNew,
      reservations,
      orders: orders.length,
      conversionPct,
      repeatClients,
      revenue: showMoney ? revenue : null,
    },
    topClients,
    hiddenForRole: showMoney ? [] : ['выручка', 'средний чек', 'суммы топ-клиентов'],
  }
}

// ─── Клиенты ─────────────────────────────────────────────────────────────────

/** Маскируем так, чтобы менеджер мог сверить последние цифры, но не унести базу. */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return '···'
  return `···${digits.slice(-4)}`
}

export function maskEmail(email: string | null): string | null {
  if (!email) return null
  const [name, domain] = email.split('@')
  if (!domain) return '···'
  return `${(name ?? '').slice(0, 2)}···@${domain}`
}

export interface ClientView {
  id: number
  name: string
  source: string
  telegramUsername: string | null
  phone: string | null
  email: string | null
  ordersCount: number
  totalRevenue: number | null
  lastOrderAt: Date | null
  pdnConsentAt: Date | null
}

const safeDecrypt = (v: string | null): string | null => {
  try { return decryptClientField(v) } catch { return null }
}

/**
 * Поиск клиента: по имени, @username и внешнему id. По телефону искать нельзя —
 * он зашифрован, а расшифровывать всю базу ради LIKE мы не будем.
 */
export async function findClients(role: Role, q: string, limit = 20): Promise<ClientView[]> {
  const query = q.trim()
  if (query.length < 2) return []
  const rows = await prisma.client.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { fullName: { contains: query, mode: 'insensitive' } },
        { telegramUsername: { contains: query.replace(/^@/, ''), mode: 'insensitive' } },
        { externalId: { equals: query } },
      ],
    },
    take: Math.min(limit, 50),
    orderBy: [{ lastPurchaseDate: 'desc' }, { id: 'desc' }],
    select: {
      id: true, name: true, source: true, telegramUsername: true, phone: true, email: true,
      totalPurchases: true, totalRevenue: true, lastPurchaseDate: true, pdnConsentAt: true,
      _count: { select: { orders: true } },
    },
  })

  const showFull = role === 'owner'
  return rows.map(c => {
    const phone = safeDecrypt(c.phone)
    const email = safeDecrypt(c.email)
    return {
      id: c.id,
      name: c.name,
      source: c.source,
      telegramUsername: c.telegramUsername ? c.telegramUsername.replace(/^@+/, '') : null,
      phone: showFull ? phone : maskPhone(phone),
      email: showFull ? email : maskEmail(email),
      ordersCount: c._count.orders,
      totalRevenue: showFull ? Number(c.totalRevenue) : null,
      lastOrderAt: c.lastPurchaseDate,
      pdnConsentAt: c.pdnConsentAt,
    }
  })
}

export interface ClientCard extends ClientView {
  orders: Array<{
    id: number
    createdAt: Date
    status: string
    total: number | null
    items: Array<{ name: string; qty: number }>
  }>
}

export async function getClientCard(role: Role, id: number): Promise<ClientCard | null> {
  const c = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true, name: true, source: true, telegramUsername: true, phone: true, email: true,
      totalPurchases: true, totalRevenue: true, lastPurchaseDate: true, pdnConsentAt: true,
      _count: { select: { orders: true } },
      orders: {
        orderBy: { createdAt: 'desc' }, take: 20,
        select: {
          id: true, createdAt: true, status: true, totalAmount: true,
          items: { select: { productName: true, quantity: true } },
        },
      },
    },
  })
  if (!c) return null

  const showFull = role === 'owner'
  const phone = safeDecrypt(c.phone)
  const email = safeDecrypt(c.email)
  return {
    id: c.id,
    name: c.name,
    source: c.source,
    telegramUsername: c.telegramUsername ? c.telegramUsername.replace(/^@+/, '') : null,
    phone: showFull ? phone : maskPhone(phone),
    email: showFull ? email : maskEmail(email),
    ordersCount: c._count.orders,
    totalRevenue: showFull ? Number(c.totalRevenue) : null,
    lastOrderAt: c.lastPurchaseDate,
    pdnConsentAt: c.pdnConsentAt,
    orders: c.orders.map(o => ({
      id: o.id,
      createdAt: o.createdAt,
      status: o.status,
      total: showFull ? Number(o.totalAmount) : null,
      items: o.items.map(i => ({ name: i.productName, qty: i.quantity })),
    })),
  }
}
