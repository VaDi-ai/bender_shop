/**
 * lib/ai-parser.ts — AI-парсинг через OpenRouter (Claude)
 */
export declare function reinitClient(newKey: string): void;
export type AIParsedProduct = {
    model: string;
    storage: string | null;
    color: string | null;
    region: string | null;
    simType: string | null;
    price: number;
    rawLine: string;
};
export type AIParsedRate = {
    currency: string;
    rate: number;
    rawLine: string;
};
export declare function parseSupplierMessage(text: string): Promise<AIParsedProduct[]>;
export declare function parseCurrencyRates(text: string): Promise<AIParsedRate[]>;
//# sourceMappingURL=ai-parser.d.ts.map