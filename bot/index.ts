import 'dotenv/config'
import { Telegraf, Markup } from 'telegraf'
import { setupClientHandlers } from '../webhooks/telegram'
import { startScheduler } from './scheduler'
import { startApiServer } from '../api/server'

const BOT_TOKEN = process.env.BOT_TOKEN
const ADMIN_IDS = (process.env.ADMIN_IDS ?? '').split(',').map((id) => Number(id.trim()))

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN не задан в .env')
}

const bot = new Telegraf(BOT_TOKEN)

// ─── Главное меню ─────────────────────────────────────────────────────────────

const adminKeyboard = Markup.keyboard([
  ['📊 Аналитика', '📬 Входящие'],
  ['📢 Рассылки', '💰 Балансы'],
  ['🏷️ Акции', '🔧 Техработы'],
  ['🔑 API Ключи'],
]).resize()

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

// ─── /start ───────────────────────────────────────────────────────────────────

bot.start((ctx) => {
  ctx.reply(
    `Привет, ${ctx.from.first_name}! Добро пожаловать в панель управления Bender Shop.`,
    adminKeyboard,
  )
})

// ─── Заглушки для кнопок меню ─────────────────────────────────────────────────

const stub = 'Раздел в разработке'

bot.hears('📊 Аналитика', (ctx) => ctx.reply(stub))
bot.hears('📬 Входящие', (ctx) => ctx.reply(stub))
bot.hears('📢 Рассылки', (ctx) => ctx.reply(stub))
bot.hears('💰 Балансы', (ctx) => ctx.reply(stub))
bot.hears('🏷️ Акции', (ctx) => ctx.reply(stub))
bot.hears('🔧 Техработы', (ctx) => ctx.reply(stub))
bot.hears('🔑 API Ключи', (ctx) => ctx.reply(stub))

// ─── Запуск ───────────────────────────────────────────────────────────────────

bot.launch({
  allowedUpdates: ['message', 'callback_query'],
})

console.log('Бот запущен')

startScheduler(bot)
startApiServer()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
