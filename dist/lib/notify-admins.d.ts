/**
 * lib/notify-admins.ts — Уведомления администраторов об ошибках AI API
 */
import { Telegraf } from 'telegraf';
/** Вызвать один раз при старте бота */
export declare function initAdminNotifications(bot: Telegraf, adminIds: number[]): void;
/** Уведомить всех администраторов об ошибке AI API */
export declare function notifyAdminsAboutApiError(error: unknown, context: string): Promise<void>;
//# sourceMappingURL=notify-admins.d.ts.map