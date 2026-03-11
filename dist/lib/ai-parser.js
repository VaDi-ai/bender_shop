"use strict";
/**
 * lib/ai-parser.ts — AI-парсинг через OpenRouter (Claude)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reinitClient = reinitClient;
exports.parseSupplierMessage = parseSupplierMessage;
exports.parseCurrencyRates = parseCurrencyRates;
const openai_1 = __importDefault(require("openai"));
const notify_admins_1 = require("./notify-admins");
let client = new openai_1.default({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
});
function reinitClient(newKey) {
    client = new openai_1.default({ baseURL: 'https://openrouter.ai/api/v1', apiKey: newKey });
}
// ─── Парсинг сообщения поставщика ─────────────────────────────────────────────
async function parseSupplierMessage(text) {
    try {
        const response = await client.chat.completions.create({
            model: 'anthropic/claude-sonnet-4-5',
            messages: [
                {
                    role: 'user',
                    content: `Распарси список товаров от поставщика техники. Верни ТОЛЬКО валидный JSON массив, без пояснений.

Текст:
${text}

Формат каждого элемента:
{
  "model": "точное название модели например iPhone 17 Pro или MacBook Air M4",
  "storage": "объём памяти например 256 ГБ или 1 ТБ или null",
  "color": "цвет на английском например Silver или null",
  "region": "регион HK/EU/IN/RU/CN или null если не указан",
  "simType": "тип SIM например 1 Sim+eSim или null",
  "price": число без пробелов и символов валюты,
  "rawLine": "оригинальная строка"
}

Правила:
- Точки в числах это разделители тысяч: 122.000 = 122000
- Флаги эмодзи: 🇭🇰=HK, 🇪🇺=EU, 🇮🇳=IN, 🇷🇺=RU, 🇨🇳=CN
- Если строка не содержит товар и цену — пропустить
- Верни только JSON массив []`,
                },
            ],
            max_tokens: 2000,
        });
        const content = response.choices[0]?.message?.content ?? '[]';
        const clean = content.replace(/```json|```/g, '').trim();
        return JSON.parse(clean);
    }
    catch (err) {
        (0, notify_admins_1.notifyAdminsAboutApiError)(err, 'Парсинг прайса поставщика').catch(() => { });
        throw err;
    }
}
// ─── Парсинг курсов валют из произвольного текста ─────────────────────────────
async function parseCurrencyRates(text) {
    try {
        const response = await client.chat.completions.create({
            model: 'anthropic/claude-sonnet-4-5',
            messages: [
                {
                    role: 'user',
                    content: `Извлеки курсы валют из текста. Верни ТОЛЬКО валидный JSON массив.

Текст:
${text}

Формат:
{
  "currency": "код валюты USD/EUR/CNY/HKD/INR/etc",
  "rate": курс к рублю как число,
  "rawLine": "оригинальная строка"
}

Правила:
- Если написано "1 USD = 92.5 руб" → rate: 92.5
- Если написано "100 INR = 108 руб" → rate: 1.08 (делить на номинал)
- Если просто число после названия валюты — это курс к рублю
- Верни только JSON массив []`,
                },
            ],
            max_tokens: 500,
        });
        const content = response.choices[0]?.message?.content ?? '[]';
        const clean = content.replace(/```json|```/g, '').trim();
        return JSON.parse(clean);
    }
    catch (err) {
        (0, notify_admins_1.notifyAdminsAboutApiError)(err, 'Парсинг курсов валют').catch(() => { });
        throw err;
    }
}
//# sourceMappingURL=ai-parser.js.map