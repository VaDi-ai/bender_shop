/**
 * Карточка товара: что видит владелец и что можно менять. Описание тоже
 * зеркало таблицы — без записи в лист в БД не пишем.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: { product: { findUnique: vi.fn(), update: vi.fn() } },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/api-key-store', () => ({ getApiKeyValue: vi.fn(), setApiKeyValue: vi.fn() }))

import { prisma } from '../lib/prisma'
import { setApiKeyValue } from '../lib/api-key-store'
import { getProductCard, setProductVisible, setProductDescription } from '../lib/product-admin'

/* eslint-disable @typescript-eslint/no-explicit-any */
const pp = prisma.product as any
const bump = setApiKeyValue as any
const ACTOR = '900'

const productRow = {
  id: 3, name: 'Iphone 17 Pro Max', sku: 'sku-1', brand: 'Apple', description: 'старое',
  isAvailable: true, isFeatured: false, photoUrl: '/photos/a.webp', photos: ['/photos/a.webp'],
  category: { name: 'iPhone 17 Pro Max' },
  variants: [
    { id: 11, price: 131200, quantity: 2, inStock: true, photoUrls: ['/photos/a.webp'],
      attributes: { fullName: 'iPhone 17 Pro Max 256 (Япония)', 'Страна': 'Япония', SIM: 'eSIM', 'Цвет': 'Blue' } },
    { id: 12, price: 124000, quantity: 0, inStock: false, photoUrls: [],
      attributes: { fullName: 'iPhone 17 Pro Max 256 (Китай)', 'Страна': 'Китай', SIM: '2 SIM', 'Цвет': 'Black' } },
  ],
}

beforeEach(() => {
  pp.findUnique.mockReset(); pp.update.mockReset(); bump.mockReset()
  pp.update.mockResolvedValue({})
})

describe('карточка', () => {
  it('собирает предложения, страны, цену «от» и честную видимость', async () => {
    pp.findUnique.mockResolvedValue(productRow)
    const card = (await getProductCard(3))!
    expect(card).toMatchObject({ name: 'Iphone 17 Pro Max', countries: ['Япония', 'Китай'], inStockCount: 1, priceFrom: 131200 })
    expect(card.offers[0]).toMatchObject({ variantId: 11, sim: 'eSIM', visible: true })
    expect(card.offers[1]).toMatchObject({ variantId: 12, visible: false })   // 0 шт → покупателю не видно
    expect(card.offers[0].attrs.fullName).toBeUndefined()                     // служебное поле в UI не тащим
  })

  it('скрытый товар: предложения перестают быть видимыми', async () => {
    pp.findUnique.mockResolvedValue({ ...productRow, isAvailable: false })
    const card = (await getProductCard(3))!
    expect(card.offers.every(o => !o.visible)).toBe(true)
    expect(card.inStockCount).toBe(1)      // остаток есть, но витрина его не покажет
  })

  it('нет товара — null', async () => {
    pp.findUnique.mockResolvedValue(null)
    expect(await getProductCard(999)).toBeNull()
  })
})

describe('скрыть с витрины', () => {
  it('меняет флаг и пишет в аудит', async () => {
    pp.findUnique.mockResolvedValue({ id: 3, name: 'X', isAvailable: true })
    expect(await setProductVisible(ACTOR, 3, false)).toMatchObject({ ok: true })
    expect(pp.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { isAvailable: false } })
    expect(bump).toHaveBeenCalledWith('cache_version', expect.any(String))
  })

  it('повтор — no-op без записи', async () => {
    pp.findUnique.mockResolvedValue({ id: 3, name: 'X', isAvailable: false })
    expect(await setProductVisible(ACTOR, 3, false)).toMatchObject({ ok: true, data: { unchanged: true } })
    expect(pp.update).not.toHaveBeenCalled()
    expect(bump).not.toHaveBeenCalled()
  })

  it('чужой id — 404', async () => {
    pp.findUnique.mockResolvedValue(null)
    expect((await setProductVisible(ACTOR, 999, false)).status).toBe(404)
  })
})

describe('описание', () => {
  const rows = { id: 3, description: 'старое', variants: [
    { attributes: { fullName: 'iPhone 17 Pro Max 256 (Япония)' } },
    { attributes: { fullName: 'iPhone 17 Pro Max 256 (Китай)' } },
  ] }

  it('пишет во ВСЕ строки товара и только потом в БД', async () => {
    pp.findUnique.mockResolvedValue(rows)
    const wb = vi.fn(async () => ({ missing: [] }))
    const r = await setProductDescription(ACTOR, 3, 'Новый текст', wb)
    expect(r.ok).toBe(true)
    expect(wb.mock.calls[0][0]).toHaveLength(2)
    expect(pp.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { description: 'Новый текст' } })
    expect(bump).toHaveBeenCalledWith('cache_version', expect.any(String))
  })

  it('лист недоступен → 503, БД не тронута', async () => {
    pp.findUnique.mockResolvedValue(rows)
    const r = await setProductDescription(ACTOR, 3, 'Текст', vi.fn(async () => { throw new Error('down') }))
    expect(r.status).toBe(503)
    expect(pp.update).not.toHaveBeenCalled()
    expect(bump).not.toHaveBeenCalled()
  })

  it('ни одной строки в листе → 409, БД не тронута', async () => {
    pp.findUnique.mockResolvedValue(rows)
    const wb = vi.fn(async () => ({ missing: ['a', 'b'] }))
    expect((await setProductDescription(ACTOR, 3, 'Текст', wb)).status).toBe(409)
    expect(pp.update).not.toHaveBeenCalled()
  })

  it('часть строк не нашлась — сохраняем и возвращаем список', async () => {
    pp.findUnique.mockResolvedValue(rows)
    const wb = vi.fn(async () => ({ missing: ['iphone 17 pro max 256 (китай)'] }))
    const r = await setProductDescription(ACTOR, 3, 'Текст', wb)
    expect(r.ok).toBe(true)
    expect((r.data as { missing: string[] }).missing).toHaveLength(1)
  })

  it('слишком длинный текст — 422 до всякой записи', async () => {
    pp.findUnique.mockResolvedValue(rows)
    const wb = vi.fn()
    expect((await setProductDescription(ACTOR, 3, 'а'.repeat(2001), wb)).status).toBe(422)
    expect(wb).not.toHaveBeenCalled()
  })

  it('пустой текст — законное «убрать описание»', async () => {
    pp.findUnique.mockResolvedValue(rows)
    const wb = vi.fn(async () => ({ missing: [] }))
    expect((await setProductDescription(ACTOR, 3, '   ', wb)).ok).toBe(true)
    expect(wb.mock.calls[0][0][0].description).toBe('')
  })
})
