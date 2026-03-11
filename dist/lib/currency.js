"use strict";
/**
 * lib/currency.ts — Курсы валют и привязка регион → валюта
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CURRENCY_FLAGS = void 0;
exports.getActiveCurrencies = getActiveCurrencies;
exports.getRegionCurrencyMap = getRegionCurrencyMap;
exports.fetchCurrencyRates = fetchCurrencyRates;
exports.roundPrice = roundPrice;
exports.updateCurrencyRates = updateCurrencyRates;
exports.getSavedRates = getSavedRates;
const https_1 = __importDefault(require("https"));
const prisma_1 = require("./prisma");
/** Статические флаги для UI (дополняются данными из БД) */
exports.CURRENCY_FLAGS = {
    HKD: '🇭🇰', EUR: '🇪🇺', INR: '🇮🇳', RUB: '🇷🇺', USD: '🇺🇸', CNY: '🇨🇳',
    GBP: '🇬🇧', JPY: '🇯🇵', AUD: '🇦🇺', TRY: '🇹🇷', AED: '🇦🇪', KZT: '🇰🇿',
    AZN: '🇦🇿', THB: '🇹🇭', SGD: '🇸🇬',
};
const CURRENCY_NAMES = {
    HKD: 'Гонконгский доллар', EUR: 'Евро', INR: 'Индийская рупия',
    RUB: 'Российский рубль', USD: 'Доллар США', CNY: 'Юань',
    GBP: 'Фунт стерлингов', JPY: 'Японская иена', AED: 'Дирхам ОАЭ',
};
/** Загружает уникальные коды валют из активных регионов БД. */
async function getActiveCurrencies() {
    try {
        const regions = await prisma_1.prisma.region.findMany({ where: { isActive: true } });
        const codes = [...new Set(regions.map((r) => r.currency))];
        return codes.length ? codes : ['HKD', 'EUR', 'CNY', 'USD', 'INR'];
    }
    catch {
        return ['HKD', 'EUR', 'CNY', 'USD', 'INR'];
    }
}
/** Загружает маппинг регион → валюта из БД. */
async function getRegionCurrencyMap() {
    try {
        const regions = await prisma_1.prisma.region.findMany({ where: { isActive: true } });
        return Object.fromEntries(regions.map((r) => [r.code, r.currency]));
    }
    catch {
        return { HK: 'HKD', EU: 'EUR', IN: 'INR', RU: 'RUB', US: 'USD', CN: 'CNY' };
    }
}
/** Курсы валют с ЦБ РФ. Ключ — ISO-код, значение — рублей за 1 единицу. */
async function fetchCurrencyRates() {
    return new Promise((resolve, reject) => {
        https_1.default.get('https://www.cbr-xml-daily.ru/daily_json.js', (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const rates = { RUB: 1 };
                    const valute = data.Valute;
                    for (const [code, info] of Object.entries(valute)) {
                        rates[code] = info.Value / info.Nominal;
                    }
                    resolve(rates);
                }
                catch (e) {
                    reject(e);
                }
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}
/** Округление цены вверх до ближайшего круглого числа */
function roundPrice(price) {
    if (price < 10000)
        return Math.ceil(price / 100) * 100;
    if (price < 50000)
        return Math.ceil(price / 500) * 500;
    return Math.ceil(price / 1000) * 1000;
}
/**
 * Обновляет курсы валют активных регионов в БД (модель CurrencyRate).
 * Сохраняет предыдущий курс в previousRate.
 * Возвращает массив изменений по каждой валюте.
 */
async function updateCurrencyRates() {
    const allRates = await fetchCurrencyRates();
    const currencies = await getActiveCurrencies();
    const changes = [];
    for (const currency of currencies) {
        if (currency === 'RUB')
            continue;
        const newRate = allRates[currency];
        if (!newRate)
            continue;
        const existing = await prisma_1.prisma.currencyRate.findUnique({ where: { currency } });
        const previousRate = existing ? Number(existing.rate) : newRate;
        await prisma_1.prisma.currencyRate.upsert({
            where: { currency },
            create: { currency, rate: newRate, previousRate: null },
            update: { previousRate: previousRate, rate: newRate },
        });
        const diff = newRate - previousRate;
        const changePercent = previousRate !== 0
            ? ((diff / previousRate) * 100).toFixed(2)
            : '0.00';
        const direction = diff > 0.001 ? 'up' : diff < -0.001 ? 'down' : 'same';
        changes.push({
            currency,
            flag: exports.CURRENCY_FLAGS[currency] ?? '',
            name: CURRENCY_NAMES[currency] ?? currency,
            previousRate,
            newRate,
            changePercent,
            direction,
        });
    }
    return changes;
}
/** Загружает сохранённые курсы из БД */
async function getSavedRates() {
    const records = await prisma_1.prisma.currencyRate.findMany({ orderBy: { currency: 'asc' } });
    return records.map((r) => {
        const prev = r.previousRate ? Number(r.previousRate) : Number(r.rate);
        const curr = Number(r.rate);
        const diff = curr - prev;
        const changePercent = prev !== 0 ? ((diff / prev) * 100).toFixed(2) : '0.00';
        const direction = diff > 0.001 ? 'up' : diff < -0.001 ? 'down' : 'same';
        return {
            currency: r.currency,
            flag: exports.CURRENCY_FLAGS[r.currency] ?? '',
            name: CURRENCY_NAMES[r.currency] ?? r.currency,
            previousRate: prev,
            newRate: curr,
            changePercent,
            direction,
        };
    });
}
//# sourceMappingURL=currency.js.map