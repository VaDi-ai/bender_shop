import 'dotenv/config'
import { Telegraf, Markup } from 'telegraf'
import { message } from 'telegraf/filters'
import { setupClientHandlers } from '../webhooks/telegram'
import { startScheduler } from './scheduler'
import { startApiServer } from '../api/server'
import { prisma, pool, initPrismaAlerts } from '../lib/prisma'
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
import {
  showAISettings, setupAISettingsHandlers,
  showApiKeysMenu, setupApiKeysHandlers, handleApiKeysMessage, apiKeysState,
  securityState, handleSecurityMessage,
} from './admin/ai_settings'
import { initAdminNotifications } from '../lib/notify-admins'
import { getApiKeyValue, setApiKeyValue } from '../lib/api-key-store'
import { reinitClient as reinitAgentClient } from './ai/agent'
import { reinitClient as reinitParserClient } from '../lib/ai-parser'
import {
  storefrontState,
  setupStorefrontHandlers,
  handleStorefrontMessage,
  handleStorefrontPhoto,
  showStorefront,
} from './admin/storefront'
import {
  broadcastsState,
  setupBroadcastHandlers,
  showBroadcastMenu,
  handleBroadcastMessage,
  handleBroadcastPhoto,
  handleBroadcastVideo,
} from './admin/broadcasts'
import {
  promotionsState,
  setupPromotionsHandlers,
  showPromotionsMenu,
  handlePromotionsMessage,
} from './admin/promotions'
import {
  pricingState,
  setupPricingHandlers,
  showPricingMenu,
  handlePricingMessage,
  handlePricingDocument,
  sendDailyCurrencyRates,
  lastCurrencyChanges,
} from './admin/pricing'
import { cancelPromotion } from '../lib/promotions'
import { logSecurityEvent, initSecurityAlerts } from '../lib/security-log'

const BOT_TOKEN = process.env.BOT_TOKEN
const ADMIN_IDS = (process.env.ADMIN_IDS ?? '').split(',').map((id) => Number(id.trim()))

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN не задан в .env')
}

const bot = new Telegraf(BOT_TOKEN)

initAdminNotifications(bot, ADMIN_IDS)
initSecurityAlerts(bot, ADMIN_IDS)
initPrismaAlerts(bot, ADMIN_IDS)

// ─── Режим техработ (in-memory) ───────────────────────────────────────────────

let maintenanceMode = false

// ─── Защита от флуда ─────────────────────────────────────────────────────────

const userRequestCount = new Map<number, { count: number; resetAt: number }>()

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id
  if (!userId) return next()

  const now = Date.now()
  const stats = userRequestCount.get(userId) ?? { count: 0, resetAt: now + 60_000 }

  if (now > stats.resetAt) {
    stats.count = 0
    stats.resetAt = now + 60_000
  }

  stats.count++
  userRequestCount.set(userId, stats)

  if (stats.count > 30) {
    if (stats.count === 31) {
      await ctx.reply('⚠️ Слишком много запросов. Подождите минуту.')
      await logSecurityEvent('rate_limit_exceeded', { userId, count: stats.count })
    }
    return
  }

  return next()
})

// ─── Хелпер: только для администраторов ──────────────────────────────────────

export async function adminOnly(ctx: any, next: any) {
  const userId = ctx.from?.id
  if (!ADMIN_IDS.includes(userId)) {
    await logSecurityEvent('unauthorized_access', {
      userId,
      command: ctx.message?.text ?? ctx.callbackQuery?.data,
    })
    return ctx.reply('⛔ Нет доступа.')
  }
  return next()
}

// ─── Главное меню ─────────────────────────────────────────────────────────────

const adminKeyboard = Markup.keyboard([
  ['📊 Аналитика', '📬 Входящие'],
  ['📢 Рассылки', '💰 Балансы'],
  ['🏷️ Акции', '🔧 Техработы'],
  ['📦 Товароучёт', '🔑 API Ключи'],
  ['📂 Сегменты', '🤖 AI Агент'],
  ['🖼️ Витрина', '💰 Цены'],
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
  '💰 Цены',
])

