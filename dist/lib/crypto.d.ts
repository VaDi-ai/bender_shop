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
/**
 * Encrypts a UTF-8 string with AES-256-GCM using the latest key version.
 * Returns: "v{N}:{iv_hex}:{ciphertext_hex}:{authtag_hex}"
 */
export declare function encrypt(text: string): string;
/**
 * Decrypts a value produced by encrypt().
 * Supports versioned format "v{N}:..." and legacy format "iv:ct:tag" (treated as V1).
 * Throws if the format is invalid or authentication fails.
 */
export declare function decrypt(value: string): string;
/** Returns true if the value looks like an encrypted blob (versioned or legacy). */
export declare function isEncrypted(value: string): boolean;
/** Returns the key version used to encrypt a value, or null if unrecognized. */
export declare function getEncryptedKeyVersion(value: string): number | null;
//# sourceMappingURL=crypto.d.ts.map