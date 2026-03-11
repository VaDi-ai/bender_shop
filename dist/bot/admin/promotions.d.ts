/**
 * bot/admin/promotions.ts
 *
 * Управление акциями:
 *   • Создать акцию (7 шагов)
 *   • Активные / завершённые акции
 *   • Запуск с необязательной рассылкой клиентам
 *   • Завершение акции (откат цен)
 *
 * Подключение в bot/index.ts:
 *   setupPromotionsHandlers(bot)
 *   showPromotionsMenu(ctx)
 *   promotionsState — Map для сброса в back:main
 *   handlePromotionsMessage(ctx, uid, txt) → boolean
 */
import { Context, Telegraf } from 'telegraf';
type PromoFlow = {
    step: 'name';
} | {
    step: 'discount_type';
    name: string;
} | {
    step: 'discount_value';
    name: string;
    discountType: 'percent' | 'fixed';
} | {
    step: 'filter_type';
    name: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
} | {
    step: 'filter_category';
    name: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
} | {
    step: 'filter_brand';
    name: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
} | {
    step: 'filter_attribute';
    name: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
} | {
    step: 'filter_products';
    name: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    selectedProductIds: number[];
} | {
    step: 'dates';
    name: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    filterType: string;
    filterValue: string;
} | {
    step: 'dates_input';
    name: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    filterType: string;
    filterValue: string;
} | {
    step: 'preview';
    name: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    filterType: string;
    filterValue: string;
    startsAt?: Date;
    endsAt?: Date;
};
export declare const promotionsState: Map<number, PromoFlow>;
export declare function showPromotionsMenu(ctx: Context): Promise<void>;
export declare function setupPromotionsHandlers(bot: Telegraf): void;
export declare function handlePromotionsMessage(ctx: Context, userId: number, text: string): Promise<boolean>;
export {};
//# sourceMappingURL=promotions.d.ts.map