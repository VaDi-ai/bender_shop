/**
 * bot/admin/ai_settings.ts
 *
 * Панель управления AI Sales Agent + управление API ключами.
 * Подключение в bot/index.ts:
 *   setupAISettingsHandlers(bot)
 *   setupApiKeysHandlers(bot)
 *   bot.hears('🤖 AI Агент', ...) → showAISettings(ctx)
 *   bot.hears('🔑 API Ключи', ...) → showApiKeysMenu(ctx)
 */
import { Context, Telegraf } from 'telegraf';
type ApiKeysFlow = {
    flow: 'awaiting_openrouter_key';
};
export declare const apiKeysState: Map<number, ApiKeysFlow>;
export declare const securityState: Map<number, {
    flow: "awaiting_sec_clear_confirm";
}>;
export declare function handleSecurityMessage(ctx: Context, userId: number, text: string): Promise<boolean>;
export declare function maskKey(key: string): string;
export declare function showAISettings(ctx: Context): Promise<void>;
export declare function showSecurityLog(ctx: Context): Promise<void>;
export declare function showApiKeysMenu(ctx: Context): Promise<void>;
export declare function handleApiKeysMessage(ctx: Context, userId: number, text: string): Promise<boolean>;
export declare function setupAISettingsHandlers(bot: Telegraf): void;
export declare function setupApiKeysHandlers(bot: Telegraf): void;
export {};
//# sourceMappingURL=ai_settings.d.ts.map