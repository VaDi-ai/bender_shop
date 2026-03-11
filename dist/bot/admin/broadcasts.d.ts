/**
 * bot/admin/broadcasts.ts
 *
 * Рассылки клиентам:
 *   • Всем Telegram-клиентам
 *   • По тегу
 *   • По сегменту (с опциональным фильтром по тегу)
 *   • История рассылок (BroadcastLog)
 *
 * Подключение в bot/index.ts:
 *   setupBroadcastHandlers(bot)
 *   showBroadcastMenu(ctx)
 *   handleBroadcastMessage(ctx, uid, txt) → boolean
 *   handleBroadcastPhoto(ctx, uid) → boolean
 *   handleBroadcastVideo(ctx, uid) → boolean
 *   broadcastsState — проверять/сбрасывать при нажатии кнопок меню
 */
import { Context, Telegraf } from 'telegraf';
type BroadcastFlowState = {
    flow: 'awaiting_text';
    type: 'all' | 'tag' | 'segment';
    target: string;
    tagFilter?: string;
} | {
    flow: 'preview';
    type: 'all' | 'tag' | 'segment';
    target: string;
    tagFilter?: string;
    messageText?: string;
    mediaFileId?: string;
    mediaType?: 'photo' | 'video';
    caption?: string;
};
export declare const broadcastsState: Map<number, BroadcastFlowState>;
export declare function showBroadcastMenu(ctx: Context): Promise<void>;
export declare function setupBroadcastHandlers(bot: Telegraf): void;
export declare function handleBroadcastMessage(ctx: Context, userId: number, text: string): Promise<boolean>;
export declare function handleBroadcastPhoto(ctx: Context, userId: number): Promise<boolean>;
export declare function handleBroadcastVideo(ctx: Context, userId: number): Promise<boolean>;
export {};
//# sourceMappingURL=broadcasts.d.ts.map