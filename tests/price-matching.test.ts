/**
 * Матчер прайса: строка либо точно ложится на один вариант, либо в «не узнал».
 * Фиксируем обе исторические дыры:
 * 1) contains смешивал братские модели («iPhone 17 Pro» попадал в «… Pro Max»);
 * 2) alias.productId без точного варианта размазывал цену на ВСЕ варианты.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    priceAlias: { findFirst: vi.fn() },
    product: { findMany: vi.fn(), findUnique: vi.fn() },
    productVariant: { findUnique: vi.fn() },
  },
}))

import { prisma } from '../lib/prisma'
import { matchVariants, normalizeModelName, normalizeStorage, ParsedLine } from '../lib/price-matching'

/* eslint-disable @typescript-eslint/no-explicit-any */
const alias = prisma.priceAlias.findFirst as any
const findMany = prisma.product.findMany as any
const findProduct = prisma.product.findUnique as any
const findVariant = prisma.productVariant.findUnique as any

const line = (over: Partial<ParsedLine> = {}): ParsedLine => ({
  model: 'iPhone 17 Pro', storage: '256GB', color: 'Silver', price: 122000,
  rawLine: 'iPhone 17 Pro 256 Silver - 122.000₽', ...over,
})

let vid = 0
const variant = (attrs: Record<string, string>, over: Record<string, unknown> = {}) => ({
  id: ++vid, sku: `sku-${vid}`, productId: 1, price: 100000, attributes: attrs, ...over,
})
const product = (name: string, variants: ReturnType<typeof variant>[], over: Record<string, unknown> = {}) => ({
  id: 1, name, brand: 'Apple', categoryId: 5, variants, ...over,
})

// эмуляция contains(model, insensitive) — как предвыборка в проде
const catalog = (products: ReturnType<typeof product>[]) => {
  findMany.mockImplementation(({ where }: any) =>
    Promise.resolve(products.filter(p => p.name.toLowerCase().includes(where.name.contains.toLowerCase()))))
}

beforeEach(() => {
  vid = 0
  alias.mockReset(); alias.mockResolvedValue(null)
  findMany.mockReset(); findMany.mockResolvedValue([])
  findProduct.mockReset(); findProduct.mockResolvedValue(null)
  findVariant.mockReset(); findVariant.mockResolvedValue(null)
})

