import 'dotenv/config'
import { Telegraf, Markup } from 'telegraf'
import { message } from 'telegraf/filters'
import { setupClientHandlers } from '../webhooks/telegram'
import { startScheduler, isRunning as schedulerRunning } from './scheduler'
import { getUserId } from './helpers'
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
  showAISettings, setupAISettingsHandlers, setupAIScheduleHandlers,
  showApiKeysMenu, setupApiKeysHandlers, handleApiKeysMessage, apiKeysState,
  securityState, handleSecurityMessage,
} from './admin/ai_settings'
import { initAdminNotifications } from '../lib/notify-admins'
import { getApiKeyValue, setApiKeyValue } from '../lib/api-key-store'
import { reinitClient as reinitAgentClient, getAIMode, setAIMode } from './ai/agent'
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
import {
  suppliersState,
  setupSupplierHandlers,
  showSuppliersMenu,
  handleSuppliersMessage,
} from './admin/suppliers'
import { handleSupplierMessage, findBestPrice, requestPriceFromAllSuppliers } from '../webhooks/supplier'
import { cancelPromotion } from '../lib/promotions'
import { logSecurityEvent, initSecurityAlerts } from '../lib/security-log'
import { createBackupBuffer } from '../lib/backup'
import { aiSuggestions, storeSuggestion } from './ai/agent'

const BOT_TOKEN = process.env.BOT_TOKEN

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN не задан в .env')
}

const ADMIN_IDS = (process.env.ADMIN_IDS ?? '').split(',').map((id) => Number(id.trim())).filter(Boolean)
if (ADMIN_IDS.length === 0 || ADMIN_IDS.some(isNaN)) {
  throw new Error('ADMIN_IDS must be comma-separated list of valid Telegram user IDs')
}

const bot = new Telegraf(BOT_TOKEN)

initAdminNotifications(bot, ADMIN_IDS)
initSecurityAlerts(bot, ADMIN_IDS)
initPrismaAlerts(bot, ADMIN_IDS)

// ─── Режим техработ (in-memory) ───────────────────────────────────────────────

let maintenanceMode = false

// ─── Request logging ─────────────────────────────────────────────────────────

bot.use(async (ctx, next) => {
  const updateType = ctx.updateType
  const fromId = ctx.from?.id
  const chatId = ctx.chat?.id
  const chatType = ctx.chat?.type ?? ''
  const text = ((ctx.message as any)?.text ?? '').slice(0, 60)
  const cbData = (ctx.callbackQuery as any)?.data ?? ''
  const info = text || cbData || ''
  console.log(`[BOT] ${updateType} from=${fromId ?? '?'} chat=${chatId ?? '?'}(${chatType})${info ? ' ' + info : ''}`)
  return next()
})

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
      await logSecurityEvent('rate_limit_exceeded', { userId, count: stats.count }, userId)
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
    }, userId)
    return ctx.reply('⛔ Нет доступа.')
  }
  return next()
}

// ─── Главное меню ─────────────────────────────────────────────────────────────

const adminKeyboard = Markup.keyboard([
  ['📦 Товароучёт', '💰 Цены'],
  ['📊 Аналитика', '📬 Входящие'],
  ['🏭 Поставщики', '🤖 AI Агент'],
  ['📢 Рассылки', '🏷️ Акции'],
  ['🖼️ Витрина', '📂 Сегменты'],
  ['🔧 Техработы'],
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
  '🏭 Поставщики',
])

// ─── Обработка сообщений от клиентов ─────────────────────────────────────────
// Регистрируется ДО admin-middleware, чтобы клиенты не получали «⛔ Доступ запрещён»

setupClientHandlers(bot)

// ─── Обработка сообщений из чатов поставщиков ───────────────────────────────
// Регистрируется ДО admin-middleware, чтобы прайсы от поставщиков обрабатывались.

bot.on(message('text'), async (ctx, next) => {
  const chatId = ctx.chat?.id
  if (ctx.chat?.type === 'private') return next()
  if (chatId === Number(process.env.CRM_GROUP_ID)) return next()

  const handled = await handleSupplierMessage(ctx, bot)
  if (handled) return
  return next()
})

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

