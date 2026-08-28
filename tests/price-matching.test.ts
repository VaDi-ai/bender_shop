/**
 * Матчер прайса: строка либо точно ложится на один вариант, либо в «не узнал».
 * Фиксируем обе исторические дыры:
 * 1) contains смешивал братские модели («iPhone 17 Pro» попадал в «… Pro Max»);
 * 2) alias.productId без точного варианта размазывал цену на ВСЕ варианты.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    priceAlias: { findMany: vi.fn() },
    product: { findMany: vi.fn(), findUnique: vi.fn() },
    productVariant: { findUnique: vi.fn() },
    attrValueAlias: { findMany: vi.fn() },
  },
}))

import { prisma } from '../lib/prisma'
import { matchVariants, normalizeModelName, normalizeStorage, ParsedLine } from '../lib/price-matching'
import { ALIAS_SEED } from '../lib/sim-rules'

/* eslint-disable @typescript-eslint/no-explicit-any */
const alias = prisma.priceAlias.findMany as any
const findMany = prisma.product.findMany as any
const findProduct = prisma.product.findUnique as any
const findVariant = prisma.productVariant.findUnique as any
const attrAliases = prisma.attrValueAlias.findMany as any

// Матчер работает с реальным сидом словаря — тесты заодно проверяют его состав
const SEED_ALIASES = ALIAS_SEED.map(a => ({ attrKey: a.attrKey, rawNorm: a.raw.trim().toLowerCase(), canonical: a.canonical }))

const line = (over: Partial<ParsedLine> = {}): ParsedLine => ({
  model: 'iPhone 17 Pro', storage: '256GB', color: 'Silver', price: 122000,
  rawLine: 'iPhone 17 Pro 256 Silver - 122.000₽', ...over,
})

/**
 * Привязка, найденная по композитному ключу строки-фикстуры. Матчер тянет
 * ключи одним findMany и выбирает первый по точности — мок отдаёт список.
 */
const aliasHit = (over: Record<string, unknown>) =>
  [{ alias: 'iphone 17 pro 256gb silver', variantId: null, productId: null, isIgnored: false, ...over }]

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
  alias.mockReset(); alias.mockResolvedValue([])
  findMany.mockReset(); findMany.mockResolvedValue([])
  findProduct.mockReset(); findProduct.mockResolvedValue(null)
  findVariant.mockReset(); findVariant.mockResolvedValue(null)
  attrAliases.mockReset(); attrAliases.mockResolvedValue(SEED_ALIASES)
})

describe('поиск алиаса: ключи в порядке убывания точности', () => {
  const keysOf = () => alias.mock.calls[0][0].where.alias.in

  it('порядок ключей фиксирован: rawLine → композит с RAM → композит без RAM → модель', async () => {
    await matchVariants([line({ model: 'MacBook Air 13 M5', storage: '1TB', ram: '16GB', color: 'Midnight', rawLine: 'raw 1' })])
    expect(keysOf()).toEqual([
      'raw 1',
      'macbook air 13 m5 1tb 16gb midnight',
      'macbook air 13 m5 1tb midnight',
      'macbook air 13 m5',
    ])
  })

  it('RAM неизвестна → композит прежнего формата: ключи планшетов и часов живы', async () => {
    await matchVariants([line({ model: 'iPad 11', storage: '128GB', color: 'Silver', rawLine: 'raw 2' })])
    expect(keysOf()).toEqual(['raw 2', 'ipad 11 128gb silver', 'ipad 11'])
  })

  it('разная RAM — разные ключи: строка 24GB не подхватит привязку 16GB', async () => {
    await matchVariants([line({ model: 'MacBook Air 13 M5', storage: '1TB', ram: '24GB', color: 'Midnight', rawLine: 'raw 3' })])
    expect(keysOf()).toContain('macbook air 13 m5 1tb 24gb midnight')
    expect(keysOf()).not.toContain('macbook air 13 m5 1tb 16gb midnight')
  })

  it('точный ключ строки побеждает общий по модели — порядок выдачи БД больше не решает', async () => {
    // БД возвращает сначала общий ключ по модели: с findFirst({OR}) выиграл бы он
    alias.mockResolvedValue([
      { alias: 'iphone 17 pro', variantId: 11, productId: null, isIgnored: false },
      { alias: 'iphone 17 pro 256 silver - 122.000₽', variantId: 22, productId: null, isIgnored: false },
    ])
    findVariant.mockResolvedValue({
      id: 22, sku: 'sku-22', productId: 444, price: 90000,
      product: { id: 444, name: 'Iphone 17 Pro', brand: 'Apple', categoryId: 5 },
    })
    const { matched } = await matchVariants([line()])
    expect(matched.map(m => m.variantId)).toEqual([22])
  })

  it('композит с RAM побеждает композит без RAM', async () => {
    alias.mockResolvedValue([
      { alias: 'macbook air 13 m5 1tb midnight', variantId: 398, productId: null, isIgnored: false },
      { alias: 'macbook air 13 m5 1tb 24gb midnight', variantId: 410, productId: null, isIgnored: false },
    ])
    findVariant.mockResolvedValue({
      id: 410, sku: 'sku-410', productId: 448, price: 163000,
      product: { id: 448, name: 'Macbook Air M5', brand: 'Apple', categoryId: 20 },
    })
    const { matched } = await matchVariants([
      line({ model: 'MacBook Air 13 M5', storage: '1TB', ram: '24GB', color: 'Midnight', rawLine: 'свежая строка' }),
    ])
    expect(matched.map(m => m.variantId)).toEqual([410])
  })
})

