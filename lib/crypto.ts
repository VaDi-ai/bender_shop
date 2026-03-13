/**
 * lib/crypto.ts
 *
 * Application-level AES-256-GCM encryption for sensitive values stored in DB.
 *
 * Key configuration (in order of priority):
 *   ENCRYPTION_KEY_V2 — latest key (64-char hex, 32 bytes)
 *   ENCRYPTION_KEY_V1 — V1 key (64-char hex, 32 bytes)
 *   ENCRYPTION_KEY    — legacy fallback, treated as V1
 *
 * Versioned format: v{N}:{iv_hex}:{ciphertext_hex}:{authtag_hex}
 * Legacy format:    {iv_hex}:{ciphertext_hex}:{authtag_hex}  ← treated as V1
 *
 * Generate a key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

function getKeys(): { version: number; key: Buffer }[] {
  const keys: Record<number, Buffer> = {}

  // Support ENCRYPTION_KEY_V1, ENCRYPTION_KEY_V2, etc.
  for (let v = 1; v <= 10; v++) {
    const val = process.env[`ENCRYPTION_KEY_V${v}`]
    if (val) keys[v] = Buffer.from(val, 'hex')
  }

  // Fallback: plain ENCRYPTION_KEY treated as V1
  if (Object.keys(keys).length === 0 && process.env.ENCRYPTION_KEY) {
    keys[1] = Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  }

  if (Object.keys(keys).length === 0) {
    throw new Error('No encryption key configured. Set ENCRYPTION_KEY or ENCRYPTION_KEY_V1.')
  }

  return Object.entries(keys)
    .map(([v, key]) => ({ version: parseInt(v, 10), key }))
    .sort((a, b) => a.version - b.version)
}

function getLatestKey(): { version: number; key: Buffer } {
  const keys = getKeys()
  return keys[keys.length - 1]
}

function getKeyByVersion(version: number): Buffer {
  const keys = getKeys()
  const found = keys.find((k) => k.version === version)
  if (!found) throw new Error(`Encryption key version ${version} not configured`)
  return found.key
}

/**
 * Encrypts a UTF-8 string with AES-256-GCM using the latest key version.
 * Returns: "v{N}:{iv_hex}:{ciphertext_hex}:{authtag_hex}"
 */
export function encrypt(text: string): string {
  const { version, key } = getLatestKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v${version}:${iv.toString('hex')}:${ciphertext.toString('hex')}:${tag.toString('hex')}`
}

/**
 * Decrypts a value produced by encrypt().
 * Supports versioned format "v{N}:..." and legacy format "iv:ct:tag" (treated as V1).
 * Throws if the format is invalid or authentication fails.
 */
export function decrypt(value: string): string {
  let key: Buffer
  let ivHex: string, ciphertextHex: string, tagHex: string

  if (/^v\d+:/.test(value)) {
    // Versioned format: v{N}:iv:ct:tag
    const firstColon = value.indexOf(':')
    const version = parseInt(value.slice(1, firstColon), 10)
    if (isNaN(version)) throw new Error('Invalid version in encrypted value')
    key = getKeyByVersion(version)
    const rest = value.slice(firstColon + 1)
    const parts = rest.split(':')
    if (parts.length !== 3) throw new Error('Invalid encrypted value format')
    ;[ivHex, ciphertextHex, tagHex] = parts
  } else {
    // Legacy format: iv:ct:tag — use V1 key
    const parts = value.split(':')
    if (parts.length !== 3) throw new Error('Invalid encrypted value format')
    ;[ivHex, ciphertextHex, tagHex] = parts
    key = getKeyByVersion(1)
  }

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

/** Returns true if the value looks like an encrypted blob (versioned or legacy). */
export function isEncrypted(value: string): boolean {
  return /^v\d+:[0-9a-f]{24}:[0-9a-f]+:[0-9a-f]{32}$/.test(value) ||
    /^[0-9a-f]{24}:[0-9a-f]+:[0-9a-f]{32}$/.test(value)
}

/** Returns the key version used to encrypt a value, or null if unrecognized. */
export function getEncryptedKeyVersion(value: string): number | null {
  const m = value.match(/^v(\d+):/)
  if (m) return parseInt(m[1], 10)
  if (/^[0-9a-f]{24}:[0-9a-f]+:[0-9a-f]{32}$/.test(value)) return 1
  return null
}
