/**
 * Акции: предпросмотр обязателен, запуск/остановка — деньги, черновик цен не
 * двигает. Плюс главный инвариант: пока акция идёт, синк её цены не трогает.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    promotion: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    category: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
  },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/security-log', () => ({ logSecurityEvent: vi.fn() }))
vi.mock('../lib/promotions', () => ({
  findVariantsByFilter: vi.fn(),
  applyPromotion: vi.fn(),
  cancelPromotion: vi.fn(),
  filterLabel: (t: string, v: string) => `${t}: ${v}`,
}))

import { prisma } from '../lib/prisma'
import { findVariantsByFilter, applyPromotion, cancelPromotion } from '../lib/promotions'
import { previewPromotion, createPromotion, launchPromotion, stopPromotion, deleteDraft } from '../lib/promotion-admin'

/* eslint-disable @typescript-eslint/no-explicit-any */
const promo = prisma.promotion as any
const ACTOR = '900'

const variant = (id: number, price: number, inStock = true) => ({
  id, price, quantity: inStock ? 3 : 0, inStock,
  attributes: { fullName: `Товар ${id}` }, product: { name: `Товар ${id}` },
})

beforeEach(() => {
  ;[promo.findMany, promo.findUnique, promo.create, promo.delete].forEach(f => f.mockReset())
  ;(findVariantsByFilter as any).mockReset()
  ;(applyPromotion as any).mockReset()
  ;(cancelPromotion as any).mockReset().mockResolvedValue(undefined)
})

describe('предпросмотр', () => {
  it('считает «было → стало» и среднюю скидку, ничего не меняя', async () => {
    ;(findVariantsByFilter as any).mockResolvedValue([variant(1, 100000), variant(2, 50000)])
    const r = await previewPromotion('category', 'iPhone', 'percent', 10)
    expect(r.ok).toBe(true)
    expect(r.data).toMatchObject({ count: 2, inStockCount: 2, avgDrop: 7500 })
    expect(r.data!.rows[0]).toMatchObject({ oldPrice: 100000, newPrice: 90000 })
    expect(promo.create).not.toHaveBeenCalled()
  })

  it('предупреждает про пустой фильтр', async () => {
    ;(findVariantsByFilter as any).mockResolvedValue([])
    const r = await previewPromotion('brand', 'Nokia', 'percent', 10)
    expect(r.data!.warnings.join(' ')).toContain('ни один товар')
  })

  it('предупреждает, когда скидка больше цены', async () => {
    ;(findVariantsByFilter as any).mockResolvedValue([variant(1, 500)])
    const r = await previewPromotion('category', 'Аксессуары', 'fixed', 1000)
    expect(r.data!.rows[0].newPrice).toBe(1)                 // ниже рубля не опускаем
    expect(r.data!.warnings.join(' ')).toContain('1 ₽')
  })

  it('предупреждает, когда всё под фильтром не в наличии', async () => {
    ;(findVariantsByFilter as any).mockResolvedValue([variant(1, 1000, false)])
    const r = await previewPromotion('category', 'iPhone', 'percent', 10)
    expect(r.data!.warnings.join(' ')).toContain('не в наличии')
  })

  it('мусорные параметры — человеческий отказ, без похода в каталог', async () => {
    for (const args of [
      ['category', '', 'percent', 10],
      ['category', 'iPhone', 'percent', 0],
      ['category', 'iPhone', 'percent', 95],
      ['category', 'iPhone', 'fixed', 2_000_000],
      ['sql', 'iPhone', 'percent', 10],
    ] as const) {
      const r = await previewPromotion(args[0] as never, args[1], args[2] as never, args[3])
      expect(r.ok, JSON.stringify(args)).toBe(false)
      expect(r.status).toBe(422)
    }
    expect(findVariantsByFilter).not.toHaveBeenCalled()
  })
})

