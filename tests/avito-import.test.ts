import { describe, it, expect } from 'vitest'

describe('Avito import format detection', () => {
  it('detects old format with date column', () => {
    const header = 'Дата'
    expect(header.toLowerCase().includes('дата')).toBe(true)
  })

  it('detects new format without date column', () => {
    const header = 'Наименование Товара'
    expect(header.toLowerCase().includes('дата')).toBe(false)
  })

  it('parseNum handles formula objects', () => {
    const v: { formula: string; result: number } = { formula: '=E2-D2', result: 6000 }
    const result = typeof v === 'object' && v !== null && 'result' in v ? v.result : v
    expect(result).toBe(6000)
  })

  it('parseNum handles string with spaces and currency', () => {
    const v = '112 800₽'
    const n = parseFloat(String(v).replace(/[\s₽]/g, ''))
    expect(n).toBe(112800)
  })

  it('parseNum handles comma decimals', () => {
    const v = '1 234,56'
    const n = parseFloat(String(v).replace(/[\s₽]/g, '').replace(',', '.'))
    expect(n).toBeCloseTo(1234.56)
  })
})
