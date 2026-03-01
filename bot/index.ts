import 'dotenv/config'
import { Telegraf, Markup } from 'telegraf'
import { message } from 'telegraf/filters'
import { setupClientHandlers } from '../webhooks/telegram'
import { startScheduler } from './scheduler'
import { startApiServer } from '../api/server'
import { prisma } from '../lib/prisma'
import {
  inventoryState,
  setupInventoryHandlers,
  handleInventoryMessage,
  handleInventoryDocument,
  handleInventoryPhoto,
  showInventory,
} from './admin/inventory'
import {
  segmentsState,
  setupSegmentHandlers,
  handleSegmentMessage,
  showSegments,
} from './admin/segments'
import {
  salesState,
  setupSalesHandlers,
  handleSalesMessage,
  registerSkipCommentHandlers,
} from './admin/sales'
import {
  analyticsState,
  setupAnalyticsHandlers,
  showAnalyticsToday,
  handleAnalyticsMessage,
} from './admin/analytics'
import { showAISettings, setupAISettingsHandlers } from './admin/ai_settings'
import {
  storefrontState,
  setupStorefrontHandlers,
  handleStorefrontMessage,
  handleStorefrontPhoto,
  showStorefront,
} from './admin/storefront'

const BOT_TOKEN = process.env.BOT_TOKEN
const ADMIN_IDS = (process.env.ADMIN_IDS ?? '').split(',').map((id) => Number(id.trim()))

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN не задан в .env')
}

const bot = new Telegraf(BOT_TOKEN)

// ─── Режим техработ (in-memory) ───────────────────────────────────────────────

let maintenanceMode = false

// ─── Состояние рассылки ───────────────────────────────────────────────────────

const broadcastState = new Map<number, true>()

// ─── Главное меню ─────────────────────────────────────────────────────────────

const adminKeyboard = Markup.keyboard([
  ['📊 Аналитика', '📬 Входящие'],
  ['📢 Рассылки', '💰 Балансы'],
  ['🏷️ Акции', '🔧 Техработы'],
  ['📦 Товароучёт', '🔑 API Ключи'],
  ['📂 Сегменты', '🤖 AI Агент'],
  ['🖼️ Витрина'],
]).resize()

// Кнопки главного меню — для сброса пошаговых флоу при нажатии
const MENU_BUTTONS = new Set([
  '📊 Аналитика',
  '📬 Входящие',
  '📢 Рассылки',
  '💰 Балансы',
  '🏷️ Акции',
  '🔧 Техработы',
  '📦 Товароучёт',
  '🔑 API Ключи',
  '📂 Сегменты',
  '🤖 AI Агент',
  '🖼️ Витрина',
])

// ─── Обработка сообщений от клиентов ─────────────────────────────────────────
// Регистрируется ДО admin-middleware, чтобы клиенты не получали «⛔ Доступ запрещён»

setupClientHandlers(bot)

// ─── Middleware: только для администраторов ────────────────────────────────────

bot.use((ctx, next) => {
  const userId = ctx.from?.id
  if (!userId || !ADMIN_IDS.includes(userId)) {
    return ctx.reply('⛔ Доступ запрещён.')
  }
  return next()
})

// ─── Перехватчик текста для пошаговых флоу ───────────────────────────────────
// Должен быть зарегистрирован ДО bot.hears(), чтобы перехватывать ввод в активных флоу.

