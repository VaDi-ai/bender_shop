/**
 * Предзаказ: политика, деньги и ограды.
 *
 * Главные инварианты, которые здесь держатся:
 *   • пустой флаг = обычный товар, ничего из механики не применяется;
 *   • полузаполненный предзаказ НЕ готов к витрине, но товар не ломает;
 *   • предоплату считает сервер и никогда не берёт больше суммы заказа;
 *   • пока касса не умеет предоплату, предзаказный вариант не заказуем.
 */
import { describe, it, expect, vi } from 'vitest'
import { Decimal } from '@prisma/client/runtime/client'

vi.mock('../lib/prisma', () => ({ prisma: {} }))
vi.mock('../lib/api-key-store', () => ({ getApiKeyValue: vi.fn(), setApiKeyValue: vi.fn() }))

import {
  parsePreorderDefaults,
  serializePreorderDefaults,
  resolvePreorder,
  computePrepayment,
  renderPreorderTerms,
  parsePreorderCell,
  splitOrderPrepayment,
  EMPTY_PREORDER_DEFAULTS,
  SUGGESTED_PREORDER_DEFAULTS,
  type PreorderDefaults,
  type PreorderProductFields,
} from '../lib/preorder'
import { assertOrderableVariant } from '../lib/order-checks'

const dec = (v: string | number) => new Decimal(v)

/** Товар без своих значений: всё берётся из дефолтов магазина. */
const plainProduct = (over: Partial<PreorderProductFields> = {}): PreorderProductFields => ({
  isPreorder: true,
  preorderMode: null,
  prepaymentKind: null,
  prepaymentValue: null,
  preorderEta: null,
  preorderTerms: null,
  ...over,
})

const defaults = (over: Partial<PreorderDefaults> = {}): PreorderDefaults => ({
  ...EMPTY_PREORDER_DEFAULTS,
  ...over,
})

const PARTIAL_30 = defaults({ mode: 'partial', kind: 'percent', value: dec(30) })

describe('колонка листа: пустой флаг = обычный товар', () => {
  it('пустая ячейка и мусор — не предзаказ', () => {
    for (const v of ['', '   ', '-', 'нет', 'no', '0', 'может быть', 'ё']) {
      expect(parsePreorderCell(v), v).toBe(false)
    }
  })

  it('человеческие «да» распознаются, регистр и пробелы не мешают', () => {
    for (const v of ['да', 'Да', ' ДА ', 'yes', '1', 'true', '✓', '+', 'Предзаказ']) {
      expect(parsePreorderCell(v), v).toBe(true)
    }
  })
})

describe('дефолты магазина', () => {
  it('настройки нет — дефолтов нет, ничего не выдумываем', () => {
    expect(parsePreorderDefaults(null)).toEqual(EMPTY_PREORDER_DEFAULTS)
    expect(parsePreorderDefaults('   ')).toEqual(EMPTY_PREORDER_DEFAULTS)
  })

  it('битый JSON — тоже «дефолтов нет», а не догадка', () => {
    expect(parsePreorderDefaults('{сломано')).toEqual(EMPTY_PREORDER_DEFAULTS)
    expect(parsePreorderDefaults('[1,2]')).toEqual(EMPTY_PREORDER_DEFAULTS)
  })

  it('неизвестные тип и вид отбрасываются, а не подставляются', () => {
    const d = parsePreorderDefaults(JSON.stringify({ mode: 'половина', kind: 'бартер', value: '30' }))
    expect(d.mode).toBeNull()
    expect(d.kind).toBeNull()
  })

  it('процент больше 100 — не предоплата, а переплата: значение выбрасываем', () => {
    const d = parsePreorderDefaults(JSON.stringify({ mode: 'partial', kind: 'percent', value: '150' }))
    expect(d.value).toBeNull()
  })

  it('ноль и минус не проходят', () => {
    expect(parsePreorderDefaults(JSON.stringify({ kind: 'fixed', value: '0' })).value).toBeNull()
    expect(parsePreorderDefaults(JSON.stringify({ kind: 'fixed', value: '-5000' })).value).toBeNull()
  })

  it('сохранение и чтение — круговой рейс без потерь', () => {
    const src = defaults({ mode: 'partial', kind: 'fixed', value: dec('15000'), terms: 'Условия', eta: 'октябрь' })
    const back = parsePreorderDefaults(serializePreorderDefaults(src))
    expect(back.mode).toBe('partial')
    expect(back.kind).toBe('fixed')
    expect(back.value?.toString()).toBe('15000')
    expect(back.terms).toBe('Условия')
    expect(back.eta).toBe('октябрь')
  })
})

