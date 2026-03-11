/**
 * lib/currency.ts — Курсы валют и привязка регион → валюта
 */
/** Статические флаги для UI (дополняются данными из БД) */
export declare const CURRENCY_FLAGS: Record<string, string>;
/** Загружает уникальные коды валют из активных регионов БД. */
export declare function getActiveCurrencies(): Promise<string[]>;
/** Загружает маппинг регион → валюта из БД. */
export declare function getRegionCurrencyMap(): Promise<Record<string, string>>;
/** Курсы валют с ЦБ РФ. Ключ — ISO-код, значение — рублей за 1 единицу. */
export declare function fetchCurrencyRates(): Promise<Record<string, number>>;
/** Округление цены вверх до ближайшего круглого числа */
export declare function roundPrice(price: number): number;
export type CurrencyChange = {
    currency: string;
    flag: string;
    name: string;
    previousRate: number;
    newRate: number;
    changePercent: string;
    direction: 'up' | 'down' | 'same';
};
/**
 * Обновляет курсы валют активных регионов в БД (модель CurrencyRate).
 * Сохраняет предыдущий курс в previousRate.
 * Возвращает массив изменений по каждой валюте.
 */
export declare function updateCurrencyRates(): Promise<CurrencyChange[]>;
/** Загружает сохранённые курсы из БД */
export declare function getSavedRates(): Promise<CurrencyChange[]>;
//# sourceMappingURL=currency.d.ts.map