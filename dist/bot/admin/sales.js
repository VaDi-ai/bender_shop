"use strict";
/**
 * bot/admin/sales.ts
 *
 * Флоу продажи и резерва из карточки клиента (или без привязки из топика продаж).
 *
 * Подключение в bot/index.ts:
 *   setupSalesHandlers(bot)
 *   handleSalesMessage(ctx, userId, text) — вызывать из перехватчика текстовых сообщений
 *   salesState                            — проверять наличие активного флоу
 *
 * Из webhooks/telegram.ts:
 *   startSaleFlow(ctx, clientId)          — кнопка 💰 Продажа из карточки
 *   startReserveFlow(ctx, clientId)       — кнопка 🔖 Резерв из карточки
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.salesState = void 0;
exports.startSaleFlow = startSaleFlow;
exports.startReserveFlow = startReserveFlow;
exports.setupSalesHandlers = setupSalesHandlers;
exports.handleSalesMessage = handleSalesMessage;
exports.registerSkipCommentHandlers = registerSkipCommentHandlers;
const telegraf_1 = require("telegraf");
const prisma_1 = require("../../lib/prisma");
const stock_1 = require("../../lib/stock");
const api_key_store_1 = require("../../lib/api-key-store");
const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID);
exports.salesState = new Map();
// ─── Экспортируемые хелперы для запуска флоу из карточки клиента ─────────────
async function startSaleFlow(ctx, clientId) {
    const userId = ctx.from.id;
    exports.salesState.set(userId, { flow: 'sale', step: 'product_method', clientId });
    await ctx.reply('💰 Продажа — выберите способ выбора товара:', telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback('📋 Из списка', `sale:list:${clientId}`)],
        [telegraf_1.Markup.button.callback('🔢 По SKU', `sale:sku:${clientId}`)],
        [telegraf_1.Markup.button.callback('❌ Отмена', `sale:cancel`)],
    ]));
}
async function startReserveFlow(ctx, clientId) {
    const userId = ctx.from.id;
    exports.salesState.set(userId, { flow: 'reserve', step: 'product_method', clientId });
    await ctx.reply('🔖 Резерв — выберите способ выбора товара:', telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback('📋 Из списка', `res:list:${clientId}`)],
        [telegraf_1.Markup.button.callback('🔢 По SKU', `res:sku:${clientId}`)],
        [telegraf_1.Markup.button.callback('❌ Отмена', `res:cancel`)],
    ]));
}
// ─── Регистрация action-обработчиков ─────────────────────────────────────────
function setupSalesHandlers(bot) {
    // ── Продажа: выбор из списка (категории) ──────────────────────────────────
    bot.action(/^sale:list:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const clientId = parseInt(ctx.match[1], 10);
        const userId = ctx.from.id;
        const categories = await prisma_1.prisma.category.findMany({ orderBy: { name: 'asc' } });
        if (categories.length === 0) {
            exports.salesState.delete(userId);
            return await ctx.reply('Нет категорий товаров.');
        }
        exports.salesState.set(userId, { flow: 'sale', step: 'category', clientId });
        await ctx.reply('📂 Выберите категорию:', telegraf_1.Markup.inlineKeyboard([
            ...categories.map((c) => [telegraf_1.Markup.button.callback(c.name, `sale:cat:${clientId}:${c.id}`)]),
            [telegraf_1.Markup.button.callback('❌ Отмена', 'sale:cancel')],
        ]));
    });
    // ── Резерв: выбор из списка ────────────────────────────────────────────────
    bot.action(/^res:list:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const clientId = parseInt(ctx.match[1], 10);
        const userId = ctx.from.id;
        const categories = await prisma_1.prisma.category.findMany({ orderBy: { name: 'asc' } });
        if (categories.length === 0) {
            exports.salesState.delete(userId);
            return await ctx.reply('Нет категорий товаров.');
        }
        exports.salesState.set(userId, { flow: 'reserve', step: 'category', clientId });
        await ctx.reply('📂 Выберите категорию:', telegraf_1.Markup.inlineKeyboard([
            ...categories.map((c) => [telegraf_1.Markup.button.callback(c.name, `res:cat:${clientId}:${c.id}`)]),
            [telegraf_1.Markup.button.callback('❌ Отмена', 'res:cancel')],
        ]));
    });
    // ── Продажа: выбор по SKU ──────────────────────────────────────────────────
    bot.action(/^sale:sku:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const clientId = parseInt(ctx.match[1], 10);
        const userId = ctx.from.id;
        exports.salesState.set(userId, { flow: 'sale', step: 'product_sku', clientId });
        await ctx.reply('🔢 Введите SKU товара:');
    });
    // ── Резерв: выбор по SKU ───────────────────────────────────────────────────
    bot.action(/^res:sku:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const clientId = parseInt(ctx.match[1], 10);
        const userId = ctx.from.id;
        exports.salesState.set(userId, { flow: 'reserve', step: 'product_sku', clientId });
        await ctx.reply('🔢 Введите SKU товара:');
    });
    // ── Продажа: выбор товара из категории ────────────────────────────────────
    bot.action(/^sale:cat:(\d+):(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const clientId = parseInt(ctx.match[1], 10);
        const categoryId = parseInt(ctx.match[2], 10);
        const userId = ctx.from.id;
        const products = await prisma_1.prisma.product.findMany({
            where: { categoryId, isAvailable: true },
            orderBy: { name: 'asc' },
        });
        if (products.length === 0) {
            return await ctx.reply('Нет доступных товаров в этой категории.');
        }
        exports.salesState.set(userId, { flow: 'sale', step: 'product_pick', clientId, categoryId });
        await ctx.reply('📦 Выберите товар:', telegraf_1.Markup.inlineKeyboard([
            ...products.map((p) => {
                const available = p.quantity - p.reserved;
                return [telegraf_1.Markup.button.callback(`${p.name} (${available} шт.) — ${fmtPrice(Number(p.price))} ₽`, `sale:pick:${clientId}:${p.id}`)];
            }),
            [telegraf_1.Markup.button.callback('❌ Отмена', 'sale:cancel')],
        ]));
    });
    // ── Резерв: выбор товара из категории ─────────────────────────────────────
    bot.action(/^res:cat:(\d+):(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const clientId = parseInt(ctx.match[1], 10);
        const categoryId = parseInt(ctx.match[2], 10);
        const userId = ctx.from.id;
        const products = await prisma_1.prisma.product.findMany({
            where: { categoryId, isAvailable: true },
            orderBy: { name: 'asc' },
        });
        if (products.length === 0) {
            return await ctx.reply('Нет доступных товаров в этой категории.');
        }
        exports.salesState.set(userId, { flow: 'reserve', step: 'product_pick', clientId, categoryId });
        await ctx.reply('📦 Выберите товар:', telegraf_1.Markup.inlineKeyboard([
            ...products.map((p) => {
                const available = p.quantity - p.reserved;
                return [telegraf_1.Markup.button.callback(`${p.name} (${available} шт.) — ${fmtPrice(Number(p.price))} ₽`, `res:pick:${clientId}:${p.id}`)];
            }),
            [telegraf_1.Markup.button.callback('❌ Отмена', 'res:cancel')],
        ]));
    });
    // ── Продажа: выбран товар → шаг количество ────────────────────────────────
    bot.action(/^sale:pick:(\d+):(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const clientId = parseInt(ctx.match[1], 10);
        const productId = parseInt(ctx.match[2], 10);
        const userId = ctx.from.id;
        const product = await prisma_1.prisma.product.findUnique({ where: { id: productId } });
        if (!product)
            return await ctx.reply('Товар не найден.');
        exports.salesState.set(userId, { flow: 'sale', step: 'qty', clientId, productId, productName: product.name, price: Number(product.price) });
        const available = product.quantity - product.reserved;
        await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`);
    });
    // ── Резерв: выбран товар → шаг количество ─────────────────────────────────
    bot.action(/^res:pick:(\d+):(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const clientId = parseInt(ctx.match[1], 10);
        const productId = parseInt(ctx.match[2], 10);
        const userId = ctx.from.id;
        const product = await prisma_1.prisma.product.findUnique({ where: { id: productId } });
        if (!product)
            return await ctx.reply('Товар не найден.');
        exports.salesState.set(userId, { flow: 'reserve', step: 'qty', clientId, productId, productName: product.name, price: Number(product.price) });
        const available = product.quantity - product.reserved;
        await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`);
    });
    // ── Подтверждение продажи ──────────────────────────────────────────────────
    bot.action(/^sale:confirm:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.salesState.get(userId);
        if (!state || state.flow !== 'sale' || state.step !== 'confirm')
            return;
        exports.salesState.delete(userId);
        const { clientId, productId, productName, price, qty } = state;
        const total = Number(price) * qty;
        try {
            const client = await prisma_1.prisma.client.findUnique({ where: { id: clientId } });
            if (!client)
                return await ctx.reply('Клиент не найден.');
            // Создаём Order
            await prisma_1.prisma.order.create({
                data: {
                    clientId,
                    telegramId: client.externalId ?? String(clientId),
                    items: [{ productId, name: productName, price: Number(price), qty }],
                    totalAmount: total,
                    payment: 'crm',
                    status: 'completed',
                },
            });
            // Уменьшаем остаток и записываем движение склада
            await prisma_1.prisma.product.update({
                where: { id: productId },
                data: {
                    quantity: { decrement: qty },
                    stock: { decrement: qty },
                },
            });
            const saleVariants = await prisma_1.prisma.productVariant.findMany({
                where: { productId },
                orderBy: { quantity: 'desc' },
            });
            const saleVariant = saleVariants.find((v) => v.quantity >= qty) ?? saleVariants[0];
            if (saleVariant) {
                try {
                    await (0, stock_1.stockOut)(saleVariant.id, qty, `Продажа клиенту`, String(userId));
                }
                catch {
                    // вариант может не иметь достаточного остатка — движение не критично
                }
            }
            // Обновляем клиента
            await prisma_1.prisma.client.update({
                where: { id: clientId },
                data: {
                    totalPurchases: { increment: 1 },
                    totalRevenue: { increment: total },
                    lastPurchaseDate: new Date(),
                },
            });
            // Если продажа закрывает активный резерв — завершить его и освободить reserved
            const activeReservation = await prisma_1.prisma.reservation.findFirst({
                where: { clientId, productId, status: 'active' },
                orderBy: { createdAt: 'asc' },
            });
            if (activeReservation) {
                await prisma_1.prisma.$transaction([
                    prisma_1.prisma.reservation.update({
                        where: { id: activeReservation.id },
                        data: { status: 'completed' },
                    }),
                    prisma_1.prisma.product.update({
                        where: { id: productId },
                        data: { reserved: { decrement: activeReservation.quantity } },
                    }),
                ]);
            }
            const msg = `✅ Продажа оформлена: ${productName} × ${qty} — ${fmtPrice(total)} ₽`;
            await ctx.reply(msg);
            await notifyToSalesTopic(ctx, msg, client.name);
            if (client.telegramTopicId) {
                await sendToTopic(ctx, CRM_GROUP_ID, client.telegramTopicId, msg);
            }
        }
        catch (err) {
            console.error('sale:confirm error:', err);
            await ctx.reply('Ошибка при оформлении продажи.');
        }
    });
    // ── Подтверждение резерва ──────────────────────────────────────────────────
    bot.action(/^res:confirm:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.salesState.get(userId);
        if (!state || state.flow !== 'reserve' || state.step !== 'confirm')
            return;
        exports.salesState.delete(userId);
        const { clientId, productId, productName, qty } = state;
        const comment = state.comment;
        try {
            const client = await prisma_1.prisma.client.findUnique({ where: { id: clientId } });
            if (!client)
                return await ctx.reply('Клиент не найден.');
            // Создаём резерв
            const reservation = await prisma_1.prisma.reservation.create({
                data: { clientId, productId, quantity: qty, comment, status: 'active' },
            });
            // Увеличиваем reserved
            await prisma_1.prisma.product.update({
                where: { id: productId },
                data: { reserved: { increment: qty } },
            });
            const msg = `🔖 Резерв: ${productName} × ${qty} для ${client.name} до отдельного уведомления`;
            await ctx.reply(msg, telegraf_1.Markup.inlineKeyboard([
                [
                    telegraf_1.Markup.button.callback('✅ Выдан', `res:do_complete:${reservation.id}`),
                    telegraf_1.Markup.button.callback('❌ Отменить', `res:do_cancel:${reservation.id}`),
                ],
            ]));
            await notifyToSalesTopic(ctx, msg, client.name);
            if (client.telegramTopicId) {
                await sendToTopic(ctx, CRM_GROUP_ID, client.telegramTopicId, msg);
            }
        }
        catch (err) {
            console.error('res:confirm error:', err);
            await ctx.reply('Ошибка при оформлении резерва.');
        }
    });
    // ── Отмена ─────────────────────────────────────────────────────────────────
    bot.action('sale:cancel', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        exports.salesState.delete(ctx.from.id);
        await ctx.reply('Продажа отменена.');
    });
    bot.action('res:cancel', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        exports.salesState.delete(ctx.from.id);
        await ctx.reply('Резерв отменён.');
    });
    // ── Флоу без привязки к клиенту (из топика продаж) ────────────────────────
    bot.action('sales_topic:new_sale', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        exports.salesState.set(userId, { flow: 'sale_nc', step: 'ask_client' });
        await ctx.reply('💰 Новая продажа\n\nВведите имя или телефон клиента:');
    });
    bot.action('sales_topic:new_reserve', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        exports.salesState.set(userId, { flow: 'reserve_nc', step: 'ask_client' });
        await ctx.reply('🔖 Новый резерв\n\nВведите имя или телефон клиента:');
    });
    // ── Выбор метода для sale_nc / reserve_nc ─────────────────────────────────
    bot.action(/^sale_nc:list$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.salesState.get(userId);
        if (!state || state.flow !== 'sale_nc')
            return;
        const clientName = state.clientName;
        const categories = await prisma_1.prisma.category.findMany({ orderBy: { name: 'asc' } });
        if (categories.length === 0) {
            exports.salesState.delete(userId);
            return await ctx.reply('Нет категорий товаров.');
        }
        exports.salesState.set(userId, { flow: 'sale_nc', step: 'category', clientName });
        await ctx.reply('📂 Выберите категорию:', telegraf_1.Markup.inlineKeyboard([
            ...categories.map((c) => [telegraf_1.Markup.button.callback(c.name, `sale_nc:cat:${c.id}`)]),
            [telegraf_1.Markup.button.callback('❌ Отмена', 'sale:cancel')],
        ]));
    });
    bot.action(/^res_nc:list$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.salesState.get(userId);
        if (!state || state.flow !== 'reserve_nc')
            return;
        const clientName = state.clientName;
        const categories = await prisma_1.prisma.category.findMany({ orderBy: { name: 'asc' } });
        if (categories.length === 0) {
            exports.salesState.delete(userId);
            return await ctx.reply('Нет категорий товаров.');
        }
        exports.salesState.set(userId, { flow: 'reserve_nc', step: 'category', clientName });
        await ctx.reply('📂 Выберите категорию:', telegraf_1.Markup.inlineKeyboard([
            ...categories.map((c) => [telegraf_1.Markup.button.callback(c.name, `res_nc:cat:${c.id}`)]),
            [telegraf_1.Markup.button.callback('❌ Отмена', 'res:cancel')],
        ]));
    });
    bot.action(/^sale_nc:sku$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.salesState.get(userId);
        if (!state || state.flow !== 'sale_nc')
            return;
        const clientName = state.clientName;
        exports.salesState.set(userId, { flow: 'sale_nc', step: 'product_sku', clientName });
        await ctx.reply('🔢 Введите SKU товара:');
    });
    bot.action(/^res_nc:sku$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.salesState.get(userId);
        if (!state || state.flow !== 'reserve_nc')
            return;
        const clientName = state.clientName;
        exports.salesState.set(userId, { flow: 'reserve_nc', step: 'product_sku', clientName });
        await ctx.reply('🔢 Введите SKU товара:');
    });
    // ── sale_nc: категория → товары ────────────────────────────────────────────
    bot.action(/^sale_nc:cat:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.salesState.get(userId);
        if (!state || state.flow !== 'sale_nc')
            return;
        const clientName = state.clientName;
        const categoryId = parseInt(ctx.match[1], 10);
        const products = await prisma_1.prisma.product.findMany({ where: { categoryId, isAvailable: true }, orderBy: { name: 'asc' } });
        exports.salesState.set(userId, { flow: 'sale_nc', step: 'product_pick', clientName, categoryId });
        await ctx.reply('📦 Выберите товар:', telegraf_1.Markup.inlineKeyboard([
            ...products.map((p) => {
                const available = p.quantity - p.reserved;
                return [telegraf_1.Markup.button.callback(`${p.name} (${available} шт.)`, `sale_nc:pick:${p.id}`)];
            }),
            [telegraf_1.Markup.button.callback('❌ Отмена', 'sale:cancel')],
        ]));
    });
    bot.action(/^res_nc:cat:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.salesState.get(userId);
        if (!state || state.flow !== 'reserve_nc')
            return;
        const clientName = state.clientName;
        const categoryId = parseInt(ctx.match[1], 10);
        const products = await prisma_1.prisma.product.findMany({ where: { categoryId, isAvailable: true }, orderBy: { name: 'asc' } });
        exports.salesState.set(userId, { flow: 'reserve_nc', step: 'product_pick', clientName, categoryId });
        await ctx.reply('📦 Выберите товар:', telegraf_1.Markup.inlineKeyboard([
            ...products.map((p) => {
                const available = p.quantity - p.reserved;
                return [telegraf_1.Markup.button.callback(`${p.name} (${available} шт.)`, `res_nc:pick:${p.id}`)];
            }),
            [telegraf_1.Markup.button.callback('❌ Отмена', 'res:cancel')],
        ]));
    });
    // ── sale_nc: выбран товар → количество ────────────────────────────────────
    bot.action(/^sale_nc:pick:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.salesState.get(userId);
        if (!state || state.flow !== 'sale_nc')
            return;
        const clientName = state.clientName;
        const productId = parseInt(ctx.match[1], 10);
        const product = await prisma_1.prisma.product.findUnique({ where: { id: productId } });
        if (!product)
            return await ctx.reply('Товар не найден.');
        exports.salesState.set(userId, { flow: 'sale_nc', step: 'qty', clientName, productId, productName: product.name, price: Number(product.price) });
        const available = product.quantity - product.reserved;
        await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`);
    });
    bot.action(/^res_nc:pick:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.salesState.get(userId);
        if (!state || state.flow !== 'reserve_nc')
            return;
        const clientName = state.clientName;
        const productId = parseInt(ctx.match[1], 10);
        const product = await prisma_1.prisma.product.findUnique({ where: { id: productId } });
        if (!product)
            return await ctx.reply('Товар не найден.');
        exports.salesState.set(userId, { flow: 'reserve_nc', step: 'qty', clientName, productId, productName: product.name, price: Number(product.price) });
        const available = product.quantity - product.reserved;
        await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`);
    });
    // ── sale_nc: подтверждение ─────────────────────────────────────────────────
    bot.action(/^sale_nc:confirm$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.salesState.get(userId);
        if (!state || state.flow !== 'sale_nc' || state.step !== 'confirm')
            return;
        exports.salesState.delete(userId);
        const { clientName, productId, productName, price, qty } = state;
        const total = Number(price) * qty;
        try {
            await prisma_1.prisma.order.create({
                data: {
                    telegramId: 'crm_manual',
                    items: [{ productId, name: productName, price: Number(price), qty }],
                    totalAmount: total,
                    payment: 'crm',
                    status: 'completed',
                },
            });
            await prisma_1.prisma.product.update({
                where: { id: productId },
                data: { quantity: { decrement: qty }, stock: { decrement: qty } },
            });
            const ncVariants = await prisma_1.prisma.productVariant.findMany({
                where: { productId },
                orderBy: { quantity: 'desc' },
            });
            const ncVariant = ncVariants.find((v) => v.quantity >= qty) ?? ncVariants[0];
            if (ncVariant) {
                try {
                    await (0, stock_1.stockOut)(ncVariant.id, qty, `Продажа клиенту ${clientName}`, String(userId));
                }
                catch {
                    // игнорируем если у варианта нет достаточного остатка
                }
            }
            const msg = `✅ Продажа оформлена: ${productName} × ${qty} — ${fmtPrice(total)} ₽\n👤 Клиент: ${clientName}`;
            await ctx.reply(msg);
            await notifyToSalesTopic(ctx, msg, clientName);
        }
        catch (err) {
            console.error('sale_nc:confirm error:', err);
            await ctx.reply('Ошибка при оформлении продажи.');
        }
    });
    // ── res_nc: подтверждение ──────────────────────────────────────────────────
    bot.action(/^res_nc:confirm$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.salesState.get(userId);
        if (!state || state.flow !== 'reserve_nc' || state.step !== 'confirm')
            return;
        exports.salesState.delete(userId);
        const { clientName, productId, productName, qty } = state;
        const comment = state.comment;
        try {
            const reservation = await prisma_1.prisma.reservation.create({
                data: {
                    clientId: null,
                    productId,
                    quantity: qty,
                    comment: `${clientName}${comment ? ': ' + comment : ''}`,
                    status: 'active',
                },
            });
            await prisma_1.prisma.product.update({
                where: { id: productId },
                data: { reserved: { increment: qty } },
            });
            const msg = `🔖 Резерв: ${productName} × ${qty} для ${clientName} до отдельного уведомления${comment ? '\n📝 ' + comment : ''}`;
            await ctx.reply(msg, telegraf_1.Markup.inlineKeyboard([
                [
                    telegraf_1.Markup.button.callback('✅ Выдан', `res:do_complete:${reservation.id}`),
                    telegraf_1.Markup.button.callback('❌ Отменить', `res:do_cancel:${reservation.id}`),
                ],
            ]));
            await notifyToSalesTopic(ctx, msg, clientName);
        }
        catch (err) {
            console.error('res_nc:confirm error:', err);
            await ctx.reply(`⚠️ Ошибка при оформлении резерва: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    // ── Завершить резерв (выдан) ───────────────────────────────────────────────
    bot.action(/^res:do_complete:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const reservationId = parseInt(ctx.match[1], 10);
        try {
            const reservation = await prisma_1.prisma.reservation.findUnique({ where: { id: reservationId } });
            if (!reservation || reservation.status !== 'active') {
                return ctx.answerCbQuery('Резерв уже закрыт или не найден');
            }
            await prisma_1.prisma.$transaction([
                prisma_1.prisma.reservation.update({
                    where: { id: reservationId },
                    data: { status: 'completed' },
                }),
                // Place 2: status → 'completed' — освобождаем reserved
                prisma_1.prisma.product.update({
                    where: { id: reservation.productId },
                    data: { reserved: { decrement: reservation.quantity } },
                }),
            ]);
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => { });
            await ctx.reply(`✅ Резерв #${reservationId} завершён — товар выдан.`);
        }
        catch (err) {
            console.error('res:do_complete error:', err);
            await ctx.reply('Ошибка при завершении резерва.');
        }
    });
    // ── Отменить резерв ────────────────────────────────────────────────────────
    bot.action(/^res:do_cancel:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const reservationId = parseInt(ctx.match[1], 10);
        try {
            const reservation = await prisma_1.prisma.reservation.findUnique({ where: { id: reservationId } });
            if (!reservation || reservation.status !== 'active') {
                return ctx.answerCbQuery('Резерв уже закрыт или не найден');
            }
            await prisma_1.prisma.$transaction([
                prisma_1.prisma.reservation.update({
                    where: { id: reservationId },
                    data: { status: 'cancelled' },
                }),
                // Place 1: status → 'cancelled' — освобождаем reserved
                prisma_1.prisma.product.update({
                    where: { id: reservation.productId },
                    data: { reserved: { decrement: reservation.quantity } },
                }),
            ]);
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => { });
            await ctx.reply(`❌ Резерв #${reservationId} отменён.`);
        }
        catch (err) {
            console.error('res:do_cancel error:', err);
            await ctx.reply('Ошибка при отмене резерва.');
        }
    });
}
// ─── Обработчик текстовых сообщений для активных флоу ─────────────────────────
async function handleSalesMessage(ctx, userId, text) {
    const state = exports.salesState.get(userId);
    if (!state)
        return false;
    // ── Флоу: продажа с клиентом ──────────────────────────────────────────────
    if (state.flow === 'sale') {
        if (state.step === 'product_sku') {
            const product = await prisma_1.prisma.product.findUnique({ where: { sku: text.trim() } });
            if (!product) {
                await ctx.reply('Товар с таким SKU не найден. Попробуйте ещё раз:');
                return true;
            }
            exports.salesState.set(userId, { flow: 'sale', step: 'qty', clientId: state.clientId, productId: product.id, productName: product.name, price: Number(product.price) });
            const available = product.quantity - product.reserved;
            await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`);
            return true;
        }
        if (state.step === 'qty') {
            const qty = parseInt(text.trim(), 10);
            if (isNaN(qty) || qty <= 0) {
                await ctx.reply('Введите корректное количество (целое число > 0):');
                return true;
            }
            const { clientId, productId, productName, price } = state;
            const product = await prisma_1.prisma.product.findUnique({ where: { id: productId } });
            const available = (product?.quantity ?? 0) - (product?.reserved ?? 0);
            if (qty > available) {
                await ctx.reply(`Недостаточно товара. Доступно: ${available} шт.`);
                return true;
            }
            const total = Number(price) * qty;
            const client = await prisma_1.prisma.client.findUnique({ where: { id: clientId } });
            exports.salesState.set(userId, { flow: 'sale', step: 'confirm', clientId, productId, productName, price, qty });
            await ctx.reply(`💰 Подтверждение продажи:\n\n📦 ${productName} × ${qty} — ${fmtPrice(total)} ₽\n👤 Клиент: ${client?.name ?? clientId}`, telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('✅ Подтвердить', `sale:confirm:${clientId}`)],
                [telegraf_1.Markup.button.callback('❌ Отмена', 'sale:cancel')],
            ]));
            return true;
        }
    }
    // ── Флоу: резерв с клиентом ───────────────────────────────────────────────
    if (state.flow === 'reserve') {
        if (state.step === 'product_sku') {
            const product = await prisma_1.prisma.product.findUnique({ where: { sku: text.trim() } });
            if (!product) {
                await ctx.reply('Товар с таким SKU не найден. Попробуйте ещё раз:');
                return true;
            }
            exports.salesState.set(userId, { flow: 'reserve', step: 'qty', clientId: state.clientId, productId: product.id, productName: product.name, price: Number(product.price) });
            const available = product.quantity - product.reserved;
            await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`);
            return true;
        }
        if (state.step === 'qty') {
            const qty = parseInt(text.trim(), 10);
            if (isNaN(qty) || qty <= 0) {
                await ctx.reply('Введите корректное количество:');
                return true;
            }
            const { clientId, productId, productName, price } = state;
            exports.salesState.set(userId, { flow: 'reserve', step: 'comment', clientId, productId, productName, price, qty });
            await ctx.reply('Введите комментарий к резерву (или «-» чтобы пропустить):', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('Пропустить', `res:skip_comment:${clientId}`)]]));
            return true;
        }
        if (state.step === 'comment') {
            const comment = text === '-' ? undefined : text;
            const { clientId, productId, productName, price, qty } = state;
            const client = await prisma_1.prisma.client.findUnique({ where: { id: clientId } });
            exports.salesState.set(userId, { flow: 'reserve', step: 'confirm', clientId, productId, productName, price, qty, comment });
            await ctx.reply(`🔖 Подтверждение резерва:\n\n📦 ${productName} × ${qty}\n👤 Клиент: ${client?.name ?? clientId}${comment ? '\n📝 ' + comment : ''}`, telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('✅ Подтвердить', `res:confirm:${clientId}`)],
                [telegraf_1.Markup.button.callback('❌ Отмена', 'res:cancel')],
            ]));
            return true;
        }
    }
    // ── Флоу: продажа без клиента (nc) ────────────────────────────────────────
    if (state.flow === 'sale_nc') {
        if (state.step === 'ask_client') {
            const clientName = text.trim();
            exports.salesState.set(userId, { flow: 'sale_nc', step: 'product_method', clientName });
            await ctx.reply(`👤 Клиент: ${clientName}\n\nВыберите способ выбора товара:`, telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('📋 Из списка', 'sale_nc:list')],
                [telegraf_1.Markup.button.callback('🔢 По SKU', 'sale_nc:sku')],
                [telegraf_1.Markup.button.callback('❌ Отмена', 'sale:cancel')],
            ]));
            return true;
        }
        if (state.step === 'product_sku') {
            const product = await prisma_1.prisma.product.findUnique({ where: { sku: text.trim() } });
            if (!product) {
                await ctx.reply('Товар с таким SKU не найден. Попробуйте ещё раз:');
                return true;
            }
            exports.salesState.set(userId, { flow: 'sale_nc', step: 'qty', clientName: state.clientName, productId: product.id, productName: product.name, price: Number(product.price) });
            const available = product.quantity - product.reserved;
            await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`);
            return true;
        }
        if (state.step === 'qty') {
            const qty = parseInt(text.trim(), 10);
            if (isNaN(qty) || qty <= 0) {
                await ctx.reply('Введите корректное количество:');
                return true;
            }
            const { clientName, productId, productName, price } = state;
            const total = Number(price) * qty;
            exports.salesState.set(userId, { flow: 'sale_nc', step: 'confirm', clientName, productId, productName, price, qty });
            await ctx.reply(`💰 Подтверждение продажи:\n\n📦 ${productName} × ${qty} — ${fmtPrice(total)} ₽\n👤 Клиент: ${clientName}`, telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('✅ Подтвердить', 'sale_nc:confirm')],
                [telegraf_1.Markup.button.callback('❌ Отмена', 'sale:cancel')],
            ]));
            return true;
        }
    }
    // ── Флоу: резерв без клиента (nc) ─────────────────────────────────────────
    if (state.flow === 'reserve_nc') {
        if (state.step === 'ask_client') {
            const clientName = text.trim();
            exports.salesState.set(userId, { flow: 'reserve_nc', step: 'product_method', clientName });
            await ctx.reply(`👤 Клиент: ${clientName}\n\nВыберите способ выбора товара:`, telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('📋 Из списка', 'res_nc:list')],
                [telegraf_1.Markup.button.callback('🔢 По SKU', 'res_nc:sku')],
                [telegraf_1.Markup.button.callback('❌ Отмена', 'res:cancel')],
            ]));
            return true;
        }
        if (state.step === 'product_sku') {
            const product = await prisma_1.prisma.product.findUnique({ where: { sku: text.trim() } });
            if (!product) {
                await ctx.reply('Товар с таким SKU не найден. Попробуйте ещё раз:');
                return true;
            }
            exports.salesState.set(userId, { flow: 'reserve_nc', step: 'qty', clientName: state.clientName, productId: product.id, productName: product.name, price: Number(product.price) });
            const available = product.quantity - product.reserved;
            await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`);
            return true;
        }
        if (state.step === 'qty') {
            const qty = parseInt(text.trim(), 10);
            if (isNaN(qty) || qty <= 0) {
                await ctx.reply('Введите корректное количество:');
                return true;
            }
            const { clientName, productId, productName, price } = state;
            exports.salesState.set(userId, { flow: 'reserve_nc', step: 'comment', clientName, productId, productName, price, qty });
            await ctx.reply('Введите комментарий к резерву (или «-» чтобы пропустить):', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('Пропустить', 'res_nc:skip_comment')]]));
            return true;
        }
        if (state.step === 'comment') {
            const comment = text === '-' ? undefined : text;
            const { clientName, productId, productName, price, qty } = state;
            exports.salesState.set(userId, { flow: 'reserve_nc', step: 'confirm', clientName, productId, productName, price, qty, comment });
            await ctx.reply(`🔖 Подтверждение резерва:\n\n📦 ${productName} × ${qty}\n👤 Клиент: ${clientName}${comment ? '\n📝 ' + comment : ''}`, telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('✅ Подтвердить', 'res_nc:confirm')],
                [telegraf_1.Markup.button.callback('❌ Отмена', 'res:cancel')],
            ]));
            return true;
        }
    }
    return false;
}
// ─── Хелпер: пропустить комментарий ──────────────────────────────────────────
function registerSkipCommentHandlers(bot) {
    bot.action(/^res:skip_comment:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.salesState.get(userId);
        if (!state || state.flow !== 'reserve' || state.step !== 'comment')
            return;
        const { clientId, productId, productName, price, qty } = state;
        const client = await prisma_1.prisma.client.findUnique({ where: { id: clientId } });
        exports.salesState.set(userId, { flow: 'reserve', step: 'confirm', clientId, productId, productName, price, qty });
        await ctx.reply(`🔖 Подтверждение резерва:\n\n📦 ${productName} × ${qty}\n👤 Клиент: ${client?.name ?? clientId}`, telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback('✅ Подтвердить', `res:confirm:${clientId}`)],
            [telegraf_1.Markup.button.callback('❌ Отмена', 'res:cancel')],
        ]));
    });
    bot.action('res_nc:skip_comment', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.salesState.get(userId);
        if (!state || state.flow !== 'reserve_nc' || state.step !== 'comment')
            return;
        const { clientName, productId, productName, price, qty } = state;
        exports.salesState.set(userId, { flow: 'reserve_nc', step: 'confirm', clientName, productId, productName, price, qty });
        await ctx.reply(`🔖 Подтверждение резерва:\n\n📦 ${productName} × ${qty}\n👤 Клиент: ${clientName}`, telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback('✅ Подтвердить', 'res_nc:confirm')],
            [telegraf_1.Markup.button.callback('❌ Отмена', 'res:cancel')],
        ]));
    });
}
// ─── Хелпер: дублировать в топик продаж ──────────────────────────────────────
async function notifyToSalesTopic(ctx, text, clientName) {
    try {
        const topicValue = await (0, api_key_store_1.getApiKeyValue)('sales_topic');
        if (!topicValue)
            return;
        const threadId = parseInt(topicValue, 10);
        if (isNaN(threadId))
            return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.telegram.sendMessage(CRM_GROUP_ID, text, { message_thread_id: threadId });
    }
    catch (err) {
        console.error('notifyToSalesTopic error:', err);
    }
}
async function sendToTopic(ctx, chatId, threadId, text) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ctx.telegram.sendMessage(chatId, text, { message_thread_id: threadId });
}
function fmtPrice(n) {
    return n.toLocaleString('ru-RU');
}
//# sourceMappingURL=sales.js.map