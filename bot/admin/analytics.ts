/**
 * bot/admin/analytics.ts
 *
 * Расширенная аналитика: отчёт за период, топ товаров, топ клиентов, отчёт по клиенту.
 *
 * Подключение в bot/index.ts:
 *   setupAnalyticsHandlers(bot)
 *   showAnalyticsToday(ctx)          — вызывается из bot.hears('📊 Аналитика')
 *   handleAnalyticsMessage(...)      — вызывается из перехватчика текста
 *   analyticsState                   — проверять/очищать при нажатии кнопок меню
 */

import { Context, Markup, Telegraf } from 'telegraf'
import { prisma } from '../../lib/prisma'

// ─── Типы состояния ───────────────────────────────────────────────────────────

type AnalyticsFlowState = {
  flow: 'custom_period'
  target: 'main' | 'top_prod' | 'top_cli'
}

export const analyticsState = new Map<number, AnalyticsFlowState>()

// ─── Хелперы ─────────────────────────────────────────────────────────────────

const SEP = '━━━━━━━━━━━━━━━━━━━'

const fmt = (n: unknown) => Number(n ?? 0).toLocaleString('ru-RU')

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return `${n} ${many}`
  if (mod10 === 1) return `${n} ${one}`
  if (mod10 >= 2 && mod10 <= 4) return `${n} ${few}`
  return `${n} ${many}`
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getPeriodDates(period: string): { from: Date; to: Date; label: string } {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  switch (period) {
    case 'today':
      return { from: todayStart, to: todayEnd, label: 'сегодня' }
    case 'yesterday': {
      const from = new Date(todayStart)
      from.setDate(from.getDate() - 1)
      const to = new Date(from)
      to.setHours(23, 59, 59, 999)
      return { from, to, label: 'вчера' }
    }
    case '7d': {
      const from = new Date(todayStart)
      from.setDate(from.getDate() - 6)
      return { from, to: todayEnd, label: '7 дней' }
    }
    case '30d': {
      const from = new Date(todayStart)
      from.setDate(from.getDate() - 29)
      return { from, to: todayEnd, label: '30 дней' }
    }
    case 'month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from, to: todayEnd, label: 'этот месяц' }
    }
    default:
      return { from: todayStart, to: todayEnd, label: 'сегодня' }
  }
}

function parseDateRange(input: string): { from: Date; to: Date; label: string } | null {
  const match = input.match(/^(\d{2})\.(\d{2})\.(\d{4})-(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!match) return null
  const [, d1, m1, y1, d2, m2, y2] = match
  const from = new Date(Number(y1), Number(m1) - 1, Number(d1), 0, 0, 0, 0)
  const to = new Date(Number(y2), Number(m2) - 1, Number(d2), 23, 59, 59, 999)
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return null
  return { from, to, label: `${d1}.${m1}.${y1} — ${d2}.${m2}.${y2}` }
}

// ─── Клавиатуры ──────────────────────────────────────────────────────────────

function mainButtons() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📅 За период', 'an:period'),
      Markup.button.callback('🏆 Топ товаров', 'an:tp'),
    ],
    [
      Markup.button.callback('👑 Топ клиентов', 'an:tc'),
      Markup.button.callback('👤 Отчёт по клиенту', 'an:cli:0'),
    ],
    [
      Markup.button.callback('📂 Сегменты', 'segs:list'),
      Markup.button.callback('🏠 Главное меню', 'back:main'),
    ],
  ])
}

function periodButtons(target: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Сегодня', `an:p:${target}:today`),
      Markup.button.callback('Вчера', `an:p:${target}:yesterday`),
      Markup.button.callback('7 дней', `an:p:${target}:7d`),
    ],
    [
      Markup.button.callback('30 дней', `an:p:${target}:30d`),
      Markup.button.callback('Этот месяц', `an:p:${target}:month`),
      Markup.button.callback('Произвольный', `an:p:${target}:custom`),
    ],
    [Markup.button.callback('🔙 К аналитике', 'an:main')],
  ])
}

function backToAnalyticsButtons() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔙 К аналитике', 'an:main')],
    [Markup.button.callback('🏠 Главное меню', 'back:main')],
  ])
}

// ─── Построение отчётов ───────────────────────────────────────────────────────

async function buildMainReport(from: Date, to: Date, label: string): Promise<string> {
  const [newClients, msgCount, ordersAgg, resCount, segments] = await Promise.all([
    prisma.client.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.message.count({
      where: { direction: 'in', createdAt: { gte: from, lte: to } },
    }),
    prisma.order.aggregate({
      where: { createdAt: { gte: from, lte: to } },
      _count: true,
      _sum: { totalAmount: true },
    }),
    prisma.reservation.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.segment.findMany({
      orderBy: { id: 'asc' },
      include: { _count: { select: { clients: true } } },
    }),
  ])

  const revenue = fmt(ordersAgg._sum.totalAmount)
  const segLines = segments.map((s) => `${s.color} ${s.name}: ${s._count.clients}`).join('\n')

  return [
    `📊 Аналитика за ${label}`,
    SEP,
    `👥 Новых клиентов: ${newClients}`,
    `💬 Сообщений получено: ${msgCount}`,
    `💰 Продаж: ${ordersAgg._count} на сумму ${revenue} ₽`,
    `🔖 Резервов: ${resCount}`,
    SEP,
    'По сегментам:',
    segLines || '—',
    SEP,
  ].join('\n')
}

