/**
 * Обучение от исправлений. Главное, что проверяем: в словарь ничего не уходит
 * молча, паттерн считается по НОРМАЛИЗОВАННОМУ ключу (бренд, страна, атрибут),
 * а шум (мало повторов, противоречия, пустой ключ, конфликт) правилом не
 * становится.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    auditLog: { findMany: vi.fn() },
    productVariant: { findMany: vi.fn() },
    simRule: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    attrValueAlias: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn(), delete: vi.fn() },
  },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))

import { prisma } from '../lib/prisma'
import { detectPatterns, ripePatterns, isRipe, patternKey, rulePhrase, learnRule, learnAlias, forgetRule, REPEATS_REQUIRED } from '../lib/rule-learning'

/* eslint-disable @typescript-eslint/no-explicit-any */
const audit = prisma.auditLog as any
const pv = prisma.productVariant as any
const sim = prisma.simRule as any
const alias = prisma.attrValueAlias as any
const ACTOR = '900'

const edit = (variantId: number, attr = 'SIM', value = '2 SIM') => ({
  entityId: String(variantId), after: { [attr]: value, overrides: [attr] },
})
const variant = (id: number, brand: string | null, country: string | null) => ({
  id, attributes: country ? { 'Страна': country } : {}, product: { brand },
})

beforeEach(() => {
  ;[audit.findMany, pv.findMany, sim.findMany, sim.findUnique, sim.upsert, sim.delete,
    alias.findMany, alias.findUnique, alias.upsert, alias.delete].forEach(f => f.mockReset())
  sim.findMany.mockResolvedValue([]); alias.findMany.mockResolvedValue([])
  sim.findUnique.mockResolvedValue(null); alias.findUnique.mockResolvedValue(null)
  sim.upsert.mockResolvedValue({ id: 42 }); alias.upsert.mockResolvedValue({ id: 43 })
  alias.create.mockReset(); alias.create.mockResolvedValue({ id: 44 })
})

describe('ключ паттерна нормализованный, а не сырой текст', () => {
  it('регистр и пробелы в бренде/стране не создают разные ключи', () => {
    expect(patternKey({ attr: 'SIM', brand: ' Redmi ', country: 'ИНДИЯ' }))
      .toBe(patternKey({ attr: 'SIM', brand: 'redmi', country: 'Индия' }))
  })
  it('разные атрибуты — разные ключи', () => {
    expect(patternKey({ attr: 'SIM', brand: 'Redmi', country: 'Индия' }))
      .not.toBe(patternKey({ attr: 'Цвет', brand: 'Redmi', country: 'Индия' }))
  })
  it('формулировка человеческая', () => {
    // без склонений: «из Индия» читалось бы как ошибка
    expect(rulePhrase({ attr: 'SIM', brand: 'Apple', country: 'Индия', value: 'SIM + eSIM' }))
      .toBe('Все Apple · Индия → SIM: SIM + eSIM')
    expect(rulePhrase({ attr: 'Цвет', brand: null, country: 'Китай', value: 'Полночный' }))
      .toBe('Все Китай → Цвет: Полночный')
  })
})