bot.on(message('text'), async (ctx, next) => {
  const userId = ctx.from?.id
  if (!userId) return next()

  const text = ctx.message.text

  // Нажатие кнопки главного меню — сбрасываем любой активный флоу
  if (MENU_BUTTONS.has(text)) {
    inventoryState.delete(userId)
    broadcastState.delete(userId)
    segmentsState.delete(userId)
    salesState.delete(userId)
    analyticsState.delete(userId)
    storefrontState.delete(userId)
    return next()
  }

  // Флоу рассылки
  if (broadcastState.has(userId)) {
    broadcastState.delete(userId)
    if (text === '❌ Отмена') {
      await ctx.reply('Рассылка отменена.', Markup.removeKeyboard())
      return
    }
    await ctx.reply('Отправляю рассылку…', Markup.removeKeyboard())
    const clients = await prisma.client.findMany({
      where: { source: 'telegram', externalId: { not: null } },
    })
    let sent = 0
    for (const client of clients) {
      try {
        await ctx.telegram.sendMessage(client.externalId!, text)
        sent++
      } catch {
        // клиент заблокировал бота или ещё не начинал диалог
      }
    }
    await ctx.reply(`✅ Рассылка отправлена ${sent} из ${clients.length} клиентов.`)
    return
  }

  // Флоу аналитики (произвольный период)
  if (analyticsState.has(userId)) {
    const handled = await handleAnalyticsMessage(ctx, userId, text)
    if (handled) return
  }

  // Флоу сегментов
  if (segmentsState.has(userId)) {
    const handled = await handleSegmentMessage(ctx, userId, text)
    if (handled) return
  }

  // Флоу продаж/резервов
  if (salesState.has(userId)) {
    const handled = await handleSalesMessage(ctx, userId, text)
    if (handled) return
  }

  // Флоу товароучёта
  if (inventoryState.has(userId)) {
    const handled = await handleInventoryMessage(ctx, userId, text)
    if (handled) return
  }

  // Флоу витрины
  if (storefrontState.has(userId)) {
    const handled = await handleStorefrontMessage(ctx as any, userId, text)
    if (handled) return
  }

  return next()
})

// ─── Перехватчик фото для шага загрузки фото при добавлении товара ────────────

bot.on(message('photo'), async (ctx, next) => {
  const userId = ctx.from?.id
  if (!userId) return next()
  const handled = await handleInventoryPhoto(ctx, userId)
  if (handled) return
  const handledSf = await handleStorefrontPhoto(ctx as any, userId)
  if (handledSf) return
  return next()
})

// ─── Перехватчик документов ───────────────────────────────────────────────────
// Обрабатывает:
//   1. Image-документы (PNG без фона и т.п.) → photo-флоу товароучёта и витрины
//   2. Файлы прайсов (Excel/CSV) → импорт, приёмка, списание

bot.on(message('document'), async (ctx, next) => {
  const userId = ctx.from?.id
  if (!userId) return next()

  const doc = (ctx.message as { document?: { mime_type?: string } })?.document

  // Image-документ → роутим в photo-обработчики (работают с photo и document)
  if (doc?.mime_type?.startsWith('image/')) {
    const handled = await handleInventoryPhoto(ctx as any, userId)
    if (handled) return
    const handledSf = await handleStorefrontPhoto(ctx as any, userId)
    if (handledSf) return
  }

  const state = inventoryState.get(userId)
  if (
    state?.flow === 'import' ||
    state?.flow === 'receive_file' ||
    state?.flow === 'writeoff_file'
  ) {
    await handleInventoryDocument(ctx, userId)
    return
  }

  return next()
})

// ─── /start ───────────────────────────────────────────────────────────────────

bot.start((ctx) => {
  ctx.reply(
    `Привет, ${ctx.from.first_name}! Добро пожаловать в панель управления Bender Shop.`,
    adminKeyboard,
  )
})

// ─── 📊 Аналитика ─────────────────────────────────────────────────────────────

setupAnalyticsHandlers(bot)

bot.hears('📊 Аналитика', async (ctx) => {
  await showAnalyticsToday(ctx)
})

// ─── 📬 Входящие ──────────────────────────────────────────────────────────────

bot.hears('📬 Входящие', async (ctx) => {
  const unreadCount = await prisma.message.count({ where: { isRead: false } })

  if (unreadCount === 0) {
    await ctx.reply(
      '📬 Нет непрочитанных сообщений.',
      Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'back:main')]]),
    )
    return
  }

  const recentClients = await prisma.client.findMany({
    where: { messages: { some: { isRead: false } } },
    include: {
      messages: {
        where: { isRead: false },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    take: 10,
    orderBy: { updatedAt: 'desc' },
  })

  const lines = recentClients.map((c) => {
    const last = c.messages[0]
    const preview = last?.text.slice(0, 60) ?? ''
    return `• ${c.name}: ${preview}`
  })

  await ctx.reply(
    `📬 Непрочитанных: ${unreadCount}\n\n${lines.join('\n')}`,
    Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'back:main')]]),
  )
})

// ─── 📢 Рассылки ──────────────────────────────────────────────────────────────

