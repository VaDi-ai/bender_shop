import { describe, it, expect } from 'vitest'
import { fmtPrice, pluralize } from '../lib/format'

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
