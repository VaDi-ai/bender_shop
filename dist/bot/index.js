"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maintenanceMode = void 0;
exports.adminOnly = adminOnly;
require("dotenv/config");
const telegraf_1 = require("telegraf");
const filters_1 = require("telegraf/filters");
const telegram_1 = require("../webhooks/telegram");
const scheduler_1 = require("./scheduler");
const server_1 = require("../api/server");
const prisma_1 = require("../lib/prisma");
const inventory_1 = require("./admin/inventory");
const segments_1 = require("./admin/segments");
const sales_1 = require("./admin/sales");
const analytics_1 = require("./admin/analytics");
const ai_settings_1 = require("./admin/ai_settings");
const notify_admins_1 = require("../lib/notify-admins");
const agent_1 = require("./ai/agent");
const ai_parser_1 = require("../lib/ai-parser");
const storefront_1 = require("./admin/storefront");
const broadcasts_1 = require("./admin/broadcasts");
const promotions_1 = require("./admin/promotions");
const pricing_1 = require("./admin/pricing");
const promotions_2 = require("../lib/promotions");
const security_log_1 = require("../lib/security-log");
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS ?? '').split(',').map((id) => Number(id.trim()));
if (!BOT_TOKEN) {
    throw new Error('BOT_TOKEN не задан в .env');
}
const bot = new telegraf_1.Telegraf(BOT_TOKEN);
(0, notify_admins_1.initAdminNotifications)(bot, ADMIN_IDS);
(0, security_log_1.initSecurityAlerts)(bot, ADMIN_IDS);
// ─── Режим техработ (in-memory) ───────────────────────────────────────────────
let maintenanceMode = false;
exports.maintenanceMode = maintenanceMode;
// ─── Защита от флуда ─────────────────────────────────────────────────────────
const userRequestCount = new Map();
bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId)
        return next();
    const now = Date.now();
    const stats = userRequestCount.get(userId) ?? { count: 0, resetAt: now + 60000 };
    if (now > stats.resetAt) {
        stats.count = 0;
        stats.resetAt = now + 60000;
    }
    stats.count++;
    userRequestCount.set(userId, stats);
    if (stats.count > 30) {
        if (stats.count === 31) {
            await ctx.reply('⚠️ Слишком много запросов. Подождите минуту.');
            (0, security_log_1.logSecurityEvent)('rate_limit_exceeded', { userId, count: stats.count });
        }
        return;
    }
    return next();
});
// ─── Хелпер: только для администраторов ──────────────────────────────────────
function adminOnly(ctx, next) {
    const userId = ctx.from?.id;
    if (!ADMIN_IDS.includes(userId)) {
        (0, security_log_1.logSecurityEvent)('unauthorized_access', {
            userId,
            command: ctx.message?.text ?? ctx.callbackQuery?.data,
        });
        return ctx.reply('⛔ Нет доступа.');
    }
    return next();
}
// ─── Главное меню ─────────────────────────────────────────────────────────────
const adminKeyboard = telegraf_1.Markup.keyboard([
    ['📊 Аналитика', '📬 Входящие'],
    ['📢 Рассылки', '💰 Балансы'],
    ['🏷️ Акции', '🔧 Техработы'],
    ['📦 Товароучёт', '🔑 API Ключи'],
    ['📂 Сегменты', '🤖 AI Агент'],
    ['🖼️ Витрина', '💰 Цены'],
]).resize();
// Кнопки главного меню — для сброса пошаговых флоу при нажатии
const MENU_BUTTONS = new Set([
    '📊 Аналитика',
    '📬 Входящие',
    '📢 Рассылки',
    '💰 Балансы',
    '🏷️ Акции',
    '🔧 Техработы',
    '📦 Товароучёт',
    '🔑 API Ключи',
    '📂 Сегменты',
    '🤖 AI Агент',
    '🖼️ Витрина',
    '💰 Цены',
]);
// ─── Обработка сообщений от клиентов ─────────────────────────────────────────
// Регистрируется ДО admin-middleware, чтобы клиенты не получали «⛔ Доступ запрещён»
(0, telegram_1.setupClientHandlers)(bot);
// ─── Middleware: только для администраторов ────────────────────────────────────
bot.use((ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !ADMIN_IDS.includes(userId)) {
        return ctx.reply('⛔ Доступ запрещён.');
    }
    return next();
});
// ─── Перехватчик текста для пошаговых флоу ───────────────────────────────────
// Должен быть зарегистрирован ДО bot.hears(), чтобы перехватывать ввод в активных флоу.
bot.on((0, filters_1.message)('text'), async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId)
        return next();
    const text = ctx.message.text;
    // Нажатие кнопки главного меню — сбрасываем любой активный флоу
    if (MENU_BUTTONS.has(text)) {
        inventory_1.inventoryState.delete(userId);
        broadcasts_1.broadcastsState.delete(userId);
        segments_1.segmentsState.delete(userId);
        sales_1.salesState.delete(userId);
        analytics_1.analyticsState.delete(userId);
        storefront_1.storefrontState.delete(userId);
        promotions_1.promotionsState.delete(userId);
        pricing_1.pricingState.delete(userId);
        ai_settings_1.apiKeysState.delete(userId);
        return next();
    }
    // Флоу рассылки
    if (broadcasts_1.broadcastsState.has(userId)) {
        const handled = await (0, broadcasts_1.handleBroadcastMessage)(ctx, userId, text);
        if (handled)
            return;
    }
    // Флоу аналитики (произвольный период)
    if (analytics_1.analyticsState.has(userId)) {
        const handled = await (0, analytics_1.handleAnalyticsMessage)(ctx, userId, text);
        if (handled)
            return;
    }
    // Флоу сегментов
    if (segments_1.segmentsState.has(userId)) {
        const handled = await (0, segments_1.handleSegmentMessage)(ctx, userId, text);
        if (handled)
            return;
    }
    // Флоу продаж/резервов
    if (sales_1.salesState.has(userId)) {
        const handled = await (0, sales_1.handleSalesMessage)(ctx, userId, text);
        if (handled)
            return;
    }
    // Флоу товароучёта
    if (inventory_1.inventoryState.has(userId)) {
        const handled = await (0, inventory_1.handleInventoryMessage)(ctx, userId, text);
        if (handled)
            return;
    }
    // Флоу витрины
    if (storefront_1.storefrontState.has(userId)) {
        const handled = await (0, storefront_1.handleStorefrontMessage)(ctx, userId, text);
        if (handled)
            return;
    }
    // Флоу акций
    if (promotions_1.promotionsState.has(userId)) {
        const handled = await (0, promotions_1.handlePromotionsMessage)(ctx, userId, text);
        if (handled)
            return;
    }
    // Флоу цен
    if (pricing_1.pricingState.has(userId)) {
        const handled = await (0, pricing_1.handlePricingMessage)(ctx, userId, text);
        if (handled)
            return;
    }
    // Флоу API ключей
    if (ai_settings_1.apiKeysState.has(userId)) {
        const handled = await (0, ai_settings_1.handleApiKeysMessage)(ctx, userId, text);
        if (handled)
            return;
    }
    return next();
});
// ─── Перехватчик фото для шага загрузки фото при добавлении товара ────────────
bot.on((0, filters_1.message)('photo'), async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId)
        return next();
    const handledBcast = await (0, broadcasts_1.handleBroadcastPhoto)(ctx, userId);
    if (handledBcast)
        return;
    const handled = await (0, inventory_1.handleInventoryPhoto)(ctx, userId);
    if (handled)
        return;
    const handledSf = await (0, storefront_1.handleStorefrontPhoto)(ctx, userId);
    if (handledSf)
        return;
    return next();
});
bot.on((0, filters_1.message)('video'), async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId)
        return next();
    const handled = await (0, broadcasts_1.handleBroadcastVideo)(ctx, userId);
    if (handled)
        return;
    return next();
});
// ─── Перехватчик документов ───────────────────────────────────────────────────
// Обрабатывает:
//   1. Image-документы (PNG без фона и т.п.) → photo-флоу товароучёта и витрины
//   2. Файлы прайсов (Excel/CSV) → импорт, приёмка, списание
bot.on((0, filters_1.message)('document'), async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId)
        return next();
    const doc = ctx.message?.document;
    // Image-документ → роутим в photo-обработчики (работают с photo и document)
    if (doc?.mime_type?.startsWith('image/')) {
        const handled = await (0, inventory_1.handleInventoryPhoto)(ctx, userId);
        if (handled)
            return;
        const handledSf = await (0, storefront_1.handleStorefrontPhoto)(ctx, userId);
        if (handledSf)
            return;
    }
    // xlsx прайс-лист для обновления цен
    if (!doc?.mime_type?.startsWith('image/')) {
        const handledPricing = await (0, pricing_1.handlePricingDocument)(ctx, userId);
        if (handledPricing)
            return;
    }
    const state = inventory_1.inventoryState.get(userId);
    if (state?.flow === 'import_file') {
        await (0, inventory_1.handleInventoryDocument)(ctx, userId);
        return;
    }
    return next();
});
// ─── /start ───────────────────────────────────────────────────────────────────
bot.start((ctx) => {
    ctx.reply(`Привет, ${ctx.from.first_name}! Добро пожаловать в панель управления Bender Shop.`, adminKeyboard);
});
// ─── 📊 Аналитика ─────────────────────────────────────────────────────────────
(0, analytics_1.setupAnalyticsHandlers)(bot);
bot.hears('📊 Аналитика', async (ctx) => {
    await (0, analytics_1.showAnalyticsToday)(ctx);
});
// ─── 📬 Входящие ──────────────────────────────────────────────────────────────
bot.hears('📬 Входящие', async (ctx) => {
    const unreadCount = await prisma_1.prisma.message.count({ where: { isRead: false } });
    if (unreadCount === 0) {
        await ctx.reply('📬 Нет непрочитанных сообщений.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🏠 Главное меню', 'back:main')]]));
        return;
    }
    const recentClients = await prisma_1.prisma.client.findMany({
        where: { messages: { some: { isRead: false } } },
        include: {
            messages: {
                where: { isRead: false },
                orderBy: { createdAt: 'desc' },
                take: 1,
            },
        },
        take: 10,
        orderBy: { updatedAt: 'desc' },
    });
    const lines = recentClients.map((c) => {
        const last = c.messages[0];
        const preview = last?.text.slice(0, 60) ?? '';
        return `• ${c.name}: ${preview}`;
    });
    await ctx.reply(`📬 Непрочитанных: ${unreadCount}\n\n${lines.join('\n')}`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🏠 Главное меню', 'back:main')]]));
});
// ─── 📢 Рассылки ──────────────────────────────────────────────────────────────
(0, broadcasts_1.setupBroadcastHandlers)(bot);
bot.hears('📢 Рассылки', async (ctx) => {
    await (0, broadcasts_1.showBroadcastMenu)(ctx);
});
// ─── 💰 Балансы ───────────────────────────────────────────────────────────────
bot.hears('💰 Балансы', async (ctx) => {
    const [total, byPayment] = await Promise.all([
        prisma_1.prisma.order.aggregate({ _sum: { totalAmount: true }, _count: true }),
        prisma_1.prisma.order.groupBy({
            by: ['payment'],
            _sum: { totalAmount: true },
            _count: true,
        }),
    ]);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayRevenue = await prisma_1.prisma.order.aggregate({
        where: { createdAt: { gte: todayStart } },
        _sum: { totalAmount: true },
        _count: true,
    });
    const LABEL = {
        cash: '💵 Наличные',
        transfer: '📲 Перевод',
        card: '💳 Карта',
    };
    const fmt = (n) => Number(n ?? 0).toLocaleString('ru-RU');
    const payLines = byPayment
        .map((p) => `  ${LABEL[p.payment] ?? p.payment}: ${fmt(p._sum.totalAmount)} ₽ (${p._count} заказ.)`)
        .join('\n');
    await ctx.reply([
        '💰 Балансы',
        '',
        `Заказов всего: ${total._count}`,
        `Сегодня: ${todayRevenue._count} заказ. / ${fmt(todayRevenue._sum.totalAmount)} ₽`,
        '',
        'По способам оплаты:',
        payLines || '  —',
        '',
        `Итого выручка: ${fmt(total._sum.totalAmount)} ₽`,
    ].join('\n'), telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🏠 Главное меню', 'back:main')]]));
});
// ─── 🏷️ Акции ─────────────────────────────────────────────────────────────────
(0, promotions_1.setupPromotionsHandlers)(bot);
bot.hears('🏷️ Акции', async (ctx) => {
    await (0, promotions_1.showPromotionsMenu)(ctx);
});
// ─── 🔧 Техработы ────────────────────────────────────────────────────────────
bot.hears('🔧 Техработы', async (ctx) => {
    const status = maintenanceMode ? '🔴 Включён' : '🟢 Выключен';
    const action = maintenanceMode ? 'maint:off' : 'maint:on';
    const label = maintenanceMode ? '✅ Выключить техработы' : '🔧 Включить техработы';
    await ctx.reply(`🔧 Режим техработ\n\nСтатус: ${status}\n\nПри включении новые клиентские сообщения получают автоответ о техработах.`, telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback(label, action)],
        [telegraf_1.Markup.button.callback('🏠 Главное меню', 'back:main')],
    ]));
});
bot.action('maint:on', async (ctx) => {
    try {
        await ctx.answerCbQuery();
    }
    catch { }
    exports.maintenanceMode = maintenanceMode = true;
    await ctx.reply('🔧 Техработы включены. Клиенты получат автоответ.');
});
bot.action('maint:off', async (ctx) => {
    try {
        await ctx.answerCbQuery();
    }
    catch { }
    exports.maintenanceMode = maintenanceMode = false;
    await ctx.reply('✅ Техработы выключены. Бот работает в штатном режиме.');
});
// ─── 🏠 Назад в главное меню ──────────────────────────────────────────────────
bot.action('back:main', async (ctx) => {
    try {
        await ctx.answerCbQuery();
    }
    catch { }
    const userId = ctx.from.id;
    inventory_1.inventoryState.delete(userId);
    broadcasts_1.broadcastsState.delete(userId);
    segments_1.segmentsState.delete(userId);
    sales_1.salesState.delete(userId);
    analytics_1.analyticsState.delete(userId);
    storefront_1.storefrontState.delete(userId);
    promotions_1.promotionsState.delete(userId);
    pricing_1.pricingState.delete(userId);
    ai_settings_1.apiKeysState.delete(userId);
    await ctx.reply('🏠 Главное меню', adminKeyboard);
});
// ─── 📦 Товароучёт ────────────────────────────────────────────────────────────
(0, inventory_1.setupInventoryHandlers)(bot);
bot.hears('📦 Товароучёт', async (ctx) => {
    await (0, inventory_1.showInventory)(ctx);
});
// ─── 📂 Сегменты ──────────────────────────────────────────────────────────────
(0, segments_1.setupSegmentHandlers)(bot);
bot.hears('📂 Сегменты', async (ctx) => {
    await (0, segments_1.showSegments)(ctx);
});
// ─── 🤖 AI Агент ──────────────────────────────────────────────────────────────
(0, ai_settings_1.setupAISettingsHandlers)(bot);
bot.hears('🤖 AI Агент', async (ctx) => {
    await (0, ai_settings_1.showAISettings)(ctx);
});
// ─── 🖼️ Витрина ───────────────────────────────────────────────────────────────
(0, storefront_1.setupStorefrontHandlers)(bot);
bot.hears('🖼️ Витрина', async (ctx) => {
    await (0, storefront_1.showStorefront)(ctx);
});
// ─── 💰 Цены ──────────────────────────────────────────────────────────────────
(0, pricing_1.setupPricingHandlers)(bot);
bot.hears('💰 Цены', async (ctx) => {
    await (0, pricing_1.showPricingMenu)(ctx);
});
// ─── 💰 Продажи и резервы ─────────────────────────────────────────────────────
(0, sales_1.setupSalesHandlers)(bot);
(0, sales_1.registerSkipCommentHandlers)(bot);
// ─── 🔑 API Ключи ─────────────────────────────────────────────────────────────
(0, ai_settings_1.setupApiKeysHandlers)(bot);
bot.hears('🔑 API Ключи', async (ctx) => {
    await (0, ai_settings_1.showApiKeysMenu)(ctx);
});
// ─── Запуск ───────────────────────────────────────────────────────────────────
bot.launch({
    allowedUpdates: ['message', 'callback_query'],
});
console.log('Бот запущен');
(0, scheduler_1.startScheduler)(bot);
(0, server_1.startApiServer)();
(async () => {
    try {
        const savedKey = await prisma_1.prisma.apiKey.findFirst({ where: { service: 'openrouter_key' } });
        if (savedKey?.value) {
            process.env.OPENROUTER_API_KEY = savedKey.value;
            (0, agent_1.reinitClient)(savedKey.value);
            (0, ai_parser_1.reinitClient)(savedKey.value);
            console.log('OpenRouter ключ загружен из БД');
        }
    }
    catch (e) {
        console.error('Load OpenRouter key error:', e);
    }
})();
// ─── Инициализация дефолтных регионов ────────────────────────────────────────
const DEFAULT_REGIONS = [
    { code: 'HK', name: 'Гонконг', flag: '🇭🇰', currency: 'HKD' },
    { code: 'EU', name: 'Европа', flag: '🇪🇺', currency: 'EUR' },
    { code: 'IN', name: 'Индия', flag: '🇮🇳', currency: 'INR' },
    { code: 'RU', name: 'Россия', flag: '🇷🇺', currency: 'RUB' },
    { code: 'CN', name: 'Китай', flag: '🇨🇳', currency: 'CNY' },
];
(async () => {
    for (const r of DEFAULT_REGIONS) {
        await prisma_1.prisma.region.upsert({
            where: { code: r.code },
            create: r,
            update: {},
        });
    }
    console.log('Регионы инициализированы');
})().catch((e) => console.error('Seed regions error:', e));
// ─── DB keepalive: предотвращает разрыв соединения на db.prisma.io ────────────
setInterval(async () => {
    try {
        await prisma_1.prisma.$queryRaw `SELECT 1`;
    }
    catch (e) {
        console.log('DB keepalive failed, reconnecting...');
    }
}, 4 * 60 * 1000);
// ─── Автозавершение акций по истечению срока (каждые 10 минут) ───────────────
setInterval(async () => {
    try {
        const expired = await prisma_1.prisma.promotion.findMany({
            where: { isActive: true, endsAt: { lt: new Date() } },
        });
        for (const promo of expired) {
            await (0, promotions_2.cancelPromotion)(promo.id);
            for (const adminId of ADMIN_IDS) {
                try {
                    await bot.telegram.sendMessage(adminId, `⏰ Акция «${promo.name}» завершена автоматически — срок истёк.`);
                }
                catch {
                    // ignore
                }
            }
        }
    }
    catch (e) {
        console.error('Promo auto-cancel error:', e);
    }
}, 10 * 60 * 1000);
// ─── Ежедневное уведомление о курсах валют в 10:00 МСК ───────────────────────
// Проверяем раз в час; если час === 10 и сегодня ещё не отправляли — отправляем.
setInterval(async () => {
    try {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
        if (now.getHours() !== 10)
            return;
        const todayStr = now.toISOString().slice(0, 10);
        const notifyKey = await prisma_1.prisma.apiKey.findUnique({ where: { service: 'currency_notify_date' } });
        if (notifyKey?.value === todayStr)
            return; // уже отправляли сегодня
        // Отмечаем как отправленное
        await prisma_1.prisma.apiKey.upsert({
            where: { service: 'currency_notify_date' },
            create: { service: 'currency_notify_date', value: todayStr },
            update: { value: todayStr },
        });
        for (const adminId of ADMIN_IDS) {
            try {
                const result = await (0, pricing_1.sendDailyCurrencyRates)(async (text, keyboard) => {
                    await bot.telegram.sendMessage(adminId, text, { parse_mode: 'HTML', ...keyboard });
                });
                if (result?.changes) {
                    pricing_1.lastCurrencyChanges.splice(0, pricing_1.lastCurrencyChanges.length, ...result.changes);
                }
            }
            catch { /* ignore */ }
        }
    }
    catch (e) {
        console.error('Currency notify error:', e);
    }
}, 60 * 60 * 1000);
// ─── Инициализация технического топика «📦 Продажи и резервы» ─────────────────
async function ensureSalesTopic() {
    try {
        const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID);
        if (!CRM_GROUP_ID)
            return;
        const existing = await prisma_1.prisma.apiKey.findUnique({ where: { service: 'sales_topic' } });
        if (existing) {
            console.log(`Топик продаж: threadId=${existing.value}`);
            return;
        }
        const topic = await bot.telegram.createForumTopic(CRM_GROUP_ID, '📦 Продажи и резервы');
        const threadId = topic.message_thread_id;
        await prisma_1.prisma.apiKey.create({ data: { service: 'sales_topic', value: String(threadId) } });
        console.log(`Топик «📦 Продажи и резервы» создан: threadId=${threadId}`);
        // Отправляем панель управления в топик
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await bot.telegram.sendMessage(CRM_GROUP_ID, '💼 Панель продаж и резервов', {
            message_thread_id: threadId,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '💰 Новая продажа', callback_data: 'sales_topic:new_sale' },
                        { text: '🔖 Новый резерв', callback_data: 'sales_topic:new_reserve' },
                    ],
                ],
            },
        });
    }
    catch (err) {
        console.error('ensureSalesTopic error:', err);
    }
}
ensureSalesTopic();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
//# sourceMappingURL=index.js.map