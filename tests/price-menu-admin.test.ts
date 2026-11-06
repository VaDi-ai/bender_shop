import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Telegraf } from 'telegraf'
import type { Update } from 'telegraf/types'
import { PriceMenuStore } from '../bot/price-menu-store'
import { registerPriceMenuAdmin } from '../bot/price-menu-admin'

const BOT = { id: 100, is_bot: true as const, first_name: 'Test', username: 'test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false }
const ADMIN = { id: 200, is_bot: false, first_name: 'Owner' }
let dir: string, store: PriceMenuStore
beforeEach(() => {
  vi.stubEnv('ADMIN_IDS', '200')
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'price-admin-test-'))
  store = new PriceMenuStore(path.join(dir, 'menu.json'), { root: { title: 'Прайс', parent: 'home', children: ['apple'] }, apple: { title: 'Apple', parent: 'root' } })
})
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(dir, { recursive: true, force: true }) })
function makeBot() {
  const bot = new Telegraf('100:TEST'); bot.botInfo = BOT
  const api = vi.fn().mockResolvedValue({ message_id: 88 })
  bot.use(async (ctx, next) => { ctx.telegram.callApi = api; return next() })
  registerPriceMenuAdmin(bot, () => store)
  const downstream = vi.fn()
  bot.use(async () => { downstream() })
  return { bot, api, downstream }
}
function click(data: string, userId = 200, chatType = 'private'): Update {
  return { update_id: 1, callback_query: { id: 'click', from: { ...ADMIN, id: userId }, chat_instance: 'chat', data,
    message: { message_id: 42, date: 1, from: BOT, chat: { id: userId, type: chatType }, text: 'Menu' },
  } } as Update
}
function text(text: string, reply?: number, userId = 200): Update {
  return { update_id: 2, message: { message_id: 3, date: 1, from: { ...ADMIN, id: userId },
    chat: { id: userId, type: 'private' }, text,
    entities: text.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: text.length }] : [],
    ...(reply ? { reply_to_message: { message_id: reply, date: 1, from: BOT, chat: { id: userId, type: 'private' }, text: 'Prompt' } } : {}),
  } } as Update
}
describe('manual price editing access and workflow', () => {
  it('opens the editor by command', async () => {
    const { bot, api } = makeBot()
    await bot.handleUpdate(text('/price_menu'))
    expect(api.mock.calls[0]![1].text).toContain('Управление прайсом')
  })
  it.each(['pm:view:root', 'pm:add:root', 'pm:text:apple', 'pm:delete:apple:0'])('denies non-admins: %s', async data => {
    const { bot, api } = makeBot()
    await bot.handleUpdate(click(data, 300))
    expect(api.mock.calls.map(c => c[0])).toEqual(['answerCallbackQuery'])
    expect(store.snapshot().revision).toBe(0)
  })
  it('denies editing in group chats', async () => {
    const { bot, api } = makeBot()
    await bot.handleUpdate(click('pm:text:apple', 200, 'group'))
    expect(api.mock.calls.map(c => c[0])).toEqual(['answerCallbackQuery'])
  })
  it('saves plain text only after an explicit reply to the edit prompt', async () => {
    const { bot, api, downstream } = makeBot()
    await bot.handleUpdate(click('pm:text:apple'))
    await bot.handleUpdate(text('Обычное сообщение'))
    expect(downstream).toHaveBeenCalledOnce()
    expect(store.snapshot().revision).toBe(0)
    await bot.handleUpdate(text('iPhone\n128 GB — 80 000 ₽\n<текст>', 88))
    expect(store.snapshot().nodes.apple!.text).toBe('iPhone\n128 GB — 80 000 ₽\n<текст>')
    expect(api.mock.calls.at(-1)![1].text).toContain('Сохранено.')
  })
  it('adds and renames buttons', async () => {
    const { bot } = makeBot()
    await bot.handleUpdate(click('pm:add:apple'))
    await bot.handleUpdate(text('iPhone', 88))
    const id = store.snapshot().nodes.apple!.children![0]!
    await bot.handleUpdate(click(`pm:title:${id}`))
    await bot.handleUpdate(text('Телефоны', 88))
    expect(store.snapshot().nodes[id]!.title).toBe('Телефоны')
  })
  it('does not delete until confirmation and rejects stale confirmation', async () => {
    const { bot, api } = makeBot()
    await bot.handleUpdate(click('pm:confirm:apple'))
    expect(store.snapshot().nodes.apple).toBeDefined()
    expect(api.mock.calls.at(-1)![1].reply_markup.inline_keyboard[0][0].callback_data).toBe('pm:delete:apple:0')
    store.change({ action: 'text', id: 'apple', value: 'Changed elsewhere' }, 0)
    await bot.handleUpdate(click('pm:delete:apple:0'))
    expect(store.snapshot().nodes.apple).toBeDefined()
    await bot.handleUpdate(click('pm:delete:apple:1'))
    expect(store.snapshot().nodes.apple).toBeUndefined()
  })
  it('cancels input and leaves prices unchanged', async () => {
    const { bot } = makeBot()
    await bot.handleUpdate(click('pm:text:apple'))
    await bot.handleUpdate(text('/cancel'))
    await bot.handleUpdate(text('not saved', 88))
    expect(store.snapshot().revision).toBe(0)
  })
  it('rechecks admin rights on each reply', async () => {
    const { bot } = makeBot()
    await bot.handleUpdate(click('pm:text:apple'))
    vi.stubEnv('ADMIN_IDS', '')
    await bot.handleUpdate(text('not saved', 88))
    expect(store.snapshot().revision).toBe(0)
  })
  it('keeps unrelated callbacks and messages in their original routing', async () => {
    const { bot, downstream, api } = makeBot()
    await bot.handleUpdate(click('crm:card:1'))
    await bot.handleUpdate(text('Здравствуйте', undefined, 300))
    expect(downstream).toHaveBeenCalledTimes(2)
    expect(api).not.toHaveBeenCalled()
  })
})