describe('черновик', () => {
  it('создаётся неактивным — цены не двигает', async () => {
    promo.create.mockResolvedValue({ id: 5 })
    const r = await createPromotion(ACTOR, { name: 'Скидка на MacBook', filterType: 'category', filterValue: 'MacBook', discountType: 'percent', discountValue: 10 })
    expect(r).toMatchObject({ ok: true, status: 201 })
    expect(promo.create.mock.calls[0][0].data.isActive).toBe(false)
  })

  it('без названия не создаётся', async () => {
    expect((await createPromotion(ACTOR, { name: '  ', filterType: 'category', filterValue: 'MacBook', discountType: 'percent', discountValue: 10 })).status).toBe(422)
    expect(promo.create).not.toHaveBeenCalled()
  })
})

describe('запуск и остановка', () => {
  it('запуск применяет скидку и пишет в журналы', async () => {
    promo.findUnique.mockResolvedValue({ id: 5, name: 'Скидка', isActive: false })
    ;(applyPromotion as any).mockResolvedValue(12)
    const r = await launchPromotion(ACTOR, 5)
    expect(r).toMatchObject({ ok: true, data: { variants: 12 } })
  })

  it('повторный запуск — 409', async () => {
    promo.findUnique.mockResolvedValue({ id: 5, name: 'Скидка', isActive: true })
    expect((await launchPromotion(ACTOR, 5)).status).toBe(409)
    expect(applyPromotion).not.toHaveBeenCalled()
  })

  it('под фильтр не попало ничего — акция остаётся черновиком', async () => {
    promo.findUnique.mockResolvedValue({ id: 5, name: 'Скидка', isActive: false })
    ;(applyPromotion as any).mockResolvedValue(0)
    const r = await launchPromotion(ACTOR, 5)
    expect(r).toMatchObject({ ok: false, status: 422 })
    expect(r.error).toContain('цены не тронуты')
  })

  it('гонка двух запусков — понятный отказ', async () => {
    promo.findUnique.mockResolvedValue({ id: 5, name: 'Скидка', isActive: false })
    ;(applyPromotion as any).mockRejectedValue(new Error('Акция была изменена параллельно — повторите операцию'))
    const r = await launchPromotion(ACTOR, 5)
    expect(r.status).toBe(409)
    expect(r.error).toContain('повторите')
  })

  it('остановка возвращает цены и сообщает, скольким', async () => {
    promo.findUnique.mockResolvedValue({ id: 5, name: 'Скидка', isActive: true, _count: { prices: 7 } })
    const r = await stopPromotion(ACTOR, 5)
    expect(r).toMatchObject({ ok: true, data: { restored: 7 } })
    expect(cancelPromotion).toHaveBeenCalledWith(5)
  })

  it('остановка неидущей — 409', async () => {
    promo.findUnique.mockResolvedValue({ id: 5, name: 'Скидка', isActive: false, _count: { prices: 0 } })
    expect((await stopPromotion(ACTOR, 5)).status).toBe(409)
    expect(cancelPromotion).not.toHaveBeenCalled()
  })
})

describe('удаление черновика', () => {
  it('идущую акцию удалить нельзя — сначала остановить', async () => {
    promo.findUnique.mockResolvedValue({ id: 5, isActive: true, _count: { prices: 3 } })
    expect((await deleteDraft(ACTOR, 5)).status).toBe(409)
    expect(promo.delete).not.toHaveBeenCalled()
  })

  it('акцию с сохранёнными ценами удалить нельзя — цены осиротеют', async () => {
    promo.findUnique.mockResolvedValue({ id: 5, isActive: false, _count: { prices: 3 } })
    expect((await deleteDraft(ACTOR, 5)).status).toBe(409)
    expect(promo.delete).not.toHaveBeenCalled()
  })

  it('чистый черновик удаляется', async () => {
    promo.findUnique.mockResolvedValue({ id: 5, name: 'X', discountValue: 10, filterValue: 'MacBook', isActive: false, _count: { prices: 0 } })
    expect((await deleteDraft(ACTOR, 5)).ok).toBe(true)
    expect(promo.delete).toHaveBeenCalledWith({ where: { id: 5 } })
  })
})
