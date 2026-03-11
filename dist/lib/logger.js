"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeLog = safeLog;
const SECRET_SUBSTRINGS = ['token', 'key', 'password', 'secret'];
function safeLog(message, data) {
    if (!data) {
        console.log(message);
        return;
    }
    const sanitized = { ...data };
    for (const field of Object.keys(sanitized)) {
        if (SECRET_SUBSTRINGS.some((s) => field.toLowerCase().includes(s))) {
            sanitized[field] = '***';
        }
    }
    console.log(message, sanitized);
}
//# sourceMappingURL=logger.js.map