describe('детектор повторов', () => {
  it('три одинаковые правки → предложение', async () => {
    audit.findMany.mockResolvedValue([edit(1), edit(2), edit(3)])
    pv.findMany.mockResolvedValue([variant(1, 'Redmi', 'Индия'), variant(2, 'Redmi', 'Индия'), variant(3, 'Redmi', 'Индия')])
    const ripe = await ripePatterns()
    expect(ripe).toHaveLength(1)
    expect(ripe[0]).toMatchObject({ attr: 'SIM', brand: 'Redmi', country: 'Индия', value: '2 SIM', count: 3 })
    expect(REPEATS_REQUIRED).toBe(3)
  })

  it('двух правок мало — молчим', async () => {
    audit.findMany.mockResolvedValue([edit(1), edit(2)])
    pv.findMany.mockResolvedValue([variant(1, 'Redmi', 'Индия'), variant(2, 'Redmi', 'Индия')])
    expect(await ripePatterns()).toEqual([])
  })

  it('противоречивые правки одной связки правилом не становятся', async () => {
    audit.findMany.mockResolvedValue([edit(1, 'SIM', '2 SIM'), edit(2, 'SIM', 'eSIM'), edit(3, 'SIM', '2 SIM'), edit(4, 'SIM', 'eSIM')])
    pv.findMany.mockResolvedValue([1, 2, 3, 4].map(i => variant(i, 'Redmi', 'Индия')))
    const all = await detectPatterns()
    expect(all[0].conflicting).toBe(true)
    expect(await ripePatterns()).toEqual([])
  })

  it('пустой ключ (ни бренда, ни страны) не обобщается', async () => {
    audit.findMany.mockResolvedValue([edit(1), edit(2), edit(3)])
    pv.findMany.mockResolvedValue([1, 2, 3].map(i => variant(i, null, null)))
    expect(await detectPatterns()).toEqual([])
  })

  it('конфликт с существующим правилом показывается как конфликт, а не предложение', async () => {
    audit.findMany.mockResolvedValue([edit(1), edit(2), edit(3)])
    pv.findMany.mockResolvedValue([1, 2, 3].map(i => variant(i, 'Redmi', 'Индия')))
    sim.findMany.mockResolvedValue([{ countryNorm: 'индия', brandNorm: 'redmi', modelMatch: '', simType: 'SIM + eSIM' }])
    const all = await detectPatterns()
    expect(all[0].conflictsWithExisting).toBe('SIM + eSIM')
    expect(isRipe(all[0])).toBe(false)
    expect(await ripePatterns()).toEqual([])
  })

  it('исчезнувший вариант не роняет детектор — правка просто не считается', async () => {
    audit.findMany.mockResolvedValue([edit(1), edit(2), edit(999)])
    pv.findMany.mockResolvedValue([variant(1, 'Redmi', 'Индия'), variant(2, 'Redmi', 'Индия')])   // 999 удалён
    const all = await detectPatterns()
    expect(all[0].count).toBe(2)
    expect(await ripePatterns()).toEqual([])
  })

  it('правки не-SIM атрибутов предложения НЕ дают — даже если их много', async () => {
    audit.findMany.mockResolvedValue([
      edit(1, 'Цвет', 'White'), edit(2, 'Цвет', 'White'), edit(3, 'Цвет', 'White'), edit(4, 'Цвет', 'White'),
    ])
    pv.findMany.mockResolvedValue([1, 2, 3, 4].map(i => variant(i, 'Redmi', 'Индия')))
    expect(await detectPatterns()).toEqual([])
    expect(await ripePatterns()).toEqual([])
  })

  it('в смеси правок остаётся только SIM-паттерн', async () => {
    audit.findMany.mockResolvedValue([
      edit(1, 'SIM', '2 SIM'), edit(2, 'SIM', '2 SIM'), edit(3, 'SIM', '2 SIM'),
      edit(4, 'Цвет', 'White'), edit(5, 'Цвет', 'White'), edit(6, 'Цвет', 'White'),
    ])
    pv.findMany.mockResolvedValue([1, 2, 3, 4, 5, 6].map(i => variant(i, 'Redmi', 'Индия')))
    const ripe = await ripePatterns()
    expect(ripe).toHaveLength(1)
    expect(ripe[0].attr).toBe('SIM')
  })

  it('пустой журнал — пустой результат, без похода в каталог', async () => {
    audit.findMany.mockResolvedValue([])
    expect(await detectPatterns()).toEqual([])
    expect(pv.findMany).not.toHaveBeenCalled()
  })
})

describe('запись правила — только явная и только трёх форм', () => {
  it('SIM пишется как SimRule с source=learned', async () => {
    const r = await learnRule(ACTOR, { attr: 'SIM', brand: 'Redmi', country: 'Индия', value: '2 SIM' })
    expect(r).toMatchObject({ ok: true, status: 201 })
    expect(sim.upsert.mock.calls[0][0].create).toMatchObject({ simType: '2 SIM', source: 'learned' })
    expect(alias.upsert).not.toHaveBeenCalled()
  })

  it('не-SIM атрибут правилом не становится — честный отказ вместо пустышки', async () => {
    const r = await learnRule(ACTOR, { attr: 'Цвет', brand: 'Redmi', country: 'Индия', value: 'White' })
    expect(r).toMatchObject({ ok: false, status: 422 })
    expect(r.error).toContain('только тип SIM')
    expect(alias.upsert).not.toHaveBeenCalled()
    expect(sim.upsert).not.toHaveBeenCalled()
  })

  it('конфликт с существующим правилом — 409, ничего не переписываем', async () => {
    sim.findUnique.mockResolvedValue({ simType: 'SIM + eSIM' })
    const r = await learnRule(ACTOR, { attr: 'SIM', brand: 'Redmi', country: 'Индия', value: '2 SIM' })
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(sim.upsert).not.toHaveBeenCalled()
  })

  it('правило без бренда и страны не записать', async () => {
    expect((await learnRule(ACTOR, { attr: 'SIM', brand: null, country: null, value: '2 SIM' })).status).toBe(422)
    expect((await learnRule(ACTOR, { attr: '', brand: 'Redmi', country: null, value: '' })).status).toBe(422)
    expect(sim.upsert).not.toHaveBeenCalled()
  })
})

