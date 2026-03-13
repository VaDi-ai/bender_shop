"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.isEncrypted = isEncrypted;
const crypto_1 = require("crypto");
if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is required but not set');
}
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
function getKey() {
    const hex = process.env.ENCRYPTION_KEY;
    if (hex.length !== 64) {
        throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }
    return Buffer.from(hex, 'hex');
}
/**
 * Encrypts a UTF-8 string with AES-256-GCM.
 * Returns: "<iv_hex>:<ciphertext_hex>:<authtag_hex>"
 */
function encrypt(text) {
    const key = getKey();
    const iv = (0, crypto_1.randomBytes)(IV_BYTES);
    const cipher = (0, crypto_1.createCipheriv)(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${ciphertext.toString('hex')}:${tag.toString('hex')}`;
}
/**
 * Decrypts a value produced by encrypt().
 * Throws if the format is invalid or authentication fails.
 */
function decrypt(value) {
    const parts = value.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted value format');
    }
    const [ivHex, ciphertextHex, tagHex] = parts;
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
        throw new Error('Invalid encrypted value: wrong IV or tag length');
    }
    const decipher = (0, crypto_1.createDecipheriv)(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}
/** Returns true if the value looks like an encrypted blob (for migration use). */
function isEncrypted(value) {
    return /^[0-9a-f]{24}:[0-9a-f]+:[0-9a-f]{32}$/.test(value);
}
//# sourceMappingURL=crypto.js.map