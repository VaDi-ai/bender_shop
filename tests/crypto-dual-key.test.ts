import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

/** ciphertext зашифрован ENCRYPTION_KEY (legacy); при добавлении V1 с другим hex оба должны открывать V1. */
describe('crypto dual V1 keys', () => {
  const hex = (n: number) => n.toString(16).padStart(2, '0').repeat(32).slice(0, 64)

  const saved = { ...process.env }

  beforeAll(() => {
    vi.resetModules()
    process.env.ENCRYPTION_KEY = hex(1)
    process.env.ENCRYPTION_KEY_V1 = hex(2)
    delete process.env.ENCRYPTION_KEY_V2
  })

  afterAll(() => {
    Object.assign(process.env, saved)
    vi.resetModules()
  })

  it('decrypts blob from legacy key after V1 env was added', async () => {
    vi.resetModules()
    process.env.ENCRYPTION_KEY = hex(1)
    delete process.env.ENCRYPTION_KEY_V1
    const { encrypt } = await import('../lib/crypto')
    const blob = encrypt('secret-data', 'svc')

    vi.resetModules()
    process.env.ENCRYPTION_KEY = hex(1)
    process.env.ENCRYPTION_KEY_V1 = hex(2)
    const { decrypt } = await import('../lib/crypto')
    expect(decrypt(blob, 'svc')).toBe('secret-data')
  })
})
