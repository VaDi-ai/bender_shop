import type { Telegraf } from 'telegraf'
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'telegraf/types'

export type PriceHomeVariant = 'client' | 'quick'
export type PriceMenuPage = { text: string; reply_markup: InlineKeyboardMarkup }
import path from 'node:path'
import { PriceMenuStore, type PriceNode } from './price-menu-store'

export const PRICE_MENU_NODES: Record<string, PriceNode> = {
  root: { title: 'Каталог Bender Shop', parent: 'home', children: [
    'info', 'order', 'apple', 'samsung', 'dyson', 'cameras', 'headphones',
    'xiaomi', 'one_plus', 'google_pixel', 'honor_huawei', 'gaming_vr',
    'vacuum_cleaners', 'tv', 'accessories',
  ] },
  info: { title: 'Основная информация', parent: 'root', text: 'Барклая 8, ТЦ Горбушка, Павильон 202\nЕжедневно с 11:00 до 20:00' },
  order: { title: 'Оформить заказ у менеджера', parent: 'root', text: 'Для оформления заказа напишите @BenderManager.' },
  apple: { title: 'Apple', parent: 'root', children: [
    'iphone_18_pro', 'iphone_17_pro', 'iphone_17_air', 'iphone_13_16',
    'airpods', 'apple_watch', 'ipad', 'macbook_air', 'macbook_pro', 'mac_studio_mini',
  ] },
  iphone_18_pro: { title: 'iPhone 18 Pro / Pro Max', parent: 'apple' },
  iphone_17_pro: { title: 'iPhone 17 Pro / Pro Max', parent: 'apple' },
  iphone_17_air: { title: 'iPhone 17 / Air', parent: 'apple' },
  iphone_13_16: { title: 'iPhone 13–16', parent: 'apple' },
  airpods: { title: 'AirPods', parent: 'apple' },
  apple_watch: { title: 'Apple Watch', parent: 'apple' },
  ipad: { title: 'iPad', parent: 'apple' },
  macbook_air: { title: 'MacBook Air', parent: 'apple' },
  macbook_pro: { title: 'MacBook Pro', parent: 'apple' },
  mac_studio_mini: { title: 'Mac Studio / Mini', parent: 'apple' },
  samsung: { title: 'Samsung', parent: 'root', children: ['galaxy_a', 'galaxy_s', 'galaxy_z', 'samsung_tablets'] },
  galaxy_a: { title: 'Galaxy A', parent: 'samsung' },
  galaxy_s: { title: 'Galaxy S', parent: 'samsung' },
  galaxy_z: { title: 'Galaxy Z', parent: 'samsung' },
  samsung_tablets: { title: 'Планшеты', parent: 'samsung' },
  dyson: { title: 'Dyson', parent: 'root' },
  cameras: { title: 'Камеры', parent: 'root' },
  headphones: { title: 'Наушники', parent: 'root' },
  xiaomi: { title: 'Xiaomi', parent: 'root' },
  one_plus: { title: 'One Plus', parent: 'root' },
  google_pixel: { title: 'Google Pixel', parent: 'root' },
  honor_huawei: { title: 'Honor/Huawei', parent: 'root' },
  gaming_vr: { title: 'Игровые консоли/VR', parent: 'root' },
  vacuum_cleaners: { title: 'Пылесосы', parent: 'root' },
  tv: { title: 'Телевизоры', parent: 'root' },
  accessories: { title: 'Аксессуары', parent: 'root' },
}

const CLIENT_WELCOME_TEXT = [
  'Привет! 👋 Добро пожаловать в Bender Shop!',
  '',
  '🛍 У нас можно купить технику по лучшим ценам — iPhone, MacBook, PlayStation, Dyson и многое другое.',
  '',
  '📍 Мы работаем:',
  '   Барклая 8, ТЦ Горбушка, Павильон 202',
  '   ⏰ Ежедневно с 11:00 до 20:00',
  '',
  '💬 Напишите что вас интересует — ответим быстро!',
  '🛒 Или откройте каталог по кнопке ниже 👇',
].join('\n')

