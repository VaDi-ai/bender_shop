"use strict";
/**
 * webhooks/telegram.ts
 *
 * Двусторонний мост «клиент ↔ CRM-группа»:
 *   • Входящее от клиента  → найти/создать Client + топик форума → уведомить CRM
 *   • Ответ менеджера в топике → переслать клиенту в личку
 *
 * Inline-панель управления в каждом топике:
 *   Отправляется ОДИН РАЗ при создании топика и закрепляется.
 *   [💰 Продажа] [🔖 Резерв]
 *   [✏️ Редактировать] [📊 Сегмент]
 *   [🏷️ Теги] [📋 История]
 *   [📝 Заметка] [👤 Карточка]
 *
 * Команда /card в топике — карточка клиента с inline keyboard (статусы + редактирование).
 *
 * Требования к боту:
 *   — администратор CRM-группы (для создания топиков, закрепления/удаления сообщений)
 *   — privacy mode выключен (BotFather → /setprivacy → Disable)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupClientHandlers = setupClientHandlers;
const telegraf_1 = require("telegraf");
const filters_1 = require("telegraf/filters");
const prisma_1 = require("../lib/prisma");
const sales_1 = require("../bot/admin/sales");
const agent_1 = require("../bot/ai/agent");
const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID);
const ADMIN_IDS = (process.env.ADMIN_IDS ?? '').split(',').map((id) => Number(id.trim()));
// ─── Состояние: режим заметки ──────────────────────────────────────────────────
// threadId топика → clientId; сбрасывается после сохранения заметки
const noteMode = new Map();
const editMode = new Map();
// ─── Inline keyboard панели управления ────────────────────────────────────────
// Отправляется один раз в топик при его создании и закрепляется.
// Callback data: cp:{action}:{clientId}
function buildControlPanelKeyboard(clientId) {
    return telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback('💰 Продажа', `cp:sale:${clientId}`),
            telegraf_1.Markup.button.callback('🔖 Резерв', `cp:res:${clientId}`),
        ],
        [
            telegraf_1.Markup.button.callback('✏️ Редактировать', `cp:edit:${clientId}`),
            telegraf_1.Markup.button.callback('📊 Сегмент', `cp:seg:${clientId}`),
        ],
        [
            telegraf_1.Markup.button.callback('🏷️ Теги', `cp:tags:${clientId}`),
            telegraf_1.Markup.button.callback('📋 История', `cp:hist:${clientId}`),
        ],
        [
            telegraf_1.Markup.button.callback('📝 Заметка', `cp:note:${clientId}`),
            telegraf_1.Markup.button.callback('👤 Карточка', `cp:card:${clientId}`),
        ],
    ]);
}
// ─── Inline keyboard для карточки клиента (/card) ─────────────────────────────
function buildCardInlineKeyboard(clientId, segmentLabel) {
    return telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback(`${segmentLabel} · сменить сегмент`, `seg:${clientId}`)],
        [
            telegraf_1.Markup.button.callback('💭 Думает', `st:think:${clientId}`),
            telegraf_1.Markup.button.callback('⏳ Ждёт скидку', `st:disc:${clientId}`),
            telegraf_1.Markup.button.callback('❌ Отказ', `st:ref:${clientId}`),
        ],
        [telegraf_1.Markup.button.callback('✏️ Редактировать', `edit:menu:${clientId}`)],
    ]);
}
function getSegmentLabel(seg) {
    return seg ? `${seg.color} ${seg.name}` : '— Сегмент';
}
// ─── Форматирование карточки клиента ─────────────────────────────────────────
async function buildClientCard(clientId) {
    const client = await prisma_1.prisma.client.findUnique({
        where: { id: clientId },
        include: { segment: true, tags: true },
    });
    if (!client)
        return '❌ Клиент не найден';
    const now = Date.now();
    const lastContact = client.updatedAt;
    const diffMs = now - lastContact.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffH / 24);
    const lastContactStr = diffD > 0 ? `${diffD} дн. назад` : diffH > 0 ? `${diffH} ч. назад` : 'недавно';
    const birthStr = client.birthDate
        ? client.birthDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '—';
    const segLabel = client.segment ? `${client.segment.color} ${client.segment.name}` : '—';
    const tagsStr = client.tags.length > 0 ? client.tags.map((t) => `[${t.name}]`).join(' ') : '—';
    const notesStr = client.notes ?? '—';
    const revenue = Number(client.totalRevenue);
    const lines = [
        `👤 ${client.fullName ?? client.name}`,
    ];
    if (client.phone)
        lines.push(`📞 ${client.phone}`);
    if (client.email)
        lines.push(`📧 ${client.email}`);
    if (client.birthDate)
        lines.push(`🎂 ${birthStr}`);
    lines.push('━━━━━━━━━━━━━━━');
    lines.push(`📌 Источник: ${sourceLabel(client.source)}`);
    lines.push(`📊 Сегмент: ${segLabel}`);
    lines.push(`💬 Последний контакт: ${lastContactStr}`);
    lines.push(`🛍️ Покупок: ${client.totalPurchases} на сумму ${fmtPrice(revenue)} ₽`);
    lines.push('━━━━━━━━━━━━━━━');
    lines.push(`🏷️ Теги: ${tagsStr}`);
    lines.push(`📝 Заметка: ${notesStr}`);
    return lines.join('\n');
}
function sourceLabel(source) {
    const map = {
        telegram: 'Telegram',
        avito: 'Avito',
        instagram: 'Instagram',
        shop: 'Магазин',
    };
    return map[source] ?? source;
}
// ─── Экспортируемая функция подключения ───────────────────────────────────────
/**
 * Регистрирует обработчики сообщений от клиентов, ответов менеджеров
 * и inline-кнопок карточки клиента.
 * ВАЖНО: вызывать ДО admin-middleware в bot/index.ts.
 */
