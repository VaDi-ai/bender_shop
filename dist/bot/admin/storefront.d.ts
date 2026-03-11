/**
 * bot/admin/storefront.ts
 *
 * Управление витриной: бегущая строка + hero-баннеры.
 *
 * Подключение в bot/index.ts:
 *   setupStorefrontHandlers(bot)
 *   handleStorefrontMessage(ctx, uid, text)
 *   handleStorefrontPhoto(ctx, uid)   — вызывать из перехватчика фото
 *   storefrontState                   — проверять наличие активного флоу
 */
import { Context, Telegraf } from 'telegraf';
type MarqueeFlow = {
    flow: 'marquee';
    step: 'text';
};
type BannerAddFlow = {
    flow: 'banner_add';
    step: 'photo';
} | {
    flow: 'banner_add';
    step: 'title';
    imageFile: string;
} | {
    flow: 'banner_add';
    step: 'subtitle';
    imageFile: string;
    title: string | null;
} | {
    flow: 'banner_add';
    step: 'order';
    imageFile: string;
    title: string | null;
    subtitle: string | null;
};
export type StorefrontFlowState = MarqueeFlow | BannerAddFlow;
export declare const storefrontState: Map<number, StorefrontFlowState>;
export declare function showStorefront(ctx: Context): Promise<void>;
export declare function setupStorefrontHandlers(bot: Telegraf): void;
export declare function handleStorefrontMessage(ctx: Context & {
    message: {
        text: string;
    };
}, userId: number, text: string): Promise<boolean>;
export declare function handleStorefrontPhoto(ctx: Context & {
    message: {
        photo: Array<{
            file_id: string;
        }>;
    };
}, userId: number): Promise<boolean>;
export {};
//# sourceMappingURL=storefront.d.ts.map