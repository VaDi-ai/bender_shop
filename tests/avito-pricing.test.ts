import { describe, it, expect, vi } from 'vitest'

// computeAvitoPrice — чистая функция, но модуль avito-sync тянет prisma/Sheets/бота:
// глушим инфраструктуру, тестируем только расчёт.
vi.mock('../lib/prisma', () => ({ prisma: {} }))
vi.mock('../lib/google-sheets', () => ({ readSheet: vi.fn(), getProductSheetNames: vi.fn() }))
vi.mock('../lib/avito', () => ({ getAvitoItems: vi.fn(), updateAvitoPrice: vi.fn(), isAvitoConfigured: () => false }))
vi.mock('../lib/sheets-sync', () => ({ mapHeaders: vi.fn() }))

import { computeAvitoPrice, AvitoPriceVariant } from '../lib/avito-sync'
import { MarkupRuleData } from '../lib/markup-rules'

// Avito-лесенка с наценкой МЕНЬШЕ site (site из прод-набора: 45k–100k → +5000)
const AVITO_RULES: MarkupRuleData[] = [
  { id: 101, minCost: 0, maxCost: 50000, mode: 'fixed', value: 1500, enabled: true },
  { id: 102, minCost: 50000, maxCost: null, mode: 'fixed', value: 2500, enabled: true },
]

const v = (price: number, costPrice: number | null, inStock = true, quantity = 3): AvitoPriceVariant =>
  ({ price, costPrice, inStock, quantity })

describe('computeAvitoPrice — наценка на закупку по avito-правилам', () => {
  it('закупка + avito-лесенка меньше site → avito НИЖЕ site (так и нужно)', () => {
    // site-розница варианта 65000 (закупка 60000 + site 5000);
    // avito: 60000 + 2500 = 62500 < 65000
    expect(computeAvitoPrice([v(65000, 60000)], AVITO_RULES, 65000)).toBe(62500)
  })

  it('нет закупки у варианта → фолбэк на его site-цену', () => {
    expect(computeAvitoPrice([v(65000, null)], AVITO_RULES, 65000)).toBe(65000)
    expect(computeAvitoPrice([v(65000, 0)], AVITO_RULES, 65000)).toBe(65000)
  })

  it('avito-правил нет вовсе → avito = site (поведение не изменилось)', () => {
    expect(computeAvitoPrice([v(65000, 60000)], [], 65000)).toBe(65000)
    // и min-семантика сохраняется без правил
    expect(computeAvitoPrice([v(65000, 60000), v(64000, null)], [], 65000)).toBe(64000)
  })

  it('несколько вариантов → min-семантика «от…», смешанные кандидаты', () => {
    // 1: закупка 60000 → 62500; 2: без закупки → site 61000; 3: закупка 40000 → 41500
    expect(computeAvitoPrice(
      [v(65000, 60000), v(61000, null), v(45000, 40000)],
      AVITO_RULES, 65000,
    )).toBe(41500)
  })

  it('out-of-stock и нулевые кандидаты не участвуют', () => {
    // единственный in-stock с ценой 0 → кандидатов нет → fallbackPrice
    expect(computeAvitoPrice([v(0, null), v(70000, 60000, false), v(70000, 60000, true, 0)], AVITO_RULES, 55000))
      .toBe(55000)
  })

  it('нет вариантов вовсе → fallbackPrice (товар без вариантов)', () => {
    expect(computeAvitoPrice([], AVITO_RULES, 33000)).toBe(33000)
  })

  it('результат округляется вверх до 100 (единое округление розницы)', () => {
    // закупка 40015 → 40015+1500 = 41515 → 41600
    expect(computeAvitoPrice([v(50000, 40015)], AVITO_RULES, 50000)).toBe(41600)
  })

  it('цена ≤ 0 по товару → гвард skip в syncPricesToAvito (fallback 0 → 0)', () => {
    expect(computeAvitoPrice([], AVITO_RULES, 0)).toBe(0)
  })
})