// ─── Обработка сообщений от клиентов ─────────────────────────────────────────
// Регистрируется ДО admin-middleware, чтобы клиенты не получали «⛔ Доступ запрещён»

setupClientHandlers(bot)

// ─── Публичные обработчики (до admin-middleware) ───────────────────────────────

const WEBAPP_URL = process.env.WEBAPP_URL

if (process.env.NODE_ENV === 'production' && !process.env.WEBHOOK_SECRET) {
  throw new Error('WEBHOOK_SECRET is required when WEBHOOK_URL is set')
}

// /start с payload shop или startapp=shop — открыть Mini App
bot.start(async (ctx, next) => {
  if (!WEBAPP_URL) return next()
  const payload = ctx.startPayload ?? ''
  if (payload === 'shop' || payload === 'startapp=shop') {
    await ctx.reply(
      '🛍 Открыть магазин Bender Shop',
      Markup.inlineKeyboard([[Markup.button.webApp('🛍 Открыть магазин', WEBAPP_URL)]]),
    )
    return
  }
  return next()
})

// /shop — ответить кнопкой Mini App (любой пользователь)
bot.command('shop', async (ctx) => {
  if (!WEBAPP_URL) return
  await ctx.reply(
    '🛍 Магазин Bender Shop',
    Markup.inlineKeyboard([[Markup.button.webApp('🛍 Открыть магазин', WEBAPP_URL)]]),
  )
})

// Новый участник группы — приветствие в личку с кнопкой Mini App
bot.on(message('new_chat_members'), async (ctx) => {
  if (!WEBAPP_URL) return
  for (const member of ctx.message.new_chat_members) {
    if (member.is_bot) continue
    try {
      await bot.telegram.sendMessage(
        member.id,
        'Привет! Я бот магазина Bender Shop 👋\n\nЗдесь ты найдёшь технику по лучшим ценам — iPhone, MacBook, PlayStation, Dyson и многое другое.\n\nОткрой каталог и выбирай 👇\nПо любым вопросам просто напиши мне — отвечу быстро 😊',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🛍 Открыть магазин', web_app: { url: WEBAPP_URL } }]],
          },
        },
      )
    } catch {
      // Пользователь мог не начать диалог с ботом — игнорируем
    }
  }
})

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
    broadcastsState.delete(userId)
    segmentsState.delete(userId)
    salesState.delete(userId)
    analyticsState.delete(userId)
    storefrontState.delete(userId)
    promotionsState.delete(userId)
    pricingState.delete(userId)
    apiKeysState.delete(userId)
    securityState.delete(userId)
    return next()
  }

  // Флоу рассылки
  if (broadcastsState.has(userId)) {
    const handled = await handleBroadcastMessage(ctx, userId, text)
    if (handled) return
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

  // Флоу акций
  if (promotionsState.has(userId)) {
    const handled = await handlePromotionsMessage(ctx, userId, text)
    if (handled) return
  }

  // Флоу цен
  if (pricingState.has(userId)) {
    const handled = await handlePricingMessage(ctx, userId, text)
    if (handled) return
  }

  // Флоу API ключей
  if (apiKeysState.has(userId)) {
    const handled = await handleApiKeysMessage(ctx, userId, text)
    if (handled) return
  }

  // Подтверждение очистки лога безопасности
  if (securityState.has(userId)) {
    const handled = await handleSecurityMessage(ctx, userId, text)
    if (handled) return
  }

  return next()
})

// ─── Перехватчик фото для шага загрузки фото при добавлении товара ────────────

bot.on(message('photo'), async (ctx, next) => {
  const userId = ctx.from?.id
  if (!userId) return next()
  const handledBcast = await handleBroadcastPhoto(ctx, userId)
  if (handledBcast) return
  const handled = await handleInventoryPhoto(ctx, userId)
  if (handled) return
  const handledSf = await handleStorefrontPhoto(ctx as any, userId)
  if (handledSf) return
  return next()
})

