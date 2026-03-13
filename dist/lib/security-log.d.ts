import { Telegraf } from 'telegraf';
export type SecurityEvent = 'invalid_telegram_signature' | 'price_manipulation_attempt' | 'rate_limit_exceeded' | 'invalid_order_data' | 'unauthorized_access';
export declare function initSecurityAlerts(bot: Telegraf, adminIds: number[]): void;
export declare function logSecurityEvent(event: SecurityEvent, details: Record<string, any>, adminTelegramId?: string | number): Promise<void>;
//# sourceMappingURL=security-log.d.ts.map