bot.hears('📢 Рассылки', async (ctx) => {
  const totalTg = await prisma.client.count({
    where: { source: 'telegram', externalId: { not: null } },
  })
  await ctx.reply(
    `📢 Рассылки\n\nTelegram-клиентов: ${totalTg}\n\nРассылка будет отправлена всем, кто писал боту.`,
    Markup.inlineKeyboard([
      [Markup.button.callback('✉️ Создать рассылку', 'broadcast:new')],
      [Markup.button.callback('🏠 Главное меню', 'back:main')],
    ]),
  )
})

bot.action('broadcast:new', async (ctx) => {
  await ctx.answerCbQuery()
  const userId = ctx.from!.id
  broadcastState.set(userId, true)
  await ctx.reply(
    'Введите текст рассылки.\nОн будет отправлен всем Telegram-клиентам.',
    Markup.keyboard([['❌ Отмена']]).resize(),
  )
})

// ─── 💰 Балансы ───────────────────────────────────────────────────────────────

bot.hears('💰 Балансы', async (ctx) => {
  const [total, byPayment] = await Promise.all([
    prisma.order.aggregate({ _sum: { totalAmount: true }, _count: true }),
    prisma.order.groupBy({
      by: ['payment'],
      _sum: { totalAmount: true },
      _count: true,
    }),
  ])

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayRevenue = await prisma.order.aggregate({
    where: { createdAt: { gte: todayStart } },
    _sum: { totalAmount: true },
    _count: true,
  })

  const LABEL: Record<string, string> = {
    cash: '💵 Наличные',
    transfer: '📲 Перевод',
    card: '💳 Карта',
  }

  const fmt = (n: unknown) => Number(n ?? 0).toLocaleString('ru-RU')

  const payLines = byPayment
    .map((p) => `  ${LABEL[p.payment] ?? p.payment}: ${fmt(p._sum.totalAmount)} ₽ (${p._count} заказ.)`)
    .join('\n')

  await ctx.reply(
    [
      '💰 Балансы',
      '',
      `Заказов всего: ${total._count}`,
      `Сегодня: ${todayRevenue._count} заказ. / ${fmt(todayRevenue._sum.totalAmount)} ₽`,
      '',
      'По способам оплаты:',
      payLines || '  —',
      '',
      `Итого выручка: ${fmt(total._sum.totalAmount)} ₽`,
    ].join('\n'),
    Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'back:main')]]),
  )
})

// ─── 🏷️ Акции ─────────────────────────────────────────────────────────────────

bot.hears('🏷️ Акции', async (ctx) => {
  const pending = await prisma.task.count({
    where: { action: 'promo_notify', status: 'pending' },
  })

  await ctx.reply(
    `🏷️ Акции\n\nОжидают уведомления о скидке: ${pending} клиент(ов).\n\nПри запуске акции все они получат сообщение в течение 10 минут.`,
    Markup.inlineKeyboard([
      [Markup.button.callback(`🚀 Запустить акцию (${pending} клиент.)`, 'promo:fire')],
      [Markup.button.callback('🏠 Главное меню', 'back:main')],
    ]),
  )
})

bot.action('promo:fire', async (ctx) => {
  await ctx.answerCbQuery()
  const updated = await prisma.task.updateMany({
    where: { action: 'promo_notify', status: 'pending' },
    data: { scheduledAt: new Date() },
  })
  await ctx.reply(
    `🚀 Акция запущена! ${updated.count} клиентов получат уведомление в ближайшие 10 минут.`,
  )
})

// ─── 🔧 Техработы ────────────────────────────────────────────────────────────

bot.hears('🔧 Техработы', async (ctx) => {
  const status = maintenanceMode ? '🔴 Включён' : '🟢 Выключен'
  const action = maintenanceMode ? 'maint:off' : 'maint:on'
  const label = maintenanceMode ? '✅ Выключить техработы' : '🔧 Включить техработы'

  await ctx.reply(
    `🔧 Режим техработ\n\nСтатус: ${status}\n\nПри включении новые клиентские сообщения получают автоответ о техработах.`,
    Markup.inlineKeyboard([
      [Markup.button.callback(label, action)],
      [Markup.button.callback('🏠 Главное меню', 'back:main')],
    ]),
  )
})

bot.action('maint:on', async (ctx) => {
  await ctx.answerCbQuery()
  maintenanceMode = true
  await ctx.reply('🔧 Техработы включены. Клиенты получат автоответ.')
})

bot.action('maint:off', async (ctx) => {
  await ctx.answerCbQuery()
  maintenanceMode = false
  await ctx.reply('✅ Техработы выключены. Бот работает в штатном режиме.')
})

