/**
 * Сегменты из веба — перенос бота: дефолт не удаляем, клиенты мигрируют,
 * security-логи пишутся.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    segment: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    client: { updateMany: vi.fn() },
  },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/security-log', () => ({ logSecurityEvent: vi.fn() }))

import { prisma } from '../lib/prisma'
import { logSecurityEvent } from '../lib/security-log'
import { listSegments, createSegment, renameSegment, deleteSegment, SEGMENT_COLORS } from '../lib/segments-admin'

/* eslint-disable @typescript-eslint/no-explicit-any */
const seg = prisma.segment as any
const client = prisma.client as any
const sec = logSecurityEvent as any

beforeEach(() => {
  ;[seg.findMany, seg.findUnique, seg.findFirst, seg.create, seg.update, seg.delete, client.updateMany, sec].forEach((f: any) => f.mockReset())
  seg.create.mockResolvedValue({ id: 5 })
  seg.update.mockResolvedValue({})
  seg.delete.mockResolvedValue({})
  client.updateMany.mockResolvedValue({ count: 7 })
})

describe('создание и переименование', () => {
  it('создаёт с валидным цветом, пишет segment_created', async () => {
    const r = await createSegment('900', { name: ' VIP ', color: '🟡' })
    expect(r).toMatchObject({ ok: true, status: 201, data: { id: 5 } })
    expect(seg.create.mock.calls[0][0].data).toEqual({ name: 'VIP', color: '🟡' })
    expect(sec.mock.calls[0][0]).toBe('segment_created')
  })

  it('чужой цвет → дефолтный из палитры бота', async () => {
    await createSegment('900', { name: 'X', color: '💥' })
    expect(SEGMENT_COLORS).toContain(seg.create.mock.calls[0][0].data.color)
  })

  it('лимиты имени из бота: пустое и >50 — 422; дубль — 409', async () => {
    expect((await createSegment('900', { name: '' })).status).toBe(422)
    expect((await createSegment('900', { name: 'x'.repeat(51) })).status).toBe(422)
    seg.create.mockRejectedValue(new Error('unique'))
    expect((await createSegment('900', { name: 'VIP' })).status).toBe(409)
  })

  it('переименование пишет segment_renamed', async () => {
    seg.findUnique.mockResolvedValue({ id: 5, name: 'Old' })
    const r = await renameSegment('900', 5, { name: 'New' })
    expect(r.ok).toBe(true)
    expect(sec.mock.calls[0][0]).toBe('segment_renamed')
  })
})

describe('удаление — ограды бота', () => {
  it('дефолтный удалить нельзя', async () => {
    seg.findUnique.mockResolvedValue({ id: 1, name: 'База', isDefault: true })
    const r = await deleteSegment('900', 1)
    expect(r).toMatchObject({ ok: false, status: 422 })
    expect(seg.delete).not.toHaveBeenCalled()
  })

  it('клиенты мигрируют в дефолтный, segment_deleted с числом', async () => {
    seg.findUnique.mockResolvedValue({ id: 5, name: 'VIP', isDefault: false })
    seg.findFirst.mockResolvedValue({ id: 1, isDefault: true })
    const r = await deleteSegment('900', 5)
    expect(r).toMatchObject({ ok: true, data: { migrated: 7 } })
    expect(client.updateMany).toHaveBeenCalledWith({ where: { segmentId: 5 }, data: { segmentId: 1 } })
    expect(sec.mock.calls[0][0]).toBe('segment_deleted')
    expect(sec.mock.calls[0][1]).toMatchObject({ migratedClients: 7 })
  })

  it('без дефолтного — segmentId=null (как в боте), клиенты не теряются', async () => {
    seg.findUnique.mockResolvedValue({ id: 5, name: 'VIP', isDefault: false })
    seg.findFirst.mockResolvedValue(null)
    await deleteSegment('900', 5)
    expect(client.updateMany).toHaveBeenCalledWith({ where: { segmentId: 5 }, data: { segmentId: null } })
  })
})

describe('список', () => {
  it('отдаёт счётчики клиентов', async () => {
    seg.findMany.mockResolvedValue([{ id: 1, name: 'База', color: '🔵', isDefault: true, _count: { clients: 42 } }])
    expect(await listSegments()).toEqual([{ id: 1, name: 'База', color: '🔵', isDefault: true, clients: 42 }])
  })
})
