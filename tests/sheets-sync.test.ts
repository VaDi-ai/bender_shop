import { describe, it, expect } from 'vitest'
import { extractProductName } from '../lib/sheets-sync'

describe('extractProductName', () => {
  it('iPhone: removes color, memory, country', () => {
    expect(extractProductName('iPhone 16 Pro 256GB Desert', 'Apple'))
      .toBe('Iphone 16 Pro')
  })

  it('Samsung: removes article, memory, SIM', () => {
    expect(extractProductName('Samsung Galaxy S26 Ultra 12/256GB Black', 'Samsung'))
      .toBe('Samsung Galaxy S26 Ultra')
  })

  it('iPad: removes chip, connectivity, memory', () => {
    expect(extractProductName('iPad Air 11 128GB Space Gray Wi-Fi M3', 'Apple'))
      .toBe('Ipad Air 11')
  })

  it('MacBook: removes screen size, config', () => {
    expect(extractProductName('MacBook Air 13 M5 16GB 512GB Midnight', 'Apple'))
      .toBe('Macbook Air M5')
  })

  it('MacBook NEO: does not include chip in name', () => {
    expect(extractProductName('MacBook NEO 256Gb Silver', 'Apple'))
      .toBe('Macbook NEO')
  })

  it('Apple Watch: removes size, band, material', () => {
    expect(extractProductName('Apple Watch Ultra 2 49 Black Ti Black Ocean Band', 'Apple'))
      .toBe('Apple Watch Ultra 2')
  })
})
