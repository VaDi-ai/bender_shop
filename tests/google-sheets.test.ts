import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isExcludedSheet } from '../lib/google-sheets'

describe('isExcludedSheet', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.EXCLUDED_SHEET_PREFIX
    delete process.env.EXCLUDED_SHEET_NAMES
  })

  afterEach(() => {
    process.env = env
  })

  it('исключает листы с префиксом «не использовать»', () => {
    expect(isExcludedSheet('не использовать')).toBe(true)
    expect(isExcludedSheet('Не использовать')).toBe(true)
    expect(isExcludedSheet('не использовать 2')).toBe(true)
    expect(isExcludedSheet('  не использовать 2  ')).toBe(true)
  })

  it('не исключает рабочие листы', () => {
    expect(isExcludedSheet('телефоны')).toBe(false)
    expect(isExcludedSheet('Mac')).toBe(false)
    expect(isExcludedSheet('Apple Watch / Air Pods')).toBe(false)
  })

  it('поддерживает дополнительные имена через EXCLUDED_SHEET_NAMES', () => {
    process.env.EXCLUDED_SHEET_NAMES = 'архив, draft'
    expect(isExcludedSheet('архив')).toBe(true)
    expect(isExcludedSheet('Draft')).toBe(true)
    expect(isExcludedSheet('телефоны')).toBe(false)
  })

  it('пустое имя листа считается служебным', () => {
    expect(isExcludedSheet('')).toBe(true)
    expect(isExcludedSheet('   ')).toBe(true)
  })
})
