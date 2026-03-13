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
/**
 * Encrypts a UTF-8 string with AES-256-GCM.
 * Returns: "<iv_hex>:<ciphertext_hex>:<authtag_hex>"
 */
export declare function encrypt(text: string): string;
/**
 * Decrypts a value produced by encrypt().
 * Throws if the format is invalid or authentication fails.
 */
export declare function decrypt(value: string): string;
/** Returns true if the value looks like an encrypted blob (for migration use). */
export declare function isEncrypted(value: string): boolean;
//# sourceMappingURL=crypto.d.ts.map