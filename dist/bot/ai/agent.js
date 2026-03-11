"use strict";
/**
 * bot/ai/agent.ts
 *
 * AI Sales Agent на базе OpenRouter (Claude + Perplexity web search).
 *
 * Режимы (хранятся в ApiKey service="ai_mode"):
 *   manual — только подсказка менеджеру в топик (💡 AI подсказка)
 *   semi   — генерирует ответ, показывает менеджеру с кнопками [✅ Отправить] [✏️ Редактировать] [❌ Пропустить]
 *   auto   — отправляет ответ клиенту автоматически
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiSuggestions = void 0;
exports.reinitClient = reinitClient;
exports.getAIMode = getAIMode;
exports.setAIMode = setAIMode;
exports.getAIStats = getAIStats;
exports.incrementStat = incrementStat;
exports.storeSuggestion = storeSuggestion;
exports.getSuggestion = getSuggestion;
exports.deleteSuggestion = deleteSuggestion;
exports.generateAIResponse = generateAIResponse;
const openai_1 = __importDefault(require("openai"));
const prisma_1 = require("../../lib/prisma");
const notify_admins_1 = require("../../lib/notify-admins");
// ─── Клиент OpenRouter ────────────────────────────────────────────────────────
let openRouterClient = null;
function getClient() {
    if (!openRouterClient) {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey)
            throw new Error('OPENROUTER_API_KEY не задан в .env');
        openRouterClient = new openai_1.default({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey,
        });
    }
    return openRouterClient;
}
function reinitClient(newKey) {
    openRouterClient = new openai_1.default({ baseURL: 'https://openrouter.ai/api/v1', apiKey: newKey });
}
async function getAIMode() {
    try {
        const record = await prisma_1.prisma.apiKey.findUnique({ where: { service: 'ai_mode' } });
        if (record)
            return record.value;
        const envMode = process.env.AI_MODE;
        return envMode ?? 'off';
    }
    catch {
        return 'off';
    }
}
async function setAIMode(mode) {
    await prisma_1.prisma.apiKey.upsert({
        where: { service: 'ai_mode' },
        update: { value: mode },
        create: { service: 'ai_mode', value: mode },
    });
}
let stats = {
    date: getTodayStr(),
    total: 0,
    approved: 0,
    rejected: 0,
};
function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
}
function ensureStatsToday() {
    const today = getTodayStr();
    if (stats.date !== today) {
        stats = { date: today, total: 0, approved: 0, rejected: 0 };
    }
}
function getAIStats() {
    ensureStatsToday();
    return { ...stats };
}
function incrementStat(key) {
    ensureStatsToday();
    stats[key]++;
}
let nextSuggestionId = 1;
exports.aiSuggestions = new Map();
function storeSuggestion(clientId, text, threadId) {
    const id = nextSuggestionId++;
    exports.aiSuggestions.set(id, { clientId, text, threadId });
    return id;
}
function getSuggestion(id) {
    return exports.aiSuggestions.get(id);
}
function deleteSuggestion(id) {
    exports.aiSuggestions.delete(id);
}
// ─── Определение запросов о технике ──────────────────────────────────────────
const TECH_BRANDS = [
    'iphone', 'ipad', 'macbook', 'airpods', 'apple watch',
    'samsung', 'galaxy',
    'xiaomi', 'redmi', 'poco',
    'huawei',
    'sony', 'playstation', 'ps5', 'ps4',
    'google pixel',
    'oneplus',
    'realme', 'oppo', 'vivo',
    'asus', 'rog',
    'lenovo', 'thinkpad',
    'dell', 'xps',
    'hp', 'spectre', 'envy',
    'lg',
    'nvidia', 'rtx', 'gtx',
    'amd', 'ryzen',
    'intel',
    'airpods',
];
function isTechQuery(message) {
    const lower = message.toLowerCase();
    return TECH_BRANDS.some((brand) => lower.includes(brand));
}
// ─── Web search через Perplexity/Sonar ───────────────────────────────────────
async function searchTechInfo(query) {
    try {
        const client = getClient();
        const response = await client.chat.completions.create({
            model: 'perplexity/sonar',
            messages: [
                {
                    role: 'user',
                    content: `Найди актуальные характеристики и приблизительную цену в России для: ${query}. Ответь кратко: ключевые характеристики и цены в рублях.`,
                },
            ],
            max_tokens: 300,
        });
        return response.choices[0]?.message?.content?.trim() ?? '';
    }
    catch (err) {
        console.error('Perplexity search error:', err);
        return '';
    }
}
// ─── Генерация ответа ─────────────────────────────────────────────────────────
async function generateAIResponse(clientId, newMessage) {
    const client = getClient();
    // Загружаем товары в наличии
    const products = await prisma_1.prisma.product.findMany({
        where: { isAvailable: true },
        select: { name: true, sku: true, price: true, quantity: true, reserved: true, description: true },
        orderBy: { name: 'asc' },
    });
    const productsText = products.length > 0
        ? products.map((p) => {
            return `• ${p.name} (${p.sku}) — ${Number(p.price).toLocaleString('ru-RU')} ₽${p.description ? ', ' + p.description : ''}`;
        }).join('\n')
        : 'Товары не найдены';
    // Загружаем последние 10 сообщений клиента
    const history = await prisma_1.prisma.message.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
        take: 10,
    });
    const historyText = history.length > 0
        ? history
            .reverse()
            .map((m) => `${m.direction === 'in' ? 'Клиент' : 'Менеджер'}: ${m.text}`)
            .join('\n')
        : 'Нет предыдущих сообщений';
    // Web search если клиент спрашивает о конкретной технике
    let webSearchContext = '';
    if (isTechQuery(newMessage)) {
        const searchResult = await searchTechInfo(newMessage);
        if (searchResult) {
            webSearchContext = `\n\nАктуальная информация из интернета по запросу клиента:\n${searchResult}`;
        }
    }
    const systemPrompt = `Ты — опытный менеджер по продажам техники с 25-летним стажем. За твоими плечами тысячи продаж — ты умеешь слушать клиента, понимать что ему реально нужно и подбирать именно то устройство которое решит его задачи, а не просто самое дорогое.

Твой подход:
- Сначала понять задачу клиента — для чего берёт, как использует, что важно
- Задавать правильные вопросы чтобы понять реальные потребности
- Рекомендовать то что реально подойдёт — даже если это дешевле
- Говорить честно про плюсы и минусы конкретной модели
- Не впаривать — помогать принять правильное решение

Стиль общения:
- Как опытный знакомый который разбирается в технике — просто и по делу
- Минимум смайликов и эмодзи
- Без markdown форматирования: никаких **слово**
- Без шаблонных фраз: "конечно!", "отличный выбор!", "рад помочь"
- Длина ответа под ситуацию — иногда одно предложение, иногда абзац
- Можешь немного пошутить если уместно — живой человек так и делает

Экспертиза:
- Знаешь все актуальные модели телефонов, ноутбуков, аудио, часов
- Понимаешь разницу между моделями и умеешь объяснить просто
- Используешь актуальную информацию из интернета про характеристики
- Сравниваешь честно — если у конкурента лучше в чём-то, скажешь

Про наш магазин:
- Работаешь в Bender Shop — предлагаешь товары из нашего каталога
- Цены называешь из каталога
- Не упоминаешь количество на складе — только есть/нет
- Если нужного товара нет — говоришь что уточнишь наличие у коллег

Наши товары в наличии:
${productsText}

История переписки:
${historyText}${webSearchContext}`;
    try {
        const response = await client.chat.completions.create({
            model: 'anthropic/claude-sonnet-4-5',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: newMessage },
            ],
            max_tokens: 500,
        });
        const text = response.choices[0]?.message?.content?.trim();
        if (!text)
            throw new Error('Пустой ответ от модели');
        return text;
    }
    catch (err) {
        (0, notify_admins_1.notifyAdminsAboutApiError)(err, 'AI ответ клиенту').catch(() => { });
        throw err;
    }
}
//# sourceMappingURL=agent.js.map