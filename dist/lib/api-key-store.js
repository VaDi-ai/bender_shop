"use strict";
/**
 * lib/api-key-store.ts
 *
 * Thin wrappers around prisma.apiKey that transparently encrypt on write
 * and decrypt on read. All application code should use these helpers instead
 * of calling prisma.apiKey directly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiKeyValue = getApiKeyValue;
exports.setApiKeyValue = setApiKeyValue;
const prisma_1 = require("./prisma");
const crypto_1 = require("./crypto");
/**
 * Read a stored ApiKey value, decrypting it.
 * Returns null if the record does not exist.
 */
async function getApiKeyValue(service) {
    const record = await prisma_1.prisma.apiKey.findUnique({ where: { service } });
    if (!record)
        return null;
    return (0, crypto_1.decrypt)(record.value);
}
/**
 * Write an ApiKey value, encrypting it first.
 * Creates the record if it doesn't exist; updates it otherwise.
 */
async function setApiKeyValue(service, value) {
    const encValue = (0, crypto_1.encrypt)(value);
    await prisma_1.prisma.apiKey.upsert({
        where: { service },
        create: { service, value: encValue },
        update: { value: encValue },
    });
}
//# sourceMappingURL=api-key-store.js.map