// Silent drop for non-admins: adminOnly() would reply "⛔ Нет доступа" to every
// non-admin message, which is bad UX. Client messages are handled by setupClientHandlers
// registered above. This middleware only gates the admin panel below.
bot.use((ctx, next) => {
  const userId = ctx.from?.id
  if (!userId || !ADMIN_IDS.includes(userId)) {
    return
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
    suppliersState.delete(userId)
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

  // Флоу поставщиков
  if (suppliersState.has(userId)) {
    const handled = await handleSuppliersMessage(ctx, userId, text)
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
  const userId = ctx.from?.id
  if (userId) {
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
    suppliersState.delete(userId)
  }
  return ctx.reply(
    `Привет, ${ctx.from?.first_name ?? ''}! Добро пожаловать в панель управления Bender Shop.`,
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

// ─── /hits — управление блоком "Хит продаж" ──────────────────────────────────

bot.command('hits', async (ctx) => {
  const userId = getUserId(ctx)
  if (!ADMIN_IDS.includes(userId)) return

  const args = (ctx.message.text || '').split(/\s+/).slice(1)
  const sub = args[0]

  try {
    // /hits — показать текущие
    if (!sub) {
      const featured = await prisma.product.findMany({
        where: { isFeatured: true },
        select: { name: true, price: true },
        orderBy: { name: 'asc' },
      })
      if (featured.length === 0) {
        await ctx.reply('🔥 Хит продаж: пусто\n\nДобавить: /hits add <название>\nAI: /hits auto')
        return
      }
      const lines = featured.map(p => `• ${p.name} — ${Number(p.price).toLocaleString('ru-RU')}₽`)
      await ctx.reply(`🔥 Хит продаж (${featured.length}):\n\n${lines.join('\n')}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🤖 Обновить AI', 'hits:refresh')],
          [Markup.button.callback('❌ Очистить все', 'hits:clear')],
        ]))
      return
    }

    // /hits add <текст>
    if (sub === 'add') {
      const search = args.slice(1).join(' ')
      if (!search) { await ctx.reply('Укажите название: /hits add iPhone 16 Pro'); return }
      const product = await prisma.product.findFirst({
        where: { isAvailable: true, name: { contains: search, mode: 'insensitive' } },
      })
      if (!product) { await ctx.reply(`❌ Товар "${search}" не найден`); return }
      await prisma.product.update({ where: { id: product.id }, data: { isFeatured: true } })
      await ctx.reply(`✅ ${product.name} добавлен в хиты`)
      return
    }

    // /hits remove <текст>
    if (sub === 'remove') {
      const search = args.slice(1).join(' ')
      if (!search) { await ctx.reply('Укажите название: /hits remove iPhone 16 Pro'); return }
      const product = await prisma.product.findFirst({
        where: { isFeatured: true, name: { contains: search, mode: 'insensitive' } },
      })
      if (!product) { await ctx.reply(`❌ Товар "${search}" не найден в хитах`); return }
      await prisma.product.update({ where: { id: product.id }, data: { isFeatured: false } })
      await ctx.reply(`✅ ${product.name} убран из хитов`)
      return
    }

    // /hits auto
    if (sub === 'auto') {
      await ctx.reply('⏳ AI анализирует тренды...')
      const { fetchTrendsFromAI, saveTrends } = await import('../lib/trends')
      const trends = await fetchTrendsFromAI()
      if (!trends) { await ctx.reply('❌ Не удалось получить тренды от AI'); return }
      await saveTrends(trends)

      await prisma.product.updateMany({ where: { isFeatured: true }, data: { isFeatured: false } })
      let count = 0
      for (const name of trends.featuredProducts.slice(0, 10)) {
        const p = await prisma.product.findFirst({
          where: { isAvailable: true, name: { contains: name, mode: 'insensitive' } },
        })
        if (p) { await prisma.product.update({ where: { id: p.id }, data: { isFeatured: true } }); count++ }
      }
      await ctx.reply([
        `✅ AI обновил хиты (${count} товаров)`,
        '',
        `🏷 Категории: ${trends.categories.slice(0, 6).join(' → ')}`,
        `🏭 Бренды: ${trends.brands.slice(0, 6).join(' → ')}`,
        `💡 ${trends.reasoning}`,
      ].join('\n'))
      return
    }

    // /hits clear
    if (sub === 'clear') {
      const { count } = await prisma.product.updateMany({ where: { isFeatured: true }, data: { isFeatured: false } })
      await ctx.reply(`✅ Все хиты сброшены (${count})`)
      return
    }

    await ctx.reply('Команды: /hits, /hits add, /hits remove, /hits auto, /hits clear')
  } catch (err) {
    await ctx.reply(`❌ Ошибка: ${err instanceof Error ? err.message : err}`)
  }
})

bot.action('hits:refresh', async (ctx) => {
  try { await ctx.answerCbQuery('⏳ Запускаю AI...') } catch { /* ignore */ }
  try {
    const { fetchTrendsFromAI, saveTrends } = await import('../lib/trends')
    const trends = await fetchTrendsFromAI()
    if (!trends) { await ctx.reply('❌ AI недоступен'); return }
    await saveTrends(trends)
    await prisma.product.updateMany({ where: { isFeatured: true }, data: { isFeatured: false } })
    let count = 0
    for (const name of trends.featuredProducts.slice(0, 10)) {
      const p = await prisma.product.findFirst({
        where: { isAvailable: true, name: { contains: name, mode: 'insensitive' } },
      })
      if (p) { await prisma.product.update({ where: { id: p.id }, data: { isFeatured: true } }); count++ }
    }
    await ctx.reply(`✅ AI обновил хиты (${count})\n💡 ${trends.reasoning}`)
  } catch (err) {
    await ctx.reply(`❌ ${err instanceof Error ? err.message : err}`)
  }
})

bot.action('hits:clear', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  const { count } = await prisma.product.updateMany({ where: { isFeatured: true }, data: { isFeatured: false } })
  await ctx.reply(`✅ Все хиты сброшены (${count})`)
})

// ─── Avito команды ───────────────────────────────────────────────────────────

bot.command('avito', async (ctx) => {
  const userId = getUserId(ctx)
  if (!ADMIN_IDS.includes(userId)) return

  const args = (ctx.message.text || '').split(/\s+/).slice(1)
  const sub = args[0]

  try {
    const { isAvitoConfigured } = await import('../lib/avito')

    // /avito — статус
    if (!sub) {
      const configured = isAvitoConfigured()
      const mapped = await prisma.product.count({ where: { avitoItemId: { not: null } } })
      const enabled = await prisma.product.count({ where: { avitoEnabled: true } })
      let avitoCount = '—'
      if (configured) {
        try {
          const { getAvitoItems } = await import('../lib/avito')
          const items = await getAvitoItems()
          avitoCount = String(items.length)
        } catch { avitoCount = 'ошибка' }
      }
      await ctx.reply([
        '📊 Avito интеграция:',
        `🔗 Подключено: ${configured ? '✅' : '❌'}`,
        `📦 Объявлений на Avito: ${avitoCount}`,
        `🔗 Смаплено с каталогом: ${mapped}`,
        `✅ avitoEnabled: ${enabled}`,
        '',
        'Команды:',
        '/avito map — автоматический маппинг',
        '/avito sync — синхронизация цен',
        '/avito enable_cat <Категория>',
        '/avito disable_cat <Категория>',
        '/avito list — смапленные товары',
      ].join('\n'))
      return
    }

    // /avito map
    if (sub === 'map') {
      await ctx.reply('⏳ Маппинг Avito → Каталог (read-only)...')
      const { mapAvitoToProducts } = await import('../lib/avito-sync')
      const mappings = await mapAvitoToProducts()

      const exact = mappings.filter(m => m.confidence === 'exact').length
      const fuzzy = mappings.filter(m => m.confidence === 'fuzzy').length
      const none = mappings.filter(m => m.confidence === 'none').length

      // Полный отчёт — сортировка: exact → fuzzy → none, внутри по score desc
      const order = { exact: 0, fuzzy: 1, none: 2 }
      const sorted = [...mappings].sort((a, b) =>
        (order[a.confidence] - order[b.confidence]) || (b.score - a.score)
      )

      const reportLines = sorted.map(m => {
        const icon = m.confidence === 'exact' ? '✅' : m.confidence === 'fuzzy' ? '⚠️' : '❌'
        const match = m.productName
          ? `→ ${m.productName} (${Math.round(m.score * 100)}%)`
          : '→ НЕТ СОВПАДЕНИЯ'
        const pricePart = m.avitoPrice ? ` [Avito: ${m.avitoPrice.toLocaleString('ru-RU')}₽]` : ''
        return `${icon} ${m.avitoTitle} ${match}${pricePart}`
      })

      await ctx.reply([
        `🔗 Маппинг Avito → Каталог (${mappings.length} объявлений):`,
        '',
        `✅ Точных: ${exact}`,
        `⚠️ Нечётких: ${fuzzy}`,
        `❌ Не найдено: ${none}`,
        '',
        '📄 Полный отчёт в файле ниже',
        '⚠️ READ-ONLY — ничего не применяется',
      ].join('\n'))

      const buffer = Buffer.from(reportLines.join('\n'), 'utf-8')
      await ctx.replyWithDocument({
        source: buffer,
        filename: `avito-mapping-${new Date().toISOString().slice(0, 10)}.txt`,
      })
      return
    }

    // /avito sync
    if (sub === 'sync') {
      await ctx.reply('⏳ Синхронизация цен...')
      const { syncPricesToAvito } = await import('../lib/avito-sync')
      const result = await syncPricesToAvito()
      await ctx.reply(`✅ Avito: ${result.updated} цен обновлено, ${result.failed} ошибок, ${result.skipped} пропущено`)
      return
    }

    // /avito enable_cat <Категория>
    if (sub === 'enable_cat') {
      const catName = args.slice(1).join(' ')
      if (!catName) { await ctx.reply('Укажите категорию: /avito enable_cat Телефоны'); return }
      const cat = await prisma.category.findFirst({ where: { name: catName } })
      if (!cat) { await ctx.reply(`❌ Категория "${catName}" не найдена`); return }
      const { count } = await prisma.product.updateMany({
        where: { categoryId: cat.id },
        data: { avitoEnabled: true },
      })
      await ctx.reply(`✅ Включено ${count} товаров категории "${catName}" для Avito`)
      return
    }

    // /avito disable_cat <Категория>
    if (sub === 'disable_cat') {
      const catName = args.slice(1).join(' ')
      if (!catName) { await ctx.reply('Укажите категорию: /avito disable_cat Телефоны'); return }
      const cat = await prisma.category.findFirst({ where: { name: catName } })
      if (!cat) { await ctx.reply(`❌ Категория "${catName}" не найдена`); return }
      const { count } = await prisma.product.updateMany({
        where: { categoryId: cat.id },
        data: { avitoEnabled: false },
      })
      await ctx.reply(`✅ Выключено ${count} товаров категории "${catName}" для Avito`)
      return
    }

    // /avito list
    if (sub === 'list') {
      const mapped = await prisma.product.findMany({
        where: { avitoItemId: { not: null } },
        select: { id: true, name: true, avitoItemId: true, avitoEnabled: true, price: true },
        orderBy: { name: 'asc' },
        take: 20,
      })
      if (mapped.length === 0) { await ctx.reply('Нет смапленных товаров'); return }
      const total = await prisma.product.count({ where: { avitoItemId: { not: null } } })
      const lines = mapped.map(p =>
        `${p.avitoEnabled ? '✅' : '⬜'} ${p.name} → avito:${p.avitoItemId} (${Number(p.price).toLocaleString('ru-RU')}₽)`
      )
      lines.push(`\nПоказано ${mapped.length} из ${total}`)
      await ctx.reply(lines.join('\n'))
      return
    }

    await ctx.reply('Неизвестная подкоманда. Используйте /avito')
  } catch (err) {
    await ctx.reply(`❌ Ошибка: ${err instanceof Error ? err.message : err}`)
  }
})

bot.action('avito:apply_map', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  const mappings = (globalThis as any).__avitoMappings
  if (!mappings) { await ctx.reply('Маппинг не найден, запустите /avito map заново'); return }
  try {
    const { applyAvitoMapping } = await import('../lib/avito-sync')
    const applied = await applyAvitoMapping(mappings)
    ;(globalThis as any).__avitoMappings = null
    await ctx.reply(`✅ Применено: ${applied} товаров смаплено с Avito`)
  } catch (err) {
    await ctx.reply(`❌ Ошибка: ${err instanceof Error ? err.message : err}`)
  }
})

bot.action('avito:cancel_map', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  ;(globalThis as any).__avitoMappings = null
  await ctx.reply('❌ Маппинг отменён')
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
      [Markup.button.callback('🗄️ Бэкап сейчас', 'maint:backup')],
      [Markup.button.callback('✨ Обогатить все карточки', 'maint:enrich_all')],
      [Markup.button.callback('🔑 API Ключи', 'maint:api_keys')],
      [Markup.button.callback('🗑️ Удалить все товары', 'maint:clear_products')],
      [Markup.button.callback('🧹 Удалить тестовые заказы', 'maint:clear_orders')],
      [Markup.button.callback('🧪 Тест обогащения → Sheets', 'maint:test_enrich')],
      [Markup.button.callback('📖 Как восстановить', 'maint:restore_info')],
      [Markup.button.callback('🏠 Главное меню', 'back:main')],
    ]),
  )
})

bot.action('maint:on', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
  const userId = getUserId(ctx)
  maintenanceMode = true
  await logSecurityEvent('maintenance_mode_toggled', { enabled: true, adminId: userId }, userId)
  await ctx.reply('🔧 Техработы включены. Клиенты получат автоответ.')
})

bot.action('maint:off', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
  const userId = getUserId(ctx)
  maintenanceMode = false
  await logSecurityEvent('maintenance_mode_toggled', { enabled: false, adminId: userId }, userId)
  await ctx.reply('✅ Техработы выключены. Бот работает в штатном режиме.')
})

bot.action('maint:backup', async (ctx) => {
  try { await ctx.answerCbQuery('⏳ Создаю бэкап...') } catch { /* ignore */ }
  const userId = ctx.from?.id
  if (!userId) return

  try {
    await ctx.reply('⏳ Создаю бэкап базы данных...')
    const { buffer, stats } = await createBackupBuffer()
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2)
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')

    const statsLines = Object.entries(stats)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `  ${key}: ${count}`)
      .join('\n')

    await ctx.replyWithDocument(
      { source: buffer, filename: `bender-backup-${dateStr}.json` },
      {
        caption: [
          `🗄️ Бэкап (${new Date().toISOString().slice(0, 10)})`,
          `📦 Размер: ${sizeMB} MB`,
          '',
          statsLines,
        ].join('\n'),
      },
    )

    try {
      await logSecurityEvent('backup_created', { sizeMB, adminId: userId, manual: true }, userId)
    } catch { /* ignore */ }
  } catch (err) {
    console.error('[Backup] Manual backup failed:', err)
    await ctx.reply(`❌ Бэкап не удался: ${err instanceof Error ? err.message : 'Ошибка'}`)
  }
})

bot.action('maint:clear_products', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  await ctx.reply('⚠️ Удаление всех товаров...')
  try {
    await prisma.$transaction([
      prisma.stockMovement.deleteMany(),
      prisma.orderItem.deleteMany(),
      prisma.order.deleteMany(),
      prisma.reservation.deleteMany(),
      prisma.supplierPrice.deleteMany(),
      prisma.priceChange.deleteMany(),
      prisma.productVariant.deleteMany(),
      prisma.product.deleteMany(),
    ])
    await ctx.reply('✅ Все товары удалены. Категории сохранены.')
  } catch (err) {
    await ctx.reply(`❌ Ошибка: ${err instanceof Error ? err.message : err}`)
  }
})

bot.action('maint:test_enrich', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  await ctx.reply('🧪 Запускаю тестовое обогащение 5 товаров + запись во ВСЕ строки Sheets...')

  const TARGETS = [
    { search: 'Iphone 17 Pro', type: 'телефон' },
    { search: 'Macbook Air M5', type: 'ноутбук' },
    { search: 'Apple Watch S11', type: 'часы' },
    { search: 'Dyson Airwrap', type: 'красота' },
    { search: 'JBL Flip 6', type: 'аудио' },
  ]

  try {
    const { enrichProductCard } = await import('../lib/enrich')
    const results: string[] = []

    for (const target of TARGETS) {
      const product = await prisma.product.findFirst({
        where: { name: target.search },
        select: { id: true, name: true, _count: { select: { variants: true } } },
      })

      if (!product) {
        results.push(`❌ ${target.type}: "${target.search}" — не найден`)
        continue
      }

      // enrichProductCard now writes to ALL sheet rows internally
      const success = await enrichProductCard(product.id, true)
      if (!success) {
        results.push(`❌ ${target.type}: "${target.search}" — обогащение не удалось`)
        continue
      }

      const updated = await prisma.product.findUnique({ where: { id: product.id } })
      if (!updated) continue

      const description = updated.description || ''
      const specs = updated.specs as Record<string, string> | null
      const specCount = specs ? Object.keys(specs).length : 0

      results.push(`✅ ${target.type}: "${target.search}" (${product._count.variants} вариантов)\n   Desc: ${description.slice(0, 60)}...\n   Specs: ${specCount} полей → записано во все строки`)

      await new Promise(r => setTimeout(r, 2000))
    }

    await ctx.reply(`🧪 Результат:\n\n${results.join('\n\n')}`)
  } catch (err) {
    await ctx.reply(`❌ Ошибка: ${err instanceof Error ? err.message : err}`)
  }
})

bot.action('maint:clear_orders', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  await ctx.reply('⚠️ Удаление тестовых заказов...')
  try {
    const orderCount = await prisma.order.count()
    await prisma.$transaction([
      prisma.orderItem.deleteMany(),
      prisma.order.deleteMany(),
      prisma.reservation.deleteMany(),
    ])
    await ctx.reply(`✅ Удалено ${orderCount} заказов, все резервы сняты.`)
  } catch (err) {
    await ctx.reply(`❌ Ошибка: ${err instanceof Error ? err.message : err}`)
  }
})

// ─── Stale prices actions ─────────────────────────────────────────────────────

bot.action('stale:hide', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  const items = (globalThis as any).__staleItems as Array<{ name: string }> | undefined
  if (!items?.length) { await ctx.reply('Нет устаревших позиций.'); return }

  const allVariants = await prisma.productVariant.findMany({ select: { id: true, productId: true, attributes: true } })
  const toHide: number[] = []
  const affectedProductIds = new Set<number>()

  for (const v of allVariants) {
    const attrs = v.attributes as Record<string, unknown> | null
    if (!attrs?.fullName) continue
    const fn = String(attrs.fullName).toLowerCase()
    if (items.some(item => fn.includes(item.name.toLowerCase().slice(0, 30)))) {
      toHide.push(v.id)
      affectedProductIds.add(v.productId)
    }
  }

  if (toHide.length > 0) {
    await prisma.productVariant.updateMany({
      where: { id: { in: toHide } },
      data: { inStock: false, quantity: 0 },
    })

    for (const pid of [...affectedProductIds]) {
      const totalQty = await prisma.productVariant.aggregate({ where: { productId: pid }, _sum: { quantity: true } })
      await prisma.product.update({
        where: { id: pid },
        data: { isAvailable: (totalQty._sum.quantity ?? 0) > 0, stock: totalQty._sum.quantity ?? 0, quantity: totalQty._sum.quantity ?? 0 },
      })
    }
  }

  await ctx.reply(`🔴 Скрыто с витрины: ${toHide.length} вариантов. После обновления цен нажмите «🔄 Синхронизировать».`)
  delete (globalThis as any).__staleItems
})

bot.action('stale:ask_manager', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  const items = (globalThis as any).__staleItems as Array<{ name: string }> | undefined
  if (!items?.length) { await ctx.reply('Нет устаревших позиций.'); return }

  const allVariants = await prisma.productVariant.findMany({ select: { id: true, attributes: true } })
  const toUpdate: number[] = []

  for (const v of allVariants) {
    const attrs = v.attributes as Record<string, unknown> | null
    if (!attrs?.fullName) continue
    const fn = String(attrs.fullName).toLowerCase()
    if (items.some(item => fn.includes(item.name.toLowerCase().slice(0, 30)))) {
      toUpdate.push(v.id)
    }
  }

  if (toUpdate.length > 0) {
    await prisma.productVariant.updateMany({
      where: { id: { in: toUpdate } },
      data: { price: 0 },
    })
  }

  await ctx.reply(`💬 Обновлено ${toUpdate.length} вариантов — цена «уточняйте у менеджера». После обновления цен нажмите «🔄 Синхронизировать».`)
  delete (globalThis as any).__staleItems
})

bot.action('stale:skip', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  await ctx.reply('⏭️ Позиции оставлены без изменений. Рекомендуем обновить цены как можно скорее.')
  delete (globalThis as any).__staleItems
})

bot.action('maint:restore_info', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  await ctx.reply([
    '📖 Восстановление из бэкапа:',
    '',
    '1. Скачайте файл бэкапа из чата',
    '2. На компьютере с Railway CLI:',
    '   railway run npx ts-node scripts/restore-db.ts backup.json --dry-run',
    '3. Если всё ок:',
    '   railway run npx ts-node scripts/restore-db.ts backup.json --force',
    '',
    '⚠️ Восстановление перезаписывает ВСЕ данные!',
    'Делайте --dry-run перед --force.',
    '',
    '🔄 Для отката кода (не данных):',
    'Railway Dashboard → Deployments → выбрать рабочий → Redeploy',
  ].join('\n'))
})

let enrichAbortFlag = false

bot.action('maint:enrich_all', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  enrichAbortFlag = false
  await ctx.reply('✨ Обогащение запущено в фоне (5-15 мин)...', Markup.inlineKeyboard([
    [Markup.button.callback('⏹️ Остановить обогащение', 'enrich:stop')],
  ]))

  const userId = ctx.from?.id
  ;(async () => {
    try {
      const { enrichAllProducts } = await import('../lib/enrich')
      const result = await enrichAllProducts(() => enrichAbortFlag)
      if (userId) {
        if (enrichAbortFlag) {
          await bot.telegram.sendMessage(userId, `⏹️ Обогащение остановлено. Обогащено: ${result.enriched} из ${result.total}`)
        } else {
          await bot.telegram.sendMessage(userId, [
            '✨ Обогащение завершено!',
            '',
            `✅ Обогащено: ${result.enriched}`,
            `⏭️ Пропущено: ${result.total - result.enriched - result.failed}`,
            `❌ Ошибок: ${result.failed}`,
            `📦 Всего: ${result.total}`,
          ].join('\n'))
        }
      }
    } catch (err) {
      console.error('[Enrich] Background error:', err)
      if (userId) {
        await bot.telegram.sendMessage(userId, `❌ Ошибка обогащения: ${err}`).catch(() => {})
      }
    }
  })()
})

bot.action('enrich:stop', async (ctx) => {
  try { await ctx.answerCbQuery('Останавливаю...') } catch { /* ignore */ }
  enrichAbortFlag = true
})

bot.action('maint:api_keys', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  await showApiKeysMenu(ctx)
})

// Экспортируем флаг для использования в webhooks/telegram.ts (если потребуется)
export { maintenanceMode }

// ─── 🏠 Назад в главное меню ──────────────────────────────────────────────────

bot.action('back:main', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
  const userId = getUserId(ctx)
  inventoryState.delete(userId)
  broadcastsState.delete(userId)
  segmentsState.delete(userId)
  salesState.delete(userId)
  analyticsState.delete(userId)
  storefrontState.delete(userId)
  promotionsState.delete(userId)
  pricingState.delete(userId)
  apiKeysState.delete(userId)
  suppliersState.delete(userId)

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  let recentIncoming = 0
  try {
    recentIncoming = await prisma.message.count({
      where: { direction: 'in', createdAt: { gte: oneHourAgo } },
    })
  } catch { /* ignore */ }

  const menuText = recentIncoming > 0
    ? `🏠 Главное меню  |  📬 ${recentIncoming} новых за час`
    : '🏠 Главное меню'

  await ctx.reply(menuText, adminKeyboard)
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
setupAIScheduleHandlers(bot)

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

// ─── 🏭 Поставщики ───────────────────────────────────────────────────────────

setupSupplierHandlers(bot)

bot.hears('🏭 Поставщики', async (ctx) => {
  await showSuppliersMenu(ctx)
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

// Регистрация команд бота в Telegram
bot.telegram.setMyCommands([
  { command: 'start', description: 'Главное меню' },
  { command: 'shop', description: 'Открыть магазин' },
]).catch((e) => console.error('setMyCommands error:', e))

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

// ─── Восстановление pending AI-подсказок из БД ───────────────────────────────

;(async () => {
  try {
    const pendingTasks = await prisma.task.findMany({
      where: { action: 'ai_suggestion', status: 'pending' },
    })
    for (const task of pendingTasks) {
      const payload = task.payload as { suggestionId: number; text: string; threadId: number }
      storeSuggestion(task.clientId, payload.text, payload.threadId)
      await prisma.task.update({ where: { id: task.id }, data: { status: 'done' } })
    }
    if (pendingTasks.length > 0) {
      console.log(`[ai] Reloaded ${pendingTasks.length} pending suggestions from DB`)
    }
  } catch (e) {
    console.error('[ai] Failed to reload suggestions:', e)
  }
})()


// ─── DB keepalive: предотвращает разрыв соединения на db.prisma.io ────────────

setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (e) {
    console.error('DB keepalive failed:', e)
  }
}, 4 * 60 * 1000)

// ─── Ежедневный автобэкап в 03:00 МСК ──────────────────────────────────────

setInterval(async () => {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
    if (now.getHours() !== 3) return

    const todayStr = now.toISOString().slice(0, 10)
    const lastBackup = await getApiKeyValue('last_backup_date')
    if (lastBackup === todayStr) return

    await setApiKeyValue('last_backup_date', todayStr)

    console.log('[Backup] Starting daily backup...')
    const { buffer, stats } = await createBackupBuffer()
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2)
    const dateStr = todayStr.replace(/-/g, '')

    const statsLines = Object.entries(stats)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `  ${key}: ${count}`)
      .join('\n')

    const caption = [
      `🗄️ Ежедневный бэкап (${todayStr})`,
      `📦 Размер: ${sizeMB} MB`,
      '',
      statsLines,
    ].join('\n')

    // Отправить файл первому админу
    const adminId = ADMIN_IDS[0]
    if (adminId) {
      try {
        await bot.telegram.sendDocument(adminId, {
          source: buffer,
          filename: `bender-backup-${dateStr}.json`,
        }, { caption })
        console.log(`[Backup] Sent to admin ${adminId} (${sizeMB} MB)`)
      } catch (err) {
        console.error('[Backup] Failed to send to Telegram:', err)
      }
    }
  } catch (err) {
    console.error('[Backup] Daily backup failed:', err)
    for (const adminId of ADMIN_IDS) {
      try {
        await bot.telegram.sendMessage(adminId, `⚠️ Ежедневный бэкап не удался: ${err instanceof Error ? err.message : 'unknown error'}`)
      } catch { /* ignore */ }
    }
  }
}, 60 * 60 * 1000) // проверка каждый час

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
    // Проверить значительное изменение курса (> 0.5%)
    const usdRate = await prisma.currencyRate.findUnique({ where: { currency: 'USD' } })
    if (usdRate && usdRate.previousRate) {
      const current = Number(usdRate.rate)
      const previous = Number(usdRate.previousRate)
      const changePct = Math.abs((current - previous) / previous * 100)

      if (changePct > 0.5) {
        const direction = current > previous ? '📈' : '📉'
        for (const adminId of ADMIN_IDS) {
          try {
            await bot.telegram.sendMessage(adminId, [
              `⚠️ Курс доллара изменился на ${changePct.toFixed(2)}%`,
              `${direction} ${previous.toFixed(2)}₽ → ${current.toFixed(2)}₽`,
              '',
              'Рекомендуется скорректировать цены на витрине.',
            ].join('\n'), {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📊 Скорректировать цены', callback_data: 'pricing:usd_adjust' }],
                  [{ text: '⏭️ Пропустить', callback_data: 'morning:skip_adjust' }],
                ],
              },
            })
          } catch { /* ignore */ }
        }
      }
    }
  } catch (e) {
    console.error('Currency notify error:', e)
  }
}, 60 * 60 * 1000)

// ─── Утренняя сводка цен от поставщиков (11:00 МСК) ─────────────────────────

async function notifyNightClients(): Promise<void> {
  try {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const nightStart = new Date(todayStart)
    nightStart.setDate(nightStart.getDate() - 1)
    nightStart.setHours(20, 0, 0, 0)

    const nightEnd = new Date(todayStart)
    nightEnd.setHours(11, 0, 0, 0)

    const nightMessages = await prisma.message.findMany({
      where: {
        direction: 'in',
        createdAt: { gte: nightStart, lte: nightEnd },
      },
      include: { client: true },
      distinct: ['clientId'],
    })

    for (const msg of nightMessages) {
      if (!msg.client || msg.client.source !== 'telegram' || !msg.client.externalId) continue
      try {
        await bot.telegram.sendMessage(
          msg.client.externalId,
          '☀️ Доброе утро! Мы на связи.\n\nАктуальные цены на сегодня готовы. Если вас интересовал какой-то товар — напишите, подберём лучший вариант!',
        )
      } catch { /* ignore: user may have blocked bot */ }
    }

    if (nightMessages.length > 0) {
      console.log(`[Morning] Notified ${nightMessages.length} night clients`)
    }
  } catch (err) {
    console.error('[Morning] notifyNightClients error:', err)
  }
}

setInterval(async () => {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
    if (now.getHours() !== 11 || now.getMinutes() > 15) return

    const todayStr = now.toISOString().slice(0, 10)
    const notifyKey = 'morning_summary_date'
    const lastNotify = await getApiKeyValue(notifyKey)
    if (lastNotify === todayStr) return
    await setApiKeyValue(notifyKey, todayStr)

    // ── Ночная сводка Бендера ───────────────────────────────────────────────
    try {
      const nightBriefStart = new Date(todayStr + 'T00:00:00Z')
      nightBriefStart.setDate(nightBriefStart.getDate() - 1)
      nightBriefStart.setUTCHours(17, 0, 0, 0) // 20:00 MSK = 17:00 UTC

      const nightBriefEnd = new Date(todayStr + 'T00:00:00Z')
      nightBriefEnd.setUTCHours(8, 0, 0, 0) // 11:00 MSK = 08:00 UTC

      const nightMessages = await prisma.message.findMany({
        where: {
          direction: 'in',
          createdAt: { gte: nightBriefStart, lte: nightBriefEnd },
        },
        include: { client: true },
        orderBy: { createdAt: 'asc' },
      })

      const nightReserves = await prisma.task.findMany({
        where: {
          action: 'night_reserve',
          createdAt: { gte: nightBriefStart, lte: nightBriefEnd },
        },
        include: { client: true },
      })

      const nightRequests = await prisma.task.findMany({
        where: {
          action: 'night_request',
          createdAt: { gte: nightBriefStart, lte: nightBriefEnd },
        },
        include: { client: true },
      })

      const uniqueClients = new Set(nightMessages.map(m => m.clientId)).size

      if (uniqueClients > 0 || nightReserves.length > 0) {
        const lines = [
          '🤖 НОЧНАЯ СВОДКА БЕНДЕРА',
          '',
          `💬 Диалогов: ${uniqueClients} клиентов, ${nightMessages.length} сообщений`,
        ]

        if (nightReserves.length > 0) {
          lines.push('')
          lines.push(`🔖 БРОНИ (${nightReserves.length}) — НУЖНО ПОДТВЕРДИТЬ:`)
          for (const r of nightReserves) {
            const payload = r.payload as any
            const clientName = r.client?.name ?? 'Неизвестный'
            const clientUsername = (r.client as any)?.telegramUsername ?? ''
            lines.push(`  • ${clientName} ${clientUsername} → ${payload.productName} (${Number(payload.price).toLocaleString('ru-RU')}₽)`)
          }
        }

        if (nightRequests.length > 0) {
          lines.push('')
          lines.push(`❓ ЗАПРОСЫ (товар не найден):`)
          for (const r of nightRequests) {
            const payload = r.payload as any
            const clientName = r.client?.name ?? 'Неизвестный'
            lines.push(`  • ${clientName} искал: "${payload.requestedItem}"`)
          }
        }

        const clientsNeedReply = new Set<string>()
        for (const m of nightMessages) {
          if (m.client?.telegramTopicId) {
            const clientName = m.client.name
            const username = (m.client as any)?.telegramUsername ?? ''
            clientsNeedReply.add(`${clientName} ${username}`.trim())
          }
        }

        if (clientsNeedReply.size > 0) {
          lines.push('')
          lines.push(`👋 КЛИЕНТЫ, КОТОРЫМ НУЖНО НАПИСАТЬ:`)
          for (const c of clientsNeedReply) {
            lines.push(`  • ${c}`)
          }
        }

        lines.push('')
        lines.push('👆 Зайдите в CRM-топики этих клиентов и подтвердите брони.')

        // Кнопки для быстрого перехода к клиентам
        const crmGroupId = Number(process.env.CRM_GROUP_ID)
        const nightButtons: any[][] = []
        for (const r of nightReserves) {
          const clientName = r.client?.name ?? 'Клиент'
          const tgUsername = (r.client as any)?.telegramUsername ?? ''
          const topicId = r.client?.telegramTopicId
          if (topicId && crmGroupId) {
            const topicLink = `https://t.me/c/${String(crmGroupId).replace('-100', '')}/${topicId}`
            nightButtons.push([Markup.button.url(`👤 ${clientName} ${tgUsername}`.trim(), topicLink)])
          }
        }
        if (nightButtons.length > 0) {
          nightButtons.push([Markup.button.callback('📊 Все остатки', 'inv:stock_list')])
        }

        for (const adminId of ADMIN_IDS) {
          try {
            await bot.telegram.sendMessage(adminId, lines.join('\n'),
              nightButtons.length > 0 ? Markup.inlineKeyboard(nightButtons) : undefined)
          } catch { /* ignore */ }
        }

        console.log(`[Night Brief] Sent: ${uniqueClients} clients, ${nightReserves.length} reserves, ${nightRequests.length} requests`)
      }
    } catch (err) {
      console.error('[Night Brief] Error:', err)
    }

    // Собрать цены за сегодня
    const todayStart = new Date(todayStr + 'T00:00:00Z')
    const prices = await prisma.supplierPrice.findMany({
      where: { isActive: true, parsedAt: { gte: todayStart } },
      include: { supplier: true },
      orderBy: [{ model: 'asc' }, { price: 'asc' }],
    })

    if (prices.length === 0) {
      for (const adminId of ADMIN_IDS) {
        try {
          await bot.telegram.sendMessage(adminId, '📋 Утренняя сводка: пока нет новых цен от поставщиков. Прайсы обычно появляются к 10:30–11:00.')
        } catch { /* ignore */ }
      }
      return
    }

    // Группировать по модели
    const byModel = new Map<string, typeof prices>()
    for (const p of prices) {
      const key = `${p.model}${p.storage ? ' ' + p.storage : ''}`
      if (!byModel.has(key)) byModel.set(key, [])
      byModel.get(key)!.push(p)
    }

    const defaultMarkupStr = await getApiKeyValue('default_markup')
    const defaultMarkup = parseFloat(defaultMarkupStr ?? '5')

    const lines: string[] = [`📋 Утренняя сводка цен (${prices.length} позиций от ${new Set(prices.map(p => p.supplierId)).size} поставщиков):\n`]

    let count = 0
    for (const [model, modelPrices] of byModel) {
      if (count >= 30) { lines.push(`\n...и ещё ${byModel.size - 30} моделей`); break }
      const best = modelPrices[0]
      const markup = Number(best.supplier.markup) || defaultMarkup
      const finalPrice = Math.ceil(Number(best.price) * (1 + markup / 100))

      lines.push(`${model}${best.color ? ' ' + best.color : ''}${best.country ? ' ' + best.country : ''}`)
      lines.push(`  💰 ${Number(best.price).toLocaleString('ru-RU')}₽ → ${finalPrice.toLocaleString('ru-RU')}₽ (+${markup}%) от ${best.supplier.name}`)

      if (modelPrices.length > 1) {
        lines.push(`  📊 ещё ${modelPrices.length - 1} предложений`)
      }
      lines.push('')
      count++
    }

    for (const adminId of ADMIN_IDS) {
      try {
        await bot.telegram.sendMessage(adminId, lines.join('\n'), {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 Обновить цены на витрине', callback_data: 'morning:update_prices' }],
              [{ text: '📋 Подробная таблица', callback_data: 'morning:detailed' }],
            ],
          },
        })
      } catch { /* ignore */ }
    }

    await notifyNightClients()

    // AI-анализ трендов + обновление хитов
    try {
      const { fetchTrendsFromAI, saveTrends, getCurrentTrends } = await import('../lib/trends')
      const newTrends = await fetchTrendsFromAI()
      if (newTrends) {
        const oldTrends = await getCurrentTrends()
        await saveTrends(newTrends)

        const changed = !oldTrends ||
          JSON.stringify(oldTrends.categories.slice(0, 6)) !== JSON.stringify(newTrends.categories.slice(0, 6)) ||
          JSON.stringify(oldTrends.brands.slice(0, 6)) !== JSON.stringify(newTrends.brands.slice(0, 6))

        if (changed) {
          for (const adminId of ADMIN_IDS) {
            try {
              await bot.telegram.sendMessage(adminId, [
                '📊 AI обновил фильтрацию витрины:',
                '',
                `🏷 Топ категории: ${newTrends.categories.slice(0, 6).join(' → ')}`,
                `🏭 Топ бренды: ${newTrends.brands.slice(0, 6).join(' → ')}`,
                '',
                `💡 ${newTrends.reasoning}`,
              ].join('\n'))
            } catch { /* ignore */ }
          }
        }

        // Обновить блок "Хит продаж" (isFeatured)
        if (newTrends.featuredProducts && newTrends.featuredProducts.length > 0) {
          await prisma.product.updateMany({ where: { isFeatured: true }, data: { isFeatured: false } })

          let featuredCount = 0
          for (const name of newTrends.featuredProducts.slice(0, 10)) {
            const product = await prisma.product.findFirst({
              where: { isAvailable: true, name: { contains: name, mode: 'insensitive' } },
            })
            if (product) {
              await prisma.product.update({ where: { id: product.id }, data: { isFeatured: true } })
              featuredCount++
            }
          }

          if (featuredCount > 0) {
            const featuredList = newTrends.featuredProducts.slice(0, featuredCount).join('\n• ')
            for (const adminId of ADMIN_IDS) {
              try {
                await bot.telegram.sendMessage(adminId, `🔥 AI обновил "Хит продаж" (${featuredCount}):\n• ${featuredList}`)
              } catch { /* ignore */ }
            }
          }
        }
        console.log('[Trends] Updated:', newTrends.reasoning?.slice(0, 100))
      }
    } catch (err) {
      console.error('[Trends] Error:', err)
    }
  } catch (err) {
    console.error('[Morning summary] Error:', err)
  }
}, 15 * 60 * 1000)

// ─── AI авто-режим по расписанию ─────────────────────────────────────────────

async function checkAISchedule(): Promise<void> {
  try {
    const scheduleEnabled = await getApiKeyValue('ai_schedule_enabled')
    if (scheduleEnabled !== 'true') return

    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
    const hour = now.getHours()
    const WORK_START = 11
    const WORK_END = 20

    const currentMode = await getAIMode()
    const isWorkHours = hour >= WORK_START && hour < WORK_END

    if (!isWorkHours && currentMode !== 'auto' && currentMode !== 'off') {
      await setApiKeyValue('ai_mode_before_night', currentMode)
      await setAIMode('auto')
      console.log(`[AI Schedule] ${hour}:00 MSK → AUTO (was ${currentMode}, after hours)`)
      for (const adminId of ADMIN_IDS) {
        try {
          await bot.telegram.sendMessage(adminId,
            `🤖 AI переключён в автомат (нерабочее время ${hour}:00 МСК).\nБендер на связи!`)
        } catch { /* ignore */ }
      }
    } else if (isWorkHours && currentMode === 'auto') {
      const prevMode = await getApiKeyValue('ai_mode_before_night')
      if (prevMode) {
        const restoreMode = (['manual', 'semi', 'auto', 'off'].includes(prevMode) ? prevMode : 'semi') as 'manual' | 'semi' | 'auto' | 'off'
        await setAIMode(restoreMode)
        await setApiKeyValue('ai_mode_before_night', '')
        console.log(`[AI Schedule] ${hour}:00 MSK → ${restoreMode.toUpperCase()} (restored, work hours)`)
        for (const adminId of ADMIN_IDS) {
          try {
            await bot.telegram.sendMessage(adminId,
              `👤 AI переключён в ${restoreMode} (рабочее время ${hour}:00 МСК).`)
          } catch { /* ignore */ }
        }
      }
    }
  } catch (err) {
    console.error('[AI Schedule] Error:', err)
  }
}

setInterval(checkAISchedule, 10 * 60 * 1000)
setTimeout(checkAISchedule, 10_000)

// ─── Обработчики утренних кнопок ─────────────────────────────────────────────

bot.action('morning:skip_adjust', async (ctx) => {
  try { await ctx.answerCbQuery('Пропущено') } catch { /* ignore */ }
})

bot.action('morning:detailed', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  await ctx.reply('Откройте 🏭 Поставщики → 📊 Все цены за сегодня для подробной таблицы.')
})

