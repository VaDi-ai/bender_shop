import { describe, it, expect } from 'vitest'
import { roundPrice } from '../lib/currency'

describe('roundPrice', () => {
  it('rounds < 10k to nearest 100 (ceil)', () => {
    expect(roundPrice(9950)).toBe(10000)
    expect(roundPrice(9901)).toBe(10000)
    expect(roundPrice(5050)).toBe(5100)
    expect(roundPrice(100)).toBe(100)
  })

  it('rounds 10k-50k to nearest 500 (ceil)', () => {
    expect(roundPrice(10001)).toBe(10500)
    expect(roundPrice(10500)).toBe(10500)
    expect(roundPrice(49999)).toBe(50000)
  })

  it('rounds > 50k to nearest 1000 (ceil)', () => {
    expect(roundPrice(50001)).toBe(51000)
    expect(roundPrice(93450)).toBe(94000)
    expect(roundPrice(100000)).toBe(100000)
  })
})
