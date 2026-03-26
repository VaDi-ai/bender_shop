import { describe, it, expect } from 'vitest'

const SIX_HOURS = 6 * 60 * 60 * 1000

function isStale(dateStr: string, now: number): boolean {
  if (!dateStr) return true
  const parts = dateStr.split('.')
  if (parts.length < 3) return true
  const dayMonthYear = parts[2].split(' ')
  const year = parseInt(dayMonthYear[0], 10)
  const month = parseInt(parts[1], 10) - 1
  const day = parseInt(parts[0], 10)
  const updateDate = new Date(year, month, day)
  if (dayMonthYear[1]) {
    const timeParts = dayMonthYear[1].split(':')
    updateDate.setHours(parseInt(timeParts[0], 10) || 0, parseInt(timeParts[1], 10) || 0)
  }
  return (now - updateDate.getTime()) > SIX_HOURS
}

describe('Stale price detection', () => {
  it('empty date is stale', () => {
    expect(isStale('', Date.now())).toBe(true)
  })

  it('date > 6h ago is stale', () => {
    const now = new Date(2026, 2, 25, 18, 0).getTime()
    expect(isStale('25.03.2026 10:00', now)).toBe(true)
  })

  it('date < 6h ago is not stale', () => {
    const now = new Date(2026, 2, 25, 18, 0).getTime()
    expect(isStale('25.03.2026 14:00', now)).toBe(false)
  })

  it('date without time treats as midnight', () => {
    const now = new Date(2026, 2, 25, 4, 0).getTime()
    expect(isStale('25.03.2026', now)).toBe(false)
  })

  it('invalid format is stale', () => {
    expect(isStale('invalid', Date.now())).toBe(true)
  })
})