describe('«чтение» — learnAlias: raw-написание → канон, любое поле', () => {
  it('новое чтение пишется нормализованным и как learned', async () => {
    const r = await learnAlias(ACTOR, 'Цвет', ' Чёрный ', 'Black')
    expect(r.ok).toBe(true)
    expect(r.status).toBe(201)
    expect(alias.create).toHaveBeenCalledWith({
      data: { attrKey: 'Цвет', rawNorm: 'чёрный', canonical: 'Black', source: 'learned' },
    })
  })

  it('это НЕ SimRule: запись «бренд+страна» не создаётся ни для какого поля', async () => {
    await learnAlias(ACTOR, 'Цвет', 'чёрный', 'Black')
    expect(sim.upsert).not.toHaveBeenCalled()
    expect(sim.findUnique).not.toHaveBeenCalled()
  })

  it('анти-мусор: пустые, совпадение from/to и служебные ключи — отказ без записи', async () => {
    expect((await learnAlias(ACTOR, 'Цвет', '', 'Black')).status).toBe(422)
    expect((await learnAlias(ACTOR, 'Цвет', 'black', ' BLACK ')).status).toBe(422)  // одно и то же слово
    expect((await learnAlias(ACTOR, '', 'чёрный', 'Black')).status).toBe(422)
    expect((await learnAlias(ACTOR, 'attrOverrides', 'x', 'y')).status).toBe(422)
    expect((await learnAlias(ACTOR, 'fullName', 'x', 'y')).status).toBe(422)
    expect(alias.create).not.toHaveBeenCalled()
  })

  it('анти-мусор: длиннее лимитов — отказ', async () => {
    expect((await learnAlias(ACTOR, 'К'.repeat(41), 'a', 'b')).status).toBe(422)
    expect((await learnAlias(ACTOR, 'Цвет', 'a'.repeat(101), 'b')).status).toBe(422)
    expect((await learnAlias(ACTOR, 'Цвет', 'a', 'b'.repeat(101))).status).toBe(422)
    expect(alias.create).not.toHaveBeenCalled()
  })

  it('конфликт с существующим чтением — 409, сначала «забыть»', async () => {
    alias.findUnique.mockResolvedValue({ id: 7, attrKey: 'Цвет', rawNorm: 'чёрный', canonical: 'Midnight', source: 'learned' })
    const r = await learnAlias(ACTOR, 'Цвет', 'чёрный', 'Black')
    expect(r.status).toBe(409)
    expect(alias.create).not.toHaveBeenCalled()
  })

  it('повтор того же чтения — идемпотентно, без второй записи', async () => {
    alias.findUnique.mockResolvedValue({ id: 7, attrKey: 'Цвет', rawNorm: 'чёрный', canonical: 'Black', source: 'learned' })
    const r = await learnAlias(ACTOR, 'Цвет', 'чёрный', 'Black')
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(alias.create).not.toHaveBeenCalled()
  })
})

describe('забыть правило', () => {
  it('выученное удаляется, в ответе нет обещания откатить проставленное', async () => {
    sim.findUnique.mockResolvedValue({ id: 42, country: 'Индия', brand: 'Redmi', simType: '2 SIM', source: 'learned' })
    const r = await forgetRule(ACTOR, 'SimRule', 42)
    expect(r.ok).toBe(true)
    expect((r.data as { note: string | null }).note).toBeNull()
    expect(sim.delete).toHaveBeenCalledWith({ where: { id: 42 } })
  })

  it('правило из сида честно предупреждает, что вернётся после перезапуска', async () => {
    sim.findUnique.mockResolvedValue({ id: 1, country: 'Индия', brand: 'Apple', simType: 'SIM + eSIM', source: 'seed' })
    const r = await forgetRule(ACTOR, 'SimRule', 1)
    expect((r.data as { note: string }).note).toContain('перезапуске')
  })

  it('чужой тип и несуществующий id — человеческие отказы', async () => {
    expect((await forgetRule(ACTOR, 'Магия', 1)).status).toBe(422)
    sim.findUnique.mockResolvedValue(null)
    expect((await forgetRule(ACTOR, 'SimRule', 999)).status).toBe(404)
  })
})