bot.on(message('video'), async (ctx, next) => {
  const userId = ctx.from?.id
  if (!userId) return next()
  const handled = await handleBroadcastVideo(ctx, userId)
  if (handled) return
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

  // xlsx прайс-лист для обновления цен
  if (!doc?.mime_type?.startsWith('image/')) {
    const handledPricing = await handlePricingDocument(ctx as any, userId)
    if (handledPricing) return
  }

  const state = inventoryState.get(userId)
  if (state?.flow === 'import_file') {
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

setupBroadcastHandlers(bot)

bot.hears('📢 Рассылки', async (ctx) => {
  await showBroadcastMenu(ctx)
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

setupPromotionsHandlers(bot)

bot.hears('🏷️ Акции', async (ctx) => {
  await showPromotionsMenu(ctx)
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
  try { await ctx.answerCbQuery() } catch {}
  maintenanceMode = true
  await ctx.reply('🔧 Техработы включены. Клиенты получат автоответ.')
})

bot.action('maint:off', async (ctx) => {
  try { await ctx.answerCbQuery() } catch {}
  maintenanceMode = false
  await ctx.reply('✅ Техработы выключены. Бот работает в штатном режиме.')
})

// Экспортируем флаг для использования в webhooks/telegram.ts (если потребуется)
export { maintenanceMode }

// ─── 🏠 Назад в главное меню ──────────────────────────────────────────────────

bot.action('back:main', async (ctx) => {
  try { await ctx.answerCbQuery() } catch {}
  const userId = ctx.from!.id
  inventoryState.delete(userId)
  broadcastsState.delete(userId)
  segmentsState.delete(userId)
  salesState.delete(userId)
  analyticsState.delete(userId)
  storefrontState.delete(userId)
  promotionsState.delete(userId)
  pricingState.delete(userId)
  apiKeysState.delete(userId)
  await ctx.reply('🏠 Главное меню', adminKeyboard)
})

// ─── /pin — закрепить сообщение с кнопкой Mini App (только для администраторов) ─

bot.command('pin', async (ctx) => {
  if (!WEBAPP_URL) {
    await ctx.reply('⚠️ WEBAPP_URL не задан.')
    return
  }
  const sent = await ctx.reply(
    '🛍 Магазин Bender Shop\n\nТехника по лучшим ценам — iPhone, MacBook, PlayStation, Dyson и многое другое.',
    Markup.inlineKeyboard([[Markup.button.webApp('🛍 Открыть магазин', WEBAPP_URL)]]),
  )
  try {
    await ctx.pinChatMessage(sent.message_id)
  } catch {
    await ctx.reply('⚠️ Не удалось закрепить сообщение (нет прав администратора в чате).')
  }
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

// ─── 💰 Цены ──────────────────────────────────────────────────────────────────

setupPricingHandlers(bot)

bot.hears('💰 Цены', async (ctx) => {
  await showPricingMenu(ctx)
})

// ─── 💰 Продажи и резервы ─────────────────────────────────────────────────────

setupSalesHandlers(bot)
registerSkipCommentHandlers(bot)

// ─── 🔑 API Ключи ─────────────────────────────────────────────────────────────

setupApiKeysHandlers(bot)

bot.hears('🔑 API Ключи', async (ctx) => {
  await showApiKeysMenu(ctx)
})

// ─── Запуск ───────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  bot.launch({
    webhook: {
      domain: process.env.WEBAPP_URL || 'https://bendershop.store',
      path: '/webhook/telegram',
      secretToken: process.env.WEBHOOK_SECRET,
    },
    allowedUpdates: ['message', 'callback_query', 'chat_member'],
  }).catch(err => { console.error('Launch error:', err); process.exit(1) })
} else {
  bot.launch().catch((err) => { console.error('Bot launch failed:', err); process.exit(1) })
}

console.log('Бот запущен')

// Кнопка-меню Mini App в личных чатах
if (WEBAPP_URL) {
  bot.telegram
    .setChatMenuButton({
      menuButton: { type: 'web_app', text: '🛍 Магазин', web_app: { url: WEBAPP_URL } },
    })
    .catch((e) => console.error('setChatMenuButton error:', e))
}

startScheduler(bot)
startApiServer(process.env.NODE_ENV === 'production' ? bot : undefined)

// ─── Загрузка OpenRouter ключа из БД ─────────────────────────────────────────

;(async () => {
  try {
    const savedKey = await getApiKeyValue('openrouter_key')
    if (savedKey) {
      process.env.OPENROUTER_API_KEY = savedKey
      reinitAgentClient(savedKey)
      reinitParserClient(savedKey)
      console.log('OpenRouter ключ загружен из БД')
    }
  } catch (e) {
    console.error('Load OpenRouter key error:', e)
  }
})()

// ─── Инициализация дефолтных регионов ────────────────────────────────────────

const DEFAULT_REGIONS = [
  { code: 'HK', name: 'Гонконг',  flag: '🇭🇰', currency: 'HKD' },
  { code: 'EU', name: 'Европа',   flag: '🇪🇺', currency: 'EUR' },
  { code: 'IN', name: 'Индия',    flag: '🇮🇳', currency: 'INR' },
  { code: 'RU', name: 'Россия',   flag: '🇷🇺', currency: 'RUB' },
  { code: 'CN', name: 'Китай',    flag: '🇨🇳', currency: 'CNY' },
] as const

;(async () => {
  for (const r of DEFAULT_REGIONS) {
    await prisma.region.upsert({
      where: { code: r.code },
      create: r,
      update: {},
    })
  }
  console.log('Регионы инициализированы')
})().catch((err) => console.error('Region seeder failed:', err))

// ─── DB keepalive: предотвращает разрыв соединения на db.prisma.io ────────────

setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (e) {
    console.log('DB keepalive failed, reconnecting...')
  }
}, 4 * 60 * 1000)

// ─── Автозавершение акций по истечению срока (каждые 10 минут) ───────────────

setInterval(async () => {
  try {
    const expired = await prisma.promotion.findMany({
      where: { isActive: true, endsAt: { lt: new Date() } },
    })
    for (const promo of expired) {
      await cancelPromotion(promo.id)
      for (const adminId of ADMIN_IDS) {
        try {
          await bot.telegram.sendMessage(
            adminId,
            `⏰ Акция «${promo.name}» завершена автоматически — срок истёк.`,
          )
        } catch {
          // ignore
        }
      }
    }
  } catch (e) {
    console.error('Promo auto-cancel error:', e)
  }
}, 10 * 60 * 1000)

// ─── Ежедневное уведомление о курсах валют в 10:00 МСК ───────────────────────
// Проверяем раз в час; если час === 10 и сегодня ещё не отправляли — отправляем.

setInterval(async () => {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
    if (now.getHours() !== 10) return

    const todayStr = now.toISOString().slice(0, 10)
    const notifyDateValue = await getApiKeyValue('currency_notify_date')
    if (notifyDateValue === todayStr) return // уже отправляли сегодня

    // Отмечаем как отправленное
    await setApiKeyValue('currency_notify_date', todayStr)

    for (const adminId of ADMIN_IDS) {
      try {
        const result = await sendDailyCurrencyRates(async (text, keyboard) => {
          await bot.telegram.sendMessage(adminId, text, { parse_mode: 'HTML', ...keyboard })
        })
        if (result?.changes) {
          lastCurrencyChanges.splice(0, lastCurrencyChanges.length, ...result.changes)
        }
      } catch { /* ignore */ }
    }
  } catch (e) {
    console.error('Currency notify error:', e)
  }
}, 60 * 60 * 1000)

// ─── Инициализация технического топика «📦 Продажи и резервы» ─────────────────

async function ensureSalesTopic(): Promise<void> {
  try {
    const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID)
    if (!CRM_GROUP_ID) return

    const existingTopic = await getApiKeyValue('sales_topic')
    if (existingTopic) {
      console.log(`Топик продаж: threadId=${existingTopic}`)
      return
    }

    const topic = await bot.telegram.createForumTopic(CRM_GROUP_ID, '📦 Продажи и резервы')
    const threadId = topic.message_thread_id

    await setApiKeyValue('sales_topic', String(threadId))
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

;(async () => { await ensureSalesTopic() })().catch((err) => console.error('ensureSalesTopic failed:', err))

process.once('SIGTERM', () => bot.stop('SIGTERM'))
process.on('SIGINT', async () => {
  bot.stop('SIGINT')
  await prisma.$disconnect()
  await pool.end()
  process.exit(0)
})
