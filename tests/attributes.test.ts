import { describe, it, expect } from 'vitest'
import { extractProductName } from '../lib/sheets-sync'

describe('extractProductName', () => {
  it('extracts iPhone model', () => {
    expect(extractProductName('iPhone 17 Pro Max 256GB Blue', 'Apple')).toContain('Iphone 17 Pro Max')
  })

  it('removes country in brackets', () => {
    const result = extractProductName('iPhone 16 Pro 256GB Black (Япония)', 'Apple')
    expect(result).not.toContain('Япония')
    expect(result).toContain('Iphone 16 Pro')
  })

  it('removes article codes in brackets', () => {
    const result = extractProductName('Samsung Galaxy S26 Ultra (SM-S948B) Black', 'Samsung')
    expect(result).not.toContain('SM-S948B')
  })

  it('handles MacBook with chip', () => {
    const result = extractProductName('MacBook Air 13 M5 16/512 Midnight', 'Apple')
    expect(result).toContain('Macbook Air')
    expect(result).toContain('M5')
  })

  it('handles single-word product', () => {
    const result = extractProductName('AirPods Pro 2', 'Apple')
    expect(result).toContain('Airpods Pro')
  })
})
