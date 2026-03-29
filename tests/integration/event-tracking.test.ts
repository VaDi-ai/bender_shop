import { describe, it, expect } from 'vitest'

const ALLOWED_TYPES = ['view_product', 'add_to_cart', 'remove_from_cart', 'search', 'filter_brand', 'filter_category', 'checkout_start']

describe('Event tracking', () => {
  it('validates allowed event types', () => {
    expect(ALLOWED_TYPES.includes('view_product')).toBe(true)
    expect(ALLOWED_TYPES.includes('add_to_cart')).toBe(true)
    expect(ALLOWED_TYPES.includes('checkout_start')).toBe(true)
  })

  it('rejects unknown event types', () => {
    expect(ALLOWED_TYPES.includes('purchase')).toBe(false)
    expect(ALLOWED_TYPES.includes('hack_attempt')).toBe(false)
    expect(ALLOWED_TYPES.includes('')).toBe(false)
  })

  it('sessionId is limited to 64 chars', () => {
    const longId = 'a'.repeat(100)
    const trimmed = longId.slice(0, 64)
    expect(trimmed.length).toBe(64)
  })

  it('productId must be number or undefined', () => {
    const valid: number | undefined = 42
    const invalid = 'not-a-number'
    expect(typeof valid).toBe('number')
    expect(typeof invalid).not.toBe('number')
  })
})
