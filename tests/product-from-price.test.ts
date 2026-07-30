/**
 * Заведение товара из очереди «не узнал»: всегда СКРЫТЫМ, цена на витрину не
 * пишется, страна — только канон словаря, SIM — явный канон или вывод
 * resolveSimType (не выдумываем), алиас учится существующим путём.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    supplierPrice: { findUnique: vi.fn() },
    category: { upsert: vi.fn() },
    product: { create: vi.fn() },
    productVariant: { create: vi.fn() },
    simRule: { findMany: vi.fn() },
    attrValueAlias: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/price-alias', () => ({ linkSupplierPriceRow: vi.fn() }))

import { prisma } from '../lib/prisma'
import { logAdminAction } from '../lib/audit'
import { linkSupplierPriceRow } from '../lib/price-alias'
import { createProductFromPriceRow, detectCategoryFromName } from '../lib/product-from-price'
import { ALIAS_SEED } from '../lib/sim-rules'

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = prisma as any
const link = linkSupplierPriceRow as any

const SEED_ALIASES = ALIAS_SEED.map(a => ({ attrKey: a.attrKey, rawNorm: a.raw.trim().toLowerCase(), canonical: a.canonical }))

const row = (over: Record<string, unknown> = {}) => ({
  id: 501, variantId: null, model: 'iPhone 17 Pro', storage: '256GB', color: 'Silver',
  country: 'EU', simType: '1 Sim + eSim', price: 122500,
  rawMessage: 'iPhone 17 Pro 256 Silver 🇪🇺 1 Sim + eSim - 122.500₽', ...over,
})

beforeEach(() => {
  p.supplierPrice.findUnique.mockReset()
  p.category.upsert.mockReset().mockResolvedValue({ id: 7, name: 'Телефоны' })
  p.product.create.mockReset().mockImplementation(({ data }: any) => Promise.resolve({ id: 900, ...data }))
  p.productVariant.create.mockReset().mockImplementation(({ data }: any) => Promise.resolve({ id: 9001, ...data }))
  p.simRule.findMany.mockReset().mockResolvedValue([])
  p.attrValueAlias.findMany.mockReset().mockResolvedValue(SEED_ALIASES)
  p.$transaction.mockReset().mockImplementation((fn: any) => fn(p))
  link.mockReset().mockResolvedValue({ ok: true, status: 200, aliases: ['a', 'b'], rematched: 1 })
  ;(logAdminAction as any).mockReset()
})

describe('ограды заведения', () => {
  it('товар всегда скрытый, цены нет, атрибуты из строки, страна канонизирована', async () => {
    p.supplierPrice.findUnique.mockResolvedValue(row())
    const r = await createProductFromPriceRow({ supplierPriceId: 501, actor: { telegramId: '1' } })
    expect(r.ok).toBe(true); expect(r.status).toBe(201)

    const prod = p.product.create.mock.calls[0][0].data
    expect(prod.isAvailable).toBe(false)
    expect(prod.price).toBe(0)
    expect(prod.name).toBe('iPhone 17 Pro')
    expect(prod.brand).toBe('Apple')
    expect(prod.attributes).toEqual({ 'Память': ['256GB'], 'Цвет': ['Silver'], 'Страна': ['Европа'], 'SIM': ['SIM + eSIM'] })

    const varnt = p.productVariant.create.mock.calls[0][0].data
    expect(varnt.inStock).toBe(false)
    expect(varnt.price).toBe(0)
    expect(varnt.quantity).toBe(0)
    expect(varnt.costPrice).toBeUndefined() // закупку не фиксируем — придёт через apply
    expect(varnt.attributes).toMatchObject({ 'Память': '256GB', 'Цвет': 'Silver', 'Страна': 'Европа', 'SIM': 'SIM + eSIM' })
    expect(varnt.attributes.fullName).toBe('iPhone 17 Pro 256GB Silver (Европа)')
  })

  it('алиас учится существующим linkSupplierPriceRow на новый вариант', async () => {
    p.supplierPrice.findUnique.mockResolvedValue(row())
    const r = await createProductFromPriceRow({ supplierPriceId: 501, actor: { telegramId: '1' } })
    expect(link).toHaveBeenCalledWith({ supplierPriceId: 501, variantId: 9001, actor: { telegramId: '1' } })
    expect(r.rematched).toBe(1)
    expect(r.aliases).toEqual(['a', 'b'])
  })

  it('AuditLog: create Product с атрибутами и источником-строкой', async () => {
    p.supplierPrice.findUnique.mockResolvedValue(row())
    await createProductFromPriceRow({ supplierPriceId: 501, actor: { telegramId: '42' } })
    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      adminTelegramId: '42', action: 'create', entity: 'Product', entityId: 900,
      after: expect.objectContaining({ isAvailable: false, fromSupplierPriceId: 501 }),
    }))
  })

  it('строка уже привязана → 409, ничего не создаём', async () => {
    p.supplierPrice.findUnique.mockResolvedValue(row({ variantId: 333 }))
    const r = await createProductFromPriceRow({ supplierPriceId: 501, actor: { telegramId: '1' } })
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(p.product.create).not.toHaveBeenCalled()
  })

  it('строки нет → 404', async () => {
    p.supplierPrice.findUnique.mockResolvedValue(null)
    const r = await createProductFromPriceRow({ supplierPriceId: 999, actor: { telegramId: '1' } })
    expect(r).toMatchObject({ ok: false, status: 404 })
  })
})

describe('страна и SIM — не выдумываем', () => {
  it('нераспознанная страна → атрибут «Страна» не ставится', async () => {
    p.supplierPrice.findUnique.mockResolvedValue(row({ country: 'MARS' }))
    await createProductFromPriceRow({ supplierPriceId: 501, actor: { telegramId: '1' } })
    const prod = p.product.create.mock.calls[0][0].data
    expect(prod.attributes['Страна']).toBeUndefined()
  })

  it('SIM нет в строке — до-выводится правилом (Гонконг+Apple → 2 SIM)', async () => {
    p.supplierPrice.findUnique.mockResolvedValue(row({ country: 'HK', simType: null }))
    p.simRule.findMany.mockResolvedValue([
      { id: 1, country: 'Гонконг', countryNorm: 'гонконг', brandNorm: 'apple', modelMatch: '', modelGenFrom: 0, simType: '2 SIM', source: 'seed' },
    ])
    await createProductFromPriceRow({ supplierPriceId: 501, actor: { telegramId: '1' } })
    const varnt = p.productVariant.create.mock.calls[0][0].data
    expect(varnt.attributes['Страна']).toBe('Гонконг')
    expect(varnt.attributes['SIM']).toBe('2 SIM')
  })

  it('SIM нет и правила нет → атрибут SIM не ставится', async () => {
    p.supplierPrice.findUnique.mockResolvedValue(row({ country: 'MARS', simType: null }))
    await createProductFromPriceRow({ supplierPriceId: 501, actor: { telegramId: '1' } })
    const varnt = p.productVariant.create.mock.calls[0][0].data
    expect(varnt.attributes['SIM']).toBeUndefined()
  })
})

describe('категория по имени', () => {
  it('iPhone → Телефоны; неизвестное → null (в заведении станет «Другое»)', () => {
    expect(detectCategoryFromName('iPhone 17 Pro')).toBe('Телефоны')
    expect(detectCategoryFromName('Штука непонятная')).toBeNull()
  })
})
