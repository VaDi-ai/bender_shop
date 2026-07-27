import { describe, it, expect } from 'vitest'
import { classifyCorridor, priceDeltaPct, contentHash, computeExpiresAt, toParsedLine, CORRIDOR_PCT } from '../lib/price-batch'
import { applyMarkupRules } from '../lib/markup-rules'

describe('classifyCorridor (±15%, гейт для PR-7)', () => {
  it('границы: ровно ±15% — в коридоре; чуть больше — вне', () => {
    expect(CORRIDOR_PCT).toBe(15)
    expect(classifyCorridor(100000, 115000)).toBe('in')   // +15.0%
    expect(classifyCorridor(100000, 85000)).toBe('in')    // −15.0%
    expect(classifyCorridor(100000, 115001)).toBe('out')  // +15.001%
    expect(classifyCorridor(100000, 84999)).toBe('out')
    expect(classifyCorridor(100000, 100000)).toBe('in')
  })

  it('текущая цена 0/нет — вне коридора (не даём применять молча)', () => {
    expect(classifyCorridor(0, 50000)).toBe('out')
    expect(classifyCorridor(NaN, 50000)).toBe('out')
  })

  it('deltaPct: знак и округление до десятых; null при нулевой базе', () => {
    expect(priceDeltaPct(100000, 112340)).toBe(12.3)
    expect(priceDeltaPct(100000, 87600)).toBe(-12.4)
    expect(priceDeltaPct(0, 1)).toBeNull()
  })
})

describe('contentHash (идемпотентность разбора)', () => {
  it('стабилен и не зависит от краевых пробелов', () => {
    const text = 'iPhone 17 Pro 256GB - 122.000\nMacBook Air M5 — 89900₽'
    expect(contentHash(text)).toBe(contentHash('  ' + text + '\n'))
    expect(contentHash(text)).not.toBe(contentHash(text + ' ещё строка 55.000'))
  })
})

describe('computeExpiresAt (TTL прайса)', () => {
  it('parsedAt + ttlDays суток', () => {
    const at = new Date('2026-07-28T10:00:00Z')
    expect(computeExpiresAt(at, 3).toISOString()).toBe('2026-07-31T10:00:00.000Z')
    expect(computeExpiresAt(at, 1).toISOString()).toBe('2026-07-29T10:00:00.000Z')
  })
})

describe('toParsedLine (AIParsedProduct → матчер)', () => {
  it('null-поля становятся undefined, цена и raw сохраняются', () => {
    expect(toParsedLine({ model: 'iPhone 17 Pro', storage: '256GB', ram: null, color: null, country: 'Индия', simType: null, price: 122000, rawLine: 'iPhone 17 Pro 256GB - 122.000' }))
      .toEqual({ model: 'iPhone 17 Pro', storage: '256GB', color: undefined, price: 122000, rawLine: 'iPhone 17 Pro 256GB - 122.000' })
  })
})

describe('цепочка наценки в предпросмотре (реальные правила формата fixed/percent)', () => {
  it('proposedPrice считается той же applyMarkupRules, что применит PR-7', () => {
    const rules = [
      { id: 1, minCost: 0, maxCost: 100000, mode: 'fixed' as const, value: 15000, enabled: true },
      { id: 2, minCost: 100000, maxCost: null, mode: 'percent' as const, value: 12, enabled: true },
    ]
    expect(applyMarkupRules(88500, rules)).toBeGreaterThan(88500)
    expect(applyMarkupRules(120000, rules)).toBeGreaterThan(120000)
  })
})
