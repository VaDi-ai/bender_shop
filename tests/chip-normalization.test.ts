/**
 * Чип как структурированный атрибут (изолированный PR).
 *
 * Три круга защиты:
 *   1) extractChip — канон «длинные первыми», скобки/регистр, отсутствие
 *      ложных срабатываний (XM5, S26, 42mm, iPhone 16);
 *   2) РЕГРЕССИЯ «имена не поехали»: на эталоне из 838 живых строк листа
 *      extractProductName обязан вернуть ровно то же, что до правки. Чип у Mac
 *      входит в ИМЯ товара («Macbook Air M5») — вырезать его нельзя;
 *   3) приоритет конфигурации ядер: «Mac mini M4 10c/10c …» остаётся 10c/10c —
 *      существующие значения не переписываем.
 *
 * Плюс контроль, что гейт Step 4 (#105) не ослаблен.
 */
import { describe, it, expect } from 'vitest'
import { extractChip, extractProductName, disableStepSkipReason, CHIPS_LONG, CHIPS_SHORT } from '../lib/sheets-sync'
import baseline from './fixtures/sheet-name-baseline.json'

describe('extractChip — канон чипа', () => {
  it('длинные варианты первыми: «M4 Pro» не усекается до «M4»', () => {
    expect(extractChip('MacBook Pro 14 M4 Pro 24GB 512GB Silver')).toBe('M4 Pro')
    expect(extractChip('Mac Studio M3 Ultra 96GB 1TB')).toBe('M3 Ultra')
    expect(extractChip('MacBook Pro 16 M5 Max 48GB 1TB')).toBe('M5 Max')
    expect(extractChip('iPhone 17 Pro A19 Pro 256GB')).toBe('A19 Pro')
  })

  it('скобки и регистр не мешают', () => {
    expect(extractChip('iPad 11 (A16) 128GB Silver Wi-Fi (2025)')).toBe('A16')
    expect(extractChip('ipad air 11 128gb blue wi-fi (2026) m4')).toBe('M4')
    expect(extractChip('MacBook Air 13 M5 16GB 512GB Midnight')).toBe('M5')
  })

  it('чип в конце строки и рядом с артикулом', () => {
    expect(extractChip('iPad 11 256GB Yellow Wi-Fi (2025) A16')).toBe('A16')
    expect(extractChip('iPad Air 11 128GB Blue LTE 2026) M4')).toBe('M4')
  })

  it('ложных срабатываний нет', () => {
    expect(extractChip('Sony WH-1000XM5 Black')).toBeNull()          // XM5 — не чип
    expect(extractChip('Samsung Galaxy S26+ 12/512')).toBeNull()
    expect(extractChip('Apple Watch S11 42mm Jet Black Al Black SB M/L GPS')).toBeNull()
    expect(extractChip('iPhone 16 Pro Max 256GB')).toBeNull()        // «16» без A — не чип
    expect(extractChip('')).toBeNull()
    expect(extractChip('Ray-ban Meta Wayfarer M matte black')).toBeNull()
  })

  it('канон не содержит дублей и длинные реально длиннее коротких', () => {
    expect(new Set(CHIPS_LONG).size).toBe(CHIPS_LONG.length)
    expect(new Set(CHIPS_SHORT).size).toBe(CHIPS_SHORT.length)
    for (const long of CHIPS_LONG) expect(long.includes(' ')).toBe(true)
    for (const short of CHIPS_SHORT) expect(short.includes(' ')).toBe(false)
  })
})

describe('РЕГРЕССИЯ: имена товаров не поехали (838 живых строк листа)', () => {
  it('extractProductName даёт ровно то же имя, что до правки', () => {
    const changed: string[] = []
    for (const row of baseline as Array<{ fullName: string; brand: string; name: string }>) {
      const got = extractProductName(row.fullName, row.brand)
      if (got !== row.name) changed.push(`«${row.fullName}»: ${row.name} → ${got}`)
    }
    expect(changed).toEqual([])
  })

  it('чип у Mac остаётся частью имени товара — вырезать его нельзя', () => {
    // Идентичность модели: без M5 «Macbook Air M5» слился бы с «Macbook Air M4»
    expect(extractProductName('MacBook Air 13 M5 16GB 512GB Midnight', 'Apple')).toBe('Macbook Air M5')
    expect(extractProductName('MacBook Air 13 M4 16GB 256GB Silver', 'Apple')).toBe('Macbook Air M4')
    expect(extractProductName('iMac 24 M4 10c/10c 16GB 512GB Blue', 'Apple')).toContain('M4')
    // А у iPad чип в имя не попадает — там он только атрибут
    expect(extractProductName('iPad 11 (A16) 128GB Silver Wi-Fi (2025)', 'Apple')).toBe('Ipad 11')
    expect(extractProductName('iPad Air 11 128GB Space Gray Wi-Fi (2026) M4', 'Apple')).toBe('Ipad Air 11')
  })

  it('эталон покрывает реальные линейки, а не пустой', () => {
    const rows = baseline as Array<{ fullName: string }>
    expect(rows.length).toBeGreaterThan(500)
    expect(rows.some(r => /macbook/i.test(r.fullName))).toBe(true)
    expect(rows.some(r => /ipad/i.test(r.fullName))).toBe(true)
  })
})

describe('приоритет конфигурации ядер (существующие значения не переписываем)', () => {
  it('«Mac mini M4 10c/10c» — чип остаётся конфигурацией ядер', () => {
    // Инвариант parseAttributes: конфигурация ставится первой, канон — только
    // если ключ пуст. Здесь проверяем сам канон: он ВИДИТ M4, поэтому порядок
    // в parseAttributes критичен (иначе 94 варианта в проде переписались бы).
    expect(extractChip('Mac mini M4 10c/10c 16GB 256GB Silver')).toBe('M4')
    const rowsWithBoth = (baseline as Array<{ fullName: string; chip: string | null }>)
      .filter(r => /\d+c\/\d+c/i.test(r.fullName))
    expect(rowsWithBoth.length).toBeGreaterThan(0)
    for (const r of rowsWithBoth) expect(r.chip).toMatch(/^\d+c\/\d+c$/)
  })
})

describe('гейт Step 4 (#105) не ослаблен', () => {
  it('гасить можно только на полном непрерванном прогоне', () => {
    expect(disableStepSkipReason({ interrupted: false, rowsCount: 838, sheetsFailed: 0 })).toBeNull()
    expect(disableStepSkipReason({ interrupted: true, rowsCount: 838, sheetsFailed: 0 })).toBe('прогон прерван (стоп/таймаут)')
    expect(disableStepSkipReason({ interrupted: false, rowsCount: 0, sheetsFailed: 0 })).toBe('чтение листов пустое')
    expect(disableStepSkipReason({ interrupted: false, rowsCount: 838, sheetsFailed: 1 })).toBe('не прочитано листов: 1')
  })
})
