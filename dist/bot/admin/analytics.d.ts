/**
 * bot/admin/analytics.ts
 *
 * Расширенная аналитика: отчёт за период, топ товаров, топ клиентов, отчёт по клиенту.
 *
 * Подключение в bot/index.ts:
 *   setupAnalyticsHandlers(bot)
 *   showAnalyticsToday(ctx)          — вызывается из bot.hears('📊 Аналитика')
 *   handleAnalyticsMessage(...)      — вызывается из перехватчика текста
 *   analyticsState                   — проверять/очищать при нажатии кнопок меню
 */
import { Context, Telegraf } from 'telegraf';
type AnalyticsFlowState = {
    flow: 'custom_period';
    target: 'main' | 'top_prod' | 'top_cli';
};
export declare const analyticsState: Map<number, AnalyticsFlowState>;
export declare function showAnalyticsToday(ctx: Context): Promise<void>;
export declare function handleAnalyticsMessage(ctx: Context, userId: number, text: string): Promise<boolean>;
export declare function setupAnalyticsHandlers(bot: Telegraf): void;
export {};
//# sourceMappingURL=analytics.d.ts.map