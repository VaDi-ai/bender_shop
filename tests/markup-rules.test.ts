import { describe, it, expect } from 'vitest'
import { applyMarkupRules, validateRules, type MarkupRuleData } from '../lib/markup-rules'

const SAMPLE_RULES: MarkupRuleData[] = [
  { id: 1, minCost: 0, maxCost: 5000, mode: 'fixed', value: 500, enabled: true },
  { id: 2, minCost: 5000, maxCost: 10000, mode: 'fixed', value: 1000, enabled: true },
  { id: 3, minCost: 10000, maxCost: 30000, mode: 'fixed', value: 2500, enabled: true },
  { id: 4, minCost: 30000, maxCost: null, mode: 'fixed', value: 5000, enabled: true },
]

describe('applyMarkupRules — розница округляется вверх до 100 (стиль «…90» отменён)', () => {
  it('применяет фиксированную наценку по интервалу', () => {
    // 3000 попадает в [0, 5000) → +500 → 3500 (уже кратно 100)
    expect(applyMarkupRules(3000, SAMPLE_RULES)).toBe(3500)
    // 7000 попадает в [5000, 10000) → +1000 → 8000
    expect(applyMarkupRules(7000, SAMPLE_RULES)).toBe(8000)
    // 20000 попадает в [10000, 30000) → +2500 → 22500
    expect(applyMarkupRules(20000, SAMPLE_RULES)).toBe(22500)
    // 50000 попадает в [30000, ∞) → +5000 → 55000
    expect(applyMarkupRules(50000, SAMPLE_RULES)).toBe(55000)
    // Некруглая закупка: 7015 → +1000 → 8015 → вверх до 100 → 8100
    expect(applyMarkupRules(7015, SAMPLE_RULES)).toBe(8100)
  })

  it('применяет процентную наценку', () => {
    const pctRules: MarkupRuleData[] = [
      { id: 1, minCost: 0, maxCost: null, mode: 'percent', value: 10, enabled: true },
    ]
    // 10000 * 1.1 = 11000 (кратно 100 — не трогаем)
    expect(applyMarkupRules(10000, pctRules)).toBe(11000)
    // 111409 * 1.1 = 122549.9 → вверх до 100 → 122600 (пример владельца)
    expect(applyMarkupRules(111409, pctRules)).toBe(122600)
  })

  it('левая граница включительно', () => {
    // 5000 попадает в [5000, 10000) → +1000 → 6000
    expect(applyMarkupRules(5000, SAMPLE_RULES)).toBe(6000)
  })

  it('правая граница исключительно', () => {
    // 9999 попадает в [5000, 10000) → +1000 → 10999 → 11000
    expect(applyMarkupRules(9999, SAMPLE_RULES)).toBe(11000)
    // 10000 попадает в [10000, 30000) → +2500 → 12500
    expect(applyMarkupRules(10000, SAMPLE_RULES)).toBe(12500)
  })

  it('пропускает disabled правила', () => {
    const rules = SAMPLE_RULES.map(r => ({ ...r, enabled: false }))
    // Нет активных правил → roundPrice(7000) = 7000
    expect(applyMarkupRules(7000, rules)).toBe(7000)
  })

  it('возвращает 0 для нулевой цены', () => {
    expect(applyMarkupRules(0, SAMPLE_RULES)).toBe(0)
  })
})

describe('validateRules', () => {
  it('валидирует корректную схему', () => {
    expect(validateRules(SAMPLE_RULES)).toEqual({ ok: true })
  })

  it('ругается на пустой список', () => {
    expect(validateRules([])).toEqual({ ok: false, error: 'Нет ни одного активного правила' })
  })

  it('ругается если первое правило не с 0', () => {
    const rules = [{ ...SAMPLE_RULES[0]!, minCost: 100 }, ...SAMPLE_RULES.slice(1)]
    const result = validateRules(rules)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('начинаться с 0')
  })

  it('ругается на дырку между правилами', () => {
    const rules = [
      { ...SAMPLE_RULES[0]!, maxCost: 3000 },  // 0-3000
      { ...SAMPLE_RULES[1]!, minCost: 5000 },   // 5000-10000 (дырка 3000-5000)
      ...SAMPLE_RULES.slice(2),
    ]
    const result = validateRules(rules)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Дырка')
  })

  it('ругается на перекрытие', () => {
    const rules = [
      { ...SAMPLE_RULES[0]!, maxCost: 6000 },   // 0-6000
      { ...SAMPLE_RULES[1]!, minCost: 5000 },    // 5000-10000 (перекрытие)
      ...SAMPLE_RULES.slice(2),
    ]
    const result = validateRules(rules)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Перекрытие')
  })

  it('ругается если последнее правило не уходит в бесконечность', () => {
    const rules = SAMPLE_RULES.map((r, i) =>
      i === SAMPLE_RULES.length - 1 ? { ...r, maxCost: 100000 } : r
    )
    const result = validateRules(rules)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('бесконечность')
  })

  it('игнорирует disabled правила при валидации', () => {
    const rules = [
      SAMPLE_RULES[0]!,
      { ...SAMPLE_RULES[1]!, enabled: false },  // disabled — пропускается
      { ...SAMPLE_RULES[2]!, minCost: 5000 },   // ок если между [0]maxCost=5000 и [2]minCost=5000
      SAMPLE_RULES[3]!,
    ]
    expect(validateRules(rules)).toEqual({ ok: true })
  })
})