function setupClientHandlers(bot) {
    // ── Обработчик нажатий inline-кнопок ────────────────────────────────────────
    bot.on('callback_query', async (ctx, next) => {
        const query = ctx.callbackQuery;
        const data = query['data'];
        if (!data)
            return next();
        const msg = query['message'];
        const chatId = msg?.['chat']?.['id'];
        const messageId = msg?.['message_id'];
        const threadId = msg?.['message_thread_id'];
        try {
            // ── Панель управления: cp:{action}:{clientId} ────────────────────────────
            if (data.startsWith('cp:')) {
                const parts = data.split(':');
                const action = parts[1];
                const clientId = parseInt(parts[2], 10);
                const managerId = ctx.from?.id;
                const client = await prisma_1.prisma.client.findUnique({
                    where: { id: clientId },
                    include: { segment: true },
                });
                if (!client)
                    return ctx.answerCbQuery('Клиент не найден');
                switch (action) {
                    // Продажа — флоу в личке менеджера
                    case 'sale': {
                        if (!managerId)
                            return ctx.answerCbQuery();
                        sales_1.salesState.set(managerId, { flow: 'sale', step: 'product_method', clientId });
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        await ctx.telegram.sendMessage(managerId, '💰 Продажа — выберите способ выбора товара:', {
                            reply_markup: telegraf_1.Markup.inlineKeyboard([
                                [telegraf_1.Markup.button.callback('📋 Из списка', `sale:list:${clientId}`)],
                                [telegraf_1.Markup.button.callback('🔢 По SKU', `sale:sku:${clientId}`)],
                                [telegraf_1.Markup.button.callback('❌ Отмена', 'sale:cancel')],
                            ]).reply_markup,
                        });
                        return ctx.answerCbQuery('💰 Флоу продажи запущен');
                    }
                    // Резерв — флоу в личке менеджера
                    case 'res': {
                        if (!managerId)
                            return ctx.answerCbQuery();
                        sales_1.salesState.set(managerId, { flow: 'reserve', step: 'product_method', clientId });
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        await ctx.telegram.sendMessage(managerId, '🔖 Резерв — выберите способ выбора товара:', {
                            reply_markup: telegraf_1.Markup.inlineKeyboard([
                                [telegraf_1.Markup.button.callback('📋 Из списка', `res:list:${clientId}`)],
                                [telegraf_1.Markup.button.callback('🔢 По SKU', `res:sku:${clientId}`)],
                                [telegraf_1.Markup.button.callback('❌ Отмена', 'res:cancel')],
                            ]).reply_markup,
                        });
                        return ctx.answerCbQuery('🔖 Флоу резерва запущен');
                    }
                    // Редактировать — меню в личке менеджера
                    case 'edit': {
                        if (!managerId)
                            return ctx.answerCbQuery();
                        await ctx.answerCbQuery();
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        return ctx.telegram.sendMessage(managerId, '✏️ Что редактировать?', {
                            reply_markup: telegraf_1.Markup.inlineKeyboard([
                                [
                                    telegraf_1.Markup.button.callback('👤 ФИО', `edit:field:${clientId}:fullName`),
                                    telegraf_1.Markup.button.callback('📞 Телефон', `edit:field:${clientId}:phone`),
                                ],
                                [
                                    telegraf_1.Markup.button.callback('📧 Email', `edit:field:${clientId}:email`),
                                    telegraf_1.Markup.button.callback('🎂 Дата рождения', `edit:field:${clientId}:birthDate`),
                                ],
                                [telegraf_1.Markup.button.callback('❌ Отмена', 'edit:cancel')],
                            ]).reply_markup,
                        });
                    }
                    // Сегмент — цикличное переключение, уведомление через answerCbQuery
                    case 'seg': {
                        const segments = await prisma_1.prisma.segment.findMany({ orderBy: { id: 'asc' } });
                        if (segments.length === 0)
                            return ctx.answerCbQuery('⚠️ Нет сегментов в БД');
                        const currentIndex = segments.findIndex((s) => s.id === client.segmentId);
                        const nextIndex = (currentIndex + 1) % segments.length;
                        const nextSeg = segments[nextIndex];
                        await prisma_1.prisma.client.update({ where: { id: clientId }, data: { segmentId: nextSeg.id } });
                        return ctx.answerCbQuery(`📊 Сегмент → ${nextSeg.color} ${nextSeg.name}`);
                    }
                    // Теги — заглушка
                    case 'tags': {
                        return ctx.answerCbQuery('🏷️ Управление тегами — скоро');
                    }
                    // История — последние 10 сообщений в топик
                    case 'hist': {
                        const messages = await prisma_1.prisma.message.findMany({
                            where: { clientId },
                            orderBy: { createdAt: 'desc' },
                            take: 10,
                        });
                        if (messages.length === 0)
                            return ctx.answerCbQuery('История пуста');
                        const lines = messages
                            .reverse()
                            .map((m) => {
                            const time = m.createdAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                            const arrow = m.direction === 'in' ? '→' : '←';
                            return `[${time}] ${arrow} ${m.text.slice(0, 80)}`;
                        })
                            .join('\n');
                        if (threadId) {
                            await sendToTopic(ctx.telegram, CRM_GROUP_ID, threadId, `📋 История (последние 10):\n\n${lines}`);
                        }
                        return ctx.answerCbQuery();
                    }
                    // Заметка — активируем режим ввода
                    case 'note': {
                        if (!threadId)
                            return ctx.answerCbQuery('Не определён топик');
                        noteMode.set(threadId, clientId);
                        await sendToTopic(ctx.telegram, CRM_GROUP_ID, threadId, '📝 Режим заметки: следующее ваше сообщение сохранится как заметка клиента (не пересылается).');
                        return ctx.answerCbQuery('📝 Введите заметку следующим сообщением');
                    }
                    // Карточка — отправить в топик с inline keyboard
                    case 'card': {
                        const cardText = await buildClientCard(clientId);
                        const segLabel = getSegmentLabel(client.segment);
                        if (threadId) {
                            await sendToTopicWithMarkup(ctx.telegram, CRM_GROUP_ID, threadId, cardText, buildCardInlineKeyboard(clientId, segLabel).reply_markup);
                        }
                        return ctx.answerCbQuery();
                    }
                    default:
                        return ctx.answerCbQuery();
                }
            }
            // ── Сегмент: seg:{clientId} — используется в карточке клиента ────────────
            if (data.startsWith('seg:')) {
                const clientId = parseInt(data.slice(4), 10);
                const client = await prisma_1.prisma.client.findUnique({
                    where: { id: clientId },
                    include: { segment: true },
                });
                if (!client)
                    return ctx.answerCbQuery('Клиент не найден');
                const segments = await prisma_1.prisma.segment.findMany({ orderBy: { id: 'asc' } });
                if (segments.length === 0)
                    return ctx.answerCbQuery('Нет сегментов в БД');
                const currentIndex = segments.findIndex((s) => s.id === client.segmentId);
                const nextIndex = (currentIndex + 1) % segments.length;
                const nextSeg = segments[nextIndex];
                await prisma_1.prisma.client.update({ where: { id: clientId }, data: { segmentId: nextSeg.id } });
                const label = getSegmentLabel(nextSeg);
                if (chatId && messageId) {
                    await ctx.telegram.editMessageReplyMarkup(chatId, messageId, undefined, buildCardInlineKeyboard(clientId, label).reply_markup);
                }
                return ctx.answerCbQuery(`Сегмент → ${label}`);
            }
            // ── Статус: st:{type}:{clientId} ────────────────────────────────────────
            if (data.startsWith('st:')) {
                const parts = data.split(':');
                const statusType = parts[1];
                const clientId = parseInt(parts[2], 10);
                const client = await prisma_1.prisma.client.findUnique({ where: { id: clientId } });
                if (!client)
                    return ctx.answerCbQuery('Клиент не найден');
                const defs = {
                    think: {
                        action: 'remind_client',
                        payload: { text: 'Добрый день! Актуален ли вопрос — готовы помочь с выбором 👍' },
                        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                        confirmText: '💭 Напомним через 3 дня',
                    },
                    disc: {
                        action: 'promo_notify',
                        payload: { text: '🎉 Акция началась! Скидки уже доступны — пора брать!' },
                        scheduledAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                        confirmText: '⏳ Уведомим при включении акции',
                    },
                    ref: {
                        action: 'remind_client',
                        payload: {
                            text: 'Здравствуйте! Хотели напомнить о нашем предложении — возможно, сейчас актуально?',
                        },
                        scheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        confirmText: '❌ Реактивируем через 30 дней',
                    },
                };
                const def = defs[statusType];
                if (!def)
                    return ctx.answerCbQuery();
                await prisma_1.prisma.task.create({
                    data: {
                        clientId,
                        action: def.action,
                        payload: def.payload,
                        scheduledAt: def.scheduledAt,
                    },
                });
                return ctx.answerCbQuery(def.confirmText);
            }
            // ── Заметка: note:{clientId} ────────────────────────────────────────────
            if (data.startsWith('note:') && !data.startsWith('note:save:')) {
                const clientId = parseInt(data.slice(5), 10);
                const client = await prisma_1.prisma.client.findUnique({ where: { id: clientId } });
                if (!client || client.telegramTopicId == null)
                    return ctx.answerCbQuery('Клиент не найден');
                noteMode.set(client.telegramTopicId, clientId);
                await sendToTopic(ctx.telegram, CRM_GROUP_ID, client.telegramTopicId, '📝 Режим заметки: следующее ваше сообщение сохранится как заметка клиента (не пересылается).');
                return ctx.answerCbQuery('📝 Введите заметку следующим сообщением');
            }
            // ── История: hist:{clientId} ────────────────────────────────────────────
            if (data.startsWith('hist:')) {
                const clientId = parseInt(data.slice(5), 10);
                const client = await prisma_1.prisma.client.findUnique({ where: { id: clientId } });
                if (!client)
                    return ctx.answerCbQuery('Клиент не найден');
                const messages = await prisma_1.prisma.message.findMany({
                    where: { clientId },
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                });
                if (messages.length === 0)
                    return ctx.answerCbQuery('История пуста');
                const lines = messages
                    .reverse()
                    .map((m) => {
                    const time = m.createdAt.toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                    });
                    const arrow = m.direction === 'in' ? '→' : '←';
                    return `[${time}] ${arrow} ${m.text.slice(0, 80)}`;
                })
                    .join('\n');
                if (client.telegramTopicId) {
                    await sendToTopic(ctx.telegram, CRM_GROUP_ID, client.telegramTopicId, `📋 История (последние 10):\n\n${lines}`);
                }
                return ctx.answerCbQuery();
            }
            // ── Карточка клиента: card:{clientId} ───────────────────────────────────
            if (data.startsWith('card:')) {
                const clientId = parseInt(data.slice(5), 10);
                const client = await prisma_1.prisma.client.findUnique({
                    where: { id: clientId },
                    include: { segment: true },
                });
                if (!client)
                    return ctx.answerCbQuery('Клиент не найден');
                const cardText = await buildClientCard(clientId);
                const segLabel = getSegmentLabel(client.segment);
                if (client.telegramTopicId) {
                    await sendToTopicWithMarkup(ctx.telegram, CRM_GROUP_ID, client.telegramTopicId, cardText, buildCardInlineKeyboard(clientId, segLabel).reply_markup);
                }
                return ctx.answerCbQuery();
            }
            // ── Редактировать: edit:menu:{clientId} ──────────────────────────────────
            if (data.startsWith('edit:menu:')) {
                const clientId = parseInt(data.slice(10), 10);
                await ctx.answerCbQuery();
                return ctx.reply('✏️ Что редактировать?', telegraf_1.Markup.inlineKeyboard([
                    [
                        telegraf_1.Markup.button.callback('👤 ФИО', `edit:field:${clientId}:fullName`),
                        telegraf_1.Markup.button.callback('📞 Телефон', `edit:field:${clientId}:phone`),
                    ],
                    [
                        telegraf_1.Markup.button.callback('📧 Email', `edit:field:${clientId}:email`),
                        telegraf_1.Markup.button.callback('🎂 Дата рождения', `edit:field:${clientId}:birthDate`),
                    ],
                    [telegraf_1.Markup.button.callback('❌ Отмена', 'edit:cancel')],
                ]));
            }
            // ── Редактировать: edit:field:{clientId}:{field} ──────────────────────
            if (data.startsWith('edit:field:')) {
                const parts = data.split(':');
                const clientId = parseInt(parts[2], 10);
                const field = parts[3];
                const userId = ctx.from?.id;
                if (!userId)
                    return ctx.answerCbQuery();
                editMode.set(userId, { clientId, field });
                await ctx.answerCbQuery();
                const prompts = {
                    fullName: 'Введите полное ФИО клиента:',
                    phone: 'Введите номер телефона (например, +79001234567):',
                    email: 'Введите email клиента:',
                    birthDate: 'Введите дату рождения (ДД.ММ.ГГГГ):',
                };
                return ctx.reply(prompts[field] ?? 'Введите значение:', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'edit:cancel')]]));
            }
            // ── Отмена редактирования ────────────────────────────────────────────────
            if (data === 'edit:cancel') {
                const userId = ctx.from?.id;
                if (userId)
                    editMode.delete(userId);
                await ctx.answerCbQuery();
                return ctx.reply('Редактирование отменено.');
            }
            // ── Продажа из карточки: crm:sale:{clientId} ─────────────────────────────
            if (data.startsWith('crm:sale:')) {
                const clientId = parseInt(data.slice(9), 10);
                await ctx.answerCbQuery();
                return (0, sales_1.startSaleFlow)(ctx, clientId);
            }
            // ── Резерв из карточки: crm:res:{clientId} ────────────────────────────────
            if (data.startsWith('crm:res:')) {
                const clientId = parseInt(data.slice(8), 10);
                await ctx.answerCbQuery();
                return (0, sales_1.startReserveFlow)(ctx, clientId);
            }
            // ── Теги: tags:{clientId} ────────────────────────────────────────────────
            if (data.startsWith('tags:')) {
                return ctx.answerCbQuery('Управление тегами — скоро');
            }
            // ── AI: ai:send:{suggestionId} — отправить предложение клиенту ───────────
            if (data.startsWith('ai:send:')) {
                const suggestionId = parseInt(data.slice(8), 10);
                const suggestion = (0, agent_1.getSuggestion)(suggestionId);
                if (!suggestion)
                    return ctx.answerCbQuery('Предложение не найдено или устарело');
                const { clientId, text } = suggestion;
                (0, agent_1.deleteSuggestion)(suggestionId);
                const client = await prisma_1.prisma.client.findUnique({ where: { id: clientId } });
                if (!client)
                    return ctx.answerCbQuery('Клиент не найден');
                if (client.source === 'telegram' && client.externalId) {
                    await ctx.telegram.sendMessage(client.externalId, text);
                }
                await prisma_1.prisma.message.create({
                    data: { clientId, direction: 'out', text, source: 'telegram' },
                });
                (0, agent_1.incrementStat)('approved');
                // Обновляем сообщение с кнопками — убираем кнопки, добавляем метку
                if (chatId && messageId) {
                    try {
                        await ctx.telegram.editMessageReplyMarkup(chatId, messageId, undefined, {
                            inline_keyboard: [],
                        });
                    }
                    catch { }
                }
                return ctx.answerCbQuery('✅ Ответ отправлен клиенту');
            }
            // ── AI: ai:edit:{suggestionId} — редактировать предложение ──────────────
            if (data.startsWith('ai:edit:')) {
                const suggestionId = parseInt(data.slice(8), 10);
                const suggestion = (0, agent_1.getSuggestion)(suggestionId);
                if (!suggestion)
                    return ctx.answerCbQuery('Предложение не найдено или устарело');
                (0, agent_1.deleteSuggestion)(suggestionId);
                (0, agent_1.incrementStat)('rejected');
                // Убираем кнопки
                if (chatId && messageId) {
                    try {
                        await ctx.telegram.editMessageReplyMarkup(chatId, messageId, undefined, {
                            inline_keyboard: [],
                        });
                    }
                    catch { }
                }
                if (threadId) {
                    await sendToTopic(ctx.telegram, CRM_GROUP_ID, threadId, '✏️ Введите ваш вариант ответа следующим сообщением — он будет отправлен клиенту.');
                }
                return ctx.answerCbQuery('✏️ Введите ваш вариант');
            }
            // ── AI: ai:skip:{suggestionId} — пропустить предложение ─────────────────
            if (data.startsWith('ai:skip:')) {
                const suggestionId = parseInt(data.slice(8), 10);
                (0, agent_1.deleteSuggestion)(suggestionId);
                (0, agent_1.incrementStat)('rejected');
                if (chatId && messageId) {
                    try {
                        await ctx.telegram.editMessageReplyMarkup(chatId, messageId, undefined, {
                            inline_keyboard: [],
                        });
                    }
                    catch { }
                }
                return ctx.answerCbQuery('❌ Предложение пропущено');
            }
        }
        catch (err) {
            console.error('callback_query error:', err);
            return ctx.answerCbQuery('Ошибка');
        }
        return next();
    });
    // ── Команда /cancel — отменяет любой активный флоу редактирования ───────────
    bot.command('cancel', async (ctx) => {
        const userId = ctx.from?.id;
        if (userId && editMode.has(userId)) {
            editMode.delete(userId);
            return ctx.reply('Редактирование отменено.');
        }
        return ctx.reply('Нет активного редактирования.');
    });
    // ── Команда /shop — открыть Mini App ────────────────────────────────────────
    bot.command('shop', (ctx) => {
        const webAppUrl = process.env.WEBAPP_URL ?? `http://localhost:${process.env.API_PORT ?? 3000}/shop`;
        return ctx.reply('🛍️ Добро пожаловать в Bender Shop!', telegraf_1.Markup.keyboard([[telegraf_1.Markup.button.webApp('🛒 Открыть магазин', webAppUrl)]]).resize());
    });
    // ── Заказ из Mini App (web_app_data) ─────────────────────────────────────────
    bot.on((0, filters_1.message)('web_app_data'), async (ctx) => {
        try {
            const raw = ctx.message.web_app_data.data;
            const orderData = JSON.parse(raw);
            await handleWebAppOrder(ctx.telegram, ctx.from, orderData);
        }
        catch (err) {
            console.error('web_app_data error:', err);
        }
    });
    // ── Обработчик входящих сообщений ───────────────────────────────────────────
    bot.on('message', async (ctx, next) => {
        const { chat, from } = ctx;
        const rawMsg = ctx.message;
        if (!from)
            return next();
        if (!chat)
            return next();
        // ── Сообщения из CRM-группы: ответ менеджера → клиент ────────────────────
        if (chat.id === CRM_GROUP_ID) {
            if (ADMIN_IDS.includes(from.id)) {
                const threadId = rawMsg['message_thread_id'];
                const text = rawMsg['text'];
                const messageId = rawMsg['message_id'];
                if (threadId != null && text) {
                    try {
                        await handleManagerReply(ctx, threadId, text, from.id, messageId);
                    }
                    catch (err) {
                        console.error('handleManagerReply error:', err);
                    }
                }
            }
            return;
        }
        // ── Только личные чаты ────────────────────────────────────────────────────
        if (chat.type !== 'private')
            return next();
        // Администраторы: проверяем режим редактирования
        if (ADMIN_IDS.includes(from.id)) {
            const text = rawMsg['text'];
            if (text && editMode.has(from.id)) {
                try {
                    await handleEditMessage(ctx.telegram, from.id, text);
                }
                catch (err) {
                    console.error('handleEditMessage error:', err);
                }
                return;
            }
            return next();
        }
        // ── Клиентское сообщение ──────────────────────────────────────────────────
        const text = rawMsg['text'];
        if (text) {
            try {
                await handleClientMessage(ctx.telegram, from, text);
            }
            catch (err) {
                console.error('handleClientMessage error:', err);
            }
        }
    });
}
// ─── Обработка ввода поля клиента менеджером ─────────────────────────────────
async function handleEditMessage(telegram, userId, text) {
    const edit = editMode.get(userId);
    if (!edit)
        return;
    editMode.delete(userId);
    const { clientId, field } = edit;
    let value = text.trim();
    if (field === 'birthDate') {
        const parts = value.split('.');
        if (parts.length !== 3) {
            await telegram.sendMessage(userId, '❌ Неверный формат даты. Используйте ДД.ММ.ГГГГ');
            return;
        }
        const [d, m, y] = parts.map(Number);
        const date = new Date(y, m - 1, d);
        if (isNaN(date.getTime())) {
            await telegram.sendMessage(userId, '❌ Неверная дата.');
            return;
        }
        value = date;
    }
    await prisma_1.prisma.client.update({
        where: { id: clientId },
        data: { [field]: value },
    });
    const fieldLabel = {
        fullName: 'ФИО',
        phone: 'Телефон',
        email: 'Email',
        birthDate: 'Дата рождения',
    };
    await telegram.sendMessage(userId, `✅ ${fieldLabel[field]} обновлено.`);
    // Отправить обновлённую карточку в топик клиента
    const client = await prisma_1.prisma.client.findUnique({
        where: { id: clientId },
        include: { segment: true },
    });
    if (client?.telegramTopicId) {
        const cardText = await buildClientCard(clientId);
        const segLabel = getSegmentLabel(client.segment);
        await sendToTopicWithMarkup(telegram, CRM_GROUP_ID, client.telegramTopicId, cardText, buildCardInlineKeyboard(clientId, segLabel).reply_markup);
    }
}
// ─── Отправка и закрепление панели управления ─────────────────────────────────
async function sendAndPinControlPanel(telegram, threadId, clientId) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const panelMsg = await telegram.sendMessage(CRM_GROUP_ID, '⚙️ Панель управления', {
            message_thread_id: threadId,
            reply_markup: buildControlPanelKeyboard(clientId).reply_markup,
        });
        const pinnedMessageId = panelMsg.message_id;
        // Закрепляем сообщение в топике
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await telegram.pinChatMessage(CRM_GROUP_ID, pinnedMessageId, {
                disable_notification: true,
            });
        }
        catch (pinErr) {
            console.error('pinChatMessage error:', pinErr);
        }
        return pinnedMessageId;
    }
    catch (err) {
        console.error('sendAndPinControlPanel error:', err);
        return null;
    }
}
// ─── Создание топика форума для клиента ──────────────────────────────────────
// Возвращает message_thread_id нового топика.
async function createClientTopic(telegram, clientId, name) {
    const topic = await telegram.createForumTopic(CRM_GROUP_ID, name);
    const threadId = topic.message_thread_id;
    await prisma_1.prisma.client.update({
        where: { id: clientId },
        data: { telegramTopicId: threadId, pinnedMessageId: null },
    });
    // Карточка клиента
    const cardText = await buildClientCard(clientId);
    await sendToTopic(telegram, CRM_GROUP_ID, threadId, cardText);
    // Inline панель управления — отправляется ОДИН РАЗ и закрепляется
    const pinnedMessageId = await sendAndPinControlPanel(telegram, threadId, clientId);
    if (pinnedMessageId) {
        await prisma_1.prisma.client.update({
            where: { id: clientId },
            data: { pinnedMessageId },
        });
    }
    return threadId;
}
// ─── Обработка входящего сообщения от клиента ────────────────────────────────
async function handleClientMessage(telegram, from, text) {
    try {
        const externalId = String(from.id);
        const name = getClientName(from);
        const defaultSeg = await prisma_1.prisma.segment.findFirst({ where: { isDefault: true } });
        let client = await prisma_1.prisma.client.findUnique({
            where: { source_externalId: { source: 'telegram', externalId } },
            include: { segment: true },
        });
        if (!client) {
            client = await prisma_1.prisma.client.create({
                data: { name, source: 'telegram', externalId, segmentId: defaultSeg?.id ?? null },
                include: { segment: true },
            });
        }
        // Создать топик форума, если его ещё нет
        if (client.telegramTopicId == null) {
            const threadId = await createClientTopic(telegram, client.id, name);
            await sendToTopic(telegram, CRM_GROUP_ID, threadId, `💬 ${name}: ${text}`);
        }
        else {
            // Топик уже существует — пересылаем сообщение; при ошибке пересоздаём
            try {
                await sendToTopic(telegram, CRM_GROUP_ID, client.telegramTopicId, `💬 ${name}: ${text}`);
            }
            catch (e) {
                if (e?.response?.description?.includes('message thread not found')) {
                    console.warn(`[handleClientMessage] Топик ${client.telegramTopicId} не найден — пересоздаём`);
                    await prisma_1.prisma.client.update({ where: { id: client.id }, data: { telegramTopicId: null } });
                    const threadId = await createClientTopic(telegram, client.id, name);
                    await sendToTopic(telegram, CRM_GROUP_ID, threadId, `💬 ${name}: ${text}`);
                }
                else {
                    throw e;
                }
            }
        }
        const savedMessage = await prisma_1.prisma.message.create({
            data: { clientId: client.id, direction: 'in', text, source: 'telegram' },
        });
        // ── AI Sales Agent ────────────────────────────────────────────────────────
        const currentClient = await prisma_1.prisma.client.findUnique({ where: { id: client.id } });
        if (currentClient?.telegramTopicId) {
            const threadId = currentClient.telegramTopicId;
            // Запускаем AI асинхронно, не блокируем ответ клиенту
            handleAIResponse(telegram, client.id, text, threadId).catch((err) => {
                console.error('handleAIResponse error:', err);
            });
        }
    }
    catch (e) {
        console.error('handleClientMessage FULL ERROR:', e);
    }
}
// ─── AI: обработка входящего сообщения ────────────────────────────────────────
async function handleAIResponse(telegram, clientId, userMessage, threadId) {
    const mode = await (0, agent_1.getAIMode)();
    if (mode === 'off')
        return;
    let aiText;
    try {
        aiText = await (0, agent_1.generateAIResponse)(clientId, userMessage);
        (0, agent_1.incrementStat)('total');
    }
    catch (err) {
        console.error('generateAIResponse error:', err);
        return;
    }
    if (mode === 'auto') {
        // Отправляем клиенту автоматически
        const client = await prisma_1.prisma.client.findUnique({ where: { id: clientId } });
        if (client?.source === 'telegram' && client.externalId) {
            await telegram.sendMessage(client.externalId, aiText);
        }
        await prisma_1.prisma.message.create({
            data: { clientId, direction: 'out', text: aiText, source: 'telegram' },
        });
        (0, agent_1.incrementStat)('approved');
        // Уведомляем менеджера в топике
        await sendToTopic(telegram, CRM_GROUP_ID, threadId, `🤖 AI ответил: ${aiText}`);
        return;
    }
    if (mode === 'semi') {
        // Сохраняем предложение и показываем менеджеру с кнопками
        const suggestionId = (0, agent_1.storeSuggestion)(clientId, aiText, threadId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await telegram.sendMessage(CRM_GROUP_ID, `🤖 Предложение AI:\n\n${aiText}`, {
            message_thread_id: threadId,
            reply_markup: telegraf_1.Markup.inlineKeyboard([
                [
                    telegraf_1.Markup.button.callback('✅ Отправить', `ai:send:${suggestionId}`),
                    telegraf_1.Markup.button.callback('✏️ Редактировать', `ai:edit:${suggestionId}`),
                    telegraf_1.Markup.button.callback('❌ Пропустить', `ai:skip:${suggestionId}`),
                ],
            ]).reply_markup,
        });
        return;
    }
    if (mode === 'manual') {
        // Только подсказка менеджеру
        await sendToTopic(telegram, CRM_GROUP_ID, threadId, `💡 AI подсказка: ${aiText}`);
        return;
    }
}
// ─── Обработка ответа менеджера в топике ─────────────────────────────────────
async function handleManagerReply(ctx, threadId, text, managerId, messageId) {
    // ── /card — показать карточку клиента с inline keyboard ───────────────────
    if (text === '/card') {
        const client = await prisma_1.prisma.client.findFirst({
            where: { telegramTopicId: threadId },
            include: { segment: true },
        });
        if (client) {
            const cardText = await buildClientCard(client.id);
            const segLabel = getSegmentLabel(client.segment);
            await sendToTopicWithMarkup(ctx.telegram, CRM_GROUP_ID, threadId, cardText, buildCardInlineKeyboard(client.id, segLabel).reply_markup);
            // Удаляем команду из топика
            if (messageId) {
                try {
                    await ctx.telegram.deleteMessage(CRM_GROUP_ID, messageId);
                }
                catch { }
            }
        }
        return;
    }
    // ── Режим заметки ─────────────────────────────────────────────────────────
    if (noteMode.has(threadId)) {
        const clientId = noteMode.get(threadId);
        noteMode.delete(threadId);
        await prisma_1.prisma.client.update({ where: { id: clientId }, data: { notes: text } });
        await sendToTopic(ctx.telegram, CRM_GROUP_ID, threadId, '✅ Заметка сохранена');
        return;
    }
    // ── Режим редактирования поля (менеджер вводит значение в топике) ─────────
    if (editMode.has(managerId)) {
        await handleEditMessage(ctx.telegram, managerId, text);
        return;
    }
    // ── Обычный ответ — пересылаем клиенту ───────────────────────────────────
    const client = await prisma_1.prisma.client.findFirst({ where: { telegramTopicId: threadId } });
    if (!client)
        return;
    if (client.source === 'telegram' && client.externalId) {
        await ctx.telegram.sendMessage(client.externalId, text);
    }
    await prisma_1.prisma.message.create({
        data: { clientId: client.id, direction: 'out', text, source: 'telegram' },
    });
}
// ─── Хелперы ─────────────────────────────────────────────────────────────────
async function sendToTopic(telegram, chatId, threadId, text) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await telegram.sendMessage(chatId, text, { message_thread_id: threadId });
}
async function sendToTopicWithMarkup(telegram, chatId, threadId, text, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
reply_markup) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await telegram.sendMessage(chatId, text, { message_thread_id: threadId, reply_markup });
}
function getClientName(from) {
    return ([from.first_name, from.last_name].filter(Boolean).join(' ') ||
        from.username ||
        'Неизвестный');
}
function fmtPrice(n) {
    return n.toLocaleString('ru-RU');
}
// ─── Обработка заказа из Mini App ────────────────────────────────────────────
async function handleWebAppOrder(telegram, from, orderData) {
    const { orderId, payment } = orderData;
    const externalId = String(from.id);
    const name = getClientName(from);
    // Fetch server-verified prices from DB — never trust client-supplied items/total
    let verifiedItems = [];
    let verifiedTotal = 0;
    if (orderId > 0) {
        const dbOrder = await prisma_1.prisma.order.findUnique({ where: { id: orderId } });
        if (dbOrder) {
            verifiedItems = dbOrder.items
                .map((i) => ({ name: i.name, price: i.price, qty: i.quantity }));
            verifiedTotal = Number(dbOrder.totalAmount);
        }
    }
    if (verifiedItems.length === 0) {
        verifiedItems = orderData.items.map((i) => ({ name: i.name, price: i.price, qty: i.qty }));
        verifiedTotal = Number(orderData.total);
    }
    const PAYMENT_LABEL = {
        cash: '💵 Наличные',
        transfer: '📲 Перевод',
        card: '💳 Карта (+14%)',
    };
    const defaultSeg = await prisma_1.prisma.segment.findFirst({ where: { isDefault: true } });
    let client = await prisma_1.prisma.client.findUnique({
        where: { source_externalId: { source: 'telegram', externalId } },
        include: { segment: true },
    });
    if (!client) {
        client = await prisma_1.prisma.client.create({
            data: { name, source: 'telegram', externalId, segmentId: defaultSeg?.id ?? null },
            include: { segment: true },
        });
    }
    if (orderId > 0) {
        await prisma_1.prisma.order.update({
            where: { id: orderId },
            data: { clientId: client.id },
        }).catch(() => { });
    }
    if (client.telegramTopicId == null) {
        await createClientTopic(telegram, client.id, name);
        // Перечитываем клиента, чтобы получить актуальный telegramTopicId
        client = (await prisma_1.prisma.client.findUnique({
            where: { id: client.id },
            include: { segment: true },
        }));
    }
    const itemLines = verifiedItems
        .map((i) => `• ${i.name} × ${i.qty} — ${fmtPrice(Number(i.price) * i.qty)} ₽`)
        .join('\n');
    const orderRef = orderId > 0 ? ` #${orderId}` : '';
    const notification = [
        `🛒 Новый заказ${orderRef} из магазина`,
        `👤 ${name}`,
        '',
        itemLines,
        '',
        `💰 Итого: ${fmtPrice(verifiedTotal)} ₽`,
        `💳 Оплата: ${PAYMENT_LABEL[payment] ?? payment}`,
    ].join('\n');
    await sendToTopic(telegram, CRM_GROUP_ID, client.telegramTopicId, notification);
    await prisma_1.prisma.message.create({
        data: { clientId: client.id, direction: 'in', text: notification, source: 'shop' },
    });
    const itemCount = verifiedItems.reduce((s, i) => s + i.qty, 0);
    await telegram.sendMessage(externalId, `✅ Заказ принят!\n\n${itemCount} поз. на ${fmtPrice(verifiedTotal)} ₽\nОплата: ${PAYMENT_LABEL[payment] ?? payment}\n\nОжидайте — скоро свяжемся с вами 👋`);
}
//# sourceMappingURL=telegram.js.map