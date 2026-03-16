/**
 * lib/client-crypto.ts
 *
 * Helpers for encrypting/decrypting Client PII fields (phone, email, birthDate).
 * Wraps the core AES-256-GCM functions from lib/crypto.ts.
 */

import { encrypt, decrypt, isEncrypted } from './crypto'

export function encryptClientField(value: string | null | undefined, fieldName?: string): string | null {
  if (value == null || value === '') return null
  return encrypt(value, fieldName ?? '')
}

export function decryptClientField(value: string | null | undefined, fieldName?: string): string | null {
  if (value == null || value === '') return null
  if (!isEncrypted(value)) return value
  try {
    return decrypt(value, fieldName ?? '')
  } catch {
    return decrypt(value)  // fallback for data without AAD
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
  let iso: string
  try {
    iso = decrypt(value, fieldName ?? '')
  } catch {
    iso = decrypt(value)  // fallback for data without AAD
  }
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}
