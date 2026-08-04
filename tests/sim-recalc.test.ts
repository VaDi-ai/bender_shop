/**
 * PR-B — предпросмотр пересчёта SIM на снимке боевого каталога.
 *
 * Снимок собран с прода до матрицы владельца 2026-08; ожидания пересчитаны
 * под неё: Япония-17 и США теперь «eSIM + eSIM», Гонконг с 17-го — «SIM +
 * eSIM» (смена смысла), а Россия и Казахстан из сида выпали — их строки с
 * проставленным SIM уходят в «наследие» (стоит без правила, не трогаем).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/prisma', () => ({ prisma: {} }))
vi.mock('../lib/security-log', () => ({ logSecurityEvent: vi.fn() }))

import { buildPreview, buildSimQueue, isPhone, isStorefrontVisible, VariantRow } from '../lib/sim-recalc'
import { SIM_SEED, ALIAS_SEED, SimRuleData, AttrAliasData } from '../lib/sim-rules'
import { ownerOnly, AdminRequest } from '../api/admin'
import type { Response, NextFunction } from 'express'

const norm = (s: string) => s.trim().toLowerCase()

/** Тот же сид, что уходит в БД, но в памяти — тест не ходит в базу. */
const RULES: SimRuleData[] = SIM_SEED.map((r, i) => ({
  id: i + 1,
  country: r.country ?? null,
  countryNorm: r.country ? norm(r.country) : '',
  brandNorm: r.brand ? norm(r.brand) : '',
  modelMatch: r.modelMatch ?? '',
  modelGenFrom: r.modelGenFrom ?? 0,
  simType: r.simType,
  source: 'seed',
}))

const ALIASES: AttrAliasData[] = ALIAS_SEED.map(a => ({
  attrKey: a.attrKey, rawNorm: norm(a.raw), canonical: a.canonical,
}))

/** Снимок каталога: страна, текущая метка SIM, поколение, количество строк. */
const SNAPSHOT: Array<[string, string | null, number, number]> = [
  // ── меняется СМЫСЛ (144) ───────────────────────────────────────────────
  ['Индия', 'eSIM', 17, 60],          // Индия — гибрид во всех поколениях
  ['ОАЭ', 'eSIM', 16, 2],             // 16-е — гибрид (eSIM+eSIM только с 17-го)
  ['Европа', 'eSIM', 17, 1],
  ['Япония', 'eSIM', 16, 1],          // 16-е — гибрид
  ['Южная Корея', 'eSIM', 17, 1],
  ['Япония', 'eSIM', 17, 48],         // с 17-го Япония — ДВЕ eSIM, одной мало
  ['Гонконг', '2 SIM', 17, 21],       // с 17-го Гонконг — SIM + eSIM
  ['Гонконг', '2Sim', 17, 1],         // та же смена смысла, метка кривая
  ['США', 'eSIM', 17, 9],             // США — eSIM + eSIM (все поколения)
  // ── меняется только МЕТКА (2) ──────────────────────────────────────────
  ['Китай', '2Sim', 17, 2],
  // ── SIM не было вовсе: проставляем впервые (5) ─────────────────────────
  ['Сингапур', null, 17, 3],
  ['Бразилия', null, 16, 2],
  // ── наследие: значение стоит, правила нет (30) ─────────────────────────
  ['Индия/Япония', 'eSIM', 15, 2],    // составная страна
  ['Россия', 'SIM + eSIM', 17, 16],   // Россия выпала из матрицы владельца
  ['Казахстан', 'SIM + eSIM', 17, 12], // Казахстан тоже
  // ── не меняется ничего (контроль) ──────────────────────────────────────
  ['ОАЭ', 'SIM + eSIM', 16, 23],
  ['Индия', 'SIM + eSIM', 17, 4],
]

let nextId = 0
function variantsFromSnapshot(): VariantRow[] {
  const out: VariantRow[] = []
  for (const [country, sim, gen, count] of SNAPSHOT) {
    for (let i = 0; i < count; i++) {
      const fullName = `iPhone ${gen} Pro 256 (${country})`
      out.push({
        id: ++nextId,
        attributes: { fullName, 'Страна': country, ...(sim ? { SIM: sim } : {}) },
        product: { name: `Iphone ${gen} Pro`, brand: 'Apple', category: { name: 'Телефоны' } },
      })
    }
  }
  return out
}

