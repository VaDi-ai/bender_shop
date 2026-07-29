/**
 * Рассылка уходит живым людям и не отзывается. Тесты держат защиты:
 * предпросмотр, репетиция себе, dry-run, лимиты, журнал.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    client: { findMany: vi.fn(), count: vi.fn() },
    broadcastLog: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/security-log', () => ({ logSecurityEvent: vi.fn() }))

import { prisma } from '../lib/prisma'
import { previewBroadcast, sendBroadcast, BROADCAST_MAX } from '../lib/broadcast-admin'

/* eslint-disable @typescript-eslint/no-explicit-any */
const client = prisma.client as any
const blog = prisma.broadcastLog as any
const ACTOR = '900'

beforeEach(() => {
  ;[client.findMany, client.count, blog.findFirst, blog.create, blog.findMany].forEach(f => f.mockReset())
  client.findMany.mockResolvedValue([{ externalId: '111', name: 'Иван', telegramUsername: 'ivan' }, { externalId: '222', name: 'Пётр', telegramUsername: null }])
  client.count.mockResolvedValue(2943)
  blog.findFirst.mockResolvedValue(null)
  blog.create.mockResolvedValue({})
})

describe('предпросмотр', () => {
  it('показывает охват и примеры', async () => {
    const r = await previewBroadcast('Привет!')
    expect(r.ok).toBe(true)
    expect(r.data).toMatchObject({ recipients: 2, totalClients: 2943 })
    expect(r.data!.sample).toEqual(['@ivan', 'Пётр'])
  })

  it('считает охват БЕЗ текста — «кому уйдёт» нажимают до того, как напишут', async () => {
    for (const raw of [undefined, '', '   ']) {
      const r = await previewBroadcast(raw)
      expect(r.ok, String(raw)).toBe(true)
      expect(r.data).toMatchObject({ recipients: 2, totalClients: 2943 })
    }
  })

  it('длинный текст предпросмотру не мешает — его проверяет отправка', async () => {
    const r = await previewBroadcast('а'.repeat(BROADCAST_MAX + 1))
    expect(r.ok).toBe(true)
    expect(r.data!.recipients).toBe(2)
  })

  it('получатели — только клиенты из Telegram', async () => {
    await previewBroadcast('текст')
    expect(client.findMany.mock.calls[0][0].where).toEqual({ source: 'telegram', externalId: { not: null } })
  })
})

describe('отправка', () => {
  it('dry-run считает получателей и не шлёт ничего', async () => {
    const sender = vi.fn()
    const r = await sendBroadcast(ACTOR, 'Привет', { dryRun: true, sender })
    expect(r.data).toMatchObject({ recipients: 2, sent: 0, dryRun: true })
    expect(sender).not.toHaveBeenCalled()
    expect(blog.create).not.toHaveBeenCalled()          // журнал не мусорим репетициями
  })

  it('репетиция «себе» уходит одному адресату и помечается в журнале', async () => {
    const sender = vi.fn(async () => {})
    const r = await sendBroadcast(ACTOR, 'Привет', { onlyTo: ACTOR, sender })
    expect(r.data).toMatchObject({ sent: 1, failed: 0, recipients: 1 })
    expect(sender).toHaveBeenCalledTimes(1)
    expect(sender.mock.calls[0][0]).toBe(ACTOR)
    expect(blog.create.mock.calls[0][0].data.target).toBe('self-test')
  })

  it('массовая отправка считает недоставленные и не падает на них', async () => {
    const sender = vi.fn(async (chatId: string) => { if (chatId === '222') throw new Error('bot blocked') })
    const r = await sendBroadcast(ACTOR, 'Привет', { sender })
    expect(r.data).toMatchObject({ sent: 1, failed: 1, recipients: 2 })
    expect(blog.create.mock.calls[0][0].data).toMatchObject({ target: 'all', totalSent: 1, totalFailed: 1 })
  })

  it('некому слать — честный отказ, а не «успешно отправлено 0»', async () => {
    client.findMany.mockResolvedValue([])
    const r = await sendBroadcast(ACTOR, 'Привет', { sender: vi.fn() })
    expect(r).toMatchObject({ ok: false, status: 422 })
    expect(r.error).toContain('Некому')
  })

  it('пустой текст не уходит', async () => {
    const sender = vi.fn()
    expect((await sendBroadcast(ACTOR, '  ', { sender })).status).toBe(422)
    expect(sender).not.toHaveBeenCalled()
  })

  it('падение журнала не отменяет уже отправленное', async () => {
    blog.create.mockRejectedValue(new Error('db down'))
    const r = await sendBroadcast(ACTOR, 'Привет', { onlyTo: ACTOR, sender: vi.fn(async () => {}) })
    expect(r.ok).toBe(true)
  })
})
