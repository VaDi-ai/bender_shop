/**
 * lib/api-key-store.ts
 *
 * Thin wrappers around prisma.apiKey that transparently encrypt on write
 * and decrypt on read. All application code should use these helpers instead
 * of calling prisma.apiKey directly.
 */

import { prisma } from './prisma'
import { encrypt, decrypt, getEncryptedKeyVersion } from './crypto'
import log from './logger'

/**
 * Read a stored ApiKey value, decrypting it.
 * Returns null if the record does not exist or ciphertext cannot be authenticated (wrong key / corrupt row).
 */
export async function getApiKeyValue(service: string): Promise<string | null> {
  try {
    const record = await prisma.apiKey.findUnique({ where: { service } })
    if (!record) return null
    try {
      return decrypt(record.value, service)  // try with AAD
    } catch {
      try {
        return decrypt(record.value)  // fallback without AAD for old data
      } catch (e) {
        log.warn('ApiKey decrypt failed', {
          service,
          error: e instanceof Error ? e.message : String(e),
        })
        return null
      }
    }
  } catch (e) {
    log.error('ApiKey read failed', {
      service,
      error: e instanceof Error ? e.message : String(e),
    })
    return null
  }
}

/**
 * Write an ApiKey value, encrypting it first.
 * Creates the record if it doesn't exist; updates it otherwise.
 * Persists the key version used so migrations can detect stale records.
 */
export async function setApiKeyValue(service: string, value: string): Promise<void> {
  const encValue = encrypt(value, service)  // always with AAD
  const keyVersion = getEncryptedKeyVersion(encValue) ?? 1
  await prisma.apiKey.upsert({
    where: { service },
    create: { service, value: encValue, keyVersion },
    update: { value: encValue, keyVersion },
  })
}
