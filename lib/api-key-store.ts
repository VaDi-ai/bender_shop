/**
 * lib/api-key-store.ts
 *
 * Thin wrappers around prisma.apiKey that transparently encrypt on write
 * and decrypt on read. All application code should use these helpers instead
 * of calling prisma.apiKey directly.
 */

import { prisma } from './prisma'
import { encrypt, decrypt } from './crypto'

/**
 * Read a stored ApiKey value, decrypting it.
 * Returns null if the record does not exist.
 */
export async function getApiKeyValue(service: string): Promise<string | null> {
  const record = await prisma.apiKey.findUnique({ where: { service } })
  if (!record) return null
  return decrypt(record.value)
}

/**
 * Write an ApiKey value, encrypting it first.
 * Creates the record if it doesn't exist; updates it otherwise.
 * Persists the key version used so migrations can detect stale records.
 */
export async function setApiKeyValue(service: string, value: string): Promise<void> {
  const encValue = encrypt(value)
  const keyVersion = encValue.startsWith('v')
    ? parseInt(encValue.slice(1, encValue.indexOf(':')), 10)
    : 1
  await prisma.apiKey.upsert({
    where: { service },
    create: { service, value: encValue, keyVersion },
    update: { value: encValue, keyVersion },
  })
}
