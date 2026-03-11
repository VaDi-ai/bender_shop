/**
 * bot/admin/pricing.ts — Управление ценами
 *
 * Меню: из сообщения | по курсу | из файла | точечно | история
 * Универсальный экран предпросмотра с фильтрами исключений.
 */
import { Context, Markup, Telegraf } from 'telegraf';
import { type CurrencyChange } from '../../lib/currency';
import { type AIParsedRate } from '../../lib/ai-parser';
type ParsedLine = {
    model: string;
    storage?: string;
    color?: string;
    region?: string;
    price: number;
    rawLine: string;
};
type MatchedVariant = {
    rawLine: string;
    parsed: ParsedLine;
    variantId: number;
    variantSku: string;
    productId: number;
    productName: string;
    brand?: string;
    categoryId?: number;
    currentPrice: number;
    supplierPrice: number;
};
export type PendingVariant = {
    variantId: number;
    productId: number;
    productName: string;
    brand?: string;
    categoryId?: number;
    variantSku: string;
    attrs: string;
    currentPrice: number;
    newPrice: number;
    region?: string;
    comment?: string;
};
type PricingSource = 'message' | 'file' | 'markup' | 'manual' | 'currency_update';
type PricingFlow = {
    flow: 'awaiting_rate';
} | {
    flow: 'awaiting_currency';
    rate: number;
} | {
    flow: 'awaiting_message';
    rate?: number;
    currency?: string;
} | {
    flow: 'awaiting_markup';
    matches: MatchedVariant[];
    unmatched: ParsedLine[];
    rate?: number;
    currency?: string;
} | {
    flow: 'bulk_pct';
    filterType: 'all' | 'category';
    filterValue: string;
    filterLabel: string;
} | {
    flow: 'preview';
    source: PricingSource;
    markup: number | null;
    label: string;
    pendingVariants: PendingVariant[];
    excludedVariantIds: number[];
    autoFilter?: string;
    allPendingVariants?: PendingVariant[];
} | {
    flow: 'awaiting_file';
} | {
    flow: 'manual_product_pick';
    page: number;
} | {
    flow: 'manual_variant_pick';
    productId: number;
    productName: string;
} | {
    flow: 'manual_price_input';
    variantId: number;
    variantSku: string;
    productName: string;
    attrs: string;
    currentPrice: number;
} | {
    flow: 'manual_all_price';
    productId: number;
    productName: string;
} | {
    flow: 'awaiting_currencies';
} | {
    flow: 'confirm_currencies';
    parsed: AIParsedRate[];
} | {
    flow: 'region_add_code';
} | {
    flow: 'region_add_name';
    code: string;
} | {
    flow: 'region_add_flag';
    code: string;
    name: string;
} | {
    flow: 'region_add_currency';
    code: string;
    name: string;
    flag: string;
} | {
    flow: 'region_edit_name';
    regionId: number;
    regionCode: string;
} | {
    flow: 'region_edit_flag';
    regionId: number;
    regionCode: string;
} | {
    flow: 'region_edit_currency';
    regionId: number;
    regionCode: string;
} | {
    flow: 'rate_add_code';
} | {
    flow: 'rate_add_value';
    currency: string;
} | {
    flow: 'cadj_select';
    changes: CurrencyChange[];
} | {
    flow: 'cadj_region_confirm';
    changes: CurrencyChange[];
    region: string;
    currency: string;
    pct: number;
} | {
    flow: 'cadj_region_input_pct';
    changes: CurrencyChange[];
    region: string;
    currency: string;
} | {
    flow: 'cadj_all_review';
    changes: CurrencyChange[];
    overrides: Record<string, number>;
} | {
    flow: 'cadj_all_input_pct';
    changes: CurrencyChange[];
    overrides: Record<string, number>;
    editRegion: string;
    editCurrency: string;
} | {
    flow: 'cadj_manual_select';
    changes: CurrencyChange[];
    selected: string[];
} | {
    flow: 'cadj_manual_input_pct';
    changes: CurrencyChange[];
    selected: string[];
    perRegionPct: Record<string, number>;
    currentRegion: string;
    currentCurrency: string;
};
export declare const pricingState: Map<number, PricingFlow>;
export declare const REGION_FLAGS: Record<string, string>;
export declare function showPricingMenu(ctx: Context): Promise<void>;
export declare function generatePriceListBuffer(): Promise<Buffer>;
export declare function setupPricingHandlers(bot: Telegraf): void;
export declare function handlePricingMessage(ctx: Context, userId: number, text: string): Promise<boolean>;
export declare function handlePricingDocument(ctx: Context, userId: number): Promise<boolean>;
export type CurrencyNotifyResult = {
    changes: CurrencyChange[];
};
export declare function sendDailyCurrencyRates(sendFn: (text: string, keyboard: ReturnType<typeof Markup.inlineKeyboard>) => Promise<void>): Promise<CurrencyNotifyResult | null>;
export declare const lastCurrencyChanges: CurrencyChange[];
export {};
//# sourceMappingURL=pricing.d.ts.map