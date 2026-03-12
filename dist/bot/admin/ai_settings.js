"use strict";
/**
 * bot/admin/ai_settings.ts
 *
 * Панель управления AI Sales Agent + управление API ключами.
 * Подключение в bot/index.ts:
 *   setupAISettingsHandlers(bot)
 *   setupApiKeysHandlers(bot)
 *   bot.hears('🤖 AI Агент', ...) → showAISettings(ctx)
 *   bot.hears('🔑 API Ключи', ...) → showApiKeysMenu(ctx)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeysState = void 0;
exports.maskKey = maskKey;
exports.showAISettings = showAISettings;
exports.showSecurityLog = showSecurityLog;
exports.showApiKeysMenu = showApiKeysMenu;
exports.handleApiKeysMessage = handleApiKeysMessage;
exports.setupAISettingsHandlers = setupAISettingsHandlers;
exports.setupApiKeysHandlers = setupApiKeysHandlers;
const openai_1 = __importDefault(require("openai"));
const telegraf_1 = require("telegraf");
const prisma_1 = require("../../lib/prisma");
const api_errors_1 = require("../../lib/api-errors");
const agent_1 = require("../ai/agent");
const ai_parser_1 = require("../../lib/ai-parser");
// ─── Лейблы режимов ───────────────────────────────────────────────────────────
const MODE_LABELS = {
    off: '🔴 Выключен',
    manual: '🟡 Подсказки',
    semi: '🟠 Полуавтомат',
    auto: '🟢 Автомат',
};
const MODE_DESCRIPTIONS = {
    off: 'AI не активен',
    manual: 'AI пишет подсказки менеджеру, клиент не видит',
    semi: 'AI предлагает ответ, менеджер одобряет или редактирует',
    auto: 'AI отвечает клиенту автоматически без участия менеджера',
};
exports.apiKeysState = new Map();
// ─── Маскировка ключей ────────────────────────────────────────────────────────
function maskKey(key) {
    if (!key || key.length < 8)
        return '***';
    return key.slice(0, 8) + '●●●●●●●●' + key.slice(-4);
}
// ─── Пинг OpenRouter ──────────────────────────────────────────────────────────
async function pingOpenRouter(apiKey) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.status === 401 || res.status === 403)
            return 'auth_error';
        if (res.ok)
            return 'ok';
        return 'error';
    }
    catch {
        return 'error';
    }
}
// ─── Показ настроек AI ────────────────────────────────────────────────────────
async function showAISettings(ctx) {
    const mode = await (0, agent_1.getAIMode)();
    const stats = (0, agent_1.getAIStats)();
    const modeLabel = MODE_LABELS[mode] ?? mode;
    const modeDesc = MODE_DESCRIPTIONS[mode] ?? '';
    const text = [
        '🤖 AI Sales Agent',
        '',
        `Режим: ${modeLabel}`,
        `${modeDesc}`,
        '',
        `📊 Статистика (сегодня):`,
        `  Ответов: ${stats.total}`,
        `  Одобрено: ${stats.approved}`,
        `  Отклонено: ${stats.rejected}`,
    ].join('\n');
    await ctx.reply(text, telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback('🔴 Выключен', 'ai:mode:off'),
            telegraf_1.Markup.button.callback('🟡 Подсказки', 'ai:mode:manual'),
        ],
        [
            telegraf_1.Markup.button.callback('🟠 Полуавтомат', 'ai:mode:semi'),
            telegraf_1.Markup.button.callback('🟢 Автомат', 'ai:mode:auto'),
        ],
        [telegraf_1.Markup.button.callback('🏠 Главное меню', 'back:main')],
    ]));
}
// ─── Панель безопасности ──────────────────────────────────────────────────────
const EVENT_LABELS = {
    invalid_telegram_signature: '🚫 Неверных подписей Telegram',
    rate_limit_exceeded: '⏳ Rate limit превышен',
    unauthorized_access: '🔑 Попыток несанкционированного доступа',
    price_manipulation_attempt: '💰 Попыток подмены цены',
};
async function showSecurityLog(ctx) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [counts, recent] = await Promise.all([
        prisma_1.prisma.securityLog.groupBy({
            by: ['event'],
            where: { createdAt: { gte: since } },
            _count: true,
        }),
        prisma_1.prisma.securityLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
        }),
    ]);
    const countMap = new Map(counts.map((c) => [c.event, c._count]));
    const statsLines = Object.entries(EVENT_LABELS).map(([ev, label]) => `${label}: ${countMap.get(ev) ?? 0}`);
    const recentLines = recent.map((log) => {
        const time = log.createdAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const details = (() => {
            try {
                const d = JSON.parse(log.details);
                return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(', ');
            }
            catch {
                return log.details.slice(0, 60);
            }
        })();
        return `• ${time} ${log.event} — ${details}`;
    });
    const text = [
        '🛡️ Безопасность — последние 24 часа:',
        '',
        ...statsLines,
        '',
        'Последние события:',
        recent.length > 0 ? recentLines.join('\n') : '—',
    ].join('\n');
    await ctx.reply(text, telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback('🗑️ Очистить лог', 'sec:clear'),
            telegraf_1.Markup.button.callback('🔄 Обновить', 'sec:refresh'),
        ],
        [telegraf_1.Markup.button.callback('🔙 Назад', 'sec:back')],
    ]));
}
// ─── Меню API ключей ──────────────────────────────────────────────────────────
async function showApiKeysMenu(ctx) {
    const key = process.env.OPENROUTER_API_KEY ?? '';
    let statusLine;
    if (!key) {
        statusLine = '❌ Ключ не задан';
    }
    else {
        const status = await pingOpenRouter(key);
        if (status === 'ok')
            statusLine = '✅ Работает';
        else if (status === 'auth_error')
            statusLine = '⚠️ Ошибка авторизации';
        else
            statusLine = '❌ Недоступен';
    }
    const mask = (v) => (v ? maskKey(v) : '❌ не задан');
    const lines = [
        '🔑 API Ключи',
        '',
        `🤖 OpenRouter: ${statusLine}`,
        key ? maskKey(key) : '',
        '',
        `BOT_TOKEN:    ${mask(process.env.BOT_TOKEN)}`,
        `CRM_GROUP_ID: ${mask(process.env.CRM_GROUP_ID)}`,
        `ADMIN_IDS:    ${mask(process.env.ADMIN_IDS)}`,
        `DATABASE_URL: ${mask(process.env.DATABASE_URL)}`,
        `API_PORT:     ${process.env.API_PORT ?? '3000 (default)'}`,
        `WEBAPP_URL:   ${process.env.WEBAPP_URL ?? '❌ не задан'}`,
    ].filter(Boolean);
    await ctx.reply(lines.join('\n'), telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback('🔄 Обновить ключ OpenRouter', 'api_key_update_openrouter')],
        [telegraf_1.Markup.button.callback('🛡️ Безопасность', 'sec:view')],
        [telegraf_1.Markup.button.callback('🏠 Главное меню', 'back:main')],
    ]));
}
// ─── Обработчик текста (флоу смены ключа) ────────────────────────────────────
async function handleApiKeysMessage(ctx, userId, text) {
    const state = exports.apiKeysState.get(userId);
    if (!state)
        return false;
    if (state.flow === 'awaiting_openrouter_key') {
        if (!text.startsWith('sk-or-')) {
            await ctx.reply('❌ Ключ OpenRouter должен начинаться с "sk-or-". Попробуйте ещё раз:');
            return true;
        }
        await ctx.reply('🤖 Проверяю ключ…');
        try {
            const test = new openai_1.default({ baseURL: 'https://openrouter.ai/api/v1', apiKey: text });
            await test.chat.completions.create({
                model: 'anthropic/claude-sonnet-4-5',
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 5,
            });
        }
        catch (e) {
            const msg = (0, api_errors_1.humanizeApiError)(e);
            await ctx.reply(`❌ Ключ не сохранён.\n${msg}`);
            return true;
        }
        // Сохраняем и переинициализируем клиентов
        await prisma_1.prisma.apiKey.upsert({
            where: { service: 'openrouter_key' },
            create: { service: 'openrouter_key', value: text },
            update: { value: text },
        });
        process.env.OPENROUTER_API_KEY = text;
        (0, agent_1.reinitClient)(text);
        (0, ai_parser_1.reinitClient)(text);
        exports.apiKeysState.delete(userId);
        await ctx.reply('✅ Ключ проверен и сохранён.');
        await showApiKeysMenu(ctx);
        return true;
    }
    return false;
}
// ─── Регистрация обработчиков AI режимов ─────────────────────────────────────
function setupAISettingsHandlers(bot) {
    const modes = ['off', 'manual', 'semi', 'auto'];
    for (const mode of modes) {
        bot.action(`ai:mode:${mode}`, async (ctx) => {
            try {
                await ctx.answerCbQuery();
            }
            catch { }
            await (0, agent_1.setAIMode)(mode);
            await showAISettings(ctx);
        });
    }
}
// ─── Регистрация обработчиков API ключей ─────────────────────────────────────
function setupApiKeysHandlers(bot) {
    bot.action('api_key_update_openrouter', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const currentKey = process.env.OPENROUTER_API_KEY ?? '';
        const maskedKey = currentKey ? maskKey(currentKey) : '❌ не задан';
        exports.apiKeysState.set(userId, { flow: 'awaiting_openrouter_key' });
        await ctx.reply(`Текущий ключ OpenRouter: ${maskedKey}\n\nВведите новый API ключ OpenRouter:`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'api_key_cancel')]]));
    });
    bot.action('api_key_cancel', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        exports.apiKeysState.delete(ctx.from.id);
        await showApiKeysMenu(ctx);
    });
    bot.action('sec:view', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await showSecurityLog(ctx);
    });
    bot.action('sec:refresh', async (ctx) => {
        try {
            await ctx.answerCbQuery('Обновлено');
        }
        catch { }
        await showSecurityLog(ctx);
    });
    bot.action('sec:clear', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await prisma_1.prisma.securityLog.deleteMany();
        await ctx.reply('🗑️ Лог безопасности очищен.');
        await showSecurityLog(ctx);
    });
    bot.action('sec:back', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await showApiKeysMenu(ctx);
    });
}
//# sourceMappingURL=ai_settings.js.map