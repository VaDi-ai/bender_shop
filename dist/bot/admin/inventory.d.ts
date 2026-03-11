/**
 * bot/admin/inventory.ts
 *
 * Товароучёт: список, добавить, оприходовать, списать, импорт прайса, экспорт xlsx.
 *
 * Подключение в bot/index.ts:
 *   setupInventoryHandlers(bot)              — регистрирует action-обработчики кнопок
 *   handleInventoryMessage(ctx, uid, txt)    — вызывать из перехватчика текстовых сообщений
 *   handleInventoryDocument(ctx, uid)        — вызывать из перехватчика документов
 *   handleInventoryPhoto(ctx, uid)           — вызывать из перехватчика фото
 *   inventoryState                           — проверять наличие активного флоу
 */
import { Context, Telegraf } from 'telegraf';
type AddFlow = {
    flow: 'add';
    step: 'sku';
} | {
    flow: 'add';
    step: 'name';
    sku: string;
} | {
    flow: 'add';
    step: 'description';
    sku: string;
    name: string;
} | {
    flow: 'add';
    step: 'specs';
    sku: string;
    name: string;
    description: string | null;
} | {
    flow: 'add';
    step: 'attributes';
    sku: string;
    name: string;
    description: string | null;
    specs: Record<string, string> | null;
} | {
    flow: 'add';
    step: 'price';
    sku: string;
    name: string;
    description: string | null;
    specs: Record<string, string> | null;
    attributes: Record<string, string[]> | null;
} | {
    flow: 'add';
    step: 'category';
    sku: string;
    name: string;
    description: string | null;
    specs: Record<string, string> | null;
    attributes: Record<string, string[]> | null;
    price: number;
} | {
    flow: 'add';
    step: 'photo';
    sku: string;
    name: string;
    description: string | null;
    specs: Record<string, string> | null;
    attributes: Record<string, string[]> | null;
    price: number;
    category: string;
    photoFileIds: string[];
} | {
    flow: 'add';
    step: 'qty';
    sku: string;
    name: string;
    description: string | null;
    specs: Record<string, string> | null;
    attributes: Record<string, string[]> | null;
    price: number;
    category: string;
    photoFileIds: string[];
};
type StockInFlow = {
    flow: 'stock_in';
    step: 'qty';
    variantId: number;
    variantSku: string;
    productName: string;
    currentQty: number;
} | {
    flow: 'stock_in';
    step: 'comment';
    variantId: number;
    variantSku: string;
    productName: string;
    currentQty: number;
    qty: number;
};
type StockOutFlow = {
    flow: 'stock_out';
    step: 'qty';
    variantId: number;
    variantSku: string;
    productName: string;
    currentQty: number;
} | {
    flow: 'stock_out';
    step: 'comment';
    variantId: number;
    variantSku: string;
    productName: string;
    currentQty: number;
    qty: number;
};
type ImportFileFlow = {
    flow: 'import_file';
    step: 'awaiting_file';
};
type CategoryAddFlow = {
    flow: 'category_add';
    step: 'name';
} | {
    flow: 'category_add';
    step: 'textSide';
    name: string;
};
type CategoryRenameFlow = {
    flow: 'category_rename';
    step: 'name';
    categoryId: number;
    oldName: string;
};
type CategoryBannerFlow = {
    flow: 'category_banner';
    step: 'photo';
    categoryId: number;
    categoryName: string;
};
type VariantAddFlow = {
    flow: 'variant_add';
    step: 'sku';
    productId: number;
} | {
    flow: 'variant_add';
    step: 'price';
    productId: number;
    sku: string;
} | {
    flow: 'variant_add';
    step: 'qty';
    productId: number;
    sku: string;
    price: number;
} | {
    flow: 'variant_add';
    step: 'attrs';
    productId: number;
    sku: string;
    price: number;
    qty: number;
    attrKeys: string[];
    selectedAttrs: Record<string, string>;
    currentAttrIndex: number;
} | {
    flow: 'variant_add';
    step: 'region';
    productId: number;
    sku: string;
    price: number;
    qty: number;
    attrs: Record<string, string>;
} | {
    flow: 'variant_add';
    step: 'photo';
    productId: number;
    sku: string;
    price: number;
    qty: number;
    attrs: Record<string, string>;
    photos: string[];
};
type AttrAddFlow = {
    flow: 'attr_add';
    step: 'name';
    productId: number;
} | {
    flow: 'attr_add';
    step: 'values';
    productId: number;
    attrName: string;
};
type AttrEditFlow = {
    flow: 'attr_edit';
    step: 'values';
    productId: number;
    attrName: string;
};
type SpecAddFlow = {
    flow: 'spec_add';
    step: 'input';
    productId: number;
};
type BrandEditFlow = {
    flow: 'brand_edit';
    step: 'input';
    productId: number;
};
type ProductPhotoFlow = {
    flow: 'product_photo';
    step: 'uploading';
    productId: number;
    pendingPhotos: string[];
};
type VariantPhotoEditFlow = {
    flow: 'variant_photo_edit';
    step: 'uploading';
    variantId: number;
    productId: number;
    pendingPhotos: string[];
};
export type InventoryFlowState = AddFlow | StockInFlow | StockOutFlow | ImportFileFlow | CategoryAddFlow | CategoryRenameFlow | CategoryBannerFlow | VariantAddFlow | AttrAddFlow | AttrEditFlow | SpecAddFlow | BrandEditFlow | ProductPhotoFlow | VariantPhotoEditFlow;
export declare const inventoryState: Map<number, InventoryFlowState>;
export declare function showInventory(ctx: Context): Promise<void>;
export declare function setupInventoryHandlers(bot: Telegraf): void;
export declare function handleInventoryMessage(ctx: Context, userId: number, text: string): Promise<boolean>;
export declare function handleInventoryPhoto(ctx: Context, userId: number): Promise<boolean>;
export declare function handleInventoryDocument(ctx: Context, userId: number): Promise<void>;
export {};
//# sourceMappingURL=inventory.d.ts.map