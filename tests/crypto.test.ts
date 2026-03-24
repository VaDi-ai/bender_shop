import { describe, it, expect, beforeAll, afterAll } from 'vitest'

describe('crypto', () => {
  const originalKey = process.env.ENCRYPTION_KEY_V1

  beforeAll(() => {
    if (!process.env.ENCRYPTION_KEY_V1) {
      process.env.ENCRYPTION_KEY_V1 = 'a'.repeat(64)
    }
  })

  afterAll(() => {
    if (originalKey) process.env.ENCRYPTION_KEY_V1 = originalKey
    else delete process.env.ENCRYPTION_KEY_V1
  })

  it('encrypt → decrypt round-trip', async () => {
    const { encrypt, decrypt, isEncrypted } = await import('../lib/crypto')
    const text = '+7 999 123 45 67'
    const encrypted = encrypt(text, 'phone')
    expect(isEncrypted(encrypted)).toBe(true)
    expect(decrypt(encrypted, 'phone')).toBe(text)
  })

  it('AAD mismatch throws', async () => {
    const { encrypt, decrypt } = await import('../lib/crypto')
    const encrypted = encrypt('test', 'phone')
    expect(() => decrypt(encrypted, 'email')).toThrow()
  })

  it('isEncrypted detects versioned format', async () => {
    const { isEncrypted } = await import('../lib/crypto')
    expect(isEncrypted('v1:aabbccddee112233aabbccdd:cafe:1234567890abcdef1234567890abcdef')).toBe(true)
    expect(isEncrypted('plain text')).toBe(false)
  })
})
