/**
 * Сегменты клиентов из веб-админки — перенос bot/admin/segments.ts один в один.
 *
 * Ограды (как в боте):
 *   • дефолтный сегмент удалить нельзя;
 *   • при удалении клиенты мигрируют в дефолтный (или segmentId=null, если
 *     дефолтного нет) — клиенты не теряются;
 *   • security-логи segment_created / segment_renamed / segment_deleted.
 */
import { prisma } from './prisma'
import { logAdminAction } from './audit'
import { logSecurityEvent } from './security-log'

export const SEGMENT_COLORS = ['🔵', '🟡', '🟢', '🔴', '🟣', '⚪']

export interface Outcome<T = unknown> {
  ok: boolean
  status: number
  error?: string
  data?: T
}

const bad = (status: number, error: string): Outcome => ({ ok: false, status, error })

/** Валидация названия — лимиты из бота (1..50). */
export function validateSegmentName(raw: unknown): { error?: string; name?: string } {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (name.length < 1) return { error: 'Введите название сегмента' }
  if (name.length > 50) return { error: 'Название сегмента не должно превышать 50 символов' }
  return { name }
}

export async function listSegments(): Promise<Array<{
  id: number; name: string; color: string; isDefault: boolean; clients: number
}>> {
  const segments = await prisma.segment.findMany({
    orderBy: { id: 'asc' },
    include: { _count: { select: { clients: true } } },
  })
  return segments.map(s => ({ id: s.id, name: s.name, color: s.color, isDefault: s.isDefault, clients: s._count.clients }))
}

export async function createSegment(actor: string, body: Record<string, unknown>): Promise<Outcome<{ id: number }>> {
  const { error, name } = validateSegmentName(body.name)
  if (error) return bad(422, error) as Outcome<{ id: number }>
  const color = typeof body.color === 'string' && SEGMENT_COLORS.includes(body.color) ? body.color : SEGMENT_COLORS[0]!
  try {
    const seg = await prisma.segment.create({ data: { name: name!, color } })
    void logAdminAction({ adminTelegramId: actor, action: 'create', entity: 'Segment', entityId: seg.id, after: { name, color } })
    try { await logSecurityEvent('segment_created', { name, color, via: 'web' }, actor) } catch { /* ignore */ }
    return { ok: true, status: 201, data: { id: seg.id } }
  } catch {
    return bad(409, 'Сегмент с таким названием уже существует') as Outcome<{ id: number }>
  }
}

export async function renameSegment(actor: string, id: number, body: Record<string, unknown>): Promise<Outcome> {
  const { error, name } = validateSegmentName(body.name)
  if (error) return bad(422, error)
  const seg = await prisma.segment.findUnique({ where: { id } })
  if (!seg) return bad(404, 'Сегмент не найден')
  try {
    await prisma.segment.update({ where: { id }, data: { name: name! } })
    void logAdminAction({ adminTelegramId: actor, action: 'update', entity: 'Segment', entityId: id, before: { name: seg.name }, after: { name } })
    try { await logSecurityEvent('segment_renamed', { oldName: seg.name, newName: name, via: 'web' }, actor) } catch { /* ignore */ }
    return { ok: true, status: 200 }
  } catch {
    return bad(409, 'Сегмент с таким названием уже существует')
  }
}

export async function deleteSegment(actor: string, id: number): Promise<Outcome<{ migrated: number }>> {
  const seg = await prisma.segment.findUnique({ where: { id } })
  if (!seg) return bad(404, 'Сегмент не найден') as Outcome<{ migrated: number }>
  if (seg.isDefault) return bad(422, 'Нельзя удалить дефолтный сегмент') as Outcome<{ migrated: number }>

  const defaultSeg = await prisma.segment.findFirst({ where: { isDefault: true } })
  // Клиентов переводим в дефолтный (или null если дефолтного нет) — как в боте
  const migrated = await prisma.client.updateMany({
    where: { segmentId: id },
    data: { segmentId: defaultSeg?.id ?? null },
  })
  await prisma.segment.delete({ where: { id } })
  void logAdminAction({ adminTelegramId: actor, action: 'delete', entity: 'Segment', entityId: id, before: { name: seg.name, migratedClients: migrated.count } })
  try { await logSecurityEvent('segment_deleted', { name: seg.name, migratedClients: migrated.count, via: 'web' }, actor) } catch { /* ignore */ }
  return { ok: true, status: 200, data: { migrated: migrated.count } }
}
