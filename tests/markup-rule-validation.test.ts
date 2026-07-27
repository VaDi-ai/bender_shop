import { describe, it, expect } from 'vitest'
import { validateMarkupRuleInput, evaluateIntegrityTransition } from '../lib/markup-rule-validation'

const fields = (r: { errors: Array<{ field: string }> }) => r.errors.map(e => e.field)

describe('validateMarkupRuleInput', () => {
  it('валидный create нормализуется; maxCost пусто → null (бесконечность)', () => {
    const r = validateMarkupRuleInput({ minCost: 0, maxCost: '', mode: 'fixed', value: '15000.005', channel: 'site' }, { partial: false })
    expect(r.errors).toEqual([])
    expect(r.data).toEqual({ minCost: 0, maxCost: null, mode: 'fixed', value: 15000.01, channel: 'site' })
  })

  it('границы: minCost<0, maxCost<=minCost, value<=0, percent>500 — ошибки', () => {
    expect(fields(validateMarkupRuleInput({ minCost: -1, maxCost: null, mode: 'fixed', value: 1 }, { partial: false }))).toContain('minCost')
    expect(fields(validateMarkupRuleInput({ minCost: 100, maxCost: 100, mode: 'fixed', value: 1 }, { partial: false }))).toContain('maxCost')
    expect(fields(validateMarkupRuleInput({ minCost: 0, maxCost: null, mode: 'percent', value: 0 }, { partial: false }))).toContain('value')
    expect(fields(validateMarkupRuleInput({ minCost: 0, maxCost: null, mode: 'percent', value: 501 }, { partial: false }))).toContain('value')
  })

  it('mode/channel только из словаря; неизвестные поля → ошибка', () => {
    expect(fields(validateMarkupRuleInput({ minCost: 0, maxCost: null, mode: 'magic', value: 1 }, { partial: false }))).toContain('mode')
    expect(fields(validateMarkupRuleInput({ minCost: 0, maxCost: null, mode: 'fixed', value: 1, channel: 'ozon' }, { partial: false }))).toContain('channel')
    expect(fields(validateMarkupRuleInput({ foo: 1 }, { partial: true }))).toContain('foo')
  })
})

describe('evaluateIntegrityTransition: валидный набор нельзя сломать; строящийся — предупреждаем', () => {
  const chain = [
    { id: 1, minCost: 0, maxCost: 100000, mode: 'fixed', value: 15000, enabled: true },
    { id: 2, minCost: 100000, maxCost: null, mode: 'percent', value: 12, enabled: true },
  ]

  it('валидная правка проходит без блока и warning', () => {
    expect(evaluateIntegrityTransition(chain, { id: 1, data: { value: 16000 } })).toEqual({ block: false })
  })

  it('дыра/перекрытие/рвущий disable на ВАЛИДНОМ наборе — блок', () => {
    expect(evaluateIntegrityTransition(chain, { id: 1, data: { maxCost: 90000 } }).block).toBe(true)
    expect(evaluateIntegrityTransition(chain, { data: { minCost: 50000, maxCost: 150000, mode: 'fixed', value: 1, enabled: true } }).block).toBe(true)
    expect(evaluateIntegrityTransition(chain, { id: 1, data: { enabled: false } }).block).toBe(true)
  })

  it('курица-яйцо решена: первое правило цепочки создаётся с warning, второе замыкает без warning', () => {
    const first = evaluateIntegrityTransition([], { data: { minCost: 0, maxCost: 100000, mode: 'fixed', value: 15000, enabled: true } })
    expect(first.block).toBe(false)
    expect(first.warning).toBeTruthy() // «последнее должно уходить в бесконечность»
    const second = evaluateIntegrityTransition(
      [{ id: 1, minCost: 0, maxCost: 100000, mode: 'fixed', value: 15000, enabled: true }],
      { data: { minCost: 100000, maxCost: null, mode: 'percent', value: 12, enabled: true } },
    )
    expect(second).toEqual({ block: false })
  })

  it('опустошение канала валидно; разобрать цепочку можно с головы (хвост валиден сам по себе — нет)', () => {
    const single = [{ id: 1, minCost: 0, maxCost: null, mode: 'fixed', value: 1, enabled: true }]
    expect(evaluateIntegrityTransition(single, { id: 1, data: { enabled: false } })).toEqual({ block: false })
    // у двухзвенной цепочки disable ХВОСТА блокируется ({0..100k} без бесконечности),
    // а disable головы — тоже блок ({100k..∞} не с нуля): гасить канал — с единственного
    // оставшегося правила после правок диапазонов, либо расширив голову до ∞
    expect(evaluateIntegrityTransition(chain, { id: 2, data: { enabled: false } }).block).toBe(true)
  })
})
