import { describe, it, expect } from 'vitest'

// Copied from lib/avito-sync.ts (not exported)
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[()[\].,]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/гб|gb/gi, 'gb')
    .replace(/тб|tb/gi, 'tb')
    .replace(/sim\s*\+\s*esim?/gi, '')
    .replace(/wi\s*-?\s*fi/gi, 'wifi')
    .replace(/\s*(ревизия|rev)\s*/gi, ' ')
    .replace(/go\s*pro/gi, 'gopro')
    .replace(/ray[\s-]*ban/gi, 'rayban')
    .replace(/умные\s*очки/gi, '')
    .trim()
}

describe('avito normalize', () => {
  it('normalizes memory units', () => {
    expect(normalize('256 ГБ')).toBe('256 gb')
    expect(normalize('1 ТБ')).toBe('1 tb')
  })

  it('normalizes brand names', () => {
    expect(normalize('Ray-Ban Meta')).toBe('rayban meta')
    expect(normalize('Go Pro Hero')).toBe('gopro hero')
  })

  it('normalizes Wi-Fi', () => {
    expect(normalize('Wi-Fi 6')).toBe('wifi 6')
  })
})
