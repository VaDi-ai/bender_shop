/**
 * bot/admin/segments.ts
 *
 * Управление сегментами клиентов:
 *   • Список сегментов с кол-вом клиентов
 *   • Переименование (текстовый флоу)
 *   • Удаление (с переводом клиентов в дефолтный сегмент)
 *   • Добавление (название → выбор цвета)
 *
 * Подключение в bot/index.ts:
 *   setupSegmentHandlers(bot)             — регистрирует action-обработчики
 *   handleSegmentMessage(ctx, uid, txt)   — вызывать из перехватчика текста
 *   segmentsState                         — проверять/сбрасывать активный флоу
 */
import { Context, Telegraf } from 'telegraf';
type SegmentFlowState = {
    flow: 'rename';
    segmentId: number;
} | {
    flow: 'add_name';
} | {
    flow: 'add_color';
    name: string;
};
export declare const segmentsState: Map<number, SegmentFlowState>;
export declare function showSegments(ctx: Context): Promise<void>;
export declare function setupSegmentHandlers(bot: Telegraf): void;
export declare function handleSegmentMessage(ctx: Context, userId: number, text: string): Promise<boolean>;
export {};
//# sourceMappingURL=segments.d.ts.map