async function buildTopProducts(from: Date, to: Date, label: string): Promise<string> {
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { items: true },
  })

  type OrderItem = { productId?: number; name: string; price: number; qty: number }
  const productMap = new Map<string, { name: string; count: number; revenue: number }>()

  for (const order of orders) {
    const items = order.items as OrderItem[]
    if (!Array.isArray(items)) continue
    for (const item of items) {
      const key = String(item.productId ?? item.name)
      const existing = productMap.get(key) ?? { name: item.name, count: 0, revenue: 0 }
      existing.count += item.qty ?? 1
      existing.revenue += Number(item.price) * (item.qty ?? 1)
      productMap.set(key, existing)
    }
  }

  const top = [...productMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  const lines =
    top.length > 0
      ? top.map((p, i) => {
          const sales = pluralize(p.count, 'продажа', 'продажи', 'продаж')
          return `${i + 1}. ${p.name} — ${sales} — ${fmt(p.revenue)} ₽`
        })
      : ['Нет данных за выбранный период.']

  return [`🏆 Топ товаров за ${label}`, SEP, ...lines, SEP].join('\n')
}

async function buildTopClients(from: Date, to: Date, label: string): Promise<string> {
  const orders = await prisma.order.findMany({
    where: { clientId: { not: null }, createdAt: { gte: from, lte: to } },
    select: { clientId: true, totalAmount: true, client: { select: { name: true } } },
  })

  const clientMap = new Map<number, { name: string; count: number; revenue: number }>()
  for (const order of orders) {
    if (!order.clientId) continue
    const existing = clientMap.get(order.clientId) ?? {
      name: order.client?.name ?? 'Неизвестный',
      count: 0,
      revenue: 0,
    }
    existing.count++
    existing.revenue += Number(order.totalAmount)
    clientMap.set(order.clientId, existing)
  }

  const top = [...clientMap.entries()]
    .map(([, data]) => data)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  const lines =
    top.length > 0
      ? top.map((c, i) => {
          const buys = pluralize(c.count, 'покупка', 'покупки', 'покупок')
          return `${i + 1}. ${c.name} — ${buys} — ${fmt(c.revenue)} ₽`
        })
      : ['Нет данных за выбранный период.']

  return [`👑 Топ клиентов за ${label}`, SEP, ...lines, SEP].join('\n')
}