bot.action('morning:update_prices', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const prices = await prisma.supplierPrice.findMany({
    where: { isActive: true, parsedAt: { gte: todayStart } },
    include: { supplier: true },
    orderBy: { price: 'asc' },
  })

  if (prices.length === 0) {
    await ctx.reply('Нет цен от поставщиков за сегодня.')
    return
  }

  const defaultMarkupStr = await getApiKeyValue('default_markup')
  const defaultMarkup = parseFloat(defaultMarkupStr ?? '5')

  // Лучшая цена по каждой модели
  const bestByModel = new Map<string, typeof prices[0]>()
  for (const p of prices) {
    const key = `${p.model}${p.storage ? ' ' + p.storage : ''}`
    if (!bestByModel.has(key)) bestByModel.set(key, p)
  }

  // Сопоставить с вариантами в каталоге
  const variants = await prisma.productVariant.findMany({
    where: { price: { gt: 0 } },
    include: { product: true },
  })

  const changes: string[] = []

  for (const variant of variants) {
    const productName = variant.product.name.toLowerCase()
    const attrs = variant.attributes as Record<string, string>
    const storage = attrs['Память'] || attrs['Storage'] || ''

    for (const [, bestPrice] of bestByModel) {
      if (productName.includes(bestPrice.model.toLowerCase()) &&
          (!bestPrice.storage || storage.toLowerCase().includes(bestPrice.storage.toLowerCase().replace(/\s/g, '')))) {

        const markup = Number(bestPrice.supplier.markup) || defaultMarkup
        const newPrice = Math.ceil(Number(bestPrice.price) * (1 + markup / 100))
        const oldPrice = Number(variant.price)

        if (Math.abs(newPrice - oldPrice) > 100) {
          changes.push(`${variant.product.name} ${Object.values(attrs).join('/')}: ${oldPrice.toLocaleString('ru-RU')}₽ → ${newPrice.toLocaleString('ru-RU')}₽`)
        }
        break
      }
    }
  }

  if (changes.length === 0) {
    await ctx.reply('✅ Цены на витрине актуальны — существенных изменений нет.')
    return
  }

  const preview = changes.slice(0, 20)
  await ctx.reply(
    [
      `📊 Предложение обновить ${changes.length} позиций:\n`,
      ...preview,
      changes.length > 20 ? `\n...и ещё ${changes.length - 20}` : '',
    ].join('\n'),
    Markup.inlineKeyboard([
      [Markup.button.callback('💰 Меню цен', 'pricing:menu')],
      [Markup.button.callback('🔙 Назад', 'back:main')],
    ]),
  )
})

