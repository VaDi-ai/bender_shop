/**
 * Сохранение ручных замен в «Рекомендуем».
 *
 * Что здесь важно кроме валидации: ноль — это не товар, а пустой слот, и
 * проверки существования, самоссылки и повторов обязаны его пропускать. Иначе
 * [0,0,394,0] — совершенно нормальная конфигурация — заворачивалась бы с
 * ошибкой «товара 0 нет».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: { product: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() } },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/api-key-store', () => ({ getApiKeyValue: vi.fn(), setApiKeyValue: vi.fn() }))

import { prisma } from '../lib/prisma'
import { setApiKeyValue } from '../lib/api-key-store'
import { setProductRecommendations } from '../lib/product-admin'

/* eslint-disable @typescript-eslint/no-explicit-any */
const pp = prisma.product as any
const bump = setApiKeyValue as any
const ACTOR = '900'
const SELF = 3

beforeEach(() => {
  pp.findUnique.mockReset(); pp.update.mockReset(); pp.findMany.mockReset(); bump.mockReset()
  pp.findUnique.mockResolvedValue({ id: SELF, recommendedIds: [] })
  pp.update.mockResolvedValue({})
  // «такие товары есть» — по умолчанию отдаём всё, что спросили
  pp.findMany.mockImplementation(({ where }: any) => Promise.resolve((where.id.in as number[]).map(id => ({ id }))))
})

const save = (ids: unknown) => setProductRecommendations(ACTOR, SELF, { ids })
const stored = () => pp.update.mock.calls[0][0].data.recommendedIds

describe('ноль — это пустой слот, а не товар', () => {
  it('несколько нулей подряд — валидная конфигурация', async () => {
    const r = await save([0, 0, 394, 0])
    expect(r.ok).toBe(true)
    expect(stored()).toEqual([0, 0, 394])          // снят только хвостовой ноль
  })

  it('существование проверяется только у ненулевых', async () => {
    await save([0, 0, 394, 0])
    expect(pp.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [394] } } }))
  })

  it('повторяющиеся нули не считаются дублями', async () => {
    expect((await save([0, 0, 0, 7])).ok).toBe(true)
  })

  it('ноль не путается с самим товаром', async () => {
    expect((await save([0, 0, 0, 0])).ok).toBe(true)
  })
})

describe('валидация', () => {
  it('дубль ненулевых — отказ', async () => {
    const r = await save([7, 0, 7, 0])
    expect(r).toMatchObject({ ok: false, status: 422 })
    expect(r.error).toContain('дважды')
  })

  it('товар сам к себе — отказ', async () => {
    expect(await save([0, SELF, 0, 0])).toMatchObject({ ok: false, status: 422 })
  })

  it('несуществующий товар — отказ с номером', async () => {
    pp.findMany.mockResolvedValue([])
    const r = await save([0, 999, 0, 0])
    expect(r).toMatchObject({ ok: false, status: 422 })
    expect(r.error).toContain('999')
  })

  it('длиннее ленты — отказ', async () => {
    expect(await save([1, 2, 3, 4, 5])).toMatchObject({ ok: false, status: 422 })
  })

  it('не список — отказ', async () => {
    expect(await save('7')).toMatchObject({ ok: false, status: 422 })
  })

  it('дробное и отрицательное — отказ', async () => {
    expect(await save([1.5])).toMatchObject({ ok: false, status: 422 })
    expect(await save([-1])).toMatchObject({ ok: false, status: 422 })
  })

  it('нет поля ids — нечего менять', async () => {
    expect(await setProductRecommendations(ACTOR, SELF, {})).toMatchObject({ ok: false, status: 422 })
  })

  it('нет товара — 404', async () => {
    pp.findUnique.mockResolvedValue(null)
    expect(await save([7])).toMatchObject({ ok: false, status: 404 })
  })

  it('ничего не записано, если отказали', async () => {
    await save([7, 0, 7, 0])
    expect(pp.update).not.toHaveBeenCalled()
  })
})

describe('сохранение', () => {
  it('сброс на авто — пустой массив', async () => {
    pp.findUnique.mockResolvedValue({ id: SELF, recommendedIds: [0, 0, 394] })
    const r = await save([])
    expect(r.ok).toBe(true)
    expect(stored()).toEqual([])
  })

  it('массив из одних нулей схлопывается в пустой — это тот же сброс', async () => {
    pp.findUnique.mockResolvedValue({ id: SELF, recommendedIds: [394] })
    await save([0, 0, 0, 0])
    expect(stored()).toEqual([])
  })

  it('без изменений в БД не ходим', async () => {
    pp.findUnique.mockResolvedValue({ id: SELF, recommendedIds: [0, 0, 394] })
    const r = await save([0, 0, 394, 0])
    expect(r).toMatchObject({ ok: true, data: { unchanged: true } })
    expect(pp.update).not.toHaveBeenCalled()
  })

  it('успешная правка бампает кэш витрины — открытые вкладки узнают', async () => {
    await save([0, 0, 394, 0])
    expect(bump).toHaveBeenCalled()
  })
})

describe('гейт ручки', () => {
  /** Слои маршрута в express: [ownerOnly?, safe(handler)]. */
  function handlersOf(router: any, method: string, path: string): string[] {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method])
    if (!layer) throw new Error(`Маршрут ${method.toUpperCase()} ${path} не зарегистрирован`)
    return layer.route.stack.map((h: any) => h.name || h.handle?.name || '')
  }

  it('менеджеру ленту не сохранить — ручка owner-only', async () => {
    const { adminApiRouter } = await import('../api/admin')
    const router = adminApiRouter() as any
    expect(handlersOf(router, 'put', '/products/:id/recommendations')).toContain('ownerOnly')
  })

  it('для сравнения: карточка товара по-прежнему открыта менеджеру', async () => {
    const { adminApiRouter } = await import('../api/admin')
    const router = adminApiRouter() as any
    expect(handlersOf(router, 'get', '/products/:id')).not.toContain('ownerOnly')
  })
})
