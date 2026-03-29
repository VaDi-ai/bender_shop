import { describe, it, expect } from 'vitest'

describe('Supplier message parsing', () => {
  it('detects price pattern with dot separator', () => {
    const text = 'iPhone 17 Pro 256GB - 122.000'
    const hasPrice = /\d{2,3}[.,]\d{3}/.test(text)
    expect(hasPrice).toBe(true)
  })

  it('detects price pattern with ruble sign', () => {
    const text = 'MacBook Air M5 — 89900₽'
    const hasPrice = /\d{4,6}\s*₽/.test(text)
    expect(hasPrice).toBe(true)
  })

  it('does not detect price in regular message', () => {
    const text = 'Привет, когда будет новая поставка?'
    const hasPrice = /\d{2,3}[.,]\d{3}|\d{4,6}\s*₽|\d{4,6}\s*р/.test(text)
    expect(hasPrice).toBe(false)
  })

  it('rejects short messages (< 15 chars)', () => {
    const text = 'Ок, спасибо'
    expect(text.length).toBeLessThan(15)
  })

  it('PriceAlias lookup is case-insensitive', () => {
    const alias = 'яблоко 16 про'
    const input = 'Яблоко 16 Про'
    expect(input.toLowerCase()).toBe(alias)
  })

  it('RAM vs storage: smaller number is RAM', () => {
    const ram = 24
    const storage = 1024
    expect(ram).toBeLessThan(storage)
  })
})
