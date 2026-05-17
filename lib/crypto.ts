/**
 * lib/crypto.ts
 *
 * Application-level AES-256-GCM encryption for sensitive values stored in DB.
 *
 * Key configuration:
 *   ENCRYPTION_KEY_V2 … V10 — явные версии
 *   ENCRYPTION_KEY — legacy; если нет V1..V10, считается V1; если V1 задан и отличается,
 *     при расшифровке перебираются оба (типичный сбой Railway: в БД данные от старого ключа).
 *
 * Versioned format: v{N}:{iv_hex}:{ciphertext_hex}:{authtag_hex}
 * Legacy format:    {iv_hex}:{ciphertext_hex}:{authtag_hex}  ← V1
 *
 * Generate a key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

function parseHexKey64(val: string, label: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(val)) throw new Error(`${label} must be 64-char hex`)
  return Buffer.from(val, 'hex')
}

/** Нумерованные ключи V1..V10 из env (только для шифрования / версий ≥2). */
function getNumberedVersionKeys(): Record<number, Buffer> {
  const keys: Record<number, Buffer> = {}
  for (let v = 1; v <= 10; v++) {
    const val = process.env[`ENCRYPTION_KEY_V${v}`]
    if (val) keys[v] = parseHexKey64(val, `ENCRYPTION_KEY_V${v}`)
  }
  return keys
}

function getLegacyKey(): Buffer | null {
  const legacyVal = process.env.ENCRYPTION_KEY
  if (!legacyVal) return null
  return parseHexKey64(legacyVal, 'ENCRYPTION_KEY')
}

/**
 * Карта версий для encrypt() и для decrypt версий > 1.
 * V1 в карте: пронумерованный V1 или, если его нет, legacy.
 */
function getKeys(): { version: number; key: Buffer }[] {
  const numbered = getNumberedVersionKeys()
  const legacy = getLegacyKey()

  if (Object.keys(numbered).length === 0) {
    if (!legacy) throw new Error('No encryption key configured. Set ENCRYPTION_KEY or ENCRYPTION_KEY_V1.')
    return [{ version: 1, key: legacy }]
  }

  const merged: Record<number, Buffer> = { ...numbered }
  if (!merged[1] && legacy) merged[1] = legacy

  if (Object.keys(merged).length === 0) {
    throw new Error('No encryption key configured. Set ENCRYPTION_KEY or ENCRYPTION_KEY_V1.')
  }

  return Object.entries(merged)
    .map(([v, key]) => ({ version: parseInt(v, 10), key }))
    .sort((a, b) => a.version - b.version)
}

/** Все кандидаты для расшифровки V1 (legacy и v1:…), порядок: V1 из env, затем ENCRYPTION_KEY если отличается. */
function getV1DecryptKeys(): Buffer[] {
  const numbered = getNumberedVersionKeys()
  const legacy = getLegacyKey()
  const out: Buffer[] = []
  const push = (b: Buffer) => {
    if (!out.some((x) => x.equals(b))) out.push(b)
  }
  if (numbered[1]) push(numbered[1])
  if (legacy) push(legacy)
  if (out.length === 0) {
    const k = getKeys().find((x) => x.version === 1)
    if (k) push(k.key)
  }
  if (out.length === 0) throw new Error('No encryption key configured for V1.')
  return out
}

function getLatestKey(): { version: number; key: Buffer } {
  const keys = getKeys()
  return keys[keys.length - 1]!
}

function getKeyByVersion(version: number): Buffer {
  const keys = getKeys()
  const found = keys.find((k) => k.version === version)
  if (!found) throw new Error(`Encryption key version ${version} not configured`)
  return found.key
}

function decryptRaw(key: Buffer, ivHex: string, ciphertextHex: string, tagHex: string, aad: string): string {
  const iv = Buffer.from(ivHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Invalid encrypted value: wrong IV or tag length')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}

/**
 * Encrypts a UTF-8 string with AES-256-GCM using the latest key version.
 * Returns: "v{N}:{iv_hex}:{ciphertext_hex}:{authtag_hex}"
 */
export function encrypt(text: string, aad: string = ''): string {
  const { version, key } = getLatestKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v${version}:${iv.toString('hex')}:${ciphertext.toString('hex')}:${tag.toString('hex')}`
}

/**
 * Decrypts a value produced by encrypt().
 * Supports versioned format "v{N}:..." and legacy format "iv:ct:tag" (treated as V1).
 * Throws if the format is invalid or authentication fails.
 */
export function decrypt(value: string, aad: string = ''): string {
  let ivHex: string, ciphertextHex: string, tagHex: string

  if (/^v\d+:/.test(value)) {
    const firstColon = value.indexOf(':')
    const version = parseInt(value.slice(1, firstColon), 10)
    if (isNaN(version)) throw new Error('Invalid version in encrypted value')
    const rest = value.slice(firstColon + 1)
    const parts = rest.split(':')
    if (parts.length !== 3) throw new Error('Invalid encrypted value format')
    ;[ivHex, ciphertextHex, tagHex] = parts as [string, string, string]

    if (version === 1) {
      return decryptV1TryKeys(ivHex, ciphertextHex, tagHex, aad)
    }
    const key = getKeyByVersion(version)
    return decryptRaw(key, ivHex, ciphertextHex, tagHex, aad)
  }

  const parts = value.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted value format')
  ;[ivHex, ciphertextHex, tagHex] = parts as [string, string, string]
  return decryptV1TryKeys(ivHex, ciphertextHex, tagHex, aad)
}

function decryptV1TryKeys(ivHex: string, ciphertextHex: string, tagHex: string, aad: string): string {
  const keys = getV1DecryptKeys()
  let last: Error | undefined
  for (const key of keys) {
    try {
      return decryptRaw(key, ivHex, ciphertextHex, tagHex, aad)
    } catch (e1) {
      if (aad) {
        try {
          return decryptRaw(key, ivHex, ciphertextHex, tagHex, '')
        } catch (e2) {
          last = e2 instanceof Error ? e2 : new Error(String(e2))
        }
      } else {
        last = e1 instanceof Error ? e1 : new Error(String(e1))
      }
    }
  }
  throw last ?? new Error('V1 decrypt failed')
}

/** Returns true if the value looks like an encrypted blob (versioned or legacy). */
export function isEncrypted(value: string): boolean {
  return /^v\d+:[0-9a-f]{24}:[0-9a-f]+:[0-9a-f]{32}$/.test(value) ||
    /^[0-9a-f]{24}:[0-9a-f]+:[0-9a-f]{32}$/.test(value)
}

/** Returns the key version used to encrypt a value, or null if unrecognized. */
export function getEncryptedKeyVersion(value: string): number | null {
  const m = value.match(/^v(\d+):/)
  if (m) return parseInt(m[1]!, 10)
  if (/^[0-9a-f]{24}:[0-9a-f]+:[0-9a-f]{32}$/.test(value)) return 1
  return null
}
