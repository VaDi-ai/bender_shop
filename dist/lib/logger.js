"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeLog = safeLog;
const SECRET_SUBSTRINGS = [
    'token', 'key', 'password', 'secret',
    'auth', 'bearer', 'credential', 'phone', 'email', 'card', 'cvv', 'otp', 'pin',
];
function sanitizeValue(value, depth) {
    if (depth >= 3)
        return value;
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeValue(item, depth + 1));
    }
    if (value !== null && typeof value === 'object') {
        return sanitizeObject(value, depth + 1);
    }
    return value;
}
function sanitizeObject(data, depth) {
    const result = {};
    for (const field of Object.keys(data)) {
        if (SECRET_SUBSTRINGS.some((s) => field.toLowerCase().includes(s))) {
            result[field] = '***';
        }
        else {
            result[field] = sanitizeValue(data[field], depth);
        }
    }
    return result;
}
function safeLog(message, data) {
    if (!data) {
        console.log(message);
        return;
    }
    console.log(message, sanitizeObject(data, 0));
}
//# sourceMappingURL=logger.js.map