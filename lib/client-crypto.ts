/**
 * lib/client-crypto.ts
 *
 * Helpers for encrypting/decrypting Client PII fields (phone, email, birthDate).
 * Wraps the core AES-256-GCM functions from lib/crypto.ts.
 */

import { encrypt, decrypt, isEncrypted } from './crypto'
import log from './logger'

export function encryptClientField(value: string | null | undefined, fieldName?: string): string | null {
  if (value == null || value === '') return null
  return encrypt(value, fieldName ?? '')
}

// BEFORE DEPLOYING: run /backup in bot or npm run backup to create a restore point
export function decryptClientField(value: string | null | undefined, fieldName?: string): string | null {
  if (value == null || value === '') return null
  if (!isEncrypted(value)) return value

  const aad = fieldName ?? ''
  try {
    return decrypt(value, aad)
  } catch (err) {
    // Fallback ONLY for legacy data (no version prefix = encrypted before AAD was introduced)
    if (!/^v\d+:/.test(value)) {
      log.warn('[Crypto] Legacy decryption without AAD, consider re-encrypting', { fieldName })
      return decrypt(value)  // legacy format: no version, no AAD
    }
    // Versioned data MUST decrypt with AAD — if it fails, it's corrupted or tampered
    log.error('[Crypto] AAD decryption failed for versioned data', { fieldName, err: err instanceof Error ? err.message : String(err) })
    throw err  // don't silently swallow — this could be tampering
  }
}

export function encryptDate(date: Date | null | undefined, fieldName?: string): string | null {
  if (date == null) return null
  return encrypt(date.toISOString(), fieldName ?? '')
}

export function decryptDate(value: string | null | undefined, fieldName?: string): Date | null {
  if (value == null || value === '') return null
  if (!isEncrypted(value)) {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }

  const aad = fieldName ?? ''
  let iso: string
  try {
    iso = decrypt(value, aad)
  } catch (err) {
    if (!/^v\d+:/.test(value)) {
      log.warn('[Crypto] Legacy date decryption without AAD', { fieldName })
      iso = decrypt(value)
    } else {
      log.error('[Crypto] AAD date decryption failed for versioned data', { fieldName })
      throw err
    }
  }
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}