// ─── Обработчики запроса цен у поставщиков ──────────────────────────────────

bot.action(/^price_request:send_all:(\d+):(.+)$/, async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  const query = decodeURIComponent((ctx.match as RegExpMatchArray)[2])
  const sent = await requestPriceFromAllSuppliers(bot, query)
  await ctx.reply(`📨 Запрос отправлен ${sent} поставщикам. Ответы появятся автоматически.`)
})

bot.action('price_request:cancel', async (ctx) => {
  try { await ctx.answerCbQuery() } catch { /* ignore */ }
  const userId = ctx.from?.id
  if (userId) salesState.delete(userId)
})

// ─── Google Sheets синхронизация (каждый час в рабочее время) ─────────────────

setInterval(async () => {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
    const hour = now.getHours()
    if (hour < 11 || hour >= 20) return // только рабочее время

    console.log(`[Sheets Sync] Auto-sync at ${hour}:00 MSK`)
    const { syncProductsFromSheets, checkStalePrices, formatStaleSupplierMessage } = await import('../lib/sheets-sync')
    const result = await syncProductsFromSheets()

    if (result.created > 0 || result.updated > 0) {
      for (const adminId of ADMIN_IDS) {
        try {
          await bot.telegram.sendMessage(adminId,
            `🔄 Авто-синхронизация Google Sheets:\n➕ ${result.created} создано | 🔄 ${result.updated} обновлено | 🔴 ${result.disabled} снято`)
        } catch { /* ignore */ }
      }
    }

    // Проверка устаревших цен (>6 часов)
    try {
      const staleItems = await checkStalePrices()
      if (staleItems.length > 0) {
        ;(globalThis as any).__staleItems = staleItems
        for (const adminId of ADMIN_IDS) {
          try {
            await bot.telegram.sendMessage(adminId, [
              `⚠️ ВНИМАНИЕ: ${staleItems.length} позиций с устаревшими ценами (>6 часов)`,
              '',
              'Что делать с этими позициями пока цены не обновлены?',
            ].join('\n'),
            Markup.inlineKeyboard([
              [Markup.button.callback('🔴 Убрать с витрины', 'stale:hide')],
              [Markup.button.callback('💬 «Уточняйте у менеджера»', 'stale:ask_manager')],
              [Markup.button.callback('⏭️ Оставить как есть', 'stale:skip')],
            ]))
            await bot.telegram.sendMessage(adminId, formatStaleSupplierMessage(staleItems))
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.error('[Stale Prices] Check error:', err)
    }
  } catch (err) {
    console.error('[Sheets Sync] Auto-sync error:', err)
  }
}, 60 * 60 * 1000) // каждый час

// Первая синхронизация через 30 сек после старта
setTimeout(async () => {
  try {
    const { syncProductsFromSheets } = await import('../lib/sheets-sync')
    await syncProductsFromSheets()
    console.log('[Sheets Sync] Initial sync done')
  } catch (err) {
    console.error('[Sheets Sync] Initial sync error:', err)
  }
}, 30_000)

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

async function serializeAISuggestions(): Promise<void> {
  if (aiSuggestions.size === 0) return
  try {
    const ops = [...aiSuggestions.entries()].map(([id, suggestion]) =>
      prisma.task.create({
        data: {
          clientId: suggestion.clientId,
          action: 'ai_suggestion',
          payload: { suggestionId: id, text: suggestion.text, threadId: suggestion.threadId },
          scheduledAt: new Date(),
          status: 'pending',
        },
      }),
    )
    await Promise.all(ops)
    console.log(`[ai] Serialized ${aiSuggestions.size} pending suggestions to DB`)
  } catch (e) {
    console.error('[ai] Failed to serialize suggestions:', e)
  }
}

let shuttingDown = false

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[shutdown] ${signal} received`)

  // Wait for scheduler tick to finish (max 10s)
  const waitStart = Date.now()
  while (schedulerRunning && Date.now() - waitStart < 10_000) {
    await new Promise((r) => setTimeout(r, 200))
  }

  try { await serializeAISuggestions() } catch (e) { console.error('[shutdown] serializeAISuggestions failed:', e) }
  try { bot.stop(signal) } catch (e) { console.error('[shutdown] bot.stop failed:', e) }
  try { await prisma.$disconnect() } catch (e) { console.error('[shutdown] prisma disconnect failed:', e) }
  try { await pool.end() } catch (e) { console.error('[shutdown] pool.end failed:', e) }
  process.exit(0)
}

process.once('SIGTERM', () => { gracefulShutdown('SIGTERM').catch(e => { console.error('[shutdown] fatal:', e); process.exit(1) }) })
process.once('SIGINT', () => { gracefulShutdown('SIGINT').catch(e => { console.error('[shutdown] fatal:', e); process.exit(1) }) })
