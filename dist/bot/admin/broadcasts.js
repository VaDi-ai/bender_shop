"use strict";
/**
 * bot/admin/broadcasts.ts
 *
 * Рассылки клиентам:
 *   • Всем Telegram-клиентам
 *   • По тегу
 *   • По сегменту (с опциональным фильтром по тегу)
 *   • История рассылок (BroadcastLog)
 *
 * Подключение в bot/index.ts:
 *   setupBroadcastHandlers(bot)
 *   showBroadcastMenu(ctx)
 *   handleBroadcastMessage(ctx, uid, txt) → boolean
 *   handleBroadcastPhoto(ctx, uid) → boolean
 *   handleBroadcastVideo(ctx, uid) → boolean
 *   broadcastsState — проверять/сбрасывать при нажатии кнопок меню
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastsState = void 0;
exports.showBroadcastMenu = showBroadcastMenu;
exports.setupBroadcastHandlers = setupBroadcastHandlers;
exports.handleBroadcastMessage = handleBroadcastMessage;
exports.handleBroadcastPhoto = handleBroadcastPhoto;
exports.handleBroadcastVideo = handleBroadcastVideo;
const telegraf_1 = require("telegraf");
const prisma_1 = require("../../lib/prisma");
exports.broadcastsState = new Map();
// ─── Вспомогательные утилиты ──────────────────────────────────────────────────
function fmtDate(d) {
    return d
        .toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
        .replace(',', '');
}
function typeIcon(type) {
    if (type === 'all')
        return '📢';
    if (type === 'tag')
        return '🏷️';
    return '📂';
}
/** Человекочитаемое название аудитории для BroadcastLog.target */
function logTarget(type, target, tagFilter) {
    if (type === 'all')
        return 'all';
    if (type === 'tag')
        return target;
    const name = target.split(':').slice(1).join(':');
    return tagFilter ? `${name}+${tagFilter}` : name;
}
/** Строковое описание аудитории для предпросмотра */
function audienceLabel(type, target, count, tagFilter) {
    if (type === 'all')
        return `всем клиентам (${count} чел.)`;
    if (type === 'tag')
        return `тег «${target}» (${count} чел.)`;
    const segName = target.split(':').slice(1).join(':');
    if (tagFilter)
        return `сегмент «${segName}» + тег «${tagFilter}» (${count} чел.)`;
    return `сегмент «${segName}» (${count} чел.)`;
}
// ─── Работа с БД ──────────────────────────────────────────────────────────────
async function countRecipients(type, target, tagFilter) {
    const base = { source: 'telegram', externalId: { not: null } };
    if (type === 'all')
        return prisma_1.prisma.client.count({ where: base });
    if (type === 'tag') {
        return prisma_1.prisma.client.count({ where: { ...base, tags: { some: { name: target } } } });
    }
    const segId = parseInt(target.split(':')[0], 10);
    if (tagFilter) {
        return prisma_1.prisma.client.count({
            where: { ...base, segmentId: segId, tags: { some: { name: tagFilter } } },
        });
    }
    return prisma_1.prisma.client.count({ where: { ...base, segmentId: segId } });
}
async function getRecipients(type, target, tagFilter) {
    const base = { source: 'telegram', externalId: { not: null } };
    if (type === 'all') {
        return prisma_1.prisma.client.findMany({ where: base, select: { externalId: true } });
    }
    if (type === 'tag') {
        return prisma_1.prisma.client.findMany({
            where: { ...base, tags: { some: { name: target } } },
            select: { externalId: true },
        });
    }
    const segId = parseInt(target.split(':')[0], 10);
    if (tagFilter) {
        return prisma_1.prisma.client.findMany({
            where: { ...base, segmentId: segId, tags: { some: { name: tagFilter } } },
            select: { externalId: true },
        });
    }
    return prisma_1.prisma.client.findMany({ where: { ...base, segmentId: segId }, select: { externalId: true } });
}
// ─── Главное меню рассылок ────────────────────────────────────────────────────
async function showBroadcastMenu(ctx) {
    const totalTg = await prisma_1.prisma.client.count({
        where: { source: 'telegram', externalId: { not: null } },
    });
    await ctx.reply(`📢 Рассылки\n\nTelegram-клиентов: ${totalTg}`, telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback('📢 Всем клиентам', 'bcast:all')],
        [telegraf_1.Markup.button.callback('🏷️ По тегу', 'bcast:tags')],
        [telegraf_1.Markup.button.callback('📂 По сегменту', 'bcast:segs')],
        [telegraf_1.Markup.button.callback('📊 История рассылок', 'bcast:history')],
        [telegraf_1.Markup.button.callback('🔙 Назад', 'back:main')],
    ]));
}
// ─── Вспомогательные экраны ───────────────────────────────────────────────────
async function showTagsList(ctx) {
    const tags = await prisma_1.prisma.tag.groupBy({
        by: ['name'],
        _count: { clientId: true },
        orderBy: { name: 'asc' },
    });
    if (tags.length === 0) {
        await ctx.reply('🏷️ Теги не найдены.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 Назад', 'bcast:menu')]]));
        return;
    }
    const buttons = tags.map((t) => telegraf_1.Markup.button.callback(`${t.name} (${t._count.clientId})`, `bcast:tag:${t.name.slice(0, 50)}`));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2)
        rows.push(buttons.slice(i, i + 2));
    rows.push([telegraf_1.Markup.button.callback('🔙 Назад', 'bcast:menu')]);
    await ctx.reply('🏷️ Выберите тег для рассылки:', telegraf_1.Markup.inlineKeyboard(rows));
}
async function showSegmentsList(ctx) {
    const segments = await prisma_1.prisma.segment.findMany({
        orderBy: { id: 'asc' },
        include: { _count: { select: { clients: true } } },
    });
    if (segments.length === 0) {
        await ctx.reply('📂 Сегменты не найдены.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 Назад', 'bcast:menu')]]));
        return;
    }
    const rows = segments.map((s) => [
        telegraf_1.Markup.button.callback(`${s.color} ${s.name} (${s._count.clients})`, `bcast:seg:${s.id}`),
    ]);
    rows.push([telegraf_1.Markup.button.callback('🔙 Назад', 'bcast:menu')]);
    await ctx.reply('📂 Выберите сегмент для рассылки:', telegraf_1.Markup.inlineKeyboard(rows));
}
async function showTagsForSegment(ctx, segId) {
    const tags = await prisma_1.prisma.tag.groupBy({
        by: ['name'],
        where: { client: { segmentId: segId } },
        _count: { clientId: true },
        orderBy: { name: 'asc' },
    });
    if (tags.length === 0) {
        await ctx.reply('У клиентов этого сегмента нет тегов.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 Назад', `bcast:seg:${segId}`)]]));
        return;
    }
    const buttons = tags.map((t) => telegraf_1.Markup.button.callback(`${t.name} (${t._count.clientId})`, `bcast:seg_tag_pick:${segId}:${t.name.slice(0, 38)}`));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2)
        rows.push(buttons.slice(i, i + 2));
    rows.push([telegraf_1.Markup.button.callback('🔙 Назад', `bcast:seg:${segId}`)]);
    await ctx.reply('🏷️ Выберите тег для уточнения аудитории:', telegraf_1.Markup.inlineKeyboard(rows));
}
async function showHistory(ctx) {
    const logs = await prisma_1.prisma.broadcastLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
    });
    if (logs.length === 0) {
        await ctx.reply('📊 История рассылок пуста.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 Назад', 'bcast:menu')]]));
        return;
    }
    const lines = logs.map((l) => {
        const icon = typeIcon(l.type);
        const date = fmtDate(l.createdAt);
        const preview = l.messageText
            ? `"${l.messageText.slice(0, 30)}${l.messageText.length > 30 ? '…' : ''}"`
            : '[медиа]';
        const stat = `✅ ${l.totalSent}/${l.totalSent + l.totalFailed}`;
        return `${icon} ${l.target} — ${preview} — ${date} — ${stat}`;
    });
    await ctx.reply(`📊 История рассылок (последние ${logs.length}):\n\n${lines.join('\n')}`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 Назад', 'bcast:menu')]]));
}
// ─── Предпросмотр ─────────────────────────────────────────────────────────────
async function showPreview(ctx, state) {
    const count = await countRecipients(state.type, state.target, state.tagFilter);
    const audience = audienceLabel(state.type, state.target, count, state.tagFilter);
    const previewButtons = telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback('✅ Отправить', 'bcast:send'),
            telegraf_1.Markup.button.callback('✏️ Изменить', 'bcast:edit'),
        ],
        [telegraf_1.Markup.button.callback('❌ Отмена', 'bcast:cancel')],
    ]);
    if (state.mediaType === 'photo' && state.mediaFileId) {
        await ctx.reply(`📋 Предпросмотр — ${audience}:`);
        await ctx.replyWithPhoto(state.mediaFileId, {
            caption: state.caption,
            reply_markup: previewButtons.reply_markup,
        });
    }
    else if (state.mediaType === 'video' && state.mediaFileId) {
        await ctx.reply(`📋 Предпросмотр — ${audience}:`);
        await ctx.replyWithVideo(state.mediaFileId, {
            caption: state.caption,
            reply_markup: previewButtons.reply_markup,
        });
    }
    else {
        await ctx.reply(`📋 Предпросмотр — ${audience}:\n\n${state.messageText}`, previewButtons);
    }
}
// ─── Отправка с экспоненциальным откатом при 429 ─────────────────────────────
function isRateLimitError(err) {
    if (!err || typeof err !== 'object')
        return false;
    const e = err;
    return e.code === 429 || e.response?.error_code === 429;
}
function getRetryAfterMs(err) {
    if (!err || typeof err !== 'object')
        return undefined;
    const e = err;
    const secs = e.response?.parameters?.retry_after;
    return typeof secs === 'number' ? secs * 1000 : undefined;
}
/** Выполняет send(), при 429 повторяет с экспоненциальным откатом. */
async function sendWithBackoff(send, maxRetries = 4) {
    let delay = 1000;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            await send();
            return 'sent';
        }
        catch (err) {
            if (!isRateLimitError(err) || attempt === maxRetries)
                return 'failed';
            const wait = getRetryAfterMs(err) ?? delay;
            await new Promise((r) => setTimeout(r, wait));
            delay = Math.min(delay * 2, 30000);
        }
    }
    return 'failed';
}
// ─── Выполнение рассылки ───────────────────────────────────────────────────────
async function executeBroadcast(ctx, userId, state) {
    const recipients = await getRecipients(state.type, state.target, state.tagFilter);
    const total = recipients.length;
    if (total === 0) {
        await ctx.reply('Нет Telegram-клиентов для рассылки.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 Меню', 'bcast:menu')]]));
        return;
    }
    const progressMsg = await ctx.reply(`Отправлено 0/${total}…`);
    const chatId = ctx.chat.id;
    const progressMsgId = progressMsg.message_id;
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < recipients.length; i++) {
        const tgId = recipients[i].externalId;
        const result = await sendWithBackoff(() => {
            if (state.mediaType === 'photo' && state.mediaFileId) {
                return ctx.telegram.sendPhoto(tgId, state.mediaFileId, { caption: state.caption });
            }
            else if (state.mediaType === 'video' && state.mediaFileId) {
                return ctx.telegram.sendVideo(tgId, state.mediaFileId, { caption: state.caption });
            }
            else {
                return ctx.telegram.sendMessage(tgId, state.messageText);
            }
        });
        if (result === 'sent') {
            sent++;
        }
        else {
            failed++;
        }
        // Обновляем прогресс каждые 10 сообщений
        if ((i + 1) % 10 === 0 || i === recipients.length - 1) {
            try {
                await ctx.telegram.editMessageText(chatId, progressMsgId, undefined, `Отправлено ${sent + failed}/${total}…`);
            }
            catch {
                // ignore edit errors
            }
        }
    }
    // Сохраняем лог
    await prisma_1.prisma.broadcastLog.create({
        data: {
            type: state.type,
            target: logTarget(state.type, state.target, state.tagFilter),
            messageText: state.messageText,
            mediaFileId: state.mediaFileId,
            mediaType: state.mediaType,
            totalSent: sent,
            totalFailed: failed,
            createdBy: String(userId),
        },
    });
    await ctx.reply(`✅ Рассылка завершена\n\nДоставлено: ${sent}\n❌ Ошибок: ${failed}`, telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback('📊 История', 'bcast:history'),
            telegraf_1.Markup.button.callback('🔙 Меню', 'bcast:menu'),
        ],
    ]));
}
// ─── Регистрация обработчиков ─────────────────────────────────────────────────
function setupBroadcastHandlers(bot) {
    // Главное меню рассылок
    bot.action('bcast:menu', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await showBroadcastMenu(ctx);
    });
    // ── Всем клиентам ──────────────────────────────────────────────────────────
    bot.action('bcast:all', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const count = await prisma_1.prisma.client.count({
            where: { source: 'telegram', externalId: { not: null } },
        });
        exports.broadcastsState.set(userId, { flow: 'awaiting_text', type: 'all', target: 'all' });
        await ctx.reply(`📢 Рассылка всем клиентам (${count} чел.)\n\nОтправьте текст, фото или видео:`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'bcast:cancel')]]));
    });
    // ── По тегу ────────────────────────────────────────────────────────────────
    bot.action('bcast:tags', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await showTagsList(ctx);
    });
    bot.action(/^bcast:tag:(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const tagName = ctx.match[1];
        const count = await prisma_1.prisma.client.count({
            where: { source: 'telegram', externalId: { not: null }, tags: { some: { name: tagName } } },
        });
        await ctx.reply(`Клиентов с тегом «${tagName}»: ${count}\n\nОтправить рассылку этой группе?`, telegraf_1.Markup.inlineKeyboard([
            [
                telegraf_1.Markup.button.callback('✅ Продолжить', `bcast:tag_go:${tagName}`),
                telegraf_1.Markup.button.callback('🔙 Назад', 'bcast:tags'),
            ],
        ]));
    });
    bot.action(/^bcast:tag_go:(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const tagName = ctx.match[1];
        const count = await prisma_1.prisma.client.count({
            where: { source: 'telegram', externalId: { not: null }, tags: { some: { name: tagName } } },
        });
        exports.broadcastsState.set(userId, { flow: 'awaiting_text', type: 'tag', target: tagName });
        await ctx.reply(`🏷️ Рассылка по тегу «${tagName}» (${count} чел.)\n\nОтправьте текст, фото или видео:`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'bcast:cancel')]]));
    });
    // ── По сегменту ───────────────────────────────────────────────────────────
    bot.action('bcast:segs', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await showSegmentsList(ctx);
    });
    bot.action(/^bcast:seg:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const segId = parseInt(ctx.match[1], 10);
        const seg = await prisma_1.prisma.segment.findUnique({ where: { id: segId } });
        if (!seg)
            return await ctx.reply('Сегмент не найден.');
        const count = await prisma_1.prisma.client.count({
            where: { source: 'telegram', externalId: { not: null }, segmentId: segId },
        });
        await ctx.reply(`Сегмент «${seg.color} ${seg.name}» — ${count} Telegram-клиентов.\n\nУточнить по тегу?`, telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback('🏷️ Добавить фильтр по тегу', `bcast:seg_tag:${segId}`)],
            [telegraf_1.Markup.button.callback('📤 Отправить всем в сегменте', `bcast:seg_go:${segId}`)],
            [telegraf_1.Markup.button.callback('🔙 Назад', 'bcast:segs')],
        ]));
    });
    bot.action(/^bcast:seg_go:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const segId = parseInt(ctx.match[1], 10);
        const seg = await prisma_1.prisma.segment.findUnique({ where: { id: segId } });
        if (!seg)
            return await ctx.reply('Сегмент не найден.');
        const count = await prisma_1.prisma.client.count({
            where: { source: 'telegram', externalId: { not: null }, segmentId: segId },
        });
        exports.broadcastsState.set(userId, {
            flow: 'awaiting_text',
            type: 'segment',
            target: `${segId}:${seg.name}`,
        });
        await ctx.reply(`📂 Рассылка по сегменту «${seg.color} ${seg.name}» (${count} чел.)\n\nОтправьте текст, фото или видео:`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'bcast:cancel')]]));
    });
    // Выбор тега для фильтрации сегмента
    bot.action(/^bcast:seg_tag:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const segId = parseInt(ctx.match[1], 10);
        await showTagsForSegment(ctx, segId);
    });
    bot.action(/^bcast:seg_tag_pick:(\d+):(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const segId = parseInt(ctx.match[1], 10);
        const tagName = ctx.match[2];
        const seg = await prisma_1.prisma.segment.findUnique({ where: { id: segId } });
        if (!seg)
            return await ctx.reply('Сегмент не найден.');
        const count = await prisma_1.prisma.client.count({
            where: {
                source: 'telegram',
                externalId: { not: null },
                segmentId: segId,
                tags: { some: { name: tagName } },
            },
        });
        exports.broadcastsState.set(userId, {
            flow: 'awaiting_text',
            type: 'segment',
            target: `${segId}:${seg.name}`,
            tagFilter: tagName,
        });
        await ctx.reply(`📂 ${seg.color} ${seg.name} + 🏷️ «${tagName}»: ${count} Telegram-клиентов.\n\nОтправьте текст, фото или видео:`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'bcast:cancel')]]));
    });
    // ── История ────────────────────────────────────────────────────────────────
    bot.action('bcast:history', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await showHistory(ctx);
    });
    // ── Отмена ─────────────────────────────────────────────────────────────────
    bot.action('bcast:cancel', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        exports.broadcastsState.delete(ctx.from.id);
        await ctx.reply('Рассылка отменена.');
        await showBroadcastMenu(ctx);
    });
    // ── Предпросмотр: отправить ────────────────────────────────────────────────
    bot.action('bcast:send', async (ctx) => {
        try {
            await ctx.answerCbQuery('Начинаю отправку…');
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.broadcastsState.get(userId);
        if (!state || state.flow !== 'preview') {
            return await ctx.reply('Сессия истекла. Начните рассылку заново.');
        }
        exports.broadcastsState.delete(userId);
        await executeBroadcast(ctx, userId, state);
    });
    // ── Предпросмотр: изменить ─────────────────────────────────────────────────
    bot.action('bcast:edit', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.broadcastsState.get(userId);
        if (!state || state.flow !== 'preview')
            return;
        exports.broadcastsState.set(userId, {
            flow: 'awaiting_text',
            type: state.type,
            target: state.target,
            tagFilter: state.tagFilter,
        });
        await ctx.reply('Отправьте новый текст, фото или видео:', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'bcast:cancel')]]));
    });
}
// ─── Обработчики входящих сообщений ──────────────────────────────────────────
async function handleBroadcastMessage(ctx, userId, text) {
    const state = exports.broadcastsState.get(userId);
    if (!state || state.flow !== 'awaiting_text')
        return false;
    const previewState = {
        flow: 'preview',
        type: state.type,
        target: state.target,
        tagFilter: state.tagFilter,
        messageText: text,
    };
    exports.broadcastsState.set(userId, previewState);
    await showPreview(ctx, previewState);
    return true;
}
async function handleBroadcastPhoto(ctx, userId) {
    const state = exports.broadcastsState.get(userId);
    if (!state || state.flow !== 'awaiting_text')
        return false;
    const msg = ctx.message;
    if (!msg?.photo?.length)
        return false;
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const previewState = {
        flow: 'preview',
        type: state.type,
        target: state.target,
        tagFilter: state.tagFilter,
        mediaFileId: fileId,
        mediaType: 'photo',
        caption: msg.caption,
    };
    exports.broadcastsState.set(userId, previewState);
    await showPreview(ctx, previewState);
    return true;
}
async function handleBroadcastVideo(ctx, userId) {
    const state = exports.broadcastsState.get(userId);
    if (!state || state.flow !== 'awaiting_text')
        return false;
    const msg = ctx.message;
    if (!msg?.video)
        return false;
    const previewState = {
        flow: 'preview',
        type: state.type,
        target: state.target,
        tagFilter: state.tagFilter,
        mediaFileId: msg.video.file_id,
        mediaType: 'video',
        caption: msg.caption,
    };
    exports.broadcastsState.set(userId, previewState);
    await showPreview(ctx, previewState);
    return true;
}
//# sourceMappingURL=broadcasts.js.map