export function buildClientWelcome(webAppUrl?: string): PriceMenuPage {
  const rows: InlineKeyboardButton[][] = webAppUrl
    ? [[{ text: '🛍 Открыть каталог', web_app: { url: webAppUrl } }]] : []
  rows.push([{ text: 'ПРАЙС', callback_data: 'price:client:root' }])
  return { text: CLIENT_WELCOME_TEXT, reply_markup: { inline_keyboard: rows } }
}

export function buildQuickEntry(shopUrl: string, adminUrl: string): PriceMenuPage {
  return { text: 'Быстрый вход:', reply_markup: { inline_keyboard: [
    [
      { text: '🛍 Открыть магазин', web_app: { url: shopUrl } },
      { text: '🛠 Админка', web_app: { url: adminUrl } },
    ],
    [{ text: 'ПРАЙС', callback_data: 'price:quick:root' }],
    [{ text: '✏️ Управление прайсом', callback_data: 'pm:view:root' }],
  ] } }
}

let store: PriceMenuStore | undefined
export function getPriceMenuStore(): PriceMenuStore {
  if (!store) {
    const file = process.env.PRICE_MENU_FILE || (process.env.PHOTOS_DIR
      ? path.join(process.env.PHOTOS_DIR, '.bender-price-menu', 'menu.json') : undefined)
    store = new PriceMenuStore(file, PRICE_MENU_NODES)
  }
  return store
}

const MANAGER_URL = 'https://t.me/BenderManager'
const ORDER_LABEL = 'Оформить заказ у менеджера'

export function buildPriceMenuPage(nodeId: string, home: PriceHomeVariant): PriceMenuPage | undefined {
  const nodes = getPriceMenuStore().snapshot().nodes
  if (!Object.prototype.hasOwnProperty.call(nodes, nodeId)) return undefined
  const node = nodes[nodeId]!
  const rows: InlineKeyboardButton[][] = (node.children ?? []).map((childId) => [
    childId === 'order'
      ? { text: nodes[childId]!.title === 'Оформить заказ' ? ORDER_LABEL : nodes[childId]!.title, url: MANAGER_URL }
      : { text: nodes[childId]!.title, callback_data: `price:${home}:${childId}` },
  ])
  // Keep earlier order callbacks usable, including menus saved before the manager link.
  if (nodeId === 'order') rows.push([{ text: ORDER_LABEL, url: MANAGER_URL }])
  rows.push([{ text: 'Назад', callback_data: `price:${home}:${node.parent}` }])
  const text = nodeId === 'order' && node.text === 'Для заказа откройте магазин в главном меню или напишите менеджеру.'
    ? 'Для оформления заказа напишите @BenderManager.' : node.text
  const body = text ?? (node.children?.length ? 'Выберите раздел:' : 'Прайс скоро появится.')
  return { text: `${node.title}\n\n${body}`, reply_markup: { inline_keyboard: rows } }
}

export function registerPriceMenuHandlers(bot: Telegraf, getQuickHome?: () => PriceMenuPage): void {
  bot.on('callback_query', async (ctx, next) => {
    const query = ctx.callbackQuery
    if (!('data' in query) || !query.data.startsWith('price:')) return next()
    const match = /^price:(client|quick):([a-z0-9_]+)$/.exec(query.data)
    const msg = query.message
    // Never edit channel posts, forwarded messages, or inaccessible messages.
    if (!match || !msg || msg.date === 0 || !('text' in msg) || typeof msg.text !== 'string'
      || 'forward_origin' in msg || msg.chat.type !== 'private'
      || msg.from?.id !== ctx.botInfo.id || !msg.from.is_bot) {
      await ctx.answerCbQuery()
      return
    }
    const home = match[1] as PriceHomeVariant
    const nodeId = match[2]!
    const page = nodeId === 'home'
      ? home === 'client' ? buildClientWelcome(process.env.WEBAPP_URL) : getQuickHome?.()
      : buildPriceMenuPage(nodeId, home) ?? buildPriceMenuPage('root', home)
    await ctx.answerCbQuery()
    if (!page) return
    try {
      await ctx.telegram.editMessageText(msg.chat.id, msg.message_id, undefined, page.text, {
        reply_markup: page.reply_markup,
      })
    } catch (error) {
      const response = (error as { response?: { error_code?: number; description?: string } })?.response
      if (response?.error_code === 400 && response.description?.startsWith('Bad Request: message is not modified')) return
      throw error
    }
  })
}