describe('RAM сужает кандидатов', () => {
  const threeConfigs = () => catalog([product('Macbook Air M5', [
    variant({ RAM: '16GB', Память: '1TB', Цвет: 'Midnight' }),
    variant({ RAM: '24GB', Память: '1TB', Цвет: 'Midnight' }),
    variant({ RAM: '32GB', Память: '1TB', Цвет: 'Midnight' }),
  ])])
  const mbLine = (over = {}) => line({
    model: 'Macbook Air M5', storage: '1TB', color: 'Midnight',
    rawLine: 'MacBook Air 13 Midnight (M5, 24GB, 1TB) 163000', ...over,
  })

  it('RAM из прайса выбирает свою конфигурацию', async () => {
    threeConfigs()
    const { matched, unmatched } = await matchVariants([mbLine({ ram: '24GB' })])
    expect(unmatched).toEqual([])
    expect(matched).toHaveLength(1)
    expect((matched[0].parsed as any).ram).toBe('24GB')
    expect(matched[0].variantId).toBe(2) // второй вариант каталога — 24GB
  })

  it('без RAM в строке — три кандидата, честная очередь вместо случайного выбора', async () => {
    threeConfigs()
    const { matched, unmatched } = await matchVariants([mbLine()])
    expect(matched).toEqual([])
    expect(unmatched).toHaveLength(1)
  })

  it('RAM заявлена, а у варианта ключа RAM нет — не кандидат («не смог сверить» ≠ «совпало»)', async () => {
    catalog([product('Macbook Air M5', [variant({ Память: '1TB', Цвет: 'Midnight' })])])
    const { matched, unmatched } = await matchVariants([mbLine({ ram: '24GB' })])
    expect(matched).toEqual([])
    expect(unmatched).toHaveLength(1)
  })

  it('RAM в прайсе не указана — сверка по RAM не проводится, прежнее поведение', async () => {
    catalog([product('Macbook Air M5', [variant({ RAM: '16GB', Память: '1TB', Цвет: 'Midnight' })])])
    const { matched } = await matchVariants([mbLine()])
    expect(matched).toHaveLength(1)
  })

  it('формат RAM нормализуется: «16 GB» из прайса == «16GB» в каталоге', async () => {
    catalog([product('Macbook Air M5', [variant({ RAM: '16GB', Память: '1TB', Цвет: 'Midnight' })])])
    const { matched } = await matchVariants([mbLine({ ram: '16 GB' })])
    expect(matched).toHaveLength(1)
  })
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
    alias.mockResolvedValue(aliasHit({ id: 1, variantId: 77, productId: null, isIgnored: false }))
    findVariant.mockResolvedValue({
      id: 77, sku: 'sku-77', productId: 444, price: 90000,
      product: { id: 444, name: 'Iphone 17 Pro', brand: 'Apple', categoryId: 5 },
    })
    const { matched } = await matchVariants([line()])
    expect(matched.map(m => m.variantId)).toEqual([77])
  })

  it('alias.isIgnored — строка игнорируется', async () => {
    alias.mockResolvedValue(aliasHit({ id: 1, isIgnored: true }))
    const { ignored, matched, unmatched } = await matchVariants([line()])
    expect(ignored).toHaveLength(1)
    expect(matched).toEqual([]); expect(unmatched).toEqual([])
  })

  it('alias.productId + однозначный вариант — матч ровно на него', async () => {
    alias.mockResolvedValue(aliasHit({ id: 1, productId: 444, variantId: null, isIgnored: false }))
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
    alias.mockResolvedValue(aliasHit({ id: 1, productId: 444, variantId: null, isIgnored: false }))
    findProduct.mockResolvedValue(product('Iphone 17 Pro', [
      variant({ Память: '512GB', Цвет: 'Silver' }),
      variant({ Память: '1TB', Цвет: 'Silver' }),
    ], { id: 444 }))
    const { matched, unmatched } = await matchVariants([line()])
    expect(matched).toEqual([]) // раньше здесь было 2 «матча» — на все объёмы
    expect(unmatched).toHaveLength(1)
  })

  it('alias.productId с несколькими подходящими вариантами — тоже в очередь', async () => {
    alias.mockResolvedValue(aliasHit({ id: 1, productId: 444, variantId: null, isIgnored: false }))
    findProduct.mockResolvedValue(product('Iphone 17 Pro', [
      variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Япония' }),
      variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Гонконг' }),
    ], { id: 444 }))
    const { matched, unmatched } = await matchVariants([line()])
    expect(matched).toEqual([])
    expect(unmatched).toHaveLength(1)
  })
})