describe('готовность товара: флаг, дефолты, override', () => {
  it('флага нет — механика не применяется вообще', () => {
    const r = resolvePreorder(plainProduct({ isPreorder: false }), PARTIAL_30)
    expect(r).toEqual({ kind: 'off' })
  })

  it('флаг есть, дефолтов нет — полузаполнен, на витрину нельзя', () => {
    const r = resolvePreorder(plainProduct(), EMPTY_PREORDER_DEFAULTS)
    expect(r.kind).toBe('incomplete')
    if (r.kind === 'incomplete') expect(r.gaps).toContain('no_mode')
  })

  it('частичная без размера — тоже полузаполнен, и сказано чего не хватает', () => {
    const r = resolvePreorder(plainProduct(), defaults({ mode: 'partial' }))
    expect(r.kind).toBe('incomplete')
    if (r.kind === 'incomplete') expect(r.gaps).toEqual(['no_kind', 'no_value'])
  })

  it('дефолтов достаточно — товар готов без единого своего поля', () => {
    const r = resolvePreorder(plainProduct(), PARTIAL_30)
    expect(r.kind).toBe('ready')
    if (r.kind === 'ready') {
      expect(r.policy.mode).toBe('partial')
      expect(r.policy.kind).toBe('percent')
      expect(r.policy.value?.toString()).toBe('30')
    }
  })

  it('поле товара сильнее дефолта', () => {
    const r = resolvePreorder(
      plainProduct({ prepaymentKind: 'fixed', prepaymentValue: '20000' }),
      PARTIAL_30,
    )
    expect(r.kind).toBe('ready')
    if (r.kind === 'ready') {
      expect(r.policy.kind).toBe('fixed')
      expect(r.policy.value?.toString()).toBe('20000')
    }
  })

  it('полная предоплата не требует ни вида, ни размера', () => {
    const r = resolvePreorder(plainProduct({ preorderMode: 'full' }), EMPTY_PREORDER_DEFAULTS)
    expect(r.kind).toBe('ready')
    if (r.kind === 'ready') {
      expect(r.policy.mode).toBe('full')
      expect(r.policy.kind).toBeNull()
    }
  })

  it('процент товара вне диапазона — полузаполнен, а не «как получится»', () => {
    const r = resolvePreorder(
      plainProduct({ prepaymentKind: 'percent', prepaymentValue: '140' }),
      PARTIAL_30,
    )
    expect(r.kind).toBe('incomplete')
    if (r.kind === 'incomplete') expect(r.gaps).toContain('bad_percent')
  })

  it('срок и условия тоже наследуются от магазина', () => {
    const r = resolvePreorder(plainProduct(), defaults({ ...PARTIAL_30, eta: 'ноябрь', terms: 'Шаблон' }))
    if (r.kind === 'ready') {
      expect(r.policy.eta).toBe('ноябрь')
      expect(r.policy.terms).toBe('Шаблон')
    }
  })
})

describe('расчёт предоплаты — считает только сервер', () => {
  const policy = (over: Record<string, unknown> = {}) => ({
    mode: 'partial' as const, kind: 'percent' as const, value: dec(30),
    eta: null, terms: null, ...over,
  })

  it('полная = вся сумма, остатка нет', () => {
    const r = computePrepayment(dec('149900'), policy({ mode: 'full', kind: null, value: null }))
    expect(r.prepayment.toString()).toBe('149900')
    expect(r.remaining.toString()).toBe('0')
  })

  it('процент от цены, округление вверх до рубля', () => {
    const r = computePrepayment(dec('99990'), policy({ value: dec(30) }))
    expect(r.prepayment.toString()).toBe('29997')
    expect(r.remaining.toString()).toBe('69993')
  })

  it('копейки процента уходят в пользу магазина, а не в дробь', () => {
    const r = computePrepayment(dec('10000'), policy({ value: dec('33.33') }))
    expect(r.prepayment.toString()).toBe('3333')
    expect(r.prepayment.plus(r.remaining).toString()).toBe('10000')
  })

  it('фикс-сумма берётся как есть', () => {
    const r = computePrepayment(dec('149900'), policy({ kind: 'fixed', value: dec('15000') }))
    expect(r.prepayment.toString()).toBe('15000')
    expect(r.remaining.toString()).toBe('134900')
  })

  it('фикс больше цены не превращается в долг магазину — берём 100%', () => {
    const r = computePrepayment(dec('9000'), policy({ kind: 'fixed', value: dec('15000') }))
    expect(r.prepayment.toString()).toBe('9000')
    expect(r.remaining.toString()).toBe('0')
  })

  it('предоплата и остаток ВСЕГДА складываются в сумму заказа', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['149900', policy()],
      ['99990', policy({ value: dec('33.33') })],
      ['1', policy({ value: dec(50) })],
      ['150000', policy({ kind: 'fixed', value: dec('15000') })],
      ['150000', policy({ mode: 'full', kind: null, value: null })],
    ]
    for (const [total, pol] of cases) {
      const r = computePrepayment(dec(total), pol as never)
      expect(r.prepayment.plus(r.remaining).toString(), total).toBe(dec(total).toString())
      expect(r.prepayment.isNegative()).toBe(false)
      expect(r.remaining.isNegative()).toBe(false)
    }
  })
})

