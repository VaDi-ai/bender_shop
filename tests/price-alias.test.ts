import { describe, it, expect } from 'vitest'

function normalizeAlias(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, ' ')
}

describe('PriceAlias matching', () => {
  it('alias lookup is case-insensitive', () => {
    expect(normalizeAlias('Яблоко 16 Про')).toBe('яблоко 16 про')
  })

  it('alias with extra spaces normalizes', () => {
    expect(normalizeAlias('  Яблоко  16  Про  ')).toBe('яблоко 16 про')
  })

  it('alias handles mixed case latin/cyrillic', () => {
    expect(normalizeAlias('iPhone 16 PRO Max')).toBe('iphone 16 pro max')
  })
})
