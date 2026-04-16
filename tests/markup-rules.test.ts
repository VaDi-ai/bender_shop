import { describe, it, expect } from 'vitest'
import { roundPrice90, applyMarkupRules, validateRules, type MarkupRuleData } from '../lib/markup-rules'

const SAMPLE_RULES: MarkupRuleData[] = [
  { id: 1, minCost: 0, maxCost: 5000, mode: 'fixed', value: 500, enabled: true },
  { id: 2, minCost: 5000, maxCost: 10000, mode: 'fixed', value: 1000, enabled: true },
  { id: 3, minCost: 10000, maxCost: 30000, mode: 'fixed', value: 2500, enabled: true },
  { id: 4, minCost: 30000, maxCost: null, mode: 'fixed', value: 5000, enabled: true },
]

describe('roundPrice90', () => {
  it('округляет вверх к _90', () => {
    expect(roundPrice90(9250)).toBe(9290)
    expect(roundPrice90(9201)).toBe(9290)
    expect(roundPrice90(9290)).toBe(9290)
    expect(roundPrice90(9300)).toBe(9290) // 9300 ceiled=9300, -10=9290
  })

  it('обрабатывает ровные тысячи', () => {
    expect(roundPrice90(10000)).toBe(9990) // ceil(10000/100)*100=10000, -10=9990
    expect(roundPrice90(10001)).toBe(10090)
  })

  it('обрабатывает большие числа', () => {
    expect(roundPrice90(85000)).toBe(84990) // ceil(85000/100)*100=85000, -10=84990
    expect(roundPrice90(85050)).toBe(85090)
  })

  it('возвращает 0 для нулевой и отрицательной цены', () => {
    expect(roundPrice90(0)).toBe(0)
    expect(roundPrice90(-100)).toBe(0)
  })

  it('обрабатывает маленькие числа', () => {
    expect(roundPrice90(50)).toBe(90)
    expect(roundPrice90(100)).toBe(90) // ceil(100/100)*100=100, -10=90
    expect(roundPrice90(150)).toBe(190)
  })
})

describe('applyMarkupRules', () => {
  it('применяет фиксированную наценку по интервалу', () => {
    // 3000 попадает в [0, 5000) → +500 → 3500 → roundPrice90 → 3490
    expect(applyMarkupRules(3000, SAMPLE_RULES)).toBe(3490)
    // 7000 попадает в [5000, 10000) → +1000 → 8000 → roundPrice90 → 7990
    expect(applyMarkupRules(7000, SAMPLE_RULES)).toBe(7990)
    // 20000 попадает в [10000, 30000) → +2500 → 22500 → roundPrice90 → 22490
    expect(applyMarkupRules(20000, SAMPLE_RULES)).toBe(22490)
    // 50000 попадает в [30000, ∞) → +5000 → 55000 → roundPrice90 → 54990
    expect(applyMarkupRules(50000, SAMPLE_RULES)).toBe(54990)
  })

  it('применяет процентную наценку', () => {
    const pctRules: MarkupRuleData[] = [
      { id: 1, minCost: 0, maxCost: null, mode: 'percent', value: 10, enabled: true },
    ]
    // 10000 * 1.1 = 11000 → roundPrice90 → 10990
    expect(applyMarkupRules(10000, pctRules)).toBe(10990)
  })

  it('левая граница включительно', () => {
    // 5000 попадает в [5000, 10000) → +1000 → 6000 → 5990
    expect(applyMarkupRules(5000, SAMPLE_RULES)).toBe(5990)
  })

  it('правая граница исключительно', () => {
    // 9999 попадает в [5000, 10000) → +1000 → 10999 → 10990
    expect(applyMarkupRules(9999, SAMPLE_RULES)).toBe(10990)
    // 10000 попадает в [10000, 30000) → +2500 → 12500 → 12490
    expect(applyMarkupRules(10000, SAMPLE_RULES)).toBe(12490)
  })

  it('пропускает disabled правила', () => {
    const rules = SAMPLE_RULES.map(r => ({ ...r, enabled: false }))
    // Нет активных правил → roundPrice90(7000) = 6990
    expect(applyMarkupRules(7000, rules)).toBe(6990)
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