describe('условия выкупа: шаблон владельца, без ИИ', () => {
  it('суммы подставляются БЕЗ знака рубля — ₽ стоит в шаблоне владельца', () => {
    const out = renderPreorderTerms(
      'Предоплата {предоплата} ₽, остаток {остаток} ₽.',
      { prepayment: dec('30000'), remaining: dec('119900'), eta: null },
    )
    // Разряды отделены НЕразрывным пробелом (U+00A0) — общий формат проекта.
    // Двойного «₽ ₽» быть не должно: это ровно то, что дал бы формат с валютой.
    expect(out).toBe('Предоплата 30\u00a0000 ₽, остаток 119\u00a0900 ₽.')
    expect(out).not.toContain('₽ ₽')
  })

  it('шаблон владельца рендерится целиком', () => {
    const out = renderPreorderTerms(
      SUGGESTED_PREORDER_DEFAULTS.terms,
      { prepayment: dec('44997'), remaining: dec('104993'), eta: 'конец октября' },
    )
    expect(out).toBe(
      'Предзаказ. Предоплата 44\u00a0997 ₽ (30%) — бронирует товар. '
      + 'Остаток 104\u00a0993 ₽ при получении. Ориентировочный срок: конец октября. '
      + 'Точную дату и детали подтвердит менеджер.',
    )
  })

  it('{процент} считается от факта: полная — 100%, фикс — реальная доля', () => {
    const full = renderPreorderTerms('{процент}', { prepayment: dec('149900'), remaining: dec('0'), eta: null })
    expect(full).toBe('100%')
    const fixed = renderPreorderTerms('{процент}', { prepayment: dec('15000'), remaining: dec('134900'), eta: null })
    expect(fixed).toBe('10%')
  })

  it('нулевой заказ не даёт деления на ноль', () => {
    expect(renderPreorderTerms('доля {процент}', { prepayment: dec(0), remaining: dec(0), eta: null }))
      .toBe('доля ')
  })

  it('срок не задан — честное «уточняется», а не пустое место', () => {
    const out = renderPreorderTerms('Ждать: {срок}', { prepayment: dec(1), remaining: dec(0), eta: null })
    expect(out).toBe('Ждать: уточняется')
  })

  it('шаблона нет — нечего показывать', () => {
    expect(renderPreorderTerms(null, { prepayment: dec(1), remaining: dec(0), eta: null })).toBeNull()
  })
})

describe('касса: предзаказ заказуем при нулевом остатке', () => {
  const variant = (over: Record<string, unknown> = {}) => ({
    price: '100000', inStock: true, quantity: 5,
    product: { isAvailable: true },
    ...over,
  })
  /** Предзаказ как он есть в жизни: склад пуст, флаг стоит. */
  const preorder = (over: Record<string, unknown> = {}) =>
    variant({ isPreorder: true, inStock: false, quantity: 0, ...over })

  it('обычный товар заказуем, как и раньше', () => {
    expect(() => assertOrderableVariant(variant() as never, 1, true)).not.toThrow()
  })

  it('предзаказ с нулём на складе проходит даже при включённом списании', () => {
    expect(() => assertOrderableVariant(preorder() as never, 1, true)).not.toThrow()
  })

  it('флаг на товаре работает так же, как на варианте', () => {
    expect(() => assertOrderableVariant(
      variant({ inStock: false, quantity: 0, product: { isAvailable: true, isPreorder: true } }) as never, 1, true,
    )).not.toThrow()
  })

  it('обычный товар без остатка по-прежнему отклоняется', () => {
    expect(() => assertOrderableVariant(
      variant({ inStock: false, quantity: 0 }) as never, 1, true,
    )).toThrow('Товар закончился или недоступен')
  })

  it('скрытый товар не спасается предзаказом', () => {
    expect(() => assertOrderableVariant(
      preorder({ product: { isAvailable: false, isPreorder: true } }) as never, 1, false,
    )).toThrow('Товар недоступен для заказа')
  })

  it('черновик без цены не спасается предзаказом', () => {
    expect(() => assertOrderableVariant(
      preorder({ price: '0' }) as never, 1, false,
    )).toThrow('Товар недоступен для заказа')
  })

  it('предзаказ не обходит запрошенное количество сверх остатка у ОБЫЧНОЙ позиции', () => {
    expect(() => assertOrderableVariant(variant({ quantity: 1 }) as never, 5, true))
      .toThrow('Товар закончился или недоступен')
  })
})

