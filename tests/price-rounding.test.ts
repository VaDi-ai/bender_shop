/**
 * Округление «вверх до 100 везде» (решение владельца): ядро для веток
 * mirror/respect/create синка. Идемпотентность гарантирует, что второй прогон
 * ничего не переписывает (нет осцилляции лист↔БД).
 */
import { describe, it, expect } from 'vitest'
import { roundPrice, formatShopTime } from '../lib/currency'

describe('roundPrice — вверх до 100', () => {
  it('хвосты «…90» и сырые цены подтягиваются вверх', () => {
    expect(roundPrice(91_990)).toBe(92_000)
    expect(roundPrice(169_990)).toBe(170_000)
    expect(roundPrice(41_986)).toBe(42_000)
    expect(roundPrice(155_999)).toBe(156_000)
    expect(roundPrice(122_550)).toBe(122_600)
  })

  it('кратные 100 не меняются — синк не будет переписывать чистые цены', () => {
    for (const x of [92_000, 100, 76_000, 1_000_000]) expect(roundPrice(x)).toBe(x)
  })

  it('идемпотентность: round(round(x)) = round(x)', () => {
    for (const x of [91_990, 41_986, 155_999, 99.5, 101, 100]) {
      expect(roundPrice(roundPrice(x))).toBe(roundPrice(x))
    }
  })

  it('ноль и отрицательные → 0 (цена «по запросу» не трогается)', () => {
    expect(roundPrice(0)).toBe(0)
    expect(roundPrice(-500)).toBe(0)
  })
})

describe('formatShopTime — колонка P: дата И время в МСК', () => {
  it('формат дд.мм.гггг чч:мм, таймзона Europe/Moscow', () => {
    // 12:00 UTC = 15:00 МСК
    expect(formatShopTime(new Date('2026-08-06T12:00:00Z'))).toBe('06.08.2026 15:00')
  })
})
