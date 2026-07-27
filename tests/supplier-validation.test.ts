import { describe, it, expect } from 'vitest'
import { validateSupplierInput, supplierDelta } from '../lib/supplier-validation'

const fields = (r: { errors: Array<{ field: string }> }) => r.errors.map(e => e.field)

describe('validateSupplierInput', () => {
  it('валидный create: нормализует значения', () => {
    const r = validateSupplierInput({ name: '  Дубай-опт ', markup: '12.5', priceTtlDays: 5, notes: '' }, { partial: false })
    expect(r.errors).toEqual([])
    expect(r.data).toEqual({ name: 'Дубай-опт', markup: 12.5, priceTtlDays: 5, notes: null })
  })

  it('create без name → ошибка; partial без name → ок', () => {
    expect(fields(validateSupplierInput({}, { partial: false }))).toContain('name')
    expect(validateSupplierInput({ markup: 10 }, { partial: true }).errors).toEqual([])
  })

  it('границы markup: 0 и 50 ок; -1, 50.01, мусор — нет', () => {
    expect(validateSupplierInput({ markup: 0 }, { partial: true }).errors).toEqual([])
    expect(validateSupplierInput({ markup: 50 }, { partial: true }).errors).toEqual([])
    for (const bad of [-1, 50.01, 'abc', NaN, Infinity]) {
      expect(fields(validateSupplierInput({ markup: bad }, { partial: true }))).toContain('markup')
    }
  })

  it('границы priceTtlDays: 1 и 30 ок; 0, 31, 2.5 — нет', () => {
    expect(validateSupplierInput({ priceTtlDays: 1 }, { partial: true }).errors).toEqual([])
    expect(validateSupplierInput({ priceTtlDays: 30 }, { partial: true }).errors).toEqual([])
    for (const bad of [0, 31, 2.5, 'x']) {
      expect(fields(validateSupplierInput({ priceTtlDays: bad }, { partial: true }))).toContain('priceTtlDays')
    }
  })

  it('name >100 и notes >1000 — ошибки', () => {
    expect(fields(validateSupplierInput({ name: 'x'.repeat(101) }, { partial: false }))).toContain('name')
    expect(fields(validateSupplierInput({ notes: 'x'.repeat(1001) }, { partial: true }))).toContain('notes')
  })

  it('запрещённые/неизвестные поля → 422-ошибки, не молчаливый игнор', () => {
    const r = validateSupplierInput({ chatId: '123', lastPriceAt: 'now', foo: 1, name: 'A' }, { partial: true })
    expect(fields(r)).toEqual(expect.arrayContaining(['chatId', 'lastPriceAt', 'foo']))
    expect(r.data).toEqual({}) // при ошибках data пуст — нечего частично применять
  })
})

describe('supplierDelta', () => {
  it('дельта — только изменившиеся поля, Decimal сравнивается по значению', () => {
    const existing = { name: 'A', markup: { toString: () => '5' }, priceTtlDays: 3, notes: null }
    const { before, after } = supplierDelta(existing, { name: 'A', markup: 12, notes: 'привет' })
    expect(after).toEqual({ markup: 12, notes: 'привет' })
    expect(before).toEqual({ markup: 5, notes: null })
  })
})
