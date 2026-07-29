/**
 * Занятый лок синка не должен превращаться в 503 или в молчаливую ошибку:
 * веб-роуты акций отвечают 409 с человеческим текстом и ничего не пишут.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: { promotion: { findUnique: vi.fn(), findMany: vi.fn() } },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/security-log', () => ({ logSecurityEvent: vi.fn() }))
vi.mock('../lib/promotions', () => ({
  findVariantsByFilter: vi.fn(),
  applyPromotion: vi.fn(),
  cancelPromotion: vi.fn(),
  filterLabel: () => 'категория: iPhone',
}))

import { prisma } from '../lib/prisma'
import { applyPromotion, cancelPromotion } from '../lib/promotions'
import { SyncLockBusy } from '../lib/sync-lock'
import { launchPromotion, stopPromotion, stopAllPromotions } from '../lib/promotion-admin'

/* eslint-disable @typescript-eslint/no-explicit-any */
const promo = prisma.promotion as any
const ACTOR = '900'

beforeEach(() => {
  ;[promo.findUnique, promo.findMany].forEach(f => f.mockReset())
  ;(applyPromotion as any).mockReset()
  ;(cancelPromotion as any).mockReset()
})

describe('лок синка занят', () => {
  it('запуск отдаёт 409 с текстом про синхронизацию', async () => {
    promo.findUnique.mockResolvedValue({ id: 5, name: 'Скидка', isActive: false })
    ;(applyPromotion as any).mockRejectedValue(new SyncLockBusy())
    const r = await launchPromotion(ACTOR, 5)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(r.error).toContain('синхронизация')
  })

  it('остановка отдаёт 409, а не 503 из обёртки роутера', async () => {
    promo.findUnique.mockResolvedValue({ id: 5, name: 'Скидка', isActive: true, _count: { prices: 3 } })
    ;(cancelPromotion as any).mockRejectedValue(new SyncLockBusy())
    const r = await stopPromotion(ACTOR, 5)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(r.error).toContain('синхронизация')
  })

  it('«отменить все»: сообщает, сколько успели остановить до занятого лока', async () => {
    promo.findMany.mockResolvedValue([{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }])
    ;(cancelPromotion as any)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new SyncLockBusy())
    const r = await stopAllPromotions(ACTOR)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(r.error).toContain('Остановлено 1 из 3')
  })

  it('«отменить все» на первой же занятой — обычный текст про синхронизацию', async () => {
    promo.findMany.mockResolvedValue([{ id: 1, name: 'A' }])
    ;(cancelPromotion as any).mockRejectedValue(new SyncLockBusy())
    const r = await stopAllPromotions(ACTOR)
    expect(r.status).toBe(409)
    expect(r.error).toContain('Идёт синхронизация')
  })
})

describe('лок свободен — поведение прежнее', () => {
  it('запуск и остановка проходят', async () => {
    promo.findUnique.mockResolvedValue({ id: 5, name: 'Скидка', isActive: false })
    ;(applyPromotion as any).mockResolvedValue(7)
    expect(await launchPromotion(ACTOR, 5)).toMatchObject({ ok: true, data: { variants: 7 } })

    promo.findUnique.mockResolvedValue({ id: 5, name: 'Скидка', isActive: true, _count: { prices: 7 } })
    ;(cancelPromotion as any).mockResolvedValue(undefined)
    expect(await stopPromotion(ACTOR, 5)).toMatchObject({ ok: true, data: { restored: 7 } })
  })

  it('«отменить все» останавливает всё и считает честно', async () => {
    promo.findMany.mockResolvedValue([{ id: 1, name: 'A' }, { id: 2, name: 'B' }])
    ;(cancelPromotion as any).mockResolvedValue(undefined)
    expect(await stopAllPromotions(ACTOR)).toMatchObject({ ok: true, data: { stopped: 2 } })
  })
})
