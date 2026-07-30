/**
 * Рассылка уходит живым людям и не отзывается. Тесты держат защиты:
 * предпросмотр, репетиция себе, dry-run, лимиты, журнал.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    client: { findMany: vi.fn(), count: vi.fn() },
    broadcastLog: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    segment: { findUnique: vi.fn() },
    tag: { groupBy: vi.fn() },
  },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/security-log', () => ({ logSecurityEvent: vi.fn() }))

import { prisma } from '../lib/prisma'
import { previewBroadcast, sendBroadcast, parseTarget, targetWhere, parseMedia, BROADCAST_MAX, CAPTION_MAX } from '../lib/broadcast-admin'

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
  ;(prisma as any).segment.findUnique.mockReset().mockResolvedValue({ name: 'VIP', color: '🟡' })
  ;(prisma as any).tag.groupBy.mockReset().mockResolvedValue([])
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

// ─── Таргетинг и медиа (перенос из бота) ─────────────────────────────────────

describe('parseTarget / targetWhere — как в боте', () => {
  it('пусто → всем; неизвестный тип → 422', () => {
    expect(parseTarget(undefined).data).toEqual({ type: 'all' })
    expect(parseTarget({}).data).toEqual({ type: 'all' })
    expect(parseTarget({ type: 'x' }).ok).toBe(false)
  })

  it('тег обязателен; сегмент — целый id', () => {
    expect(parseTarget({ type: 'tag' }).ok).toBe(false)
    expect(parseTarget({ type: 'tag', tag: ' vip ' }).data).toEqual({ type: 'tag', tag: 'vip' })
    expect(parseTarget({ type: 'segment', segmentId: 'abc' }).ok).toBe(false)
    expect(parseTarget({ type: 'segment', segmentId: 3, tagFilter: 'top' }).data)
      .toEqual({ type: 'segment', segmentId: 3, tagFilter: 'top' })
  })

  it('where — те же условия, что countRecipients в боте', () => {
    const base = { source: 'telegram', externalId: { not: null } }
    expect(targetWhere({ type: 'all' })).toEqual(base)
    expect(targetWhere({ type: 'tag', tag: 'vip' })).toEqual({ ...base, tags: { some: { name: 'vip' } } })
    expect(targetWhere({ type: 'segment', segmentId: 3 })).toEqual({ ...base, segmentId: 3 })
    expect(targetWhere({ type: 'segment', segmentId: 3, tagFilter: 'top' }))
      .toEqual({ ...base, segmentId: 3, tags: { some: { name: 'top' } } })
  })
})

describe('отправка с таргетом и медиа', () => {
  it('лог хранит тип и человеческий target (сегмент+тег — как в боте)', async () => {
    const sender = vi.fn().mockResolvedValue(undefined)
    const r = await sendBroadcast(ACTOR, 'Привет', { sender, target: { type: 'segment', segmentId: 3, tagFilter: 'top' } })
    expect(r.ok).toBe(true)
    expect(blog.create.mock.calls[0][0].data).toMatchObject({ type: 'segment', target: 'VIP+top' })
  })

  it('медиа: текст становится подписью, url и тип уходят в лог', async () => {
    const sender = vi.fn().mockResolvedValue(undefined)
    const media = { url: 'https://bendershop.store/photos/x.webp', type: 'photo' as const }
    const r = await sendBroadcast(ACTOR, 'Подпись', { sender, media })
    expect(r.ok).toBe(true)
    expect(sender).toHaveBeenCalledWith('111', 'Подпись', media)
    expect(blog.create.mock.calls[0][0].data).toMatchObject({ mediaFileId: media.url, mediaType: 'photo' })
  })

  it('медиа без текста — можно; текст без медиа — обязателен', async () => {
    const sender = vi.fn().mockResolvedValue(undefined)
    const ok = await sendBroadcast(ACTOR, '', { sender, media: { url: 'https://x/y.webp', type: 'photo' } })
    expect(ok.ok).toBe(true)
    const bad = await sendBroadcast(ACTOR, '', { sender })
    expect(bad).toMatchObject({ ok: false, status: 422 })
  })

  it('подпись к медиа режется по CAPTION_MAX', async () => {
    const r = await sendBroadcast(ACTOR, 'x'.repeat(CAPTION_MAX + 1), { media: { url: 'https://x/y.webp', type: 'photo' } })
    expect(r).toMatchObject({ ok: false, status: 422 })
  })

  it('parseMedia: только https; пусто = без медиа', () => {
    expect(parseMedia(undefined).data).toBeNull()
    expect(parseMedia({ url: '' }).data).toBeNull()
    expect(parseMedia({ url: 'http://x' }).ok).toBe(false)
    expect(parseMedia({ url: 'https://x/v.mp4', type: 'video' }).data).toEqual({ url: 'https://x/v.mp4', type: 'video' })
  })
})
