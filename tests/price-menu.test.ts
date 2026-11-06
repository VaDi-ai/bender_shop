import { describe, expect, it, vi, afterEach } from 'vitest'
import { Telegraf } from 'telegraf'
import type { Update } from 'telegraf/types'
import {
  buildClientWelcome, buildPriceMenuPage, buildQuickEntry,
  PRICE_MENU_NODES, registerPriceMenuHandlers,
  type PriceHomeVariant,
} from '../bot/price-menu'

const BOT = { id: 100, is_bot: true as const, first_name: 'Test', username: 'test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false }
const USER = { id: 200, is_bot: false, first_name: 'Buyer' }
const SHOP = 'https://example.test/shop'
const ADMIN = 'https://example.test/admin'

function callback(data: string, overrides: Record<string, unknown> = {}): Update {
  return {
    update_id: 1,
    callback_query: {
      id: 'click-1', from: USER, chat_instance: 'private-chat', data,
      message: { message_id: 42, date: 1, from: BOT, chat: { id: USER.id, type: 'private' }, text: 'Menu', ...overrides },
    },
  } as Update
}

function makeBot() {
  const bot = new Telegraf('100:LOCAL_TEST_ONLY')
  bot.botInfo = BOT
  const api = vi.fn().mockResolvedValue(true)
  bot.use(async (ctx, next) => { ctx.telegram.callApi = api; return next() })
  registerPriceMenuHandlers(bot, () => buildQuickEntry(SHOP, ADMIN))
  const downstream = vi.fn()
  bot.on('callback_query', async () => { downstream() })
  return { bot, api, downstream }
}

afterEach(() => vi.unstubAllEnvs())

describe('static price navigation', () => {
  it('keeps Mini App buttons and adds a separate ПРАЙС row in both entry points', () => {
    expect(buildClientWelcome(SHOP).reply_markup.inline_keyboard).toEqual([
      [{ text: '🛍 Открыть каталог', web_app: { url: SHOP } }],
      [{ text: 'ПРАЙС', callback_data: 'price:client:root' }],
    ])
    expect(buildQuickEntry(SHOP, ADMIN)).toEqual({ text: 'Быстрый вход:', reply_markup: { inline_keyboard: [
      [{ text: '🛍 Открыть магазин', web_app: { url: SHOP } }, { text: '🛠 Админка', web_app: { url: ADMIN } }],
      [{ text: 'ПРАЙС', callback_data: 'price:quick:root' }],
      [{ text: '✏️ Управление прайсом', callback_data: 'pm:view:root' }],
    ] } })
    expect(buildClientWelcome().reply_markup.inline_keyboard).toEqual([[{ text: 'ПРАЙС', callback_data: 'price:client:root' }]])
  })

  it('retains the approved root and Apple/Samsung taxonomy', () => {
    expect(PRICE_MENU_NODES.root!.children).toEqual([
      'info', 'order', 'apple', 'samsung', 'dyson', 'cameras', 'headphones',
      'xiaomi', 'one_plus', 'google_pixel', 'honor_huawei', 'gaming_vr', 'vacuum_cleaners', 'tv', 'accessories',
    ])
    expect(PRICE_MENU_NODES.apple!.children).toEqual([
      'iphone_18_pro', 'iphone_17_pro', 'iphone_17_air', 'iphone_13_16', 'airpods', 'apple_watch', 'ipad', 'macbook_air', 'macbook_pro', 'mac_studio_mini',
    ])
    expect(PRICE_MENU_NODES.samsung!.children).toEqual(['galaxy_a', 'galaxy_s', 'galaxy_z', 'samsung_tablets'])
  })

  it.each(['client', 'quick'] as const)('every node is reachable and returns to its actual parent (%s)', home => {
    const seen = new Set<string>()
    function visit(id: string) {
      expect(seen.has(id), `cycle or duplicate parent: ${id}`).toBe(false)
      seen.add(id)
      const node = PRICE_MENU_NODES[id]!
      const page = buildPriceMenuPage(id, home)!
      expect(page.text.length).toBeLessThanOrEqual(4096)
      const buttons = page.reply_markup.inline_keyboard.flat()
      expect(buttons.at(-1)).toEqual({ text: 'Назад', callback_data: `price:${home}:${node.parent}` })
      for (const button of buttons) {
        if ('callback_data' in button) expect(Buffer.byteLength(button.callback_data)).toBeLessThanOrEqual(64)
      }
      for (const childId of node.children ?? []) {
        expect(PRICE_MENU_NODES[childId]!.parent).toBe(id)
        expect(buttons).toContainEqual(childId === 'order'
          ? { text: 'Оформить заказ у менеджера', url: 'https://t.me/BenderManager' }
          : { text: PRICE_MENU_NODES[childId]!.title, callback_data: `price:${home}:${childId}` })
        visit(childId)
      }
      const urls = buttons.filter(b => 'url' in b).map(b => ('url' in b ? b.url : ''))
      expect(urls).toEqual(id === 'root' || id === 'order' ? ['https://t.me/BenderManager'] : [])
      if (!node.children && !node.text) expect(page.text).toContain('Прайс скоро появится.')
    }
    visit('root')
    expect([...seen].sort()).toEqual(Object.keys(PRICE_MENU_NODES).sort())
    expect(buildPriceMenuPage('missing', home)).toBeUndefined()
    expect(buildPriceMenuPage('__proto__', home)).toBeUndefined()
  })
})

describe('Telegram callback transport (fully mocked)', () => {
  it.each(['client', 'quick'] as const)('edits the same message through every node and back (%s)', async (home: PriceHomeVariant) => {
    const { bot, api, downstream } = makeBot()
    vi.stubEnv('WEBAPP_URL', SHOP)
    for (const [id, node] of Object.entries(PRICE_MENU_NODES)) {
      for (const target of [id, node.parent]) {
        api.mockClear()
        await bot.handleUpdate(callback(`price:${home}:${target}`))
        const expected = target === 'home'
          ? home === 'client' ? buildClientWelcome(SHOP) : buildQuickEntry(SHOP, ADMIN)
          : buildPriceMenuPage(target, home)!
        expect(api.mock.calls.map(c => c[0])).toEqual(['answerCallbackQuery', 'editMessageText'])
        expect(api.mock.calls[1]![1]).toMatchObject({ chat_id: USER.id, message_id: 42, text: expected.text, reply_markup: expected.reply_markup })
        expect(api.mock.calls[1]![1].inline_message_id).toBeUndefined()
      }
    }
    expect(downstream).not.toHaveBeenCalled()
  })

  it('tolerates repeated clicks only for Telegram message-is-not-modified errors', async () => {
    const { bot, api } = makeBot()
    api.mockImplementation(async method => {
      if (method === 'editMessageText') throw { response: { error_code: 400, description: 'Bad Request: message is not modified' } }
      return true
    })
    await expect(bot.handleUpdate(callback('price:client:apple'))).resolves.toBeUndefined()
    await expect(bot.handleUpdate(callback('price:client:apple'))).resolves.toBeUndefined()
    expect(api.mock.calls.map(c => c[0])).toEqual(['answerCallbackQuery', 'editMessageText', 'answerCallbackQuery', 'editMessageText'])
  })

  it.each(['price:bad:root', 'price:client:root:extra', 'price:'])('acknowledges unknown own callback without edit/send: %s', async data => {
    const { bot, api, downstream } = makeBot()
    await bot.handleUpdate(callback(data))
    expect(api.mock.calls.map(c => c[0])).toEqual(['answerCallbackQuery'])
    expect(downstream).not.toHaveBeenCalled()
  })

  it.each(['price:client:unknown', 'price:client:__proto__'])('returns stale deleted buttons to the root: %s', async data => {
    const { bot, api } = makeBot()
    await bot.handleUpdate(callback(data))
    expect(api.mock.calls.map(c => c[0])).toEqual(['answerCallbackQuery', 'editMessageText'])
    expect(api.mock.calls[1]![1].text).toBe(buildPriceMenuPage('root', 'client')!.text)
  })

  it.each([
    { date: 0 },
    { text: undefined },
    { from: { ...BOT, id: 999 } },
    { from: USER },
    { forward_origin: { type: 'channel', chat: { id: -100123, type: 'channel', title: 'Prices' }, message_id: 1757, date: 1 } },
    { chat: { id: -100123, type: 'channel' } },
    { chat: { id: -456, type: 'group' } },
  ])('does not edit inaccessible, foreign or non-private messages: %j', async overrides => {
    const { bot, api } = makeBot()
    await bot.handleUpdate(callback('price:client:root', overrides))
    expect(api.mock.calls.map(c => c[0])).toEqual(['answerCallbackQuery'])
  })

  it('passes unrelated callbacks to existing handlers', async () => {
    const { bot, api, downstream } = makeBot()
    await bot.handleUpdate(callback('crm:card:1'))
    expect(downstream).toHaveBeenCalledOnce()
    expect(api).not.toHaveBeenCalled()
  })

  it('does not replace a missing quick-home resolver with a new message', async () => {
    const bot = new Telegraf('100:LOCAL_TEST_ONLY')
    bot.botInfo = BOT
    const api = vi.fn().mockResolvedValue(true)
    bot.use(async (ctx, next) => { ctx.telegram.callApi = api; return next() })
    registerPriceMenuHandlers(bot)
    await bot.handleUpdate(callback('price:quick:home'))
    expect(api.mock.calls.map(c => c[0])).toEqual(['answerCallbackQuery'])
  })

  it('does not hide unrelated Telegram edit errors or send replacement messages', async () => {
    const { bot, api } = makeBot()
    const error = { response: { error_code: 403, description: 'Forbidden' } }
    api.mockImplementation(async method => { if (method === 'editMessageText') throw error; return true })
    bot.catch(err => { throw err })
    await expect(bot.handleUpdate(callback('price:client:root'))).rejects.toBe(error)
    expect(api.mock.calls.map(c => c[0])).toEqual(['answerCallbackQuery', 'editMessageText'])
  })
})