describe('корзина: сколько берём вперёд', () => {
  const pol = (over: Record<string, unknown> = {}) => ({
    mode: 'partial' as const, kind: 'percent' as const, value: dec(30),
    eta: null, terms: null, ...over,
  })

  it('обычная корзина — предоплаты нет вовсе', () => {
    const r = splitOrderPrepayment([
      { lineTotal: dec('100000'), policy: null },
      { lineTotal: dec('50000'), policy: null },
    ])
    expect(r.isPreorder).toBe(false)
    expect(r.prepayment.toString()).toBe('0')
    expect(r.terms).toBeNull()
  })

  it('одна предзаказная позиция — 30% от неё', () => {
    const r = splitOrderPrepayment([{ lineTotal: dec('149900'), policy: pol() as never }])
    expect(r.isPreorder).toBe(true)
    expect(r.prepayment.toString()).toBe('44970')
  })

  it('смешанная корзина: обычный товар в предоплату НЕ попадает', () => {
    const r = splitOrderPrepayment([
      { lineTotal: dec('149900'), policy: pol() as never, name: 'Предзаказный' },
      { lineTotal: dec('999999'), policy: null, name: 'Обычный' },
    ])
    // 30% считаются только от 149 900, дорогой обычный товар их не раздувает
    expect(r.prepayment.toString()).toBe('44970')
    expect(r.isPreorder).toBe(true)
  })

  it('две предзаказные позиции складываются', () => {
    const r = splitOrderPrepayment([
      { lineTotal: dec('100000'), policy: pol() as never },
      { lineTotal: dec('50000'), policy: pol({ kind: 'fixed', value: dec('5000') }) as never },
    ])
    expect(r.prepayment.toString()).toBe('35000')   // 30000 + 5000
  })

  it('одинаковые условия у двух позиций не дублируются в снапшоте', () => {
    const terms = 'Предоплата {предоплата} ₽, остаток {остаток} ₽.'
    const r = splitOrderPrepayment([
      { lineTotal: dec('100000'), policy: pol({ terms }) as never, name: 'A' },
      { lineTotal: dec('100000'), policy: pol({ terms }) as never, name: 'B' },
    ])
    expect(r.terms!.split('\n\n')).toHaveLength(1)
  })

  it('разные условия подписываются именем позиции', () => {
    const r = splitOrderPrepayment([
      { lineTotal: dec('100000'), policy: pol({ terms: 'Ждать {срок}', eta: 'октябрь' }) as never, name: 'iPhone' },
      { lineTotal: dec('50000'), policy: pol({ terms: 'Ждать {срок}', eta: 'декабрь' }) as never, name: 'MacBook' },
    ])
    expect(r.terms).toContain('iPhone: Ждать октябрь')
    expect(r.terms).toContain('MacBook: Ждать декабрь')
  })

  it('снапшот условий обрезается по длине поля', () => {
    const r = splitOrderPrepayment([
      { lineTotal: dec('1000'), policy: pol({ terms: 'я'.repeat(5000) }) as never },
    ])
    expect(r.terms!.length).toBeLessThanOrEqual(2000)
  })
})

describe('подсказка дефолтов от владельца', () => {
  it('это подсказка, а не молчаливый дефолт: пустая настройка так и остаётся пустой', () => {
    // Иначе «не дозаполнено» перестало бы быть видимым состоянием, и магазин
    // начал бы продавать предзаказ по правилам, о которых никто не помнит.
    expect(parsePreorderDefaults(null)).toEqual(EMPTY_PREORDER_DEFAULTS)
    expect(SUGGESTED_PREORDER_DEFAULTS.mode).toBe('partial')
    expect(SUGGESTED_PREORDER_DEFAULTS.value).toBe('30')
  })

  it('подсказку можно сохранить как есть — парсер её принимает целиком', () => {
    const d = parsePreorderDefaults(JSON.stringify(SUGGESTED_PREORDER_DEFAULTS))
    expect(d.mode).toBe('partial')
    expect(d.kind).toBe('percent')
    expect(d.value?.toString()).toBe('30')
    expect(d.terms).toBe(SUGGESTED_PREORDER_DEFAULTS.terms)
  })

  it('с ней помеченный товар сразу готов к витрине', () => {
    const d = parsePreorderDefaults(JSON.stringify(SUGGESTED_PREORDER_DEFAULTS))
    const r = resolvePreorder(plainProduct(), d)
    expect(r.kind).toBe('ready')
    if (r.kind === 'ready') {
      // 30% от 149 900 с округлением вверх
      const split = computePrepayment(dec('149900'), r.policy)
      expect(split.prepayment.toString()).toBe('44970')
      expect(split.remaining.toString()).toBe('104930')
    }
  })
})
