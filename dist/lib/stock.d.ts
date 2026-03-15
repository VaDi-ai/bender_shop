export type AtomicSaleParams = {
    productId: number;
    qty: number;
    price: number;
    productName: string;
    clientId: number | null;
    telegramId: string;
    userId: string;
    comment: string;
};
/**
 * Проводит продажу в одной транзакции:
 *   — проверяет наличие на складе (re-fetch внутри tx)
 *   — создаёт Order + OrderItem
 *   — уменьшает product.quantity / product.stock
 *   — уменьшает variant.quantity + записывает StockMovement
 * Бросает Error при недостатке товара.
 */
export declare function atomicSale(params: AtomicSaleParams): Promise<{
    variantId: number | null;
}>;
export declare function stockIn(variantId: number, qty: number, comment: string, userId: string): Promise<void>;
export declare function stockOut(variantId: number, qty: number, comment: string, userId: string): Promise<void>;
export declare function getStockHistory(variantId: number): Promise<{
    variantId: number;
    id: number;
    quantity: number;
    createdAt: Date;
    type: import("../generated/prisma/enums").StockMovementType;
    comment: string | null;
    createdBy: string | null;
}[]>;
//# sourceMappingURL=stock.d.ts.map