describe('страна разруливает неоднозначность', () => {
  const twoCountries = () => catalog([product('Iphone 17 Pro', [
    variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Япония', SIM: 'eSIM' }),
    variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Гонконг', SIM: '2 SIM' }),
  ], { id: 444 })])

  it.each(['HK', 'hk', '🇭🇰', 'Hong Kong', 'Гонконг'])('флаг/код/имя «%s» → один канон, уникальный Гонконг-вариант', async (raw) => {
    twoCountries()
    const { matched, unmatched } = await matchVariants([line({ country: raw })])
    expect(unmatched).toEqual([])
    expect(matched).toHaveLength(1)
    expect(matched[0].variantId).toBe(2) // Гонконг
  })

  it('страны нет в каталоге (EU → Европа) — очередь, не ближайшая', async () => {
    twoCountries()
    const { matched, unmatched } = await matchVariants([line({ country: 'EU' })])
    expect(matched).toEqual([])
    expect(unmatched).toHaveLength(1)
  })

  it('нераспознанная страна — не фильтр: неоднозначность остаётся, очередь', async () => {
    twoCountries()
    const { matched, unmatched } = await matchVariants([line({ country: 'KR' })])
    expect(matched).toEqual([])
    expect(unmatched).toHaveLength(1)
  })

  it('нераспознанная страна при единственном кандидате — матч как раньше', async () => {
    catalog([product('Iphone 17 Pro', [variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Япония' })], { id: 444 })])
    const { matched } = await matchVariants([line({ country: 'KR' })])
    expect(matched).toHaveLength(1)
  })

  it('страна противоречит единственному кандидату — очередь (жёсткий фильтр)', async () => {
    catalog([product('Iphone 17 Pro', [variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Япония' })], { id: 444 })])
    const { matched, unmatched } = await matchVariants([line({ country: 'HK' })])
    expect(matched).toEqual([])
    expect(unmatched).toHaveLength(1)
  })

  it('составная страна каталога («Япония/Индия») совпадает по части', async () => {
    catalog([product('Iphone 15', [variant({ Память: '128GB', Цвет: 'Blue', Страна: 'Япония/Индия' })], { id: 446 })])
    const { matched } = await matchVariants([
      line({ model: 'iPhone 15', storage: '128GB', color: 'Blue', country: 'IN', rawLine: 'iPhone 15 128 Blue 🇮🇳' }),
    ])
    expect(matched).toHaveLength(1)
  })

  it('alias.productId: страна разруливает варианты внутри товара', async () => {
    alias.mockResolvedValue(aliasHit({ id: 1, productId: 444, variantId: null, isIgnored: false }))
    findProduct.mockResolvedValue(product('Iphone 17 Pro', [
      variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Япония' }),
      variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Гонконг' }),
    ], { id: 444 }))
    const { matched } = await matchVariants([line({ country: '🇭🇰' })])
    expect(matched).toHaveLength(1)
    expect(matched[0].variantId).toBe(2)
  })
})

describe('SIM — вторичный дизамбигуатор', () => {
  it('страна не задана, SIM сужает двух кандидатов до одного', async () => {
    catalog([product('Iphone 16 Pro', [
      variant({ Память: '128GB', Цвет: 'Desert', Страна: 'Китай', SIM: '2 SIM' }),
      variant({ Память: '128GB', Цвет: 'Desert', Страна: 'Индия', SIM: 'eSIM' }),
    ], { id: 440 })])
    const { matched } = await matchVariants([
      line({ model: 'iPhone 16 Pro', storage: '128GB', color: 'Desert', simType: '2sim', rawLine: 'iPhone 16 Pro 128 Desert 2sim' }),
    ])
    expect(matched).toHaveLength(1)
    expect(matched[0].variantId).toBe(1) // 2 SIM
  })

  it('SIM не ветирует единственного кандидата после страны («1 Sim + eSim» у Гонконга)', async () => {
    catalog([product('Iphone 17 Pro', [
      variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Япония', SIM: 'eSIM' }),
      variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Гонконг', SIM: '2 SIM' }),
    ], { id: 444 })])
    // канон «SIM + eSIM» противоречит гонконгскому «2 SIM» — но страна уже дала ровно одного
    const { matched } = await matchVariants([line({ country: 'HK', simType: '1 Sim + eSim' })])
    expect(matched).toHaveLength(1)
    expect(matched[0].variantId).toBe(2)
  })

  it('SIM ни с кем не совпал — выбор не обнуляется, остаётся очередь', async () => {
    catalog([product('Iphone 17 Pro', [
      variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Япония', SIM: 'eSIM' }),
      variant({ Память: '256GB', Цвет: 'Silver', Страна: 'Гонконг', SIM: '2 SIM' }),
    ], { id: 444 })])
    const { matched, unmatched } = await matchVariants([line({ simType: '1 Sim + eSim' })])
    expect(matched).toEqual([])
    expect(unmatched).toHaveLength(1)
  })

  it('канонизация SIM каталога: «2Sim» в атрибутах == «2 sim» из прайса', async () => {
    catalog([product('Iphone 16 Pro Max', [
      variant({ Память: '1TB', Цвет: 'White', Страна: 'Гонконг', SIM: '2Sim' }),
      variant({ Память: '1TB', Цвет: 'White', Страна: 'Индия', SIM: 'eSIM' }),
    ], { id: 441 })])
    const { matched } = await matchVariants([
      line({ model: 'iPhone 16 Pro Max', storage: '1TB', color: 'White', simType: '2 Sim', rawLine: 'iPhone 16 Pro Max 1TB White 2 Sim' }),
    ])
    expect(matched).toHaveLength(1)
    expect(matched[0].variantId).toBe(1)
  })
})

describe('пусто — в очередь', () => {
  it('товар не найден вовсе', async () => {
    catalog([])
    const { unmatched } = await matchVariants([line({ model: 'Pixel 12' })])
    expect(unmatched).toHaveLength(1)
  })
})
