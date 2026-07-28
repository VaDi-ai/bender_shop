/**
 * Команда магазина: гейты важнее удобства — нельзя закрыть себе дверь и
 * нельзя оставить магазин без владельца.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: { adminUser: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn(), count: vi.fn() } },
}))
vi.mock('../lib/security-log', () => ({ logSecurityEvent: vi.fn() }))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))

import { prisma } from '../lib/prisma'
import { listTeam, addTeamMember, updateTeamMember } from '../lib/admin-team'

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma.adminUser as any
const OWNER = '111111'
const OTHER = '222222'

beforeEach(() => {
  process.env.ADMIN_IDS = OWNER
  Object.values(db).forEach((fn: any) => fn.mockReset?.())
  db.update.mockResolvedValue({})
  db.upsert.mockResolvedValue({ telegramId: OTHER, role: 'manager' })
  db.count.mockResolvedValue(1)
})

describe('список команды', () => {
  it('помечает «это вы» и «прописан в настройках сервера»', async () => {
    db.findMany.mockResolvedValue([
      { telegramId: OWNER, name: null, role: 'owner', isActive: true, createdAt: new Date() },
      { telegramId: OTHER, name: 'Аня', role: 'manager', isActive: true, createdAt: new Date() },
    ])
    const team = await listTeam(OWNER)
    expect(team[0]).toMatchObject({ isYou: true, fromEnv: true, role: 'owner' })
    expect(team[1]).toMatchObject({ isYou: false, fromEnv: false, role: 'manager', name: 'Аня' })
  })
})

describe('добавление', () => {
  it('мусорный ID не проходит', async () => {
    for (const bad of ['', 'abc', '12', '1'.repeat(20), '12a45', '-123456']) {
      const r = await addTeamMember(OWNER, { telegramId: bad })
      expect(r.ok, bad).toBe(false)
      expect(r.status).toBe(422)
    }
    expect(db.upsert).not.toHaveBeenCalled()
  })

  it('по умолчанию менеджер, а не владелец', async () => {
    db.findUnique.mockResolvedValue(null)
    await addTeamMember(OWNER, { telegramId: OTHER, name: 'Аня' })
    expect(db.upsert.mock.calls[0][0].create).toMatchObject({ role: 'manager', isActive: true })
  })

  it('повторное добавление активного — 409, а не тихий апдейт', async () => {
    db.findUnique.mockResolvedValue({ telegramId: OTHER, role: 'manager', isActive: true })
    expect(await addTeamMember(OWNER, { telegramId: OTHER })).toMatchObject({ ok: false, status: 409 })
  })

  it('выключенного возвращают в строй тем же добавлением', async () => {
    db.findUnique.mockResolvedValue({ telegramId: OTHER, role: 'manager', isActive: false, name: 'Аня' })
    const r = await addTeamMember(OWNER, { telegramId: OTHER, role: 'owner' })
    expect(r.ok).toBe(true)
    expect(db.upsert.mock.calls[0][0].update).toMatchObject({ isActive: true, role: 'owner' })
  })
})

describe('изменение прав', () => {
  it('себе доступ не снимают и себя не понижают', async () => {
    db.findUnique.mockResolvedValue({ telegramId: OWNER, role: 'owner', isActive: true, name: null })
    expect(await updateTeamMember(OWNER, OWNER, { isActive: false })).toMatchObject({ ok: false, status: 422 })
    expect(await updateTeamMember(OWNER, OWNER, { role: 'manager' })).toMatchObject({ ok: false, status: 422 })
    expect(db.update).not.toHaveBeenCalled()
  })

  it('последнего владельца не понизить и не выключить', async () => {
    db.findUnique.mockResolvedValue({ telegramId: OTHER, role: 'owner', isActive: true, name: null })
    db.count.mockResolvedValue(0)   // других активных владельцев нет
    const r = await updateTeamMember(OWNER, OTHER, { role: 'manager' })
    expect(r).toMatchObject({ ok: false, status: 422 })
    expect(r.error).toContain('последний владелец')
    expect(await updateTeamMember(OWNER, OTHER, { isActive: false })).toMatchObject({ ok: false, status: 422 })
  })

  it('когда владельцев несколько — понижение проходит', async () => {
    db.findUnique.mockResolvedValue({ telegramId: OTHER, role: 'owner', isActive: true, name: null })
    db.count.mockResolvedValue(1)
    expect(await updateTeamMember(OWNER, OTHER, { role: 'manager' })).toMatchObject({ ok: true })
    expect(db.update).toHaveBeenCalled()
  })

  it('снятие доступа у env-ID честно предупреждает про возврат после перезапуска', async () => {
    process.env.ADMIN_IDS = `${OWNER},${OTHER}`
    db.findUnique.mockResolvedValue({ telegramId: OTHER, role: 'manager', isActive: true, name: null })
    const r = await updateTeamMember(OWNER, OTHER, { isActive: false })
    expect(r.ok).toBe(true)
    expect((r.data as { note: string }).note).toContain('после перезапуска')
  })

  it('чужая роль и пустое тело — человеческие отказы', async () => {
    db.findUnique.mockResolvedValue({ telegramId: OTHER, role: 'manager', isActive: true, name: null })
    expect(await updateTeamMember(OWNER, OTHER, { role: 'root' })).toMatchObject({ ok: false, status: 422 })
    expect(await updateTeamMember(OWNER, OTHER, {})).toMatchObject({ ok: false, status: 422 })
    db.findUnique.mockResolvedValue(null)
    expect(await updateTeamMember(OWNER, '999999', { role: 'owner' })).toMatchObject({ ok: false, status: 404 })
  })
})
