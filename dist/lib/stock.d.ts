export declare function stockIn(variantId: number, qty: number, comment: string, userId: string): Promise<void>;
export declare function stockOut(variantId: number, qty: number, comment: string, userId: string): Promise<void>;
export declare function getStockHistory(variantId: number): Promise<{
    id: number;
    quantity: number;
    createdAt: Date;
    variantId: number;
    type: string;
    comment: string | null;
    createdBy: string | null;
}[]>;
//# sourceMappingURL=stock.d.ts.map