import { describe, expect, it } from 'vitest'

import {
  canonicalFamily,
  colorsCompatible,
  parseSamsungGalaxySFamilyFromText,
} from '../lib/photo-match-normalize'

describe('photo-match-normalize', () => {
  it('canonicalFamily maps iphone air to iphone 17 air', () => {
    expect(canonicalFamily('Apple', 'iphone air')).toBe('iphone 17 air')
    expect(canonicalFamily('Apple', 'iphone 17 air')).toBe('iphone 17 air')
  })

  it('parseSamsungGalaxySFamilyFromText distinguishes variants', () => {
    expect(parseSamsungGalaxySFamilyFromText('Samsung Galaxy S26 Black')).toBe('galaxy s26')
    expect(parseSamsungGalaxySFamilyFromText('Samsung Galaxy S26+ Black')).toBe('galaxy s26 plus')
    expect(parseSamsungGalaxySFamilyFromText('Samsung Galaxy S26 Ultra Black')).toBe('galaxy s26 ultra')
    expect(parseSamsungGalaxySFamilyFromText('Samsung Galaxy S25 FE Navy')).toBe('galaxy s25 fe')
  })

  it('colorsCompatible titanium ultra colors', () => {
    expect(colorsCompatible('black', 'Titanium Black', 'galaxy s25 ultra')).toBe(true)
    expect(colorsCompatible('gray', 'Titanium Gray', 'galaxy s25 ultra')).toBe(true)
    expect(colorsCompatible('black', 'Titanium Gray', 'galaxy s25 ultra')).toBe(false)
  })

  it('colorsCompatible pink gold', () => {
    expect(colorsCompatible('pink', 'pink gold', 'galaxy buds 4 pro')).toBe(true)
  })
})
