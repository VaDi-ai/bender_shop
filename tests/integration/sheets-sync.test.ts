import { describe, it, expect } from 'vitest'
import { mapHeaders, parseSheetRows } from '../../lib/sheets-sync'

describe('Sheets sync logic', () => {
  it('maps column headers correctly', () => {
    const headers = ['', 'Бренд', 'Категория', 'Общая категория', 'Название модели', 'Цвет', 'Память', 'Размер']
    const COL = mapHeaders(headers)

    expect(COL.brand).toBe(1)
    expect(COL.category).toBe(3) // "Общая категория", not "Категория"
    expect(COL.fullName).toBe(4)
    expect(COL.color).toBe(5)
    expect(COL.memory).toBe(6)
    expect(COL.size).toBe(7)
  })

  it('general category preferred over subcategory', () => {
    const headers = ['', 'Бренд', 'Категория', 'Общая категория', 'Название модели']
    const COL = mapHeaders(headers)
    // "Общая категория" at idx 3, "Категория" at idx 2
    // mapHeaders should pick 3 (Общая категория)
    expect(COL.category).toBe(3)
  })

  it('memory split handles 16GB/1TB format', () => {
    const memStr = '16GB/1TB'
    const match = memStr.match(/^(\d+)\s*(GB|gb)?\s*\/\s*(\d+)\s*(GB|TB|gb|tb)?$/i)

    expect(match).toBeTruthy()
    expect(match![1]).toBe('16')  // RAM
    expect(match![3]).toBe('1')   // Storage
    expect(match![4]!.toUpperCase()).toBe('TB')
  })

  it('memory split handles 12/256 format', () => {
    const memStr = '12/256'
    const match = memStr.match(/^(\d+)\s*(GB|gb)?\s*\/\s*(\d+)\s*(GB|TB|gb|tb)?$/i)

    expect(match).toBeTruthy()
    expect(match![1]).toBe('12')  // RAM
    expect(match![3]).toBe('256') // Storage
  })

  it('falls back to hardcoded indices when headers not found', () => {
    const headers = ['', 'X', 'Y', 'Z', 'W', 'V']
    // price header not found → fallback to index 12 (new sheet layout: L=cost, M=price)
    const COL = mapHeaders(headers)
    expect(COL.price).toBe(12)
    expect(COL.costPrice).toBe(11)
  })

  // ── Phase 1: quantity header stems (fix «нули не гасятся») ─────────────────
  it("maps quantity from «В наличии» by name, not positional fallback", () => {
    // 'В наличии' sits at idx 2, quantity fallback is 13 — a return of 2 proves name-match
    const COL = mapHeaders(['Название модели', 'Рекомендованная стоимость', 'В наличии'])
    expect(COL.quantity).toBe(2)
  })

  it("maps quantity from «Наличие»", () => {
    const COL = mapHeaders(['Название модели', 'Рекомендованная стоимость', 'Наличие'])
    expect(COL.quantity).toBe(2)
  })

  it("maps quantity from «Остаток»", () => {
    const COL = mapHeaders(['Название модели', 'Рекомендованная стоимость', 'Остаток'])
    expect(COL.quantity).toBe(2)
  })

  it("still maps quantity in the full sheet layout with «В наличии»", () => {
    const headers = ['', 'Бренд', 'Категория', 'Общая категория', 'Название модели',
      'Цвет', 'Память', 'Размер', 'Страна', 'Описание', 'Характеристики',
      'Закупочная цена', 'Рекомендованная стоимость', 'В наличии',
      'Лучший поставщик', 'Дата обновления', 'Фото']
    const COL = mapHeaders(headers)
    expect(COL.quantity).toBe(13)
    expect(COL.category).toBe(3) // «Общая категория» regression stays intact
  })
})

describe('parseSheetRows — quantity parsing (Phase 1)', () => {
  const HEADERS = ['', 'Бренд', 'Категория', 'Общая категория', 'Название модели',
    'Цвет', 'Память', 'Размер', 'Страна', 'Описание', 'Характеристики',
    'Закупочная цена', 'Рекомендованная стоимость', 'В наличии',
    'Лучший поставщик', 'Дата обновления', 'Фото']

  function qtyFor(qtyCell: string): number {
    const row = ['', 'Apple', 'iPhone', 'Телефоны', 'iPhone 16 Pro 256GB Black',
      'Black', '256GB', '', '', '', '', '', '100000', qtyCell, '', '', '']
    const rows = parseSheetRows('Тест', [HEADERS, row])
    return rows[0]!.quantity
  }

  it('empty cell → 0 (not the seed default)', () => {
    expect(qtyFor('')).toBe(0)
  })

  it("'0' → 0", () => {
    expect(qtyFor('0')).toBe(0)
  })

  it("'нет' → 0 (non-numeric)", () => {
    expect(qtyFor('нет')).toBe(0)
  })

  it("'-' → 0 (non-numeric)", () => {
    expect(qtyFor('-')).toBe(0)
  })

  it("'5' → 5", () => {
    expect(qtyFor('5')).toBe(5)
  })
})
