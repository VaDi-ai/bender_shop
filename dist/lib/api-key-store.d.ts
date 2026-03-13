/**
 * lib/api-key-store.ts
 *
 * Thin wrappers around prisma.apiKey that transparently encrypt on write
 * and decrypt on read. All application code should use these helpers instead
 * of calling prisma.apiKey directly.
 */
/**
 * Read a stored ApiKey value, decrypting it.
 * Returns null if the record does not exist.
 */
export declare function getApiKeyValue(service: string): Promise<string | null>;
/**
 * Write an ApiKey value, encrypting it first.
 * Creates the record if it doesn't exist; updates it otherwise.
 * Persists the key version used so migrations can detect stale records.
 */
export declare function setApiKeyValue(service: string, value: string): Promise<void>;
//# sourceMappingURL=api-key-store.d.ts.map