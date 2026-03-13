"use strict";
/**
 * bot/admin/storefront.ts
 *
 * Управление витриной: бегущая строка + hero-баннеры.
 *
 * Подключение в bot/index.ts:
 *   setupStorefrontHandlers(bot)
 *   handleStorefrontMessage(ctx, uid, text)
 *   handleStorefrontPhoto(ctx, uid)   — вызывать из перехватчика фото
 *   storefrontState                   — проверять наличие активного флоу
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.storefrontState = void 0;
exports.showStorefront = showStorefront;
exports.setupStorefrontHandlers = setupStorefrontHandlers;
exports.handleStorefrontMessage = handleStorefrontMessage;
exports.handleStorefrontPhoto = handleStorefrontPhoto;
const telegraf_1 = require("telegraf");
const prisma_1 = require("../../lib/prisma");
const api_key_store_1 = require("../../lib/api-key-store");
exports.storefrontState = new Map();
// ─── Главный экран Витрины ────────────────────────────────────────────────────
async function showStorefront(ctx) {
    const bannerCount = await prisma_1.prisma.heroBanner.count({ where: { isActive: true } });
    const marqueeValue = await (0, api_key_store_1.getApiKeyValue)('setting_marquee');
    const marqueeText = marqueeValue ? `«${marqueeValue.slice(0, 40)}${marqueeValue.length > 40 ? '…' : ''}»` : '—';
    await ctx.reply([
        '🖼️ Витрина',
        '',
        `📢 Бегущая строка: ${marqueeText}`,
        `🎠 Активных баннеров: ${bannerCount}`,
    ].join('\n'), telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback('📢 Бегущая строка', 'sf:marquee')],
        [telegraf_1.Markup.button.callback('🎠 Hero баннеры', 'sf:banners')],
        [telegraf_1.Markup.button.callback('🔄 Сбросить кэш сайта', 'sf:cache_reset')],
        [telegraf_1.Markup.button.callback('🏠 Главное меню', 'back:main')],
    ]));
}
// ─── Экран бегущей строки ─────────────────────────────────────────────────────
async function showMarquee(ctx) {
    const current = (await (0, api_key_store_1.getApiKeyValue)('setting_marquee')) ?? '—';
    await ctx.reply(`📢 Бегущая строка\n\nТекущий текст:\n${current}`, telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback('✏️ Изменить', 'sf:marquee_edit')],
        [telegraf_1.Markup.button.callback('← Назад', 'sf:back')],
    ]));
}
// ─── Экран баннеров ───────────────────────────────────────────────────────────
async function showBanners(ctx) {
    const banners = await prisma_1.prisma.heroBanner.findMany({ orderBy: { order: 'asc' } });
    if (banners.length === 0) {
        await ctx.reply('🎠 Hero баннеры\n\nПока нет ни одного баннера.', telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback('➕ Добавить', 'sf:banner_add')],
            [telegraf_1.Markup.button.callback('← Назад', 'sf:back')],
        ]));
        return;
    }
    const lines = banners.map((b, i) => {
        const status = b.isActive ? '✅' : '❌';
        const title = b.title ?? '(без заголовка)';
        return `${i + 1}. ${status} [${b.order}] ${title}`;
    });
    const bannerButtons = banners.flatMap((b) => [
        [
            telegraf_1.Markup.button.callback(`▲ #${b.id}`, `sf:banner_up:${b.id}`),
            telegraf_1.Markup.button.callback(`▼ #${b.id}`, `sf:banner_down:${b.id}`),
            telegraf_1.Markup.button.callback(`🗑️ #${b.id}`, `sf:banner_del:${b.id}`),
        ],
    ]);
    await ctx.reply(`🎠 Hero баннеры\n\n${lines.join('\n')}`, telegraf_1.Markup.inlineKeyboard([
        ...bannerButtons,
        [telegraf_1.Markup.button.callback('➕ Добавить', 'sf:banner_add')],
        [telegraf_1.Markup.button.callback('← Назад', 'sf:back')],
    ]));
}
// ─── Регистрация обработчиков ─────────────────────────────────────────────────
function setupStorefrontHandlers(bot) {
    // Главный экран
    bot.action('sf:back', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await showStorefront(ctx);
    });
    // Бегущая строка
    bot.action('sf:marquee', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await showMarquee(ctx);
    });
    bot.action('sf:marquee_edit', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        exports.storefrontState.set(userId, { flow: 'marquee', step: 'text' });
        await ctx.reply('Введите новый текст бегущей строки:', telegraf_1.Markup.keyboard([['❌ Отмена']]).resize());
    });
    // Сброс кэша
    bot.action('sf:cache_reset', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const version = Date.now().toString();
        await (0, api_key_store_1.setApiKeyValue)('cache_version', version);
        await ctx.reply(`✅ Кэш сайта сброшен. Сайт обновится в течение 30 секунд.`);
        await showStorefront(ctx);
    });
    // Баннеры
    bot.action('sf:banners', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await showBanners(ctx);
    });
    bot.action('sf:banner_add', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        exports.storefrontState.set(userId, { flow: 'banner_add', step: 'photo' });
        await ctx.reply('🎠 Добавление баннера\n\nОтправьте фото баннера:', telegraf_1.Markup.keyboard([['❌ Отмена']]).resize());
    });
    // Переместить вверх (уменьшить order)
    bot.action(/^sf:banner_up:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const id = Number(ctx.match[1]);
        const banner = await prisma_1.prisma.heroBanner.findUnique({ where: { id } });
        if (banner && banner.order > 0) {
            await prisma_1.prisma.heroBanner.update({ where: { id }, data: { order: banner.order - 1 } });
        }
        await showBanners(ctx);
    });
    // Переместить вниз (увеличить order)
    bot.action(/^sf:banner_down:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const id = Number(ctx.match[1]);
        const banner = await prisma_1.prisma.heroBanner.findUnique({ where: { id } });
        if (banner) {
            await prisma_1.prisma.heroBanner.update({ where: { id }, data: { order: banner.order + 1 } });
        }
        await showBanners(ctx);
    });
    // Удалить баннер
    bot.action(/^sf:banner_del:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const id = Number(ctx.match[1]);
        await prisma_1.prisma.heroBanner.delete({ where: { id } });
        await ctx.reply(`🗑️ Баннер #${id} удалён.`);
        await showBanners(ctx);
    });
}
// ─── Обработка текстовых сообщений флоу ──────────────────────────────────────
async function handleStorefrontMessage(ctx, userId, text) {
    const state = exports.storefrontState.get(userId);
    if (!state)
        return false;
    if (text === '❌ Отмена') {
        exports.storefrontState.delete(userId);
        await ctx.reply('Отменено.', telegraf_1.Markup.removeKeyboard());
        await showStorefront(ctx);
        return true;
    }
    // ── Бегущая строка ────────────────────────────────────────────────────────
    if (state.flow === 'marquee' && state.step === 'text') {
        exports.storefrontState.delete(userId);
        await (0, api_key_store_1.setApiKeyValue)('setting_marquee', text);
        await ctx.reply('✅ Бегущая строка обновлена.', telegraf_1.Markup.removeKeyboard());
        await showMarquee(ctx);
        return true;
    }
    // ── Добавление баннера: шаг title ─────────────────────────────────────────
    if (state.flow === 'banner_add' && state.step === 'title') {
        const title = text === '—' ? null : text;
        exports.storefrontState.set(userId, {
            flow: 'banner_add',
            step: 'subtitle',
            imageFile: state.imageFile,
            title,
        });
        await ctx.reply('Введите подзаголовок (или «—» чтобы пропустить):', telegraf_1.Markup.keyboard([['—'], ['❌ Отмена']]).resize());
        return true;
    }
    // ── Добавление баннера: шаг subtitle ─────────────────────────────────────
    if (state.flow === 'banner_add' && state.step === 'subtitle') {
        const subtitle = text === '—' ? null : text;
        exports.storefrontState.set(userId, {
            flow: 'banner_add',
            step: 'order',
            imageFile: state.imageFile,
            title: state.title,
            subtitle,
        });
        await ctx.reply('Введите порядковый номер (например 0, 1, 2…):', telegraf_1.Markup.keyboard([['0'], ['❌ Отмена']]).resize());
        return true;
    }
    // ── Добавление баннера: шаг order ────────────────────────────────────────
    if (state.flow === 'banner_add' && state.step === 'order') {
        const order = parseInt(text, 10);
        if (isNaN(order)) {
            await ctx.reply('Введите число (например 0, 1, 2).');
            return true;
        }
        exports.storefrontState.delete(userId);
        await prisma_1.prisma.heroBanner.create({
            data: {
                imageFile: state.imageFile,
                title: state.title,
                subtitle: state.subtitle,
                order,
            },
        });
        await ctx.reply('✅ Баннер добавлен!', telegraf_1.Markup.removeKeyboard());
        await showBanners(ctx);
        return true;
    }
    return false;
}
// ─── Обработка фото ───────────────────────────────────────────────────────────
async function handleStorefrontPhoto(ctx, userId) {
    const state = exports.storefrontState.get(userId);
    if (!state || state.flow !== 'banner_add' || state.step !== 'photo')
        return false;
    const photo = ctx.message.photo;
    const fileId = photo[photo.length - 1].file_id;
    exports.storefrontState.set(userId, {
        flow: 'banner_add',
        step: 'title',
        imageFile: fileId,
    });
    await ctx.reply('Фото получено! Введите заголовок (или «—» чтобы пропустить):', telegraf_1.Markup.keyboard([['—'], ['❌ Отмена']]).resize());
    return true;
}
//# sourceMappingURL=storefront.js.map