async function sendClientReport(ctx: Context, clientId: number): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      segment: true,
      tags: true,
      orders: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  })

  if (!client) {
    await ctx.reply('Клиент не найден.')
    return
  }

  type OrderItem = { name: string; price: number; qty: number }

  const orderLines = client.orders.map((o) => {
    const items = (o.items as OrderItem[])
      .map((i) => `${i.name} x${i.qty ?? 1}`)
      .join(', ')
    return `- ${formatDate(o.createdAt)} — ${items} — ${fmt(o.totalAmount)} ₽`
  })

  const SOURCE_LABEL: Record<string, string> = {
    telegram: 'Telegram',
    avito: 'Avito',
    instagram: 'Instagram',
    shop: 'Магазин',
  }

  const tags = client.tags.map((t) => t.name).join(', ') || '—'

  const lines = [
    `👤 ${client.fullName || client.name}`,
    client.phone ? `📞 ${client.phone}` : null,
    `📌 Источник: ${SOURCE_LABEL[client.source] ?? client.source}`,
    `📊 Сегмент: ${client.segment ? `${client.segment.color} ${client.segment.name}` : '—'}`,
    SEP,
    `🛍️ Всего покупок: ${client.totalPurchases}`,
    `💰 Общая выручка: ${fmt(client.totalRevenue)} ₽`,
    `📅 Первый контакт: ${formatDate(client.createdAt)}`,
    `📅 Последняя покупка: ${formatDate(client.lastPurchaseDate)}`,
    SEP,
    'История заказов:',
    ...(orderLines.length > 0 ? orderLines : ['—']),
    SEP,
    `🏷️ Теги: ${tags}`,
    client.notes ? `📝 Заметка: ${client.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  await ctx.reply(lines, backToAnalyticsButtons())
}

// ─── Публичный интерфейс ─────────────────────────────────────────────────────

export async function showAnalyticsToday(ctx: Context): Promise<void> {
  const now = new Date()
  const from = new Date(now)
  from.setHours(0, 0, 0, 0)
  const to = new Date(now)
  to.setHours(23, 59, 59, 999)
  const text = await buildMainReport(from, to, 'сегодня')
  await ctx.reply(text, mainButtons())
}

export async function handleAnalyticsMessage(
  ctx: Context,
  userId: number,
  text: string,
): Promise<boolean> {
  const state = analyticsState.get(userId)
  if (!state || state.flow !== 'custom_period') return false

  const parsed = parseDateRange(text)
  if (!parsed) {
    await ctx.reply(
      '⚠️ Неверный формат. Введите даты так:\nДД.ММ.ГГГГ-ДД.ММ.ГГГГ\n\nПример: 01.02.2026-25.02.2026',
    )
    return true
  }

  analyticsState.delete(userId)

  if (state.target === 'main') {
    const report = await buildMainReport(parsed.from, parsed.to, parsed.label)
    await ctx.reply(report, mainButtons())
  } else if (state.target === 'top_prod') {
    const report = await buildTopProducts(parsed.from, parsed.to, parsed.label)
    await ctx.reply(report, backToAnalyticsButtons())
  } else if (state.target === 'top_cli') {
    const report = await buildTopClients(parsed.from, parsed.to, parsed.label)
    await ctx.reply(report, backToAnalyticsButtons())
  }

  return true
}

export function setupAnalyticsHandlers(bot: Telegraf): void {
  // Возврат к аналитике за сегодня
  bot.action('an:main', async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Загрузка...') } catch {}
    const userId = ctx.from!.id
    analyticsState.delete(userId)
    const now = new Date()
    const from = new Date(now)
    from.setHours(0, 0, 0, 0)
    const to = new Date(now)
    to.setHours(23, 59, 59, 999)
    const text = await buildMainReport(from, to, 'сегодня')
    await ctx.reply(text, mainButtons())
  })

  // Выбор периода для основного отчёта
  bot.action('an:period', async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Загрузка...') } catch {}
    await ctx.reply('📅 Выберите период:', periodButtons('main'))
  })

  // Выбор периода для топ товаров
  bot.action('an:tp', async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Загрузка...') } catch {}
    await ctx.reply('🏆 Топ товаров — выберите период:', periodButtons('top_prod'))
  })

  // Выбор периода для топ клиентов
  bot.action('an:tc', async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Загрузка...') } catch {}
    await ctx.reply('👑 Топ клиентов — выберите период:', periodButtons('top_cli'))
  })

  // Универсальный обработчик периода: an:p:{target}:{period}
  bot.action(/^an:p:(\w+):(\w+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Загрузка...') } catch {}
    const userId = ctx.from!.id
    const target = ctx.match[1] as 'main' | 'top_prod' | 'top_cli'
    const period = ctx.match[2]

    if (period === 'custom') {
      analyticsState.set(userId, { flow: 'custom_period', target })
      await ctx.reply(
        '📅 Введите диапазон дат:\nДД.ММ.ГГГГ-ДД.ММ.ГГГГ\n\nПример: 01.02.2026-25.02.2026',
      )
      return
    }

    const { from, to, label } = getPeriodDates(period)

    if (target === 'main') {
      const text = await buildMainReport(from, to, label)
      await ctx.reply(text, mainButtons())
    } else if (target === 'top_prod') {
      const text = await buildTopProducts(from, to, label)
      await ctx.reply(text, backToAnalyticsButtons())
    } else if (target === 'top_cli') {
      const text = await buildTopClients(from, to, label)
      await ctx.reply(text, backToAnalyticsButtons())
    }
  })

  // Список клиентов с пагинацией: an:cli:{page}
  bot.action(/^an:cli:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Загрузка...') } catch {}
    const page = Number(ctx.match[1])
    const perPage = 10

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        skip: page * perPage,
        take: perPage,
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prisma.client.count(),
    ])

    if (clients.length === 0) {
      await ctx.reply('Клиентов не найдено.', backToAnalyticsButtons())
      return
    }

    const buttons = clients.map((c) => [Markup.button.callback(c.name, `an:c:${c.id}`)])

    const navRow: ReturnType<typeof Markup.button.callback>[] = []
    if (page > 0) navRow.push(Markup.button.callback('◀️ Назад', `an:cli:${page - 1}`))
    if ((page + 1) * perPage < total)
      navRow.push(Markup.button.callback('Вперёд ▶️', `an:cli:${page + 1}`))
    if (navRow.length > 0) buttons.push(navRow)

    buttons.push([Markup.button.callback('🔙 К аналитике', 'an:main')])

    const from = page * perPage + 1
    const toN = Math.min((page + 1) * perPage, total)
    await ctx.reply(
      `👤 Выберите клиента (${from}–${toN} из ${total}):`,
      Markup.inlineKeyboard(buttons),
    )
  })

  // Отчёт по клиенту: an:c:{clientId}
  bot.action(/^an:c:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Загрузка...') } catch {}
    const clientId = Number(ctx.match[1])
    await sendClientReport(ctx, clientId)
  })
}