describe('точное имя модели вместо contains', () => {
  it('«iPhone 17 Pro» не липнет к «Iphone 17 Pro Max» — каждая строка на свой товар', async () => {
    const pro = product('Iphone 17 Pro', [variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Япония' })], { id: 444 })
    const proMax = product('Iphone 17 Pro Max', [variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Япония' })], { id: 445 })
    catalog([proMax, pro]) // Pro Max первым — раньше он и забирал строку

    const { matched, unmatched } = await matchVariants([
      line(),
      line({ model: 'iPhone 17 Pro Max', rawLine: 'iPhone 17 Pro Max 256 Silver' }),
    ])
    expect(unmatched).toEqual([])
    expect(matched.map(m => m.productId)).toEqual([444, 445])
  })

  it('регистр/пробелы/ё не мешают равенству имён', () => {
    expect(normalizeModelName('  iPhone   17  Pro ')).toBe(normalizeModelName('IPHONE 17 PRO'))
    expect(normalizeModelName('Плёнка')).toBe(normalizeModelName('Пленка'))
  })

  it('дубль товара с теми же именем, но без вариантов, однозначности не ломает', async () => {
    catalog([
      product('Iphone 17 Pro', [variant({ Память: '256GB', Цвет: 'Silver' })], { id: 444 }),
      product('Iphone 17 Pro', [], { id: 20 }),
    ])
    const { matched, unmatched } = await matchVariants([line()])
    expect(unmatched).toEqual([])
    expect(matched[0].productId).toBe(444)
  })

  it('два РАЗНЫХ товара с подходящими вариантами — неоднозначность, в очередь', async () => {
    catalog([
      product('Iphone 17 Pro', [variant({ Память: '256GB', Цвет: 'Silver' })], { id: 444 }),
      product('Iphone 17 Pro', [variant({ Память: '256GB', Цвет: 'Silver' })], { id: 664 }),
    ])
    const { matched, unmatched } = await matchVariants([line()])
    expect(matched).toEqual([])
    expect(unmatched).toHaveLength(1)
  })
})

describe('память/цвет — только по ключам «Память»/«Цвет»', () => {
  it('«256GB» из парсера совпадает с атрибутом «256GB» независимо от регистра, «256» — тоже', () => {
    expect(normalizeStorage('256GB')).toBe(normalizeStorage('256gb'))
    expect(normalizeStorage('256')).toBe(normalizeStorage('256GB'))
    expect(normalizeStorage('1TB')).not.toBe(normalizeStorage('1GB'))
  })

  it('подстрока в fullName/Стране не считается совпадением памяти', async () => {
    // fullName содержит «256», но реальная Память=512GB — раньше includes совпадал
    catalog([product('Iphone 17 Pro', [
      variant({ fullName: 'iPhone 17 Pro 256GB Silver (Япония)', Память: '512GB', Цвет: 'Silver' }),
    ], { id: 444 })])
    const { matched, unmatched } = await matchVariants([line()])
    expect(matched).toEqual([])
    expect(unmatched).toHaveLength(1)
  })

  it('цвет — точное равенство, не подстрока', async () => {
    catalog([product('Iphone 17 Pro', [variant({ Память: '256GB', Цвет: 'Silver Titanium' })], { id: 444 })])
    const { matched, unmatched } = await matchVariants([line({ color: 'Silver' })])
    expect(matched).toEqual([])
    expect(unmatched).toHaveLength(1)
  })

  it('вариант без ключа «Память» при заявленной памяти — не кандидат', async () => {
    catalog([product('Iphone 17 Pro', [variant({ Цвет: 'Silver' })], { id: 444 })])
    const { unmatched } = await matchVariants([line()])
    expect(unmatched).toHaveLength(1)
  })

  it('одинаковые память+цвет в разных странах — неоднозначность, в очередь', async () => {
    catalog([product('Iphone 17 Pro', [
      variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Япония', SIM: 'eSIM' }),
      variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Гонконг', SIM: '2 SIM' }),
    ], { id: 444 })])
    const { matched, unmatched } = await matchVariants([line()])
    expect(matched).toEqual([])
    expect(unmatched).toHaveLength(1)
  })
})

describe('алиасы', () => {
  it('alias.variantId — прямое попадание, как раньше', async () => {
    alias.mockResolvedValue({ id: 1, variantId: 77, productId: null, isIgnored: false })
    findVariant.mockResolvedValue({
      id: 77, sku: 'sku-77', productId: 444, price: 90000,
      product: { id: 444, name: 'Iphone 17 Pro', brand: 'Apple', categoryId: 5 },
    })
    const { matched } = await matchVariants([line()])
    expect(matched.map(m => m.variantId)).toEqual([77])
  })

  it('alias.isIgnored — строка игнорируется', async () => {
    alias.mockResolvedValue({ id: 1, isIgnored: true })
    const { ignored, matched, unmatched } = await matchVariants([line()])
    expect(ignored).toHaveLength(1)
    expect(matched).toEqual([]); expect(unmatched).toEqual([])
  })

  it('alias.productId + однозначный вариант — матч ровно на него', async () => {
    alias.mockResolvedValue({ id: 1, productId: 444, variantId: null, isIgnored: false })
    findProduct.mockResolvedValue(product('Iphone 17 Pro', [
      variant({ Память: '256GB', Цвет: 'Silver' }),
      variant({ Память: '512GB', Цвет: 'Silver' }),
    ], { id: 444 }))
    const { matched, unmatched } = await matchVariants([line()])
    expect(unmatched).toEqual([])
    expect(matched).toHaveLength(1)
    expect((matched[0].parsed.storage)).toBe('256GB')
  })

  it('alias.productId БЕЗ точного варианта — в очередь, а не на все варианты', async () => {
    alias.mockResolvedValue({ id: 1, productId: 444, variantId: null, isIgnored: false })
    findProduct.mockResolvedValue(product('Iphone 17 Pro', [
      variant({ Память: '512GB', Цвет: 'Silver' }),
      variant({ Память: '1TB', Цвет: 'Silver' }),
    ], { id: 444 }))
    const { matched, unmatched } = await matchVariants([line()])
    expect(matched).toEqual([]) // раньше здесь было 2 «матча» — на все объёмы
    expect(unmatched).toHaveLength(1)
  })

  it('alias.productId с несколькими подходящими вариантами — тоже в очередь', async () => {
    alias.mockResolvedValue({ id: 1, productId: 444, variantId: null, isIgnored: false })
    findProduct.mockResolvedValue(product('Iphone 17 Pro', [
      variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Япония' }),
      variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Гонконг' }),
    ], { id: 444 }))
    const { matched, unmatched } = await matchVariants([line()])
    expect(matched).toEqual([])
    expect(unmatched).toHaveLength(1)
  })
})

describe('пусто — в очередь', () => {
  it('товар не найден вовсе', async () => {
    catalog([])
    const { unmatched } = await matchVariants([line({ model: 'Pixel 12' })])
    expect(unmatched).toHaveLength(1)
  })
})
