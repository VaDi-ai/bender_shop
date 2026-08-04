import { describe, it, expect } from 'vitest'
import { roundPrice } from '../lib/currency'

describe('roundPrice — единое округление вверх до 100', () => {
  it('округляет вверх до 100 в любом диапазоне (ступени 500/1000 отменены)', () => {
    expect(roundPrice(9950)).toBe(10000)
    expect(roundPrice(9990)).toBe(10000)   // пример владельца
    expect(roundPrice(9901)).toBe(10000)
    expect(roundPrice(5050)).toBe(5100)
    expect(roundPrice(100)).toBe(100)
    expect(roundPrice(10001)).toBe(10100)  // раньше было 10500
    expect(roundPrice(49999)).toBe(50000)
    expect(roundPrice(50001)).toBe(50100)  // раньше было 51000
    expect(roundPrice(93450)).toBe(93500)  // раньше было 94000
    expect(roundPrice(100000)).toBe(100000)
    expect(roundPrice(122550)).toBe(122600) // пример владельца
  })

  it('никогда не занижает', () => {
    for (const p of [99, 101, 9990, 122550, 999999]) {
      expect(roundPrice(p)).toBeGreaterThanOrEqual(p)
    }
  })

  it('ноль и отрицательные — 0', () => {
    expect(roundPrice(0)).toBe(0)
    expect(roundPrice(-100)).toBe(0)
  })
})