// Экспортируем флаг для использования в webhooks/telegram.ts (если потребуется)
export { maintenanceMode }

// ─── 🏠 Назад в главное меню ──────────────────────────────────────────────────

bot.action('back:main', async (ctx) => {
  await ctx.answerCbQuery()
  const userId = ctx.from!.id
  inventoryState.delete(userId)
  broadcastState.delete(userId)
  await ctx.reply('🏠 Главное меню', adminKeyboard)
})

// ─── 📦 Товароучёт ────────────────────────────────────────────────────────────

setupInventoryHandlers(bot)

bot.hears('📦 Товароучёт', async (ctx) => {
  await showInventory(ctx)
})

// ─── 📂 Сегменты ──────────────────────────────────────────────────────────────

setupSegmentHandlers(bot)

bot.hears('📂 Сегменты', async (ctx) => {
  await showSegments(ctx)
})

// ─── 🤖 AI Агент ──────────────────────────────────────────────────────────────

setupAISettingsHandlers(bot)

bot.hears('🤖 AI Агент', async (ctx) => {
  await showAISettings(ctx)
})

// ─── 🖼️ Витрина ───────────────────────────────────────────────────────────────

setupStorefrontHandlers(bot)

bot.hears('🖼️ Витрина', async (ctx) => {
  await showStorefront(ctx)
})

// ─── 💰 Продажи и резервы ─────────────────────────────────────────────────────

setupSalesHandlers(bot)
registerSkipCommentHandlers(bot)

// ─── 🔑 API Ключи ─────────────────────────────────────────────────────────────

bot.hears('🔑 API Ключи', (ctx) => {
  const mask = (v: string | undefined) =>
    v ? v.slice(0, 6) + '…' + v.slice(-4) : '❌ не задан'

  const lines = [
    '🔑 Конфигурация',
    '',
    `BOT_TOKEN:          ${mask(process.env.BOT_TOKEN)}`,
    `CRM_GROUP:          ${process.env.CRM_GROUP_ID ?? '❌ не задан'}`,
    `ADMIN_IDS:          ${process.env.ADMIN_IDS ?? '❌ не задан'}`,
    `DATABASE_URL:       ${mask(process.env.DATABASE_URL)}`,
    `API_PORT:           ${process.env.API_PORT ?? '3000 (default)'}`,
    `WEBAPP_URL:         ${process.env.WEBAPP_URL ?? '❌ не задан'}`,
    `OPENROUTER_API_KEY: ${mask(process.env.OPENROUTER_API_KEY)}`,
  ]

  return ctx.reply(
    lines.join('\n'),
    Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'back:main')]]),
  )
})

// ─── Запуск ───────────────────────────────────────────────────────────────────

bot.launch({
  allowedUpdates: ['message', 'callback_query'],
})

console.log('Бот запущен')

startScheduler(bot)
startApiServer()

// ─── DB keepalive: предотвращает разрыв соединения на db.prisma.io ────────────

setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (e) {
    console.log('DB keepalive failed, reconnecting...')
  }
}, 4 * 60 * 1000)

// ─── Инициализация технического топика «📦 Продажи и резервы» ─────────────────

async function ensureSalesTopic(): Promise<void> {
  try {
    const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID)
    if (!CRM_GROUP_ID) return

    const existing = await prisma.apiKey.findUnique({ where: { service: 'sales_topic' } })
    if (existing) {
      console.log(`Топик продаж: threadId=${existing.value}`)
      return
    }

    const topic = await bot.telegram.createForumTopic(CRM_GROUP_ID, '📦 Продажи и резервы')
    const threadId = topic.message_thread_id

    await prisma.apiKey.create({ data: { service: 'sales_topic', value: String(threadId) } })
    console.log(`Топик «📦 Продажи и резервы» создан: threadId=${threadId}`)

    // Отправляем панель управления в топик
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (bot.telegram.sendMessage as any)(
      CRM_GROUP_ID,
      '💼 Панель продаж и резервов',
      {
        message_thread_id: threadId,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💰 Новая продажа', callback_data: 'sales_topic:new_sale' },
              { text: '🔖 Новый резерв', callback_data: 'sales_topic:new_reserve' },
            ],
          ],
        },
      },
    )
  } catch (err) {
    console.error('ensureSalesTopic error:', err)
  }
}

ensureSalesTopic()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
