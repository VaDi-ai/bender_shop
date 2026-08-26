import { describe, it, expect } from 'vitest'
import { fmtPrice, pluralize, formatVariantAttrs, formatProductNameWithAttrs, formatAttrPairs } from '../lib/format'

describe('fmtPrice', () => {
  it('formats thousands with separator', () => {
    const result = fmtPrice(1234567)
    expect(result).toMatch(/1.*234.*567/)
  })

  it('handles zero', () => {
    expect(fmtPrice(0)).toBe('0')
  })

  it('handles string input', () => {
    expect(fmtPrice('99900')).toMatch(/99.*900/)
  })
})

describe('pluralize', () => {
  it('1 товар', () => {
    expect(pluralize(1, 'товар', 'товара', 'товаров')).toBe('1 товар')
  })

  it('3 товара', () => {
    expect(pluralize(3, 'товар', 'товара', 'товаров')).toBe('3 товара')
  })

  it('5 товаров', () => {
    expect(pluralize(5, 'товар', 'товара', 'товаров')).toBe('5 товаров')
  })

  it('11 товаров (teens)', () => {
    expect(pluralize(11, 'товар', 'товара', 'товаров')).toBe('11 товаров')
  })

  it('21 товар', () => {
    expect(pluralize(21, 'товар', 'товара', 'товаров')).toBe('21 товар')
  })
})

describe('formatVariantAttrs', () => {
  it('форматирует объект атрибутов через " / "', () => {
    expect(formatVariantAttrs({ 'Цвет': 'Silver', 'Память': '256GB' }))
      .toBe('Silver / 256GB')
  })

  it('пропускает null и undefined значения', () => {
    expect(formatVariantAttrs({ 'Цвет': 'Silver', 'Память': null, 'SIM': undefined, 'Страна': 'США' }))
      .toBe('Silver / США')
  })

  it('пропускает пустые строки и строки из пробелов', () => {
    expect(formatVariantAttrs({ 'Цвет': 'Silver', 'Память': '', 'SIM': '   ' }))
      .toBe('Silver')
  })

  it('обрезает пробелы в значениях', () => {
    expect(formatVariantAttrs({ 'Цвет': '  Silver  ', 'Память': ' 256GB' }))
      .toBe('Silver / 256GB')
  })

  it('возвращает пустую строку для null/undefined/примитивов', () => {
    expect(formatVariantAttrs(null)).toBe('')
    expect(formatVariantAttrs(undefined)).toBe('')
    expect(formatVariantAttrs('строка')).toBe('')
    expect(formatVariantAttrs(42)).toBe('')
    expect(formatVariantAttrs(true)).toBe('')
  })

  it('возвращает пустую строку для массивов', () => {
    expect(formatVariantAttrs(['Silver', '256GB'])).toBe('')
  })

  it('возвращает пустую строку для пустого объекта', () => {
    expect(formatVariantAttrs({})).toBe('')
  })

  it('сохраняет порядок ключей JSON', () => {
    expect(formatVariantAttrs({ 'Память': '256GB', 'Цвет': 'Silver', 'SIM': 'eSIM' }))
      .toBe('256GB / Silver / eSIM')
  })

  it('преобразует числовые значения в строки', () => {
    expect(formatVariantAttrs({ 'Размер': 40, 'Цвет': 'Black' }))
      .toBe('40 / Black')
  })
})

describe('formatProductNameWithAttrs', () => {
  it('добавляет атрибуты в скобках после имени', () => {
    expect(formatProductNameWithAttrs('iPhone 17 Pro', { 'Цвет': 'Silver', 'Память': '256GB' }))
      .toBe('iPhone 17 Pro (Silver / 256GB)')
  })

  it('возвращает только имя если атрибуты пустые', () => {
    expect(formatProductNameWithAttrs('iPhone 17 Pro', {})).toBe('iPhone 17 Pro')
    expect(formatProductNameWithAttrs('iPhone 17 Pro', null)).toBe('iPhone 17 Pro')
    expect(formatProductNameWithAttrs('iPhone 17 Pro', undefined)).toBe('iPhone 17 Pro')
  })

  it('возвращает только имя если все значения атрибутов пустые', () => {
    expect(formatProductNameWithAttrs('AirPods Pro', { 'Цвет': '', 'Размер': null }))
      .toBe('AirPods Pro')
  })

  it('SIM «2 SIM» показывается как «Dual SIM», остальные метки не тронуты', () => {
    expect(formatProductNameWithAttrs('iPhone 16', { 'Цвет': 'Teal', 'SIM': '2 SIM' }))
      .toBe('iPhone 16 (Teal / Dual SIM)')
    expect(formatProductNameWithAttrs('iPhone 17', { 'SIM': 'eSIM + eSIM' }))
      .toBe('iPhone 17 (eSIM + eSIM)')
    expect(formatProductNameWithAttrs('iPhone 17e', { 'SIM': 'SIM + eSIM' }))
      .toBe('iPhone 17e (SIM + eSIM)')
    // «2 SIM» вне ключа SIM не маппится (страховка от совпадений в других полях)
    expect(formatVariantAttrs({ 'Комплектация': '2 SIM' })).toBe('2 SIM')
  })

  it('объектные значения (attrOverrides) не попадают в подпись', () => {
    expect(formatVariantAttrs({ 'Цвет': 'Black', attrOverrides: { SIM: { value: 'eSIM' } } }))
      .toBe('Black')
  })
})

describe('formatAttrPairs', () => {
  it('пары «Ключ: значение», системные ключи и объекты пропущены', () => {
    expect(formatAttrPairs({
      'Цвет': 'Sky Blue', 'Память': '512GB',
      fullName: 'MacBook Air 13 M5 16GB 512GB Sky Blue',
      attrOverrides: { 'Цвет': { value: 'Sky Blue', by: 'x', at: 'y' } },
    })).toBe('Цвет: Sky Blue, Память: 512GB')
  })

  it('массив значений (агрегат товара) разворачивается через запятую', () => {
    expect(formatAttrPairs({ 'Цвет': ['Midnight', 'Starlight'] })).toBe('Цвет: Midnight, Starlight')
  })

  it('кастомный разделитель и пустые входы', () => {
    expect(formatAttrPairs({ 'Цвет': 'Black', 'SIM': 'eSIM' }, ' · ')).toBe('Цвет: Black · SIM: eSIM')
    expect(formatAttrPairs(null)).toBe('')
    expect(formatAttrPairs({ attrOverrides: {} })).toBe('')
  })
})
