import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Telegraf } from 'telegraf'
import type { Update } from 'telegraf/types'

vi.mock('../lib/prisma', () => ({ prisma: {
  adminUser: { findUnique: vi.fn() },
  client: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  segment: { findFirst: vi.fn() },
  message: { create: vi.fn() },
} }))
vi.mock('../lib/security-log', () => ({ logSecurityEvent: vi.fn() }))
vi.mock('../lib/api-key-store', () => ({ getApiKeyValue: vi.fn().mockResolvedValue(null) }))

import { prisma } from '../lib/prisma'
import { setupClientHandlers } from '../webhooks/telegram'
import { buildClientWelcome, buildQuickEntry } from '../bot/price-menu'

const BOT = { id: 100, is_bot: true as const, first_name: 'Test', username: 'test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false }
const USER = { id: 777000333, is_bot: false, first_name: 'Buyer' }
const SHOP = 'https://example.test/shop'
const ADMIN = 'https://example.test/admin'
const client = { id: 8, telegramTopicId: 42, segment: null }

function makeBot() {
  const bot = new Telegraf('100:LOCAL_TEST_ONLY')
  bot.botInfo = BOT
  const api = vi.fn().mockResolvedValue({ message_id: 77 })
  bot.use(async (ctx, next) => { ctx.telegram.callApi = api; return next() })
  setupClientHandlers(bot, () => buildQuickEntry(SHOP, ADMIN))
  const downstream = vi.fn()
  bot.on('message', async () => { downstream() })
  return { bot, api, downstream }
}

function textUpdate(text: string): Update {
  return { update_id: 1, message: {
    message_id: 1, date: 1, from: USER,
    chat: { id: USER.id, type: 'private', first_name: USER.first_name }, text,
    entities: text.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0]!.length }] : [],
  } } as Update
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('WEBAPP_URL', SHOP)
  vi.stubEnv('ADMIN_IDS', '924498094')
  vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(null)
  // Second client lookup is the existing AI handoff; return null so no async AI work runs.
  vi.mocked(prisma.client.findUnique).mockImplementation(async args => (
    'source_externalId' in args.where ? client : null
  ) as never)
  vi.mocked(prisma.segment.findFirst).mockResolvedValue(null)
  vi.mocked(prisma.client.create).mockResolvedValue(client as never)
  vi.mocked(prisma.message.create).mockResolvedValue({ id: 1 } as never)
})
afterEach(() => vi.unstubAllEnvs())

describe('price menu integrated before CRM handlers (all services mocked)', () => {
  it.each(['/start', '/start@test_bot', '/start shop'])('existing buyer receives the unchanged greeting + Mini App + ПРАЙС on %s', async text => {
    const { bot, api, downstream } = makeBot()
    await bot.handleUpdate(textUpdate(text))
    const greeting = api.mock.calls.find(c => c[0] === 'sendMessage' && c[1].chat_id === USER.id)
    const expected = buildClientWelcome(SHOP)
    expect(greeting?.[1]).toMatchObject({ text: expected.text, reply_markup: expected.reply_markup })
    expect(prisma.client.create).not.toHaveBeenCalled()
    expect(prisma.message.create).toHaveBeenCalledWith({ data: { clientId: 8, direction: 'in', text, source: 'telegram' } })
    expect(downstream).not.toHaveBeenCalled()
  })

  it('keeps the first-contact CRM creation and adds only the menu to the original greeting', async () => {
    vi.mocked(prisma.client.findUnique).mockResolvedValue(null)
    const { bot, api } = makeBot()
    await bot.handleUpdate(textUpdate('Здравствуйте'))
    expect(prisma.client.create).toHaveBeenCalledOnce()
    expect(prisma.message.create).toHaveBeenCalledOnce()
    expect(api.mock.calls.filter(c => c[0] === 'sendMessage' && c[1].chat_id === USER.id)).toHaveLength(1)
    expect(api.mock.calls.find(c => c[0] === 'sendMessage' && c[1].chat_id === USER.id)?.[1].reply_markup).toEqual(buildClientWelcome(SHOP).reply_markup)
  })

  it('does not repeat the welcome for ordinary messages from existing buyers', async () => {
    const { bot, api } = makeBot()
    await bot.handleUpdate(textUpdate('Есть в наличии?'))
    expect(api.mock.calls.filter(c => c[0] === 'sendMessage' && c[1].chat_id === USER.id)).toHaveLength(0)
    expect(prisma.message.create).toHaveBeenCalledOnce()
  })

  it.each(['price:client:root', 'price:client:apple', 'price:client:iphone_13_16', 'price:client:home', 'price:quick:root', 'price:quick:home', 'price:client:unknown'])('navigation bypasses every existing database handler: %s', async data => {
    const { bot, api } = makeBot()
    await bot.handleUpdate({ update_id: 2, callback_query: {
      id: 'click', from: USER, chat_instance: 'private-chat', data,
      message: { message_id: 77, date: 1, from: BOT, chat: { id: USER.id, type: 'private' }, text: 'Menu' },
    } } as Update)
    for (const model of Object.values(prisma)) {
      for (const method of Object.values(model)) expect(method).not.toHaveBeenCalled()
    }
    expect(api.mock.calls.every(c => ['answerCallbackQuery', 'editMessageText'].includes(c[0]))).toBe(true)
    if (data.endsWith(':unknown')) expect(api.mock.calls.map(c => c[0])).toEqual(['answerCallbackQuery'])
  })
})
