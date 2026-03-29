import { describe, it, expect } from 'vitest'

const SENSITIVE_KEYS = /token|secret|password|key|phone|email|address|card|cvv|otp|pin|credential|bearer|пароль|телефон/i

describe('PII sanitization patterns', () => {
  it('detects phone key', () => {
    expect(SENSITIVE_KEYS.test('customerPhone')).toBe(true)
    expect(SENSITIVE_KEYS.test('phone')).toBe(true)
  })

  it('detects email key', () => {
    expect(SENSITIVE_KEYS.test('email')).toBe(true)
    expect(SENSITIVE_KEYS.test('userEmail')).toBe(true)
  })

  it('detects secret/token keys', () => {
    expect(SENSITIVE_KEYS.test('accessToken')).toBe(true)
    expect(SENSITIVE_KEYS.test('AVITO_CLIENT_SECRET')).toBe(true)
    expect(SENSITIVE_KEYS.test('password')).toBe(true)
  })

  it('does not flag safe keys', () => {
    expect(SENSITIVE_KEYS.test('productId')).toBe(false)
    expect(SENSITIVE_KEYS.test('quantity')).toBe(false)
    expect(SENSITIVE_KEYS.test('category')).toBe(false)
    expect(SENSITIVE_KEYS.test('orderId')).toBe(false)
  })

  it('detects card/credential keys', () => {
    expect(SENSITIVE_KEYS.test('cardNumber')).toBe(true)
    expect(SENSITIVE_KEYS.test('credential')).toBe(true)
    expect(SENSITIVE_KEYS.test('bearer')).toBe(true)
  })
})
