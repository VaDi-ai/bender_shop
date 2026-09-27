import { describe, expect, it } from 'vitest'
import {
  canonicalFamily,
  colorsCompatible,
  familiesAlign,
  normColor,
  splitGluedColor,
} from '../lib/photo-match-normalize'

describe('photo matching normalization', () => {
  it('normalizes separators and glued marketing colors', () => {
    expect(normColor('Jet_Black')).toBe('jet black')
    expect(splitGluedColor('Galaxy-S26-Ultra-JetBlack')).toContain('jet black')
    expect(splitGluedColor('spacegray')).toBe('space gray')
  })

  it('canonicalizes known family aliases', () => {
    expect(canonicalFamily('Apple', 'iPhone Air')).toBe('iphone 17 air')
    expect(canonicalFamily('Samsung', 'Galaxy S26 Ultra')).toBe('galaxy s26 ultra')
  })

  it('accepts compatible titanium and marketing color names', () => {
    expect(colorsCompatible('Titanium Black', 'Black', 'Apple Watch Ultra')).toBe(true)
    expect(colorsCompatible('light gold', 'gold')).toBe(true)
    expect(colorsCompatible('pink', 'blue')).toBe(false)
  })

  it('aligns family prefixes but keeps unrelated families separate', () => {
    expect(familiesAlign('Apple', 'iPad Air 11', 'iPad Air')).toBe(true)
    expect(familiesAlign('Samsung', 'Galaxy S26', 'Galaxy S25')).toBe(false)
  })
})
