/**
 * lib/promotions.ts
 *
 * Бизнес-логика акций:
 *   applyPromotion  — применить скидку к вариантам, сохранить оригинальные цены
 *   cancelPromotion — откатить цены, деактивировать акцию
 *   findVariantsByFilter — выборка вариантов по фильтру акции
 */
import { FilterType } from '../generated/prisma/client';
import type { ProductVariantModel } from '../generated/prisma/models';
import type { ProductModel } from '../generated/prisma/models';
type VariantWithProduct = ProductVariantModel & {
    product: ProductModel;
};
export declare function findVariantsByFilter(filterType: FilterType | string, filterValue: string): Promise<VariantWithProduct[]>;
export declare function applyPromotion(promotionId: number): Promise<number>;
export declare function cancelPromotion(promotionId: number): Promise<void>;
export declare function filterLabel(filterType: FilterType | string, filterValue: string): string;
export {};
//# sourceMappingURL=promotions.d.ts.map