describe('предпросмотр пересчёта SIM на снимке каталога', () => {
  const preview = buildPreview(variantsFromSnapshot(), RULES, ALIASES)

  it('четыре раздела: 144 смысла / 5 впервые / 2 метки / 30 наследий', () => {
    expect(preview.counts).toEqual({ semantic: 144, added: 5, canonical: 2, inherited: 30, manual: 0 })
  })

  it('пустые НЕ попадают в «сменят значение» — это отдельный бакет added', () => {
    expect(preview.semantic.every(r => r.from !== '—')).toBe(true)
    expect(preview.added.every(r => r.from === '—')).toBe(true)
    expect(preview.addedByCountry).toEqual({ 'Сингапур': 3, 'Бразилия': 2 })
  })

  it('сумма изменяемых = semantic + added + canonical, наследие вне её', () => {
    const changeable = preview.semantic.length + preview.added.length + preview.canonical.length
    expect(changeable).toBe(151)
    const ids = new Set([...preview.semantic, ...preview.added, ...preview.canonical].map(r => r.variantId))
    expect(ids.size).toBe(changeable)                                    // пересечений между бакетами нет
    for (const r of preview.inherited) expect(ids.has(r.variantId)).toBe(false)
  })

  it('смысловые смены разложены по странам (матрица владельца)', () => {
    expect(preview.byCountry).toEqual({ 'Индия': 60, 'ОАЭ': 2, 'Европа': 1, 'Япония': 49, 'Южная Корея': 1, 'Гонконг': 22, 'США': 9 })
  })

  it('новое значение «eSIM + eSIM» доезжает до пересчёта', () => {
    const japan17 = preview.semantic.filter(r => r.country === 'Япония')
    expect(japan17.some(r => r.to === 'eSIM + eSIM')).toBe(true)
    expect(preview.semantic.filter(r => r.country === 'США').every(r => r.to === 'eSIM + eSIM')).toBe(true)
  })

  it('косметика отделена от смысла: «2Sim» → «2 SIM», значение то же', () => {
    for (const r of preview.canonical) {
      expect(r.from).toBe('2Sim')
      expect(r.to).toBe('2 SIM')
    }
  })

  it('наследие — составная страна и выпавшие из матрицы, в изменяемые не попали', () => {
    expect(new Set(preview.inherited.map(r => r.country))).toEqual(new Set(['Индия/Япония', 'Россия', 'Казахстан']))
    const changing = [...preview.semantic, ...preview.canonical].map(r => r.country)
    for (const c of ['Индия/Япония', 'Россия', 'Казахстан']) expect(changing).not.toContain(c)
  })

  it('уже верные строки не попадают ни в один раздел', () => {
    const touched = [...preview.semantic, ...preview.added, ...preview.canonical, ...preview.inherited].length
    expect(touched).toBe(181)                   // 144 + 5 + 2 + 30, остальные 27 строк чистые
  })

  it('аксессуары и не-телефоны словарь не трогает', () => {
    const p = buildPreview([
      { id: 9001, attributes: { fullName: 'Чехол Apple для iPhone 17 Pro', 'Страна': 'Индия', SIM: 'eSIM' }, product: { name: 'Чехол Apple', brand: 'Apple', category: { name: 'Аксессуары' } } },
      { id: 9002, attributes: { fullName: 'Apple Mac Mini M4 (Индия)', 'Страна': 'Индия' }, product: { name: 'Apple Mac Mini M4', brand: 'Apple', category: { name: 'Mac' } } },
    ], RULES, ALIASES)
    expect(p.counts).toEqual({ semantic: 0, added: 0, canonical: 0, inherited: 0, manual: 0 })
  })

  it('iPhone Air — модельный оверрайд сильнее страны', () => {
    const p = buildPreview([
      { id: 9003, attributes: { fullName: 'iPhone 17 Air 256 (Индия)', 'Страна': 'Индия', SIM: 'SIM + eSIM' }, product: { name: 'Iphone 17 Air', brand: 'Apple', category: { name: 'Телефоны' } } },
    ], RULES, ALIASES)
    expect(p.semantic).toHaveLength(1)
    expect(p.semantic[0]).toMatchObject({ to: 'eSIM', by: 'model' })
  })
})

