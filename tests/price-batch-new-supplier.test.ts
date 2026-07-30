import { describe, it, expect } from 'vitest'
import { validateBatchNewSupplier } from '../api/admin'

const fields = (r: { errors: Array<{ field: string }> }) => r.errors.map(e => e.field)

describe('validateBatchNewSupplier — «＋ Добавить нового» из формы «Загрузить прайс»', () => {
  it('валидный минимум: только название', () => {
    const r = validateBatchNewSupplier({ name: '  Дубай-опт ' })
    expect(r.errors).toEqual([])
    expect(r.data).toEqual({ name: 'Дубай-опт', priceTtlDays: null })
  })

  it('название + «цена свежа, дней»', () => {
    const r = validateBatchNewSupplier({ name: 'Опт HK', priceTtlDays: 5 })
    expect(r.errors).toEqual([])
    expect(r.data).toEqual({ name: 'Опт HK', priceTtlDays: 5 })
  })

  it('priceTtlDays строкой из инпута нормализуется в число', () => {
    expect(validateBatchNewSupplier({ name: 'A', priceTtlDays: '7' }).data.priceTtlDays).toBe(7)
  })

  it('без названия / пустое название — ошибка', () => {
    expect(fields(validateBatchNewSupplier({}))).toContain('name')
    expect(fields(validateBatchNewSupplier({ name: '   ' }))).toContain('name')
  })

  it('границы priceTtlDays: 0, 31, 2.5 — ошибка; пустая строка — просто «не задано»', () => {
    for (const bad of [0, 31, 2.5, 'x']) {
      expect(fields(validateBatchNewSupplier({ name: 'A', priceTtlDays: bad }))).toContain('priceTtlDays')
    }
    expect(validateBatchNewSupplier({ name: 'A', priceTtlDays: '' }).data.priceTtlDays).toBeNull()
  })

  it('наценка в этой форме запрещена — markup даёт 422, не молчаливый игнор', () => {
    const r = validateBatchNewSupplier({ name: 'A', markup: 10 })
    expect(fields(r)).toContain('markup')
    expect(r.data).toEqual({ name: '', priceTtlDays: null })
  })

  it('прочие ключи (notes, chatId, мусор) — тоже 422', () => {
    expect(fields(validateBatchNewSupplier({ name: 'A', notes: 'x' }))).toContain('notes')
    expect(fields(validateBatchNewSupplier({ name: 'A', chatId: '1', foo: 1 }))).toEqual(expect.arrayContaining(['chatId', 'foo']))
  })

  it('не-объект (null, массив, строка) — ошибка newSupplier', () => {
    for (const bad of [null, [], 'x', 42]) {
      expect(fields(validateBatchNewSupplier(bad))).toContain('newSupplier')
    }
  })
})
