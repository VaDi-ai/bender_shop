"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSecurityAlerts = initSecurityAlerts;
exports.logSecurityEvent = logSecurityEvent;
const prisma_1 = require("./prisma");
// ─── Ссылка на бот для реалтайм-алертов ──────────────────────────────────────
let _bot = null;
let _adminIds = [];
function initSecurityAlerts(bot, adminIds) {
    _bot = bot;
    _adminIds = adminIds;
}
// ─── Критичные события → немедленное уведомление ─────────────────────────────
const CRITICAL_EVENTS = [
    'price_manipulation_attempt',
    'unauthorized_access',
    'invalid_telegram_signature',
];
const EVENT_DESCRIPTIONS = {
    price_manipulation_attempt: '💰 Попытка подмены цены в заказе',
    unauthorized_access: '🚫 Попытка несанкционированного доступа к админке',
    invalid_telegram_signature: '🔑 Запрос с неверной подписью Telegram',
    rate_limit_exceeded: '⏳ Превышен лимит запросов',
    invalid_order_data: '📋 Неверные данные заказа',
};
const SENSITIVE_KEY_PATTERNS = ['token', 'key', 'hash', 'secret'];
function sanitizeDetails(obj, depth = 0) {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
        const lk = k.toLowerCase();
        if (SENSITIVE_KEY_PATTERNS.some((p) => lk.includes(p))) {
            result[k] = '***';
        }
        else if (depth < 2 && v !== null && typeof v === 'object' && !Array.isArray(v)) {
            result[k] = sanitizeDetails(v, depth + 1);
        }
        else if (typeof v === 'string') {
            result[k] = v.slice(0, 200);
        }
        else {
            result[k] = v;
        }
    }
    return result;
}
function formatSecurityAlert(event, details) {
    const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const desc = EVENT_DESCRIPTIONS[event] ?? event;
    const safe = sanitizeDetails(details);
    const detailsStr = Object.entries(safe)
        .map(([k, v]) => `${k}: ${String(v).replace(/\n/g, '\\n')}`)
        .join('\n');
    return `⚠️ СОБЫТИЕ БЕЗОПАСНОСТИ\n\n${desc}\nВремя: ${time}\n\n${detailsStr}`;
}
// ─── Основная функция логирования ─────────────────────────────────────────────
async function logSecurityEvent(event, details) {
    const safe = sanitizeDetails(details);
    console.warn(`[SECURITY] ${event}:`, safe);
    try {
        await prisma_1.prisma.securityLog.create({
            data: {
                event,
                details: JSON.stringify(safe),
                ip: details.ip ?? null,
            },
        });
    }
    catch { }
    if (CRITICAL_EVENTS.includes(event) && _bot && _adminIds.length > 0) {
        const text = formatSecurityAlert(event, safe);
        for (const adminId of _adminIds) {
            try {
                await _bot.telegram.sendMessage(adminId, text);
            }
            catch { }
        }
    }
}
//# sourceMappingURL=security-log.js.map