describe('очередь обучения и пересчёт смотрят на каталог одинаково', () => {
  // Категория пишется в таблице свободно: «Телефоны», «Смартфоны Xiaomi»…
  const android = (id: number, cat: string, brand: string, country: string, name: string, sim?: string): VariantRow => ({
    id,
    attributes: { fullName: name, 'Страна': country, ...(sim ? { SIM: sim } : {}) },
    product: { name, brand, category: { name: cat } },
  })

  const rows: VariantRow[] = [
    android(1, 'Телефоны', 'Xiaomi', 'Казахстан', 'Redmi Note 14 Pro+ 5G 12/256 Black'),
    android(2, 'Смартфоны Xiaomi', 'Poco', 'Европа', 'Poco F6 5G 12/512 Green'),
    android(3, 'Мобильные телефоны', 'Honor', 'Россия', 'Honor X8d 8/128 Gray'),
  ]

  it('вариант, который пересчёт считает телефоном, виден и в очереди', () => {
    for (const v of rows) expect(isPhone(v)).toBe(true)           // признак один и тот же
    const q = buildSimQueue(rows, RULES, ALIASES)
    const seen = q.missing.flatMap(m => Array(m.count).fill(`${m.brand}|${m.country}`))
    expect(seen).toHaveLength(rows.length)                        // ни одна строка не потерялась
    expect(q.missing.map(m => m.brand).sort()).toEqual(['Honor', 'Poco', 'Xiaomi'])
  })

  it('очередь группирует по связке «бренд + страна», а не по одной стране', () => {
    const q = buildSimQueue([
      ...rows,
      android(4, 'Телефоны', 'Xiaomi', 'Казахстан', 'Redmi Note 14S 4G 8/256 Blue'),
    ], RULES, ALIASES)
    const xiaomi = q.missing.find(m => m.brand === 'Xiaomi')
    expect(xiaomi).toMatchObject({ country: 'Казахстан', count: 2 })
  })

  it('строка с уже проставленным SIM идёт не в «не узнал», а в «стоит без правила»', () => {
    const q = buildSimQueue([android(5, 'Смартфоны', 'Honor', 'Россия', 'Honor 400 Pro', 'eSIM')], RULES, ALIASES)
    expect(q.missing).toHaveLength(0)
    expect(q.inherited[0]).toMatchObject({ variantId: 5, current: 'eSIM', brand: 'Honor' })
  })

  it('Apple по-прежнему резолвится словарём и в очередь не попадает', () => {
    const q = buildSimQueue([{
      id: 6,
      attributes: { fullName: 'iPhone 17 Pro 256 (Индия)', 'Страна': 'Индия', SIM: 'eSIM' },
      product: { name: 'Iphone 17 Pro', brand: 'Apple', category: { name: 'Телефоны' } },
    }], RULES, ALIASES)
    expect(q.missing).toHaveLength(0)
    expect(q.inherited).toHaveLength(0)
  })

  it('счётчик для «Сегодня» считает только видимое покупателю', () => {
    const phone = (id: number, vis: { isAvailable: boolean; inStock: boolean; quantity: number }): VariantRow => ({
      id,
      attributes: { fullName: `Redmi Note ${id} 8/256`, 'Страна': 'Европа' },
      inStock: vis.inStock, quantity: vis.quantity,
      product: { name: `Redmi Note ${id}`, brand: 'Xiaomi', isAvailable: vis.isAvailable, category: { name: 'Смартфоны' } },
    })
    const rows = [
      phone(1, { isAvailable: true, inStock: true, quantity: 3 }),    // видно
      phone(2, { isAvailable: true, inStock: true, quantity: 0 }),    // остаток 0
      phone(3, { isAvailable: true, inStock: false, quantity: 5 }),   // не в наличии
      phone(4, { isAvailable: false, inStock: true, quantity: 5 }),   // товар скрыт
    ]
    const q = buildSimQueue(rows, RULES, ALIASES)
    expect(q.missing[0]).toMatchObject({ brand: 'Xiaomi', count: 4, visible: 1 })
    expect(q.visibleMissing).toBe(1)                 // алерт на «Сегодня» покажет 1, а не 4
    expect(rows.map(isStorefrontVisible)).toEqual([true, false, false, false])
  })

  it('скрытые дубли без правила в алерт не попадают вовсе', () => {
    const hidden: VariantRow = {
      id: 10,
      attributes: { fullName: 'Poco F6 5G 12/512 Green', 'Страна': 'Европа' },
      inStock: false, quantity: 0,
      product: { name: 'Poco F6', brand: 'Poco', isAvailable: false, category: { name: 'Смартфоны' } },
    }
    const q = buildSimQueue([hidden], RULES, ALIASES)
    expect(q.missing).toHaveLength(1)     // в очереди на «Товарах» строка есть
    expect(q.visibleMissing).toBe(0)      // а тревоги на «Сегодня» нет
  })

  it('не-телефоны в очередь не попадают', () => {
    const q = buildSimQueue([{
      id: 7,
      attributes: { fullName: 'Apple Mac Mini M4 (Индия)', 'Страна': 'Индия' },
      product: { name: 'Apple Mac Mini M4', brand: 'Apple', category: { name: 'Mac' } },
    }], RULES, ALIASES)
    expect(q.missing).toHaveLength(0)
  })
})

describe('owner-гейт на применении и откате', () => {
  function res() {
    const r: Partial<Response> & { statusCode?: number; body?: unknown } = {}
    r.status = vi.fn((c: number) => { r.statusCode = c; return r as Response })
    r.json = vi.fn((b: unknown) => { r.body = b; return r as Response })
    return r as Response & { statusCode?: number; body?: unknown }
  }

  it('manager получает 403 и дальше не проходит', () => {
    const req = { admin: { telegramId: '77', role: 'manager', name: null } } as unknown as AdminRequest
    const r = res(); const next = vi.fn() as NextFunction
    ownerOnly(req, r, next)
    expect(r.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('owner проходит', () => {
    const req = { admin: { telegramId: '1', role: 'owner', name: null } } as unknown as AdminRequest
    const r = res(); const next = vi.fn() as NextFunction
    ownerOnly(req, r, next)
    expect(next).toHaveBeenCalled()
    expect(r.statusCode).toBeUndefined()
  })
})
