/**
 * lib/client-crypto.ts
 *
 * Helpers for encrypting/decrypting Client PII fields (phone, email, birthDate).
 * Wraps the core AES-256-GCM functions from lib/crypto.ts.
 */

import { encrypt, decrypt, isEncrypted } from './crypto'

export function encryptClientField(value: string | null | undefined): string | null {
  if (value == null || value === '') return null
  return encrypt(value)
}

export function decryptClientField(value: string | null | undefined): string | null {
  if (value == null || value === '') return null
  if (!isEncrypted(value)) return value
  return decrypt(value)
}

export function encryptDate(date: Date | null | undefined): string | null {
  if (date == null) return null
  return encrypt(date.toISOString())
}

export function decryptDate(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null
  if (!isEncrypted(value)) {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  const iso = decrypt(value)
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}
