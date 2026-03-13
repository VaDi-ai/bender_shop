/**
 * lib/crypto.ts
 *
 * Application-level AES-256-GCM encryption for sensitive values stored in DB.
 *
 * ENCRYPTION_KEY must be a 64-char hex string (32 bytes).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Encrypted format: <iv_hex>:<ciphertext_hex>:<authtag_hex>
 * The iv is 12 bytes (96 bits) — recommended for AES-GCM.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is required')
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(key, 'hex')
}

/**
 * Encrypts a UTF-8 string with AES-256-GCM.
 * Returns: "<iv_hex>:<ciphertext_hex>:<authtag_hex>"
 */
export function encrypt(text: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${ciphertext.toString('hex')}:${tag.toString('hex')}`
}

/**
 * Decrypts a value produced by encrypt().
 * Throws if the format is invalid or authentication fails.
 */
export function decrypt(value: string): string {
  const parts = value.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format')
  }
  const [ivHex, ciphertextHex, tagHex] = parts
  const key = getKey()
  const iv = Buffer.from(ivHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Invalid encrypted value: wrong IV or tag length')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}

/** Returns true if the value looks like an encrypted blob (for migration use). */
export function isEncrypted(value: string): boolean {
  return /^[0-9a-f]{24}:[0-9a-f]+:[0-9a-f]{32}$/.test(value)
}
