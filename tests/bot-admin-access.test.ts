/**
 * Бот-вход в админку для менеджера из AdminUser (без правки env ADMIN_IDS).
 *   • isBotAdmin: env ИЛИ активная запись AdminUser; ошибка БД → false, не исключение.
 *   • Маршрутизация личных сообщений в webhooks/telegram.ts: env-админ и активный
 *     менеджер проходят дальше (к /start «Быстрый вход» и /admin в bot/index.ts),
 *     деактивированный менеджер и посторонний уходят в клиентский CRM-флоу.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    adminUser: { findUnique: vi.fn() },
    client: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    segment: { findFirst: vi.fn() },
    message: { create: vi.fn() },
    event: { create: vi.fn() },
  },
}))
vi.mock('../lib/security-log', () => ({ logSecurityEvent: vi.fn() }))
vi.mock('../lib/api-key-store', () => ({ getApiKeyValue: vi.fn().mockResolvedValue(null) }))

import { Telegraf } from 'telegraf'
import { prisma } from '../lib/prisma'
import { isBotAdmin } from '../lib/bot-admin-access'
import { setupClientHandlers } from '../webhooks/telegram'

/* eslint-disable @typescript-eslint/no-explicit-any */
const adminDb = prisma.adminUser as any
const clientDb = prisma.client as any

const ENV_OWNER = 924498094
const MANAGER = 555000111
const INACTIVE = 555000222
const STRANGER = 777000333

beforeEach(() => {
  process.env.ADMIN_IDS = String(ENV_OWNER)
  adminDb.findUnique.mockReset()
  adminDb.findUnique.mockImplementation(async ({ where }: { where: { telegramId: string } }) => {
    if (where.telegramId === String(MANAGER)) return { isActive: true }
    if (where.telegramId === String(INACTIVE)) return { isActive: false }
    return null
  })
  Object.values(clientDb).forEach((fn: any) => fn.mockReset?.())
  clientDb.findUnique.mockResolvedValue(null)
  clientDb.create.mockResolvedValue({ id: 1, telegramTopicId: 1, segment: null })
  ;(prisma.segment.findFirst as any).mockResolvedValue(null)
})

describe('isBotAdmin', () => {
  it('env ADMIN_IDS → true без похода в БД', async () => {
    expect(await isBotAdmin(ENV_OWNER)).toBe(true)
    expect(adminDb.findUnique).not.toHaveBeenCalled()
  })

  it('активный AdminUser (не в env) → true; деактивированный → false; нет записи → false', async () => {
    expect(await isBotAdmin(MANAGER)).toBe(true)
    expect(await isBotAdmin(INACTIVE)).toBe(false)
    expect(await isBotAdmin(STRANGER)).toBe(false)
    expect(adminDb.findUnique).toHaveBeenCalledWith({ where: { telegramId: String(MANAGER) }, select: { isActive: true } })
  })

  it('принимает id строкой; мусор/пусто → false без БД', async () => {
    expect(await isBotAdmin(String(MANAGER))).toBe(true)
    expect(await isBotAdmin(undefined)).toBe(false)
    expect(await isBotAdmin(null)).toBe(false)
    expect(await isBotAdmin('abc')).toBe(false)
    expect(adminDb.findUnique).toHaveBeenCalledTimes(1)
  })

  it('ошибка БД → false, не исключение (бот-поллинг не падает)', async () => {
    adminDb.findUnique.mockRejectedValue(new Error('db down'))
    await expect(isBotAdmin(MANAGER)).resolves.toBe(false)
  })
})

describe('маршрутизация личных сообщений (webhooks/telegram.ts)', () => {
  const privateText = (fromId: number, text: string) => ({
    update_id: fromId,
    message: {
      message_id: 1,
      date: 1,
      chat: { id: fromId, type: 'private' as const, first_name: 'T' },
      from: { id: fromId, is_bot: false, first_name: 'T' },
      text,
      entities: text.startsWith('/') ? [{ type: 'bot_command' as const, offset: 0, length: text.split(' ')[0]!.length }] : [],
    },
  })

  function makeBot() {
    const bot = new Telegraf('123456:TEST')
    ;(bot.telegram as any).callApi = vi.fn().mockResolvedValue({ message_id: 2 })
    setupClientHandlers(bot)
    const downstream = vi.fn()
    bot.on('message', async (ctx) => { downstream(ctx.from?.id) })
    return { bot, downstream }
  }

  it('env-админ: /start доходит до бот-входа (как раньше)', async () => {
    const { bot, downstream } = makeBot()
    await bot.handleUpdate(privateText(ENV_OWNER, '/start') as any)
    expect(downstream).toHaveBeenCalledWith(ENV_OWNER)
    expect(clientDb.findUnique).not.toHaveBeenCalled()
  })

  it('активный менеджер из AdminUser: /start и /admin доходят до бот-входа, клиент в CRM не заводится', async () => {
    const { bot, downstream } = makeBot()
    await bot.handleUpdate(privateText(MANAGER, '/start') as any)
    await bot.handleUpdate(privateText(MANAGER, '/admin') as any)
    expect(downstream).toHaveBeenCalledTimes(2)
    expect(clientDb.findUnique).not.toHaveBeenCalled()
    expect(clientDb.create).not.toHaveBeenCalled()
  })

  it('деактивированный менеджер и посторонний: бот-вход не достигается, сообщение идёт в клиентский флоу', async () => {
    for (const id of [INACTIVE, STRANGER]) {
      const { bot, downstream } = makeBot()
      clientDb.findUnique.mockClear()
      await bot.handleUpdate(privateText(id, '/start') as any)
      expect(downstream, String(id)).not.toHaveBeenCalled()
      expect(clientDb.findUnique, String(id)).toHaveBeenCalled()
    }
  })
})
