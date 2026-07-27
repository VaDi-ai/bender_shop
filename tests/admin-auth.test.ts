import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Response, NextFunction } from 'express'

vi.mock('../lib/prisma', () => ({
  prisma: { adminUser: { findUnique: vi.fn() } },
}))
vi.mock('../lib/security-log', () => ({ logSecurityEvent: vi.fn() }))

import { prisma } from '../lib/prisma'
import { validateTelegramWebApp } from '../lib/telegram-webapp-auth'
import { requireAdmin, mskDayStart, AdminRequest } from '../api/admin'
import { buildInitData } from './helpers/init-data'

const BOT_TOKEN = 'test-bot-token-123'
const findUnique = prisma.adminUser.findUnique as ReturnType<typeof vi.fn>

function mockRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {}
  res.status = vi.fn((code: number) => { res.statusCode = code; return res as Response })
  res.json = vi.fn((body: unknown) => { res.body = body; return res as Response })
  return res as Response & { statusCode?: number; body?: unknown }
}

function mockReq(initData?: string): AdminRequest {
  return { headers: initData ? { 'x-telegram-init-data': initData } : {}, ip: '127.0.0.1' } as unknown as AdminRequest
}

beforeEach(() => {
  process.env.BOT_TOKEN = BOT_TOKEN
  findUnique.mockReset()
})

describe('validateTelegramWebApp (вынесена из server.ts)', () => {
  it('принимает корректную подпись', () => {
    const r = validateTelegramWebApp(buildInitData(42, BOT_TOKEN))
    expect(r).toEqual({ valid: true, userId: 42 })
  })

  it('отклоняет initData с подменёнными данными', () => {
    const tampered = buildInitData(42, BOT_TOKEN).replace('Test', 'Fake')
    expect(validateTelegramWebApp(tampered).valid).toBe(false)
  })

  it('отклоняет initData старше 5 минут (anti-replay)', () => {
    const stale = buildInitData(42, BOT_TOKEN, Math.floor(Date.now() / 1000) - 600)
    expect(validateTelegramWebApp(stale).valid).toBe(false)
  })
})

describe('requireAdmin', () => {
  it('401 без заголовка', async () => {
    const res = mockRes(); const next = vi.fn() as NextFunction
    await requireAdmin()(mockReq(), res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('401 при невалидной подписи', async () => {
    const res = mockRes(); const next = vi.fn() as NextFunction
    await requireAdmin()(mockReq('user=%7B%22id%22%3A1%7D&hash=deadbeef'), res, next)
    expect(res.statusCode).toBe(401)
  })

  it('403 (deny, не краш), когда записи нет — окно незавершённого сида (§10.5)', async () => {
    findUnique.mockResolvedValue(null)
    const res = mockRes(); const next = vi.fn() as NextFunction
    await requireAdmin()(mockReq(buildInitData(42, BOT_TOKEN)), res, next)
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('403 для деактивированного админа', async () => {
    findUnique.mockResolvedValue({ telegramId: '42', name: null, role: 'owner', isActive: false })
    const res = mockRes(); const next = vi.fn() as NextFunction
    await requireAdmin()(mockReq(buildInitData(42, BOT_TOKEN)), res, next)
    expect(res.statusCode).toBe(403)
  })

  it('503 (не 500 и не throw) при недоступной БД', async () => {
    findUnique.mockRejectedValue(new Error("Can't reach database server"))
    const res = mockRes(); const next = vi.fn() as NextFunction
    await expect(
      requireAdmin()(mockReq(buildInitData(42, BOT_TOKEN)), res, next),
    ).resolves.toBeUndefined()
    expect(res.statusCode).toBe(503)
    expect(next).not.toHaveBeenCalled()
  })

  it('manager не проходит owner-гейт (роль гейтит с PR-2, §10.2)', async () => {
    findUnique.mockResolvedValue({ telegramId: '42', name: 'M', role: 'manager', isActive: true })
    const res = mockRes(); const next = vi.fn() as NextFunction
    await requireAdmin('owner')(mockReq(buildInitData(42, BOT_TOKEN)), res, next)
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('owner проходит owner-гейт; manager проходит обычный; req.admin заполнен', async () => {
    findUnique.mockResolvedValue({ telegramId: '42', name: 'O', role: 'owner', isActive: true })
    const res = mockRes(); const next = vi.fn() as NextFunction
    const req = mockReq(buildInitData(42, BOT_TOKEN))
    await requireAdmin('owner')(req, res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(req.admin).toEqual({ telegramId: '42', name: 'O', role: 'owner' })

    findUnique.mockResolvedValue({ telegramId: '43', name: null, role: 'manager', isActive: true })
    const res2 = mockRes(); const next2 = vi.fn() as NextFunction
    const req2 = mockReq(buildInitData(43, BOT_TOKEN))
    await requireAdmin()(req2, res2, next2)
    expect(next2).toHaveBeenCalledOnce()
    expect(req2.admin?.role).toBe('manager')
  })
})

describe('mskDayStart (границы суток дашборда — по МСК)', () => {
  it('22:30 UTC = 01:30 МСК следующего дня → «сегодня» начинается в 21:00 UTC', () => {
    const now = new Date('2026-07-27T22:30:00Z')
    expect(mskDayStart(now).toISOString()).toBe('2026-07-27T21:00:00.000Z')
  })

  it('10:00 UTC = 13:00 МСК → «сегодня» с 21:00 UTC вчера; daysAgo=1 — сутками раньше', () => {
    const now = new Date('2026-07-27T10:00:00Z')
    expect(mskDayStart(now).toISOString()).toBe('2026-07-26T21:00:00.000Z')
    expect(mskDayStart(now, 1).toISOString()).toBe('2026-07-25T21:00:00.000Z')
  })
})
