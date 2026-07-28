/**
 * Команда магазина: кто имеет доступ в админку и с какой ролью.
 *
 * До этого AdminUser заводился ТОЛЬКО сидом из env ADMIN_IDS — то есть
 * «роли правятся из веба» было обещанием без реализации, а менеджера завести
 * было нечем. Теперь список правится владельцем из панели.
 *
 * Гейты (важнее, чем удобство):
 *   • только owner;
 *   • себя нельзя понизить или выключить — иначе можно закрыть себе дверь;
 *   • последнего активного владельца нельзя понизить/выключить — магазин
 *     остался бы без хозяина;
 *   • ID из env ADMIN_IDS выключить можно, но при следующем старте сид его
 *     вернёт (честно пишем это в ответе, а не делаем вид, что удалили).
 */
import { prisma } from './prisma'
import { logAdminAction } from './audit'
import { logSecurityEvent } from './security-log'
import { parseAdminIds } from './admin-users'

export type Role = 'owner' | 'manager'

export interface TeamMember {
  telegramId: string
  name: string | null
  role: Role
  isActive: boolean
  createdAt: Date
  /** ID прописан в ADMIN_IDS — сид вернёт доступ при перезапуске */
  fromEnv: boolean
  /** Это вы (по текущей сессии) */
  isYou: boolean
}

export interface Outcome<T = unknown> {
  ok: boolean
  status: number
  error?: string
  data?: T
}

const bad = (status: number, error: string): Outcome => ({ ok: false, status, error })

export async function listTeam(viewerTelegramId: string): Promise<TeamMember[]> {
  const envIds = new Set(parseAdminIds(process.env.ADMIN_IDS))
  const rows = await prisma.adminUser.findMany({ orderBy: [{ role: 'asc' }, { telegramId: 'asc' }] })
  return rows.map(r => ({
    telegramId: r.telegramId,
    name: r.name,
    role: r.role as Role,
    isActive: r.isActive,
    createdAt: r.createdAt,
    fromEnv: envIds.has(r.telegramId),
    isYou: r.telegramId === viewerTelegramId,
  }))
}

function validId(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  return /^\d{5,15}$/.test(s) ? s : null
}

export async function addTeamMember(actor: string, body: Record<string, unknown>): Promise<Outcome> {
  const telegramId = validId(body.telegramId)
  if (!telegramId) return bad(422, 'Telegram ID — только цифры (узнать можно в боте @userinfobot)')
  const role: Role = body.role === 'owner' ? 'owner' : 'manager'
  const name = String(body.name ?? '').trim().slice(0, 60) || null

  const existing = await prisma.adminUser.findUnique({ where: { telegramId } })
  if (existing && existing.isActive) return bad(409, 'Такой сотрудник уже есть в списке')

  const saved = await prisma.adminUser.upsert({
    where: { telegramId },
    update: { isActive: true, role, name: name ?? existing?.name ?? null },
    create: { telegramId, role, name, isActive: true },
  })
  void logAdminAction({
    adminTelegramId: actor, action: existing ? 'update' : 'create', entity: 'AdminUser', entityId: telegramId,
    before: existing ? { role: existing.role, isActive: existing.isActive } : undefined,
    after: { role, isActive: true, name },
  })
  void logSecurityEvent('admin_added', { telegramId, role, via: 'web' }, actor)
  return { ok: true, status: 201, data: { telegramId: saved.telegramId, role: saved.role } }
}

export async function updateTeamMember(actor: string, telegramId: string, body: Record<string, unknown>): Promise<Outcome> {
  const existing = await prisma.adminUser.findUnique({ where: { telegramId } })
  if (!existing) return bad(404, 'Сотрудник не найден')

  const data: Record<string, unknown> = {}
  if (body.role !== undefined) {
    if (body.role !== 'owner' && body.role !== 'manager') return bad(422, 'Роль — владелец или менеджер')
    data.role = body.role
  }
  if (body.isActive !== undefined) data.isActive = body.isActive === true
  if (body.name !== undefined) data.name = String(body.name ?? '').trim().slice(0, 60) || null
  if (!Object.keys(data).length) return bad(422, 'Нечего менять')

  const losesOwner = (data.role !== undefined && data.role !== 'owner') || data.isActive === false
  if (losesOwner && telegramId === actor) {
    return bad(422, 'Себе доступ не снимают — попросите другого владельца')
  }
  if (losesOwner && existing.role === 'owner' && existing.isActive) {
    const otherOwners = await prisma.adminUser.count({
      where: { role: 'owner', isActive: true, telegramId: { not: telegramId } },
    })
    if (otherOwners === 0) return bad(422, 'Это последний владелец — магазин останется без хозяина')
  }

  await prisma.adminUser.update({ where: { telegramId }, data })
  void logAdminAction({
    adminTelegramId: actor, action: 'update', entity: 'AdminUser', entityId: telegramId,
    before: { role: existing.role, isActive: existing.isActive, name: existing.name }, after: data,
  })
  void logSecurityEvent('admin_role_changed', { telegramId, ...data, via: 'web' }, actor)

  const envIds = new Set(parseAdminIds(process.env.ADMIN_IDS))
  const note = data.isActive === false && envIds.has(telegramId)
    ? 'Доступ снят, но этот ID прописан в настройках сервера — после перезапуска он вернётся владельцем'
    : null
  return { ok: true, status: 200, data: { note } }
}
