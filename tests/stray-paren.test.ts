/**
 * Защитная нормализация имени: висящая закрывающая скобка.
 *
 * В листе есть опечатка «… Wi-Fi 2026) M4» (потеряна открывающая скобка у
 * года). Разбор снимал год, а «)» доезжала до имени товара — так появились
 * товары-призраки «Ipad Air 11 )» и «Ipad Air 13 )», которые лист кормит как
 * отдельные позиции. Чиним на входе: переименование 58 строк руками в таблице
 * породило бы новых сирот (так уже вышло с #651/#652).
 *
 * Границы: парные скобки — легальная часть имени (Whoop «(подписка 199€/год)»,
 * Fujifilm «(20 sheets)») и обязаны остаться.
 */
import { describe, it, expect } from 'vitest'
import { dropUnmatchedParens, extractProductName } from '../lib/sheets-sync'
import baseline from './fixtures/sheet-name-baseline.json'

describe('dropUnmatchedParens', () => {
  it('срезает висящую закрывающую скобку', () => {
    expect(dropUnmatchedParens('iPad Air 11 128GB Blue Wi-Fi 2026) M4')).toBe('iPad Air 11 128GB Blue Wi-Fi 2026 M4')
    expect(dropUnmatchedParens('что-то )')).toBe('что-то ')
    expect(dropUnmatchedParens(')))')).toBe('')
  })

  it('парные скобки не трогает', () => {
    expect(dropUnmatchedParens('Whoop 5.0 ONE (подписка 199€/год)')).toBe('Whoop 5.0 ONE (подписка 199€/год)')
    expect(dropUnmatchedParens('iPad 11 (A16) 128GB Silver Wi-Fi (2025)')).toBe('iPad 11 (A16) 128GB Silver Wi-Fi (2025)')
    expect(dropUnmatchedParens('Картридж (20 sheets) от 10 шт')).toBe('Картридж (20 sheets) от 10 шт')
  })

  it('незакрытую ОТКРЫВАЮЩУЮ оставляет как есть (не наш случай)', () => {
    expect(dropUnmatchedParens('iPhone (17 Pro')).toBe('iPhone (17 Pro')
  })

  it('вложенные и смешанные случаи', () => {
    expect(dropUnmatchedParens('a (b (c)) d)')).toBe('a (b (c)) d')
    expect(dropUnmatchedParens('')).toBe('')
  })
})

describe('extractProductName: кривая и чистая строки ключуются в один товар', () => {
  it('сломанная «2026)» даёт то же имя, что и корректная «(2026)»', () => {
    const broken = extractProductName('iPad Air 11 128GB Blue Wi-Fi 2026) M4', 'Apple')
    const clean = extractProductName('iPad Air 11 128GB Blue Wi-Fi (2026) M4', 'Apple')
    expect(broken).toBe(clean)
    expect(broken).toBe('Ipad Air 11')
  })

  it('то же для iPad Air 13', () => {
    expect(extractProductName('iPad Air 13 256GB Starlight LTE 2026) M4', 'Apple')).toBe('Ipad Air 13')
    expect(extractProductName('iPad Air 13 256GB Starlight LTE (2026) M4', 'Apple')).toBe('Ipad Air 13')
  })

  it('легальные скобки в имени остаются', () => {
    expect(extractProductName('Whoop 5.0 ONE (подписка 199€/год)', 'Whoop')).toContain('(подписка 199€/год)')
    expect(extractProductName('Картридж Fujifilm Instax Mini Twin Pack (20 sheets) от 10 шт', 'Fujifilm')).toContain('(20 Sheets)')
  })
})

describe('РЕГРЕССИЯ на 838 живых строках: меняются ТОЛЬКО сломанные', () => {
  it('изменились ровно 58 строк и только два имени', () => {
    const changed = (baseline as Array<{ fullName: string; brand: string; name: string }>)
      .map(r => ({ ...r, got: extractProductName(r.fullName, r.brand) }))
      .filter(r => r.got !== r.name)

    expect(changed).toHaveLength(58)
    const transitions = [...new Set(changed.map(c => `${c.name} → ${c.got}`))].sort()
    expect(transitions).toEqual(['Ipad Air 11 ) → Ipad Air 11', 'Ipad Air 13 ) → Ipad Air 13'])
    // все изменившиеся — именно со сломанной скобкой в исходной строке
    for (const c of changed) expect(c.fullName).toMatch(/\d{4}\)/)
  })

  it('остальные 780 имён не тронуты — включая легальные скобки', () => {
    const rows = baseline as Array<{ fullName: string; brand: string; name: string }>
    const BROKEN = new Set(['Ipad Air 11 )', 'Ipad Air 13 )'])
    const untouched = rows.filter(r => !BROKEN.has(r.name))
    for (const r of untouched) {
      expect(extractProductName(r.fullName, r.brand)).toBe(r.name)
    }
    expect(untouched.length).toBe(780)
    // среди них — имена с парными скобками: они обязаны быть в выборке, а не исключены
    expect(untouched.some(r => /\(подписка/.test(r.name))).toBe(true)
    expect(untouched.some(r => /\(20 Sheets\)/i.test(r.name))).toBe(true)
  })
})
