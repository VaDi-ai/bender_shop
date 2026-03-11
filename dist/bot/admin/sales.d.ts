/**
 * bot/admin/sales.ts
 *
 * Флоу продажи и резерва из карточки клиента (или без привязки из топика продаж).
 *
 * Подключение в bot/index.ts:
 *   setupSalesHandlers(bot)
 *   handleSalesMessage(ctx, userId, text) — вызывать из перехватчика текстовых сообщений
 *   salesState                            — проверять наличие активного флоу
 *
 * Из webhooks/telegram.ts:
 *   startSaleFlow(ctx, clientId)          — кнопка 💰 Продажа из карточки
 *   startReserveFlow(ctx, clientId)       — кнопка 🔖 Резерв из карточки
 */
import { Context, Telegraf } from 'telegraf';
type SaleStep = {
    flow: 'sale';
    step: 'product_method';
    clientId: number;
} | {
    flow: 'sale';
    step: 'product_sku';
    clientId: number;
} | {
    flow: 'sale';
    step: 'category';
    clientId: number;
} | {
    flow: 'sale';
    step: 'product_pick';
    clientId: number;
    categoryId: number;
} | {
    flow: 'sale';
    step: 'qty';
    clientId: number;
    productId: number;
    productName: string;
    price: number;
} | {
    flow: 'sale';
    step: 'confirm';
    clientId: number;
    productId: number;
    productName: string;
    price: number;
    qty: number;
};
type ReserveStep = {
    flow: 'reserve';
    step: 'product_method';
    clientId: number;
} | {
    flow: 'reserve';
    step: 'product_sku';
    clientId: number;
} | {
    flow: 'reserve';
    step: 'category';
    clientId: number;
} | {
    flow: 'reserve';
    step: 'product_pick';
    clientId: number;
    categoryId: number;
} | {
    flow: 'reserve';
    step: 'qty';
    clientId: number;
    productId: number;
    productName: string;
    price: number;
} | {
    flow: 'reserve';
    step: 'comment';
    clientId: number;
    productId: number;
    productName: string;
    price: number;
    qty: number;
} | {
    flow: 'reserve';
    step: 'confirm';
    clientId: number;
    productId: number;
    productName: string;
    price: number;
    qty: number;
    comment?: string;
};
type SaleNoClientStep = {
    flow: 'sale_nc';
    step: 'ask_client';
} | {
    flow: 'sale_nc';
    step: 'product_method';
    clientName: string;
} | {
    flow: 'sale_nc';
    step: 'product_sku';
    clientName: string;
} | {
    flow: 'sale_nc';
    step: 'category';
    clientName: string;
} | {
    flow: 'sale_nc';
    step: 'product_pick';
    clientName: string;
    categoryId: number;
} | {
    flow: 'sale_nc';
    step: 'qty';
    clientName: string;
    productId: number;
    productName: string;
    price: number;
} | {
    flow: 'sale_nc';
    step: 'confirm';
    clientName: string;
    productId: number;
    productName: string;
    price: number;
    qty: number;
};
type ReserveNoClientStep = {
    flow: 'reserve_nc';
    step: 'ask_client';
} | {
    flow: 'reserve_nc';
    step: 'product_method';
    clientName: string;
} | {
    flow: 'reserve_nc';
    step: 'product_sku';
    clientName: string;
} | {
    flow: 'reserve_nc';
    step: 'category';
    clientName: string;
} | {
    flow: 'reserve_nc';
    step: 'product_pick';
    clientName: string;
    categoryId: number;
} | {
    flow: 'reserve_nc';
    step: 'qty';
    clientName: string;
    productId: number;
    productName: string;
    price: number;
} | {
    flow: 'reserve_nc';
    step: 'comment';
    clientName: string;
    productId: number;
    productName: string;
    price: number;
    qty: number;
} | {
    flow: 'reserve_nc';
    step: 'confirm';
    clientName: string;
    productId: number;
    productName: string;
    price: number;
    qty: number;
    comment?: string;
};
export type SalesFlowState = SaleStep | ReserveStep | SaleNoClientStep | ReserveNoClientStep;
export declare const salesState: Map<number, SalesFlowState>;
export declare function startSaleFlow(ctx: Context, clientId: number): Promise<void>;
export declare function startReserveFlow(ctx: Context, clientId: number): Promise<void>;
export declare function setupSalesHandlers(bot: Telegraf): void;
export declare function handleSalesMessage(ctx: Context, userId: number, text: string): Promise<boolean>;
export declare function registerSkipCommentHandlers(bot: Telegraf): void;
export {};
//# sourceMappingURL=sales.d.ts.map