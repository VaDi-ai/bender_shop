"use strict";
/**
 * lib/notify-admins.ts — Уведомления администраторов об ошибках AI API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAdminNotifications = initAdminNotifications;
exports.notifyAdminsAboutApiError = notifyAdminsAboutApiError;
const api_errors_1 = require("./api-errors");
let _bot = null;
const _adminIds = [];
/** Вызвать один раз при старте бота */
function initAdminNotifications(bot, adminIds) {
    _bot = bot;
    _adminIds.length = 0;
    _adminIds.push(...adminIds);
}
/** Уведомить всех администраторов об ошибке AI API */
async function notifyAdminsAboutApiError(error, context) {
    if (!_bot || _adminIds.length === 0)
        return;
    const msg = (0, api_errors_1.humanizeApiError)(error);
    const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const text = `⚠️ Ошибка AI API\n\nКонтекст: ${context}\n${msg}\n\nВремя: ${time}`;
    for (const adminId of _adminIds) {
        try {
            await _bot.telegram.sendMessage(adminId, text, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 Обновить ключ OpenRouter', callback_data: 'api_key_update_openrouter' }],
                    ],
                },
            });
        }
        catch {
            // ignore — admin may have blocked the bot
        }
    }
}
//# sourceMappingURL=notify-admins.js.map