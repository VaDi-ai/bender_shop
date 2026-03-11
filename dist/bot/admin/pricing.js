"use strict";
/**
 * bot/admin/pricing.ts — Управление ценами
 *
 * Меню: из сообщения | по курсу | из файла | точечно | история
 * Универсальный экран предпросмотра с фильтрами исключений.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lastCurrencyChanges = exports.REGION_FLAGS = exports.pricingState = void 0;
exports.showPricingMenu = showPricingMenu;
exports.generatePriceListBuffer = generatePriceListBuffer;
exports.setupPricingHandlers = setupPricingHandlers;
exports.handlePricingMessage = handlePricingMessage;
exports.handlePricingDocument = handlePricingDocument;
exports.sendDailyCurrencyRates = sendDailyCurrencyRates;
const https_1 = __importDefault(require("https"));
const exceljs_1 = __importDefault(require("exceljs"));
const telegraf_1 = require("telegraf");
const prisma_1 = require("../../lib/prisma");
const currency_1 = require("../../lib/currency");
const ai_parser_1 = require("../../lib/ai-parser");
exports.pricingState = new Map();
// ─── Флаги регионов (emoji → код) ────────────────────────────────────────────
exports.REGION_FLAGS = {
    '🇭🇰': 'HK', '🇪🇺': 'EU', '🇮🇳': 'IN', '🇺🇸': 'US', '🇨🇳': 'CN',
    '🇷🇺': 'RU', '🇬🇧': 'GB', '🇯🇵': 'JP', '🇦🇺': 'AU', '🇩🇪': 'DE',
    '🇫🇷': 'FR', '🇰🇿': 'KZ', '🇦🇿': 'AZ', '🇹🇷': 'TR', '🇦🇪': 'AE',
};
// ─── Определение региона по имени/атрибутам ───────────────────────────────────
function detectRegion(name, attrs) {
    for (const [flag, code] of Object.entries(exports.REGION_FLAGS)) {
        if (name.includes(flag))
            return code;
    }
    const regionVal = Object.entries(attrs).find(([k]) => k.toLowerCase().includes('регион') || k.toLowerCase().includes('region'));
    if (regionVal)
        return regionVal[1];
    return undefined;
}
// ─── Матчинг вариантов ────────────────────────────────────────────────────────
async function matchVariants(parsed) {
    const matched = [];
    const unmatched = [];
    for (const p of parsed) {
        const products = await prisma_1.prisma.product.findMany({
            where: { name: { contains: p.model, mode: 'insensitive' } },
            include: { variants: true },
        });
        if (!products.length) {
            unmatched.push(p);
            continue;
        }
        let found = null;
        outer: for (const product of products) {
            for (const variant of product.variants) {
                const attrs = variant.attributes;
                const vals = Object.values(attrs).map((v) => v.toLowerCase());
                if (p.storage && !vals.some((v) => v.includes(p.storage)))
                    continue;
                if (p.color && !vals.some((v) => v.includes(p.color.toLowerCase())))
                    continue;
                found = {
                    rawLine: p.rawLine, parsed: p,
                    variantId: variant.id, variantSku: variant.sku,
                    productId: product.id, productName: product.name,
                    brand: product.brand ?? undefined,
                    categoryId: product.categoryId ?? undefined,
                    currentPrice: Number(variant.price), supplierPrice: p.price,
                };
                break outer;
            }
        }
        found ? matched.push(found) : unmatched.push(p);
    }
    return { matched, unmatched };
}
// ─── Форматирование ───────────────────────────────────────────────────────────
function fmtPrice(n) {
    return n.toLocaleString('ru-RU') + ' ₽';
}
function fmtDiff(diff) {
    return (diff >= 0 ? '+' : '') + fmtPrice(diff);
}
// ─── Построение PendingVariant из MatchedVariant[] ───────────────────────────
function buildPendingFromMatches(matches, markup, rate) {
    return matches.map((m) => {
        const effective = rate ? (0, currency_1.roundPrice)(m.supplierPrice * rate) : m.supplierPrice;
        const newPrice = markup !== null ? (0, currency_1.roundPrice)(effective * (1 + markup / 100)) : effective;
        const p = m.parsed;
        const attsParts = [p.storage ? `${p.storage} ГБ` : null, p.color].filter(Boolean);
        return {
            variantId: m.variantId, productId: m.productId, productName: m.productName,
            brand: m.brand, categoryId: m.categoryId, variantSku: m.variantSku,
            attrs: attsParts.join(', '),
            currentPrice: m.currentPrice, newPrice,
            region: p.region,
        };
    });
}
// ─── Меню ─────────────────────────────────────────────────────────────────────
async function showPricingMenu(ctx) {
    await ctx.reply('💰 Управление ценами', telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback('📨 Из сообщения поставщика', 'pricing:msg')],
        [telegraf_1.Markup.button.callback('💱 По курсу валют', 'pricing:rate')],
        [telegraf_1.Markup.button.callback('📊 Из файла Excel', 'pricing:file')],
        [telegraf_1.Markup.button.callback('✏️ Точечно', 'pricing:manual')],
        [telegraf_1.Markup.button.callback('📋 История изменений', 'pricing:history')],
        [telegraf_1.Markup.button.callback('🌍 Регионы и валюты', 'pricing:regions')],
        [telegraf_1.Markup.button.callback('🔙 Назад', 'back:main')],
    ]));
}
// ─── Меню регионов ────────────────────────────────────────────────────────────
async function showRegionsMenu(ctx) {
    const regions = await prisma_1.prisma.region.findMany({ orderBy: { code: 'asc' } });
    const lines = ['🌍 Регионы и валюты\n'];
    for (const r of regions) {
        const status = r.isActive ? '' : ' ⏸';
        lines.push(`${r.flag} ${r.code} — ${r.name} — ${r.currency}${status}`);
    }
    const regionRows = regions.map((r) => [
        telegraf_1.Markup.button.callback(`✏️ ${r.code}`, `pricing:region_edit:${r.id}`),
        telegraf_1.Markup.button.callback(`🗑️ ${r.code}`, `pricing:region_del:${r.id}`),
    ]);
    await ctx.reply(lines.join('\n'), telegraf_1.Markup.inlineKeyboard([
        ...regionRows,
        [telegraf_1.Markup.button.callback('➕ Добавить регион', 'pricing:region_add')],
        [telegraf_1.Markup.button.callback('💱 Курсы валют', 'pricing:rates')],
        [telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:menu')],
    ]));
}
// ─── Меню курсов валют ────────────────────────────────────────────────────────
async function showRatesMenu(ctx) {
    const rateRecords = await prisma_1.prisma.currencyRate.findMany({ orderBy: { currency: 'asc' } });
    const lines = ['💱 Актуальные курсы:\n'];
    for (const rec of rateRecords) {
        const flag = currency_1.CURRENCY_FLAGS[rec.currency] ?? '';
        const date = rec.updatedAt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        const time = rec.updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const prev = rec.previousRate ? ` (было ${Number(rec.previousRate).toFixed(2)}₽)` : '';
        lines.push(`${flag} ${rec.currency}: ${Number(rec.rate).toFixed(2)}₽${prev} (${date} ${time})`);
    }
    if (rateRecords.length === 0)
        lines.push('Нет сохранённых курсов');
    await ctx.reply(lines.join('\n'), telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback('🔄 Обновить с ЦБ РФ', 'pricing:rates_cbr')],
        [telegraf_1.Markup.button.callback('📝 Ввести текстом (AI)', 'pricing:input_rates')],
        [telegraf_1.Markup.button.callback('➕ Добавить валюту вручную', 'pricing:rate_add')],
        [telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:regions')],
    ]));
}
// ─── Универсальный предпросмотр ───────────────────────────────────────────────
async function showPreview(ctx, userId) {
    const state = exports.pricingState.get(userId);
    if (!state || state.flow !== 'preview')
        return;
    const active = state.pendingVariants.filter((v) => !state.excludedVariantIds.includes(v.variantId));
    const excludedCount = state.excludedVariantIds.length;
    const lines = ['📊 Предпросмотр изменений:\n'];
    const preview = active.slice(0, 12);
    for (const v of preview) {
        const diff = v.newPrice - v.currentPrice;
        const attrsStr = v.attrs ? ` (${v.attrs})` : '';
        lines.push(`${v.productName}${attrsStr}: ${fmtPrice(v.currentPrice)} → ${fmtPrice(v.newPrice)} (${fmtDiff(diff)})`);
    }
    if (active.length > 12)
        lines.push(`… и ещё ${active.length - 12}`);
    const excludedNote = excludedCount > 0 ? ` (исключено: ${excludedCount} по фильтрам)` : '';
    lines.push(`\nБудет обновлено: ${active.length} вариантов${excludedNote}`);
    if (state.autoFilter) {
        const flag = currency_1.CURRENCY_FLAGS[state.autoFilter] ?? '';
        const total = state.allPendingVariants?.length ?? active.length;
        lines.push(`\n🔍 Автофильтр: ${flag} ${state.autoFilter} (${active.length} из ${total} вариантов)`);
    }
    const unfilterRow = state.autoFilter
        ? [[telegraf_1.Markup.button.callback('🔓 Показать все регионы', 'pricing:unfilter_region')]]
        : [];
    const keyboard = active.length === 0
        ? telegraf_1.Markup.inlineKeyboard([
            ...unfilterRow,
            [telegraf_1.Markup.button.callback('🔽 Исключить позиции', 'pricing:exclude')],
            [telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')],
        ])
        : telegraf_1.Markup.inlineKeyboard([
            ...unfilterRow,
            [telegraf_1.Markup.button.callback('🔽 Исключить позиции', 'pricing:exclude')],
            [
                telegraf_1.Markup.button.callback('✅ Применить', 'pricing:apply'),
                telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel'),
            ],
        ]);
    await ctx.reply(lines.join('\n'), keyboard);
}
// ─── Меню исключений ──────────────────────────────────────────────────────────
async function showExcludeMenu(ctx, userId) {
    const state = exports.pricingState.get(userId);
    if (!state || state.flow !== 'preview')
        return;
    const active = state.pendingVariants.filter((v) => !state.excludedVariantIds.includes(v.variantId));
    const regions = [...new Set(active.filter((v) => v.region).map((v) => v.region))];
    const regionRow = regions.length > 0
        ? [telegraf_1.Markup.button.callback('🌍 По региону', 'pricing:excl_regions')]
        : [];
    await ctx.reply(`Исключить из обновления:\nОсталось: ${active.length} | Исключено: ${state.excludedVariantIds.length}`, telegraf_1.Markup.inlineKeyboard([
        [
            telegraf_1.Markup.button.callback('⏱️ Изм. < 60 мин', 'pricing:excl_60m'),
            telegraf_1.Markup.button.callback('⏱️ Изм. сегодня', 'pricing:excl_today'),
        ],
        [
            telegraf_1.Markup.button.callback('🏢 По бренду', 'pricing:excl_brands'),
            telegraf_1.Markup.button.callback('🗂️ По категории', 'pricing:excl_cats'),
        ],
        [telegraf_1.Markup.button.callback('📦 По товару', 'pricing:excl_prods'), ...regionRow],
        [telegraf_1.Markup.button.callback('✅ Готово — к предпросмотру', 'pricing:preview')],
    ]));
}
// ─── Применение изменений ─────────────────────────────────────────────────────
async function applyChanges(ctx, userId) {
    const state = exports.pricingState.get(userId);
    if (!state || state.flow !== 'preview')
        return;
    const active = state.pendingVariants.filter((v) => !state.excludedVariantIds.includes(v.variantId));
    exports.pricingState.delete(userId);
    if (active.length === 0) {
        await ctx.reply('Нет вариантов для обновления.');
        return;
    }
    let updated = 0;
    const errors = [];
    for (const v of active) {
        try {
            await prisma_1.prisma.productVariant.update({ where: { id: v.variantId }, data: { price: v.newPrice } });
            await prisma_1.prisma.priceChange.create({
                data: {
                    variantId: v.variantId,
                    oldPrice: v.currentPrice,
                    newPrice: v.newPrice,
                    source: state.source,
                    markup: state.markup,
                    comment: v.comment || null,
                    createdBy: String(userId),
                },
            });
            updated++;
        }
        catch {
            errors.push(v.variantSku);
        }
    }
    const errMsg = errors.length > 0 ? `\n❌ Ошибки (${errors.length}): ${errors.join(', ')}` : '';
    await ctx.reply(`✅ Цены обновлены: ${updated} вариантов${errMsg}`, telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback('📋 История', 'pricing:history')],
        [telegraf_1.Markup.button.callback('🔙 Меню цен', 'pricing:menu')],
    ]));
}
// ─── История ──────────────────────────────────────────────────────────────────
async function showHistory(ctx) {
    const changes = await prisma_1.prisma.priceChange.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { variant: { include: { product: true } } },
    });
    if (!changes.length) {
        await ctx.reply('📋 История пуста.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:menu')]]));
        return;
    }
    const SRC = { message: '📨', file: '📊', markup: '📈', manual: '✏️', currency_update: '💱' };
    const lines = changes.map((c) => {
        const name = c.variant.product.name.slice(0, 22);
        const src = SRC[c.source] ?? c.source;
        const date = c.createdAt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        const mu = c.markup !== null ? ` +${c.markup}%` : '';
        return `${date} ${src}${mu}: ${name} ${fmtPrice(Number(c.oldPrice))} → ${fmtPrice(Number(c.newPrice))}`;
    });
    await ctx.reply(`📋 История (последние ${changes.length}):\n\n${lines.join('\n')}`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:menu')]]));
}
// ─── Список товаров для ручного редактирования ────────────────────────────────
const MANUAL_PAGE_SIZE = 12;
async function showManualProductList(ctx, userId, page) {
    const products = await prisma_1.prisma.product.findMany({
        orderBy: { name: 'asc' },
        skip: page * MANUAL_PAGE_SIZE,
        take: MANUAL_PAGE_SIZE + 1,
        include: { _count: { select: { variants: true } } },
    });
    const hasNext = products.length > MANUAL_PAGE_SIZE;
    const items = products.slice(0, MANUAL_PAGE_SIZE);
    exports.pricingState.set(userId, { flow: 'manual_product_pick', page });
    const rows = items.map((p) => [
        telegraf_1.Markup.button.callback(`${p.name.slice(0, 32)} (${p._count.variants})`, `pricing:man_prod:${p.id}`),
    ]);
    const nav = [];
    if (page > 0)
        nav.push(telegraf_1.Markup.button.callback('◀️ Назад', `pricing:man_page:${page - 1}`));
    if (hasNext)
        nav.push(telegraf_1.Markup.button.callback('▶️ Далее', `pricing:man_page:${page + 1}`));
    if (nav.length)
        rows.push(nav);
    rows.push([telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]);
    await ctx.reply('✏️ Выберите товар:', telegraf_1.Markup.inlineKeyboard(rows));
}
async function showManualVariantList(ctx, userId, productId) {
    const product = await prisma_1.prisma.product.findUnique({
        where: { id: productId },
        include: { variants: { orderBy: { id: 'asc' } } },
    });
    if (!product) {
        await ctx.reply('Товар не найден.');
        return;
    }
    if (!product.variants.length) {
        await ctx.reply('У товара нет вариантов.');
        return;
    }
    exports.pricingState.set(userId, {
        flow: 'manual_variant_pick',
        productId: product.id,
        productName: product.name,
    });
    const lines = [`✏️ ${product.name}:\n`];
    const varBtns = [];
    product.variants.forEach((v, i) => {
        const attrs = Object.values(v.attributes).join(', ');
        lines.push(`${i + 1}. ${attrs} — ${fmtPrice(Number(v.price))}`);
        varBtns.push(telegraf_1.Markup.button.callback(`✏️ №${i + 1}`, `pricing:man_v:${v.id}`));
    });
    const varRows = [];
    for (let i = 0; i < varBtns.length; i += 3)
        varRows.push(varBtns.slice(i, i + 3));
    await ctx.reply(lines.join('\n'), telegraf_1.Markup.inlineKeyboard([
        ...varRows,
        [telegraf_1.Markup.button.callback('✏️ Все сразу', `pricing:man_all:${product.id}`)],
        [telegraf_1.Markup.button.callback('🔙 К списку', 'pricing:manual')],
    ]));
}
// ─── Генерация xlsx прайс-листа ───────────────────────────────────────────────
async function generatePriceListBuffer() {
    const variants = await prisma_1.prisma.productVariant.findMany({
        include: { product: true },
        orderBy: [{ product: { name: 'asc' } }, { id: 'asc' }],
    });
    const wb = new exceljs_1.default.Workbook();
    const ws = wb.addWorksheet('Прайс-лист');
    // A=SKU B=Товар C=Атрибуты D=Регион E=Текущая цена F=Новая цена G=Комментарий
    ws.columns = [
        { key: 'sku', width: 25 },
        { key: 'name', width: 25 },
        { key: 'attrs', width: 35 },
        { key: 'region', width: 8 },
        { key: 'price', width: 15 },
        { key: 'newPrice', width: 15 },
        { key: 'comment', width: 20 },
    ];
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
    const headerFont = { bold: true, color: { argb: 'FFCCFF00' } };
    const newPriceFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2A3A2A' } };
    const headerRow = ws.addRow(['SKU', 'Товар', 'Атрибуты', 'Регион', 'Текущая цена', 'Новая цена', 'Комментарий']);
    headerRow.eachCell((cell) => { cell.fill = headerFill; cell.font = headerFont; });
    // Числовой формат для колонок E и F
    ws.getColumn('price').numFmt = '#,##0';
    ws.getColumn('newPrice').numFmt = '#,##0';
    const altFills = ['FF1A1A1A', 'FF111111'];
    variants.forEach((v, i) => {
        const attrsObj = v.attributes;
        const region = attrsObj['Регион'] ?? '';
        const attrs = Object.entries(attrsObj)
            .filter(([k]) => k !== 'Регион')
            .map(([k, val]) => `${k}: ${val}`).join(', ');
        const rowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: altFills[i % 2] } };
        const row = ws.addRow([v.sku, v.product.name, attrs, region, Number(v.price), null, '']);
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
            cell.fill = colNum === 6 ? newPriceFill : rowFill;
        });
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const raw = await wb.xlsx.writeBuffer();
    return Buffer.from(raw);
}
// ─── Скачивание файла из Telegram ─────────────────────────────────────────────
async function downloadTelegramFile(ctx, fileId) {
    const file = await ctx.telegram.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    return new Promise((resolve, reject) => {
        const chunks = [];
        https_1.default.get(url, (res) => {
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}
// ─── Парсинг загруженного прайс-листа ────────────────────────────────────────
async function parsePriceListXlsx(buffer) {
    const wb = new exceljs_1.default.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buffer);
    // Try sheet named "Прайс-лист", fallback to first sheet
    const ws = wb.getWorksheet('Прайс-лист') ?? wb.worksheets[0];
    if (!ws)
        return [];
    const rows = [];
    ws.eachRow((row, n) => {
        if (n === 1)
            return; // skip header
        const sku = String(row.getCell(1).value ?? '').trim();
        if (!sku)
            return;
        const newPriceVal = row.getCell(6).value; // колонка F — Новая цена
        if (!newPriceVal)
            return;
        const newPrice = typeof newPriceVal === 'object' && newPriceVal !== null && 'result' in newPriceVal
            ? Number(newPriceVal.result)
            : Number(newPriceVal);
        if (isNaN(newPrice) || newPrice <= 0)
            return;
        const comment = String(row.getCell(7).value ?? '').trim(); // колонка G — Комментарий
        rows.push({ sku, newPrice, comment });
    });
    return rows;
}
// ─── Вспомогательные функции для корректировки по курсу ──────────────────────
function directionEmoji(d) {
    if (d === 'up')
        return '📈';
    if (d === 'down')
        return '📉';
    return '➡️';
}
function formatChangePercent(pct, dir) {
    if (dir === 'same')
        return 'без изменений';
    return (dir === 'up' ? '+' : '') + pct + '%';
}
/** Строит PendingVariant[] для региона с заданным процентом корректировки */
async function buildRegionAdjustPending(region, pct, regionMap, currency) {
    const variants = await prisma_1.prisma.productVariant.findMany({
        where: { attributes: { path: ['Регион'], equals: region } },
        include: { product: true },
    });
    return variants.map((v) => {
        const attrs = v.attributes;
        const attrsStr = Object.entries(attrs).filter(([k]) => k !== 'Регион').map(([k, val]) => `${k}: ${val}`).join(', ');
        const oldPrice = Number(v.price);
        const newPrice = (0, currency_1.roundPrice)(oldPrice * (1 + pct / 100));
        return {
            variantId: v.id,
            productId: v.productId,
            productName: v.product.name,
            brand: v.product.brand ?? undefined,
            categoryId: v.product.categoryId ?? undefined,
            variantSku: v.sku,
            attrs: attrsStr,
            currentPrice: oldPrice,
            newPrice,
            region,
            comment: `Курс ${currency} ${pct >= 0 ? '+' : ''}${pct}%, округление ↑`,
        };
    }).filter((v) => v.newPrice !== v.currentPrice);
}
/** Показывает меню выбора региона/всего стока после обновления курсов */
async function showCurrencyAdjustSelect(ctx, userId, changes) {
    const regionMap = await (0, currency_1.getRegionCurrencyMap)();
    const changed = changes.filter((c) => c.direction !== 'same');
    const lines = ['💱 Курсы обновлены. Выберите что корректировать:'];
    for (const c of changed) {
        const pctStr = formatChangePercent(c.changePercent, c.direction);
        lines.push(`${c.flag} ${c.currency}: ${c.previousRate.toFixed(2)}₽ → ${c.newRate.toFixed(2)}₽ ${directionEmoji(c.direction)} ${pctStr}`);
    }
    // Регионы с изменёнными курсами
    const regionRows = [];
    for (const [regionCode, currency] of Object.entries(regionMap)) {
        const change = changed.find((c) => c.currency === currency);
        if (!change)
            continue;
        const pctStr = formatChangePercent(change.changePercent, change.direction);
        const flag = Object.entries(exports.REGION_FLAGS).find(([, c]) => c === regionCode)?.[0] ?? '';
        regionRows.push([
            telegraf_1.Markup.button.callback(`${flag} ${regionCode} товары (${pctStr})`, `pricing:cadj_region:${regionCode}`),
        ]);
    }
    exports.pricingState.set(userId, { flow: 'cadj_select', changes });
    await ctx.reply(lines.join('\n'), telegraf_1.Markup.inlineKeyboard([
        ...regionRows,
        [telegraf_1.Markup.button.callback('🌍 Весь сток (по регионам)', 'pricing:cadj_all')],
        [telegraf_1.Markup.button.callback('🔧 Выбрать вручную', 'pricing:cadj_manual')],
        [telegraf_1.Markup.button.callback('❌ Пропустить', 'pricing:cancel')],
    ]));
}
/** Показывает сводку "Весь сток" с процентами по регионам */
async function showCadjAllReview(ctx, userId) {
    const state = exports.pricingState.get(userId);
    if (!state || state.flow !== 'cadj_all_review')
        return;
    const regionMap = await (0, currency_1.getRegionCurrencyMap)();
    const { changes, overrides } = state;
    const lines = ['🌍 Весь сток — проверьте проценты по каждому региону:\n'];
    const buttons = [];
    for (const [regionCode, currency] of Object.entries(regionMap)) {
        const change = changes.find((c) => c.currency === currency);
        if (!change || change.direction === 'same')
            continue;
        const pct = overrides[regionCode] ?? Number(change.changePercent);
        const flag = Object.entries(exports.REGION_FLAGS).find(([, c]) => c === regionCode)?.[0] ?? '';
        const sign = pct >= 0 ? '+' : '';
        lines.push(`${flag} ${regionCode} ${sign}${pct}%`);
        buttons.push([telegraf_1.Markup.button.callback(`✏️ ${flag} ${regionCode}`, `pricing:cadj_all_edit:${regionCode}`)]);
    }
    await ctx.reply(lines.join('\n'), telegraf_1.Markup.inlineKeyboard([
        ...buttons,
        [
            telegraf_1.Markup.button.callback('✅ Применить всё', 'pricing:cadj_all_apply'),
            telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel'),
        ],
    ]));
}
/** Показывает предпросмотр корректировки для одного региона */
async function showCadjRegionPreview(ctx, userId, region, currency, pct, changes) {
    const regionMap = await (0, currency_1.getRegionCurrencyMap)();
    const pending = await buildRegionAdjustPending(region, pct, regionMap, currency);
    const flag = Object.entries(exports.REGION_FLAGS).find(([, c]) => c === region)?.[0] ?? '';
    const sign = pct >= 0 ? '+' : '';
    if (!pending.length) {
        await ctx.reply('Нет вариантов для этого региона.');
        return;
    }
    const lines = [`${flag} ${region} — корректировка ${sign}${pct}%\n`];
    for (const v of pending.slice(0, 12)) {
        const attrsStr = v.attrs ? ` (${v.attrs})` : '';
        lines.push(`${v.productName}${attrsStr}: ${fmtPrice(v.currentPrice)} → ${fmtPrice(v.newPrice)}`);
    }
    if (pending.length > 12)
        lines.push(`… и ещё ${pending.length - 12}`);
    lines.push(`\nЦены округлены до ближайшего круглого числа ↑`);
    lines.push(`Всего: ${pending.length} вариантов`);
    exports.pricingState.set(userId, {
        flow: 'preview',
        source: 'currency_update',
        markup: pct,
        label: `${flag} ${region} курс ${sign}${pct}%`,
        pendingVariants: pending,
        excludedVariantIds: [],
    });
    await ctx.reply(lines.join('\n'), telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback('🔽 Исключить позиции', 'pricing:exclude')],
        [
            telegraf_1.Markup.button.callback('✅ Применить', 'pricing:cadj_region_preview_apply'),
            telegraf_1.Markup.button.callback('✏️ Изменить %', 'pricing:cadj_region_edit_pct2'),
            telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel'),
        ],
    ]));
}
/** Показывает чекбоксы для ручного выбора регионов */
async function showCadjManualSelect(ctx, userId) {
    const state = exports.pricingState.get(userId);
    if (!state || state.flow !== 'cadj_manual_select')
        return;
    const regionMap = await (0, currency_1.getRegionCurrencyMap)();
    const rows = [];
    for (const [regionCode, currency] of Object.entries(regionMap)) {
        const change = state.changes.find((c) => c.currency === currency);
        if (!change)
            continue;
        const flag = Object.entries(exports.REGION_FLAGS).find(([, c]) => c === regionCode)?.[0] ?? '';
        const checked = state.selected.includes(regionCode) ? '✅' : '☐';
        const pctStr = formatChangePercent(change.changePercent, change.direction);
        rows.push([telegraf_1.Markup.button.callback(`${checked} ${flag} ${regionCode} (${pctStr})`, `pricing:cadj_toggle:${regionCode}`)]);
    }
    rows.push([
        telegraf_1.Markup.button.callback('✅ Готово', 'pricing:cadj_manual_done'),
        telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel'),
    ]);
    await ctx.reply('Выберите регионы для корректировки:', telegraf_1.Markup.inlineKeyboard(rows));
}
/** Обрабатывает ввод % в ручном флоу и переходит к следующему региону */
async function processCadjManualPct(ctx, userId, pct) {
    const state = exports.pricingState.get(userId);
    if (!state || state.flow !== 'cadj_manual_input_pct')
        return;
    const regionMap = await (0, currency_1.getRegionCurrencyMap)();
    const newPerRegion = { ...state.perRegionPct, [state.currentRegion]: pct };
    const remaining = state.selected.filter((r) => !(r in newPerRegion));
    if (remaining.length > 0) {
        const nextRegion = remaining[0];
        const currency = regionMap[nextRegion] ?? '';
        const change = state.changes.find((c) => c.currency === currency);
        const flag = Object.entries(exports.REGION_FLAGS).find(([, c]) => c === nextRegion)?.[0] ?? '';
        exports.pricingState.set(userId, { ...state, perRegionPct: newPerRegion, currentRegion: nextRegion, currentCurrency: currency });
        const changePct = change ? `${Number(change.changePercent) >= 0 ? '+' : ''}${change.changePercent}%` : 'неизвестно';
        await ctx.reply(`Введите процент для ${flag} ${nextRegion} (изменение курса: ${changePct}):`, telegraf_1.Markup.inlineKeyboard([
            ...(change && change.direction !== 'same'
                ? [[telegraf_1.Markup.button.callback(`${changePct} (по курсу)`, `pricing:cadj_use_rate_pct`)]]
                : []),
            [telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')],
        ]));
        return;
    }
    // Все регионы обработаны — предпросмотр
    const allPending = [];
    const summaryLines = ['Итоговые изменения:'];
    for (const regionCode of state.selected) {
        const currency = regionMap[regionCode] ?? '';
        const p = newPerRegion[regionCode] ?? 0;
        const regionPending = await buildRegionAdjustPending(regionCode, p, regionMap, currency);
        const flag = Object.entries(exports.REGION_FLAGS).find(([, c]) => c === regionCode)?.[0] ?? '';
        const sign = p >= 0 ? '+' : '';
        summaryLines.push(`${flag} ${regionCode} (${regionPending.length} вар.): ${sign}${p}% → округлено ↑`);
        allPending.push(...regionPending);
    }
    summaryLines.push(`\nИтого: ${allPending.length} вариантов`);
    exports.pricingState.set(userId, {
        flow: 'preview',
        source: 'currency_update',
        markup: null,
        label: 'ручная корректировка по курсу',
        pendingVariants: allPending,
        excludedVariantIds: [],
    });
    await ctx.reply(summaryLines.join('\n'), telegraf_1.Markup.inlineKeyboard([
        [telegraf_1.Markup.button.callback('🔽 Исключить позиции', 'pricing:exclude')],
        [telegraf_1.Markup.button.callback('✅ Применить', 'pricing:apply'), telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')],
    ]));
}
// ─── Регистрация обработчиков ─────────────────────────────────────────────────
function setupPricingHandlers(bot) {
    // ── Навигация ──────────────────────────────────────────────────────────────
    bot.action('pricing:menu', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        exports.pricingState.delete(ctx.from.id);
        await showPricingMenu(ctx);
    });
    bot.action('pricing:cancel', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        exports.pricingState.delete(ctx.from.id);
        await showPricingMenu(ctx);
    });
    bot.action('pricing:history', async (ctx) => {
        try {
            await ctx.answerCbQuery('⏳ Загрузка...');
        }
        catch { }
        await showHistory(ctx);
    });
    // ── Из сообщения ───────────────────────────────────────────────────────────
    bot.action('pricing:msg', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        exports.pricingState.set(ctx.from.id, { flow: 'awaiting_message' });
        await ctx.reply('Перешлите сообщение от поставщика или вставьте текст с ценами.\n\n' +
            'Формат:\niPhone 17 Pro 256 Silver 🇭🇰 - 122.000₽\niPhone 16 256 Black 🇮🇳 - 68.500₽', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
    });
    // ── По курсу валют ─────────────────────────────────────────────────────────
    bot.action('pricing:rate', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await ctx.reply('💱 По курсу валют', telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback('🔄 Обновить курсы сейчас', 'pricing:rate_update')],
            [telegraf_1.Markup.button.callback('📋 Текущие курсы', 'pricing:rates')],
            [telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:menu')],
        ]));
    });
    bot.action('pricing:rate_update', async (ctx) => {
        try {
            await ctx.answerCbQuery('⏳ Обновляю…');
        }
        catch { }
        const userId = ctx.from.id;
        await ctx.reply('⏳ Получаю актуальные курсы с ЦБ РФ…');
        try {
            const changes = await (0, currency_1.updateCurrencyRates)();
            if (!changes.length) {
                await ctx.reply('ℹ️ Нет активных валют для обновления.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:menu')]]));
                return;
            }
            await showCurrencyAdjustSelect(ctx, userId, changes);
        }
        catch {
            await ctx.reply('❌ Ошибка при получении курсов ЦБ РФ.');
        }
    });
    // ── Корректировка цен по изменению курса ────────────────────────────────────
    // Выбор конкретного региона
    bot.action(/^pricing:cadj_region:(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const regionCode = ctx.match[1];
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'cadj_select')
            return;
        const regionMap = await (0, currency_1.getRegionCurrencyMap)();
        const currency = regionMap[regionCode];
        if (!currency) {
            await ctx.reply('Регион не найден.');
            return;
        }
        const change = state.changes.find((c) => c.currency === currency);
        if (!change) {
            await ctx.reply('Изменений по этому региону нет.');
            return;
        }
        const pct = Number(change.changePercent);
        const flag = Object.entries(exports.REGION_FLAGS).find(([, c]) => c === regionCode)?.[0] ?? '';
        const sign = pct >= 0 ? '+' : '';
        exports.pricingState.set(userId, { flow: 'cadj_region_confirm', changes: state.changes, region: regionCode, currency, pct });
        await ctx.reply(`${flag} ${regionCode} — курс изменился на ${sign}${pct}%\n\nПрименить этот процент или изменить?`, telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback(`✅ Применить ${sign}${pct}%`, 'pricing:cadj_region_apply')],
            [telegraf_1.Markup.button.callback('✏️ Изменить процент', 'pricing:cadj_region_edit_pct')],
            [telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')],
        ]));
    });
    bot.action('pricing:cadj_region_edit_pct', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'cadj_region_confirm')
            return;
        exports.pricingState.set(userId, { flow: 'cadj_region_input_pct', changes: state.changes, region: state.region, currency: state.currency });
        await ctx.reply('Введите процент корректировки (например: 2.5 или -1.3):', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
    });
    bot.action('pricing:cadj_region_apply', async (ctx) => {
        try {
            await ctx.answerCbQuery('⏳ Считаю…');
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'cadj_region_confirm')
            return;
        await showCadjRegionPreview(ctx, userId, state.region, state.currency, state.pct, state.changes);
    });
    // Предпросмотр корректировки региона
    bot.action('pricing:cadj_region_preview_apply', async (ctx) => {
        try {
            await ctx.answerCbQuery('⏳ Применяю…');
        }
        catch { }
        await applyChanges(ctx, ctx.from.id);
    });
    // Изменить % из экрана предпросмотра одного региона
    bot.action('pricing:cadj_region_edit_pct2', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'preview')
            return;
        // Extract region/currency from label: "🇭🇰 HK курс +1.26%"
        const match = state.label.match(/(\S+)\s+(\w+)\s+курс/);
        if (!match) {
            await ctx.reply('Введите процент корректировки:');
            return;
        }
        const regionCode = match[2];
        // Reload from cadj state is not possible — just ask
        await ctx.reply('Введите новый процент корректировки (например: 2.5 или -1.3):', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
        // Store minimal state so text handler knows what to do
        exports.pricingState.set(userId, { flow: 'cadj_region_input_pct', changes: [], region: regionCode, currency: '' });
    });
    // Весь сток
    bot.action('pricing:cadj_all', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'cadj_select')
            return;
        exports.pricingState.set(userId, { flow: 'cadj_all_review', changes: state.changes, overrides: {} });
        await showCadjAllReview(ctx, userId);
    });
    bot.action(/^pricing:cadj_all_edit:(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const regionCode = ctx.match[1];
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'cadj_all_review')
            return;
        const regionMap = await (0, currency_1.getRegionCurrencyMap)();
        const currency = regionMap[regionCode];
        const change = state.changes.find((c) => c.currency === currency);
        const curPct = state.overrides[regionCode] ?? (change ? Number(change.changePercent) : 0);
        const flag = Object.entries(exports.REGION_FLAGS).find(([, c]) => c === regionCode)?.[0] ?? '';
        exports.pricingState.set(userId, { flow: 'cadj_all_input_pct', changes: state.changes, overrides: state.overrides, editRegion: regionCode, editCurrency: currency });
        await ctx.reply(`Введите процент для ${flag} ${regionCode} (текущий: ${curPct >= 0 ? '+' : ''}${curPct}%):`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cadj_all_back')]]));
    });
    bot.action('pricing:cadj_all_back', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || (state.flow !== 'cadj_all_review' && state.flow !== 'cadj_all_input_pct'))
            return;
        const changes = state.changes;
        const overrides = state.flow === 'cadj_all_input_pct' ? state.overrides : state.overrides;
        exports.pricingState.set(userId, { flow: 'cadj_all_review', changes, overrides });
        await showCadjAllReview(ctx, userId);
    });
    bot.action('pricing:cadj_all_apply', async (ctx) => {
        try {
            await ctx.answerCbQuery('⏳ Считаю…');
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'cadj_all_review')
            return;
        const regionMap = await (0, currency_1.getRegionCurrencyMap)();
        const allPending = [];
        const regionSummary = ['Итоговые изменения:'];
        for (const [regionCode, currency] of Object.entries(regionMap)) {
            const change = state.changes.find((c) => c.currency === currency);
            if (!change || change.direction === 'same')
                continue;
            const pct = state.overrides[regionCode] ?? Number(change.changePercent);
            const regionPending = await buildRegionAdjustPending(regionCode, pct, regionMap, currency);
            if (!regionPending.length)
                continue;
            const flag = Object.entries(exports.REGION_FLAGS).find(([, c]) => c === regionCode)?.[0] ?? '';
            const sign = pct >= 0 ? '+' : '';
            regionSummary.push(`${flag} ${regionCode} (${regionPending.length} вар.): ${sign}${pct}% → округлено ↑`);
            allPending.push(...regionPending);
        }
        if (!allPending.length) {
            await ctx.reply('Нет вариантов для обновления.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:menu')]]));
            return;
        }
        regionSummary.push(`\nИтого: ${allPending.length} вариантов`);
        exports.pricingState.set(userId, {
            flow: 'preview',
            source: 'currency_update',
            markup: null,
            label: 'весь сток по курсу',
            pendingVariants: allPending,
            excludedVariantIds: [],
        });
        await ctx.reply(regionSummary.join('\n'), telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback('🔽 Исключить позиции', 'pricing:exclude')],
            [telegraf_1.Markup.button.callback('✅ Применить', 'pricing:apply'), telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')],
        ]));
    });
    // Выбор вручную
    bot.action('pricing:cadj_manual', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'cadj_select')
            return;
        exports.pricingState.set(userId, { flow: 'cadj_manual_select', changes: state.changes, selected: [] });
        await showCadjManualSelect(ctx, userId);
    });
    bot.action(/^pricing:cadj_toggle:(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const regionCode = ctx.match[1];
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'cadj_manual_select')
            return;
        const selected = state.selected.includes(regionCode)
            ? state.selected.filter((r) => r !== regionCode)
            : [...state.selected, regionCode];
        exports.pricingState.set(userId, { ...state, selected });
        await showCadjManualSelect(ctx, userId);
    });
    bot.action('pricing:cadj_manual_done', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'cadj_manual_select' || !state.selected.length) {
            await ctx.reply('Выберите хотя бы один регион.');
            return;
        }
        const regionMap = await (0, currency_1.getRegionCurrencyMap)();
        // Start asking % for first selected region
        const firstRegion = state.selected[0];
        const currency = regionMap[firstRegion] ?? '';
        const change = state.changes.find((c) => c.currency === currency);
        const flag = Object.entries(exports.REGION_FLAGS).find(([, c]) => c === firstRegion)?.[0] ?? '';
        exports.pricingState.set(userId, {
            flow: 'cadj_manual_input_pct',
            changes: state.changes,
            selected: state.selected,
            perRegionPct: {},
            currentRegion: firstRegion,
            currentCurrency: currency,
        });
        const changePct = change ? `${Number(change.changePercent) >= 0 ? '+' : ''}${change.changePercent}%` : 'неизвестно';
        await ctx.reply(`Введите процент для ${flag} ${firstRegion} (изменение курса: ${changePct}):`, telegraf_1.Markup.inlineKeyboard([
            ...(change && change.direction !== 'same'
                ? [[telegraf_1.Markup.button.callback(`${changePct} (по курсу)`, `pricing:cadj_use_rate_pct`)]]
                : []),
            [telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')],
        ]));
    });
    bot.action('pricing:cadj_use_rate_pct', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'cadj_manual_input_pct')
            return;
        const change = state.changes.find((c) => c.currency === state.currentCurrency);
        if (!change)
            return;
        await processCadjManualPct(ctx, userId, Number(change.changePercent));
    });
    // Выбор валюты после ввода курса (старый флоу сообщения поставщика)
    bot.action(/^pricing:rate_cur:(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'awaiting_currency')
            return;
        const currency = ctx.match[1];
        const flag = currency_1.CURRENCY_FLAGS[currency] ?? '';
        exports.pricingState.set(userId, { flow: 'awaiting_message', rate: state.rate, currency });
        await ctx.reply(`💱 Курс: ${state.rate} | Валюта: ${flag} ${currency}\n` +
            'Отправьте сообщение с ценами — они будут пересчитаны.\n' +
            `Автофильтр: только варианты региона ${flag} (соответствующего валюте ${currency}).`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
    });
    bot.action('pricing:rate_cur_all', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'awaiting_currency')
            return;
        exports.pricingState.set(userId, { flow: 'awaiting_message', rate: state.rate });
        await ctx.reply(`💱 Курс: ${state.rate} | Без фильтра по региону.\nОтправьте сообщение с ценами:`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
    });
    // Снять авто-фильтр в превью
    bot.action('pricing:unfilter_region', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'preview' || !state.allPendingVariants)
            return;
        exports.pricingState.set(userId, {
            ...state,
            pendingVariants: state.allPendingVariants,
            autoFilter: undefined,
            allPendingVariants: undefined,
        });
        await showPreview(ctx, userId);
    });
    // ── Из файла Excel ─────────────────────────────────────────────────────────
    bot.action('pricing:file', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await ctx.reply('📊 Обновление цен из файла Excel', telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback('📥 Скачать прайс-лист', 'pricing:file_dl')],
            [telegraf_1.Markup.button.callback('📤 Загрузить обновлённый', 'pricing:file_ul')],
            [telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:menu')],
        ]));
    });
    bot.action('pricing:file_dl', async (ctx) => {
        try {
            await ctx.answerCbQuery('⏳ Генерирую...');
        }
        catch { }
        await ctx.reply('⏳ Формирую прайс-лист…');
        try {
            const port = process.env.API_PORT ?? '3000';
            const response = await fetch(`http://localhost:${port}/api/download/price-list`);
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());
            const today = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-');
            await ctx.replyWithDocument({ source: buffer, filename: `price-list-${today}.xlsx` }, { caption: '📊 Прайс-лист с текущими ценами\n\nЗаполни колонку «Новая цена» и загрузи обратно.' });
        }
        catch {
            await ctx.reply('❌ Ошибка при генерации файла.');
        }
    });
    bot.action('pricing:file_ul', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        exports.pricingState.set(ctx.from.id, { flow: 'awaiting_file' });
        await ctx.reply('Загрузите заполненный файл прайс-листа (xlsx).\nЗаполните только колонку «Новая цена».', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
    });
    // ── Точечное редактирование ────────────────────────────────────────────────
    bot.action('pricing:manual', async (ctx) => {
        try {
            await ctx.answerCbQuery('⏳ Загрузка...');
        }
        catch { }
        await showManualProductList(ctx, ctx.from.id, 0);
    });
    bot.action(/^pricing:man_page:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const page = parseInt(ctx.match[1], 10);
        await showManualProductList(ctx, ctx.from.id, page);
    });
    bot.action(/^pricing:man_prod:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery('⏳ Загрузка...');
        }
        catch { }
        await showManualVariantList(ctx, ctx.from.id, parseInt(ctx.match[1], 10));
    });
    bot.action(/^pricing:man_v:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const variantId = parseInt(ctx.match[1], 10);
        const variant = await prisma_1.prisma.productVariant.findUnique({
            where: { id: variantId },
            include: { product: true },
        });
        if (!variant)
            return ctx.reply('Вариант не найден.');
        const attrs = Object.values(variant.attributes).join(', ');
        exports.pricingState.set(userId, {
            flow: 'manual_price_input',
            variantId: variant.id,
            variantSku: variant.sku,
            productName: variant.product.name,
            attrs,
            currentPrice: Number(variant.price),
        });
        await ctx.reply(`Введите новую цену для ${variant.product.name} (${attrs})\nТекущая цена: ${fmtPrice(Number(variant.price))}:`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
    });
    bot.action(/^pricing:man_all:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const productId = parseInt(ctx.match[1], 10);
        const product = await prisma_1.prisma.product.findUnique({ where: { id: productId } });
        if (!product)
            return ctx.reply('Товар не найден.');
        exports.pricingState.set(userId, {
            flow: 'manual_all_price',
            productId: product.id,
            productName: product.name,
        });
        await ctx.reply(`Введите новую цену — применится ко всем вариантам «${product.name}»:`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
    });
    // ── Массовая наценка (bulk) ────────────────────────────────────────────────
    bot.action('pricing:bulk', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await ctx.reply('📈 Массовая наценка — применить к:', telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback('📦 Всем вариантам', 'pricing:bulk_all')],
            [telegraf_1.Markup.button.callback('🗂️ По категории', 'pricing:bulk_cats')],
            [telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:menu')],
        ]));
    });
    bot.action('pricing:bulk_all', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        exports.pricingState.set(ctx.from.id, { flow: 'bulk_pct', filterType: 'all', filterValue: '', filterLabel: 'все варианты' });
        await ctx.reply('Введите процент наценки (например: 5 или 10):', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
    });
    bot.action('pricing:bulk_cats', async (ctx) => {
        try {
            await ctx.answerCbQuery('⏳ Загрузка...');
        }
        catch { }
        const cats = await prisma_1.prisma.category.findMany({
            orderBy: { name: 'asc' },
            include: { _count: { select: { products: true } } },
        });
        if (!cats.length)
            return ctx.reply('Категории не найдены.');
        const rows = cats.map((c) => [
            telegraf_1.Markup.button.callback(`${c.name} (${c._count.products})`, `pricing:bulk_cat:${c.id}`),
        ]);
        rows.push([telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:menu')]);
        await ctx.reply('Выберите категорию:', telegraf_1.Markup.inlineKeyboard(rows));
    });
    bot.action(/^pricing:bulk_cat:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const cat = await prisma_1.prisma.category.findUnique({ where: { id: parseInt(ctx.match[1], 10) } });
        if (!cat)
            return ctx.reply('Категория не найдена.');
        exports.pricingState.set(ctx.from.id, {
            flow: 'bulk_pct',
            filterType: 'category',
            filterValue: cat.name,
            filterLabel: `категория «${cat.name}»`,
        });
        await ctx.reply(`Категория «${cat.name}». Введите процент наценки:`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
    });
    // ── Универсальный предпросмотр ─────────────────────────────────────────────
    bot.action('pricing:preview', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await showPreview(ctx, ctx.from.id);
    });
    bot.action('pricing:apply', async (ctx) => {
        try {
            await ctx.answerCbQuery('⏳ Применяю...');
        }
        catch { }
        await applyChanges(ctx, ctx.from.id);
    });
    bot.action('pricing:exclude', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        await showExcludeMenu(ctx, ctx.from.id);
    });
    // ── Фильтры исключений ─────────────────────────────────────────────────────
    bot.action('pricing:excl_60m', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'preview')
            return;
        const since = new Date(Date.now() - 60 * 60 * 1000);
        const recent = await prisma_1.prisma.priceChange.findMany({
            where: { createdAt: { gte: since } },
            select: { variantId: true },
            distinct: ['variantId'],
        });
        const ids = new Set(recent.map((r) => r.variantId));
        const toExclude = state.pendingVariants.filter((v) => ids.has(v.variantId)).map((v) => v.variantId);
        const newExcluded = [...new Set([...state.excludedVariantIds, ...toExclude])];
        exports.pricingState.set(userId, { ...state, excludedVariantIds: newExcluded });
        const added = newExcluded.length - state.excludedVariantIds.length;
        await ctx.reply(`✅ Исключено ${added} вариантов (изменены за последний час)`);
        await showExcludeMenu(ctx, userId);
    });
    bot.action('pricing:excl_today', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'preview')
            return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const recent = await prisma_1.prisma.priceChange.findMany({
            where: { createdAt: { gte: today } },
            select: { variantId: true },
            distinct: ['variantId'],
        });
        const ids = new Set(recent.map((r) => r.variantId));
        const toExclude = state.pendingVariants.filter((v) => ids.has(v.variantId)).map((v) => v.variantId);
        const newExcluded = [...new Set([...state.excludedVariantIds, ...toExclude])];
        exports.pricingState.set(userId, { ...state, excludedVariantIds: newExcluded });
        const added = newExcluded.length - state.excludedVariantIds.length;
        await ctx.reply(`✅ Исключено ${added} вариантов (изменены сегодня)`);
        await showExcludeMenu(ctx, userId);
    });
    bot.action('pricing:excl_brands', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const state = exports.pricingState.get(ctx.from.id);
        if (!state || state.flow !== 'preview')
            return;
        const active = state.pendingVariants.filter((v) => !state.excludedVariantIds.includes(v.variantId));
        const brands = [...new Set(active.filter((v) => v.brand).map((v) => v.brand))];
        if (!brands.length) {
            await ctx.reply('Бренды не определены в текущем списке.');
            return;
        }
        const rows = brands.map((b) => [
            telegraf_1.Markup.button.callback(b.slice(0, 40), `pricing:excl_b:${b.slice(0, 40)}`),
        ]);
        rows.push([telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:exclude')]);
        await ctx.reply('Исключить бренд:', telegraf_1.Markup.inlineKeyboard(rows));
    });
    bot.action(/^pricing:excl_b:(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const brand = ctx.match[1];
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'preview')
            return;
        const toExclude = state.pendingVariants
            .filter((v) => !state.excludedVariantIds.includes(v.variantId) && v.brand?.slice(0, 40) === brand)
            .map((v) => v.variantId);
        const newExcluded = [...new Set([...state.excludedVariantIds, ...toExclude])];
        exports.pricingState.set(userId, { ...state, excludedVariantIds: newExcluded });
        await ctx.reply(`✅ Исключено ${toExclude.length} вариантов бренда «${brand}»`);
        await showExcludeMenu(ctx, userId);
    });
    bot.action('pricing:excl_cats', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const state = exports.pricingState.get(ctx.from.id);
        if (!state || state.flow !== 'preview')
            return;
        const active = state.pendingVariants.filter((v) => !state.excludedVariantIds.includes(v.variantId));
        const catIds = [...new Set(active.filter((v) => v.categoryId).map((v) => v.categoryId))];
        if (!catIds.length) {
            await ctx.reply('Категории не определены.');
            return;
        }
        const cats = await prisma_1.prisma.category.findMany({ where: { id: { in: catIds } } });
        const rows = cats.map((c) => [
            telegraf_1.Markup.button.callback(c.name, `pricing:excl_c:${c.id}`),
        ]);
        rows.push([telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:exclude')]);
        await ctx.reply('Исключить категорию:', telegraf_1.Markup.inlineKeyboard(rows));
    });
    bot.action(/^pricing:excl_c:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const catId = parseInt(ctx.match[1], 10);
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'preview')
            return;
        const toExclude = state.pendingVariants
            .filter((v) => !state.excludedVariantIds.includes(v.variantId) && v.categoryId === catId)
            .map((v) => v.variantId);
        const newExcluded = [...new Set([...state.excludedVariantIds, ...toExclude])];
        exports.pricingState.set(userId, { ...state, excludedVariantIds: newExcluded });
        await ctx.reply(`✅ Исключено ${toExclude.length} вариантов по категории`);
        await showExcludeMenu(ctx, userId);
    });
    bot.action('pricing:excl_prods', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const state = exports.pricingState.get(ctx.from.id);
        if (!state || state.flow !== 'preview')
            return;
        const active = state.pendingVariants.filter((v) => !state.excludedVariantIds.includes(v.variantId));
        const seen = new Map();
        active.forEach((v) => { if (!seen.has(v.productId))
            seen.set(v.productId, v.productName); });
        if (!seen.size) {
            await ctx.reply('Нет товаров.');
            return;
        }
        const rows = [...seen.entries()].slice(0, 20).map(([id, name]) => [
            telegraf_1.Markup.button.callback(name.slice(0, 40), `pricing:excl_p:${id}`),
        ]);
        rows.push([telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:exclude')]);
        await ctx.reply('Исключить товар:', telegraf_1.Markup.inlineKeyboard(rows));
    });
    bot.action(/^pricing:excl_p:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const productId = parseInt(ctx.match[1], 10);
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'preview')
            return;
        const toExclude = state.pendingVariants
            .filter((v) => !state.excludedVariantIds.includes(v.variantId) && v.productId === productId)
            .map((v) => v.variantId);
        const newExcluded = [...new Set([...state.excludedVariantIds, ...toExclude])];
        exports.pricingState.set(userId, { ...state, excludedVariantIds: newExcluded });
        await ctx.reply(`✅ Исключено ${toExclude.length} вариантов товара`);
        await showExcludeMenu(ctx, userId);
    });
    bot.action('pricing:excl_regions', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const state = exports.pricingState.get(ctx.from.id);
        if (!state || state.flow !== 'preview')
            return;
        const active = state.pendingVariants.filter((v) => !state.excludedVariantIds.includes(v.variantId));
        const regions = [...new Set(active.filter((v) => v.region).map((v) => v.region))];
        if (!regions.length) {
            await ctx.reply('Регионы не определены.');
            return;
        }
        const rows = regions.map((r) => {
            const flag = Object.entries(exports.REGION_FLAGS).find(([, code]) => code === r)?.[0] ?? '';
            return [telegraf_1.Markup.button.callback(`${flag} ${r}`, `pricing:excl_r:${r}`)];
        });
        rows.push([telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:exclude')]);
        await ctx.reply('Исключить регион:', telegraf_1.Markup.inlineKeyboard(rows));
    });
    bot.action(/^pricing:excl_r:(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        const region = ctx.match[1];
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'preview')
            return;
        const toExclude = state.pendingVariants
            .filter((v) => !state.excludedVariantIds.includes(v.variantId) && v.region === region)
            .map((v) => v.variantId);
        const newExcluded = [...new Set([...state.excludedVariantIds, ...toExclude])];
        exports.pricingState.set(userId, { ...state, excludedVariantIds: newExcluded });
        await ctx.reply(`✅ Исключено ${toExclude.length} вариантов региона ${region}`);
        await showExcludeMenu(ctx, userId);
    });
    // ── Ввод курсов вручную (AI) ────────────────────────────────────────────────
    bot.action('pricing:input_rates', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        exports.pricingState.set(userId, { flow: 'awaiting_currencies' });
        await ctx.reply('💱 Отправьте текст с курсами валют в любом формате.\n\n' +
            'Примеры:\n' +
            '• USD 92.50\n' +
            '• 1 HKD = 11.90 руб\n' +
            '• EUR: 100.20₽\n' +
            '• 100 INR = 108 рублей\n\n' +
            'Или отправьте /cbr для получения курсов с ЦБ РФ.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
    });
    bot.action('pricing:save_rates', async (ctx) => {
        try {
            await ctx.answerCbQuery('⏳ Сохраняю…');
        }
        catch { }
        const userId = ctx.from.id;
        const state = exports.pricingState.get(userId);
        if (!state || state.flow !== 'confirm_currencies')
            return;
        const { parsed } = state;
        exports.pricingState.delete(userId);
        let saved = 0;
        for (const r of parsed) {
            try {
                const existing = await prisma_1.prisma.currencyRate.findUnique({ where: { currency: r.currency } });
                await prisma_1.prisma.currencyRate.upsert({
                    where: { currency: r.currency },
                    create: { currency: r.currency, rate: r.rate, previousRate: null },
                    update: { previousRate: existing ? existing.rate : null, rate: r.rate },
                });
                saved++;
            }
            catch { /* skip */ }
        }
        await ctx.reply(`✅ Сохранено курсов: ${saved}`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 Меню цен', 'pricing:menu')]]));
    });
    // ── Регионы и валюты ────────────────────────────────────────────────────────
    bot.action('pricing:regions', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        exports.pricingState.delete(ctx.from.id);
        await showRegionsMenu(ctx);
    });
    bot.action('pricing:region_add', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        exports.pricingState.set(ctx.from.id, { flow: 'region_add_code' });
        await ctx.reply('Шаг 1 из 4 — введите код региона (2–3 буквы, например US, JP, AE):', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:regions')]]));
    });
    bot.action(/^pricing:region_edit:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const regionId = parseInt(ctx.match[1], 10);
        const region = await prisma_1.prisma.region.findUnique({ where: { id: regionId } });
        if (!region) {
            await ctx.reply('❌ Регион не найден.');
            return;
        }
        await ctx.reply(`✏️ Регион ${region.flag} ${region.code}\nНазвание: ${region.name}\nВалюта: ${region.currency}`, telegraf_1.Markup.inlineKeyboard([
            [
                telegraf_1.Markup.button.callback('✏️ Название', `pricing:region_edit_name:${regionId}`),
                telegraf_1.Markup.button.callback('✏️ Флаг', `pricing:region_edit_flag:${regionId}`),
                telegraf_1.Markup.button.callback('✏️ Валюта', `pricing:region_edit_cur:${regionId}`),
            ],
            [telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:regions')],
        ]));
    });
    bot.action(/^pricing:region_edit_name:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const regionId = parseInt(ctx.match[1], 10);
        const region = await prisma_1.prisma.region.findUnique({ where: { id: regionId } });
        if (!region)
            return;
        exports.pricingState.set(ctx.from.id, { flow: 'region_edit_name', regionId, regionCode: region.code });
        await ctx.reply(`Введите новое название для ${region.code} (сейчас: ${region.name}):`);
    });
    bot.action(/^pricing:region_edit_flag:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const regionId = parseInt(ctx.match[1], 10);
        const region = await prisma_1.prisma.region.findUnique({ where: { id: regionId } });
        if (!region)
            return;
        exports.pricingState.set(ctx.from.id, { flow: 'region_edit_flag', regionId, regionCode: region.code });
        await ctx.reply(`Введите новый флаг для ${region.code} (сейчас: ${region.flag}):`);
    });
    bot.action(/^pricing:region_edit_cur:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const regionId = parseInt(ctx.match[1], 10);
        const region = await prisma_1.prisma.region.findUnique({ where: { id: regionId } });
        if (!region)
            return;
        exports.pricingState.set(ctx.from.id, { flow: 'region_edit_currency', regionId, regionCode: region.code });
        await ctx.reply(`Введите новый код валюты для ${region.code} (сейчас: ${region.currency}, например JPY, AED):`);
    });
    bot.action(/^pricing:region_del:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const regionId = parseInt(ctx.match[1], 10);
        const region = await prisma_1.prisma.region.findUnique({ where: { id: regionId } });
        if (!region) {
            await ctx.reply('❌ Регион не найден.');
            return;
        }
        // Count variants with this region
        const variants = await prisma_1.prisma.productVariant.findMany({
            where: { attributes: { path: ['Регион'], equals: region.code } },
            select: { id: true },
        });
        const count = variants.length;
        const warning = count > 0
            ? `⚠️ Регион ${region.code} используется в ${count} вариантах товаров.\nУдалить регион и очистить его у всех вариантов?`
            : `Удалить регион ${region.flag} ${region.code} — ${region.name}?`;
        await ctx.reply(warning, telegraf_1.Markup.inlineKeyboard([
            [
                telegraf_1.Markup.button.callback('✅ Да, удалить', `pricing:region_del_ok:${regionId}`),
                telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:regions'),
            ],
        ]));
    });
    bot.action(/^pricing:region_del_ok:(\d+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery('⏳ Удаляю…');
        }
        catch { }
        const regionId = parseInt(ctx.match[1], 10);
        const region = await prisma_1.prisma.region.findUnique({ where: { id: regionId } });
        if (!region)
            return;
        // Clear this region from all variants
        const variants = await prisma_1.prisma.productVariant.findMany({
            where: { attributes: { path: ['Регион'], equals: region.code } },
        });
        for (const v of variants) {
            const attrs = { ...v.attributes };
            delete attrs['Регион'];
            await prisma_1.prisma.productVariant.update({ where: { id: v.id }, data: { attributes: attrs } });
        }
        await prisma_1.prisma.region.delete({ where: { id: regionId } });
        await ctx.reply(`✅ Регион ${region.code} удалён. Очищено вариантов: ${variants.length}`);
        await showRegionsMenu(ctx);
    });
    // ── Курсы валют ──────────────────────────────────────────────────────────────
    bot.action('pricing:rates', async (ctx) => {
        try {
            await ctx.answerCbQuery('⏳ Загрузка...');
        }
        catch { }
        await showRatesMenu(ctx);
    });
    // Из уведомления о курсах → корректировка
    bot.action('pricing:cadj_from_notify', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        const userId = ctx.from.id;
        if (!exports.lastCurrencyChanges.length) {
            await ctx.reply('Нет данных об изменениях курсов. Нажмите «🔄 Обновить курсы сейчас».', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('💰 Меню цен', 'pricing:menu')]]));
            return;
        }
        await showCurrencyAdjustSelect(ctx, userId, exports.lastCurrencyChanges);
    });
    bot.action('pricing:rates_cbr', async (ctx) => {
        try {
            await ctx.answerCbQuery('⏳ Загружаю…');
        }
        catch { }
        await ctx.reply('⏳ Получаю курсы с ЦБ РФ…');
        try {
            const changes = await (0, currency_1.updateCurrencyRates)();
            const lines = [`✅ Обновлено: ${changes.length}\n`];
            for (const c of changes) {
                const pctStr = formatChangePercent(c.changePercent, c.direction);
                lines.push(`${c.flag} ${c.currency}: ${c.previousRate.toFixed(2)}₽ → ${c.newRate.toFixed(2)}₽ ${directionEmoji(c.direction)} ${pctStr}`);
            }
            await ctx.reply(lines.join('\n'), telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 К курсам', 'pricing:rates')]]));
        }
        catch {
            await ctx.reply('❌ Ошибка при получении курсов ЦБ РФ.');
        }
    });
    bot.action('pricing:rate_add', async (ctx) => {
        try {
            await ctx.answerCbQuery();
        }
        catch { }
        exports.pricingState.set(ctx.from.id, { flow: 'rate_add_code' });
        await ctx.reply('Введите код валюты (например JPY, AED, THB):', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:rates')]]));
    });
}
// ─── Обработчик текстовых сообщений ──────────────────────────────────────────
async function handlePricingMessage(ctx, userId, text) {
    const state = exports.pricingState.get(userId);
    if (!state)
        return false;
    // Ввод курса валюты
    if (state.flow === 'awaiting_rate') {
        const rate = parseFloat(text.replace(',', '.'));
        if (isNaN(rate) || rate <= 0) {
            await ctx.reply('Введите положительное число (например: 11.50):');
            return true;
        }
        exports.pricingState.set(userId, { flow: 'awaiting_currency', rate });
        const currencies = await (0, currency_1.getActiveCurrencies)();
        const curButtons = currencies.map((c) => telegraf_1.Markup.button.callback(`${currency_1.CURRENCY_FLAGS[c] ?? ''} ${c}`, `pricing:rate_cur:${c}`));
        const curRows = [];
        for (let i = 0; i < curButtons.length; i += 4)
            curRows.push(curButtons.slice(i, i + 4));
        curRows.push([telegraf_1.Markup.button.callback('🌍 Все регионы (без фильтра)', 'pricing:rate_cur_all')]);
        curRows.push([telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]);
        await ctx.reply(`💱 Курс: ${rate}\n\nВыберите валюту для автофильтра по региону:`, telegraf_1.Markup.inlineKeyboard(curRows));
        return true;
    }
    // Парсинг сообщения поставщика (AI)
    if (state.flow === 'awaiting_message') {
        const indicator = await ctx.reply('🤖 AI анализирует сообщение…');
        let parsed;
        try {
            const aiResults = await (0, ai_parser_1.parseSupplierMessage)(text);
            if (!aiResults.length) {
                await ctx.reply('❌ AI не смог распознать товары в этом сообщении. Проверьте формат.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
                return true;
            }
            parsed = aiResults.map((r) => ({
                model: r.model,
                storage: r.storage ?? undefined,
                color: r.color ?? undefined,
                region: r.region ?? undefined,
                price: r.price,
                rawLine: r.rawLine,
            }));
        }
        catch {
            await ctx.reply('❌ Ошибка AI парсинга. Попробуйте ещё раз.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
            return true;
        }
        void indicator; // indicator already sent, no need to delete in Telegram bot API
        await ctx.reply(`⏳ AI нашёл позиций: ${parsed.length}. Ищу совпадения…`);
        const { matched, unmatched } = await matchVariants(parsed);
        const total = matched.length + unmatched.length;
        const lines = [`📊 Распознано: ${total}\n`];
        for (const m of matched) {
            const region = m.parsed.region ? ` 🌍${m.parsed.region}` : '';
            const effective = state.rate ? Math.round(m.supplierPrice * state.rate) : m.supplierPrice;
            lines.push(`✅ ${m.productName}${region}`, `   Текущая: ${fmtPrice(m.currentPrice)} → Поставщик: ${fmtPrice(effective)}`);
        }
        for (const u of unmatched)
            lines.push(`❓ ${u.rawLine.slice(0, 60)} — не найден`);
        if (!matched.length) {
            await ctx.reply(lines.join('\n') + '\n\n❌ Ни один вариант не найден.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:menu')]]));
            return true;
        }
        exports.pricingState.set(userId, { flow: 'awaiting_markup', matches: matched, unmatched, rate: state.rate, currency: state.currency });
        await ctx.reply(lines.join('\n') + `\n\nВведите наценку % (например: 5) или /skip — без наценки:`, telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
        return true;
    }
    // Ввод наценки (из сообщения)
    if (state.flow === 'awaiting_markup') {
        let markup = null;
        if (text.trim() !== '/skip') {
            const val = parseFloat(text.replace(',', '.'));
            if (isNaN(val) || val < 0 || val > 300) {
                await ctx.reply('Введите число 0–300 или /skip:');
                return true;
            }
            markup = val;
        }
        const allPending = buildPendingFromMatches(state.matches, markup, state.rate ?? null);
        const currency = state.currency;
        let pendingVariants = allPending;
        let autoFilter;
        if (currency) {
            const regionCurrencyMap = await (0, currency_1.getRegionCurrencyMap)();
            const filtered = allPending.filter((v) => {
                const region = v.region ?? (v.attrs.match(/Регион:\s*(\w+)/)?.[1]);
                return region ? regionCurrencyMap[region] === currency : false;
            });
            if (filtered.length > 0 && filtered.length < allPending.length) {
                pendingVariants = filtered;
                autoFilter = currency;
            }
        }
        const rateLabel = state.rate ? `курс ${state.rate}` : '';
        const markupLabel = markup !== null ? `наценка ${markup}%` : '';
        const label = [rateLabel, markupLabel].filter(Boolean).join(', ') || 'цены поставщика';
        exports.pricingState.set(userId, {
            flow: 'preview',
            source: 'message',
            markup,
            label,
            pendingVariants,
            excludedVariantIds: [],
            autoFilter,
            allPendingVariants: autoFilter ? allPending : undefined,
        });
        await showPreview(ctx, userId);
        return true;
    }
    // Ввод % для массовой наценки
    if (state.flow === 'bulk_pct') {
        const val = parseFloat(text.replace(',', '.'));
        if (isNaN(val) || val <= 0 || val > 300) {
            await ctx.reply('Введите процент от 0.1 до 300:');
            return true;
        }
        await ctx.reply('⏳ Считаю…');
        const where = state.filterType === 'all'
            ? {}
            : { product: { category: { name: state.filterValue } } };
        const variants = await prisma_1.prisma.productVariant.findMany({
            where,
            include: { product: true },
        });
        const pending = variants.map((v) => {
            const attrs = v.attributes;
            const attrsStr = Object.entries(attrs).map(([k, val]) => `${k}: ${val}`).join(', ');
            const oldPrice = Number(v.price);
            return {
                variantId: v.id,
                productId: v.productId,
                productName: v.product.name,
                brand: v.product.brand ?? undefined,
                categoryId: v.product.categoryId ?? undefined,
                variantSku: v.sku,
                attrs: attrsStr,
                currentPrice: oldPrice,
                newPrice: (0, currency_1.roundPrice)(oldPrice * (1 + val / 100)),
                region: detectRegion(v.product.name, attrs),
            };
        }).filter((v) => v.newPrice !== v.currentPrice);
        exports.pricingState.set(userId, {
            flow: 'preview',
            source: 'markup',
            markup: val,
            label: `${state.filterLabel}, наценка ${val}%`,
            pendingVariants: pending,
            excludedVariantIds: [],
        });
        await showPreview(ctx, userId);
        return true;
    }
    // Ввод цены для одного варианта (точечно)
    if (state.flow === 'manual_price_input') {
        const val = parseFloat(text.replace(/\s/g, '').replace(',', '.'));
        if (isNaN(val) || val <= 0) {
            await ctx.reply('Введите положительное число:');
            return true;
        }
        const newPrice = (0, currency_1.roundPrice)(val);
        const pending = [{
                variantId: state.variantId,
                productId: 0,
                productName: state.productName,
                variantSku: state.variantSku,
                attrs: state.attrs,
                currentPrice: state.currentPrice,
                newPrice,
            }];
        exports.pricingState.set(userId, {
            flow: 'preview',
            source: 'manual',
            markup: null,
            label: 'точечное изменение',
            pendingVariants: pending,
            excludedVariantIds: [],
        });
        await showPreview(ctx, userId);
        return true;
    }
    // Ввод цены для всех вариантов товара (точечно)
    if (state.flow === 'manual_all_price') {
        const val = parseFloat(text.replace(/\s/g, '').replace(',', '.'));
        if (isNaN(val) || val <= 0) {
            await ctx.reply('Введите положительное число:');
            return true;
        }
        const newPrice = (0, currency_1.roundPrice)(val);
        const variants = await prisma_1.prisma.productVariant.findMany({
            where: { productId: state.productId },
            include: { product: true },
        });
        const pending = variants.map((v) => {
            const attrs = Object.values(v.attributes).join(', ');
            return {
                variantId: v.id, productId: v.productId, productName: v.product.name,
                variantSku: v.sku, attrs, currentPrice: Number(v.price), newPrice,
            };
        });
        exports.pricingState.set(userId, {
            flow: 'preview',
            source: 'manual',
            markup: null,
            label: `${state.productName} — все варианты`,
            pendingVariants: pending,
            excludedVariantIds: [],
        });
        await showPreview(ctx, userId);
        return true;
    }
    // Ввод произвольного текста с курсами (AI парсинг)
    if (state.flow === 'awaiting_currencies') {
        // Специальная команда: получить с ЦБ РФ
        if (text.trim() === '/cbr') {
            await ctx.reply('⏳ Получаю курсы с ЦБ РФ…');
            try {
                const rates = await (0, currency_1.fetchCurrencyRates)();
                const activeCurrencies = await (0, currency_1.getActiveCurrencies)();
                const parsed = activeCurrencies
                    .filter((c) => rates[c])
                    .map((c) => ({ currency: c, rate: rates[c], rawLine: `ЦБ РФ: ${c}` }));
                exports.pricingState.set(userId, { flow: 'confirm_currencies', parsed });
                const lines = ['💱 Курсы с ЦБ РФ:\n'];
                for (const r of parsed)
                    lines.push(`${currency_1.CURRENCY_FLAGS[r.currency] ?? ''} ${r.currency}: ${r.rate.toFixed(2)}₽`);
                lines.push('\nСохранить эти курсы?');
                await ctx.reply(lines.join('\n'), telegraf_1.Markup.inlineKeyboard([
                    [telegraf_1.Markup.button.callback('✅ Сохранить', 'pricing:save_rates'), telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')],
                ]));
            }
            catch {
                await ctx.reply('❌ Не удалось получить курсы с ЦБ РФ. Попробуйте позже.');
            }
            return true;
        }
        await ctx.reply('🤖 AI анализирует курсы…');
        let parsed;
        try {
            parsed = await (0, ai_parser_1.parseCurrencyRates)(text);
            if (!parsed.length) {
                await ctx.reply('❌ AI не смог распознать курсы валют. Попробуйте другой формат.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
                return true;
            }
        }
        catch {
            await ctx.reply('❌ Ошибка AI парсинга. Попробуйте ещё раз.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')]]));
            return true;
        }
        exports.pricingState.set(userId, { flow: 'confirm_currencies', parsed });
        const lines = ['🤖 AI распознал курсы:\n'];
        for (const r of parsed) {
            const flag = currency_1.CURRENCY_FLAGS[r.currency] ?? '';
            lines.push(`${flag} ${r.currency}: ${r.rate.toFixed(2)}₽`);
        }
        lines.push('\nСохранить эти курсы?');
        await ctx.reply(lines.join('\n'), telegraf_1.Markup.inlineKeyboard([
            [
                telegraf_1.Markup.button.callback('✅ Сохранить', 'pricing:save_rates'),
                telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel'),
            ],
        ]));
        return true;
    }
    // Добавление региона — шаг 1: код
    if (state.flow === 'region_add_code') {
        const code = text.trim().toUpperCase();
        if (!/^[A-Z]{2,4}$/.test(code)) {
            await ctx.reply('Код должен содержать 2–4 латинских буквы (например US, JP, AE):');
            return true;
        }
        const exists = await prisma_1.prisma.region.findUnique({ where: { code } });
        if (exists) {
            await ctx.reply(`❌ Регион с кодом ${code} уже существует.`);
            return true;
        }
        exports.pricingState.set(userId, { flow: 'region_add_name', code });
        await ctx.reply(`Шаг 2 из 4 — введите название (например: Japan, UAE):`);
        return true;
    }
    // Добавление региона — шаг 2: название
    if (state.flow === 'region_add_name') {
        const name = text.trim();
        if (!name || name.length > 50) {
            await ctx.reply('Введите название (до 50 символов):');
            return true;
        }
        exports.pricingState.set(userId, { flow: 'region_add_flag', code: state.code, name });
        await ctx.reply(`Шаг 3 из 4 — введите флаг-эмодзи (например 🇺🇸, 🇯🇵):`);
        return true;
    }
    // Добавление региона — шаг 3: флаг
    if (state.flow === 'region_add_flag') {
        const flag = text.trim();
        if (!flag) {
            await ctx.reply('Введите флаг-эмодзи:');
            return true;
        }
        exports.pricingState.set(userId, { flow: 'region_add_currency', code: state.code, name: state.name, flag });
        await ctx.reply(`Шаг 4 из 4 — введите код валюты (например JPY, AED, THB):`);
        return true;
    }
    // Добавление региона — шаг 4: валюта
    if (state.flow === 'region_add_currency') {
        const currency = text.trim().toUpperCase();
        if (!/^[A-Z]{3,4}$/.test(currency)) {
            await ctx.reply('Код валюты должен быть 3–4 буквы (например JPY, AED):');
            return true;
        }
        exports.pricingState.delete(userId);
        await prisma_1.prisma.region.create({
            data: { code: state.code, name: state.name, flag: state.flag, currency },
        });
        await ctx.reply(`✅ Регион ${state.flag} ${state.code} (${state.name}, ${currency}) добавлен!`);
        await showRegionsMenu(ctx);
        return true;
    }
    // Редактирование региона — название
    if (state.flow === 'region_edit_name') {
        const name = text.trim();
        if (!name || name.length > 50) {
            await ctx.reply('Введите название (до 50 символов):');
            return true;
        }
        exports.pricingState.delete(userId);
        await prisma_1.prisma.region.update({ where: { id: state.regionId }, data: { name } });
        await ctx.reply(`✅ Название региона ${state.regionCode} изменено на «${name}»`);
        await showRegionsMenu(ctx);
        return true;
    }
    // Редактирование региона — флаг
    if (state.flow === 'region_edit_flag') {
        const flag = text.trim();
        if (!flag) {
            await ctx.reply('Введите флаг-эмодзи:');
            return true;
        }
        exports.pricingState.delete(userId);
        await prisma_1.prisma.region.update({ where: { id: state.regionId }, data: { flag } });
        await ctx.reply(`✅ Флаг региона ${state.regionCode} изменён на ${flag}`);
        await showRegionsMenu(ctx);
        return true;
    }
    // Редактирование региона — валюта
    if (state.flow === 'region_edit_currency') {
        const currency = text.trim().toUpperCase();
        if (!/^[A-Z]{3,4}$/.test(currency)) {
            await ctx.reply('Код валюты должен быть 3–4 буквы (например JPY, AED):');
            return true;
        }
        exports.pricingState.delete(userId);
        await prisma_1.prisma.region.update({ where: { id: state.regionId }, data: { currency } });
        await ctx.reply(`✅ Валюта региона ${state.regionCode} изменена на ${currency}`);
        await showRegionsMenu(ctx);
        return true;
    }
    // Добавление курса вручную — шаг 1: код валюты
    if (state.flow === 'rate_add_code') {
        const currency = text.trim().toUpperCase();
        if (!/^[A-Z]{3,4}$/.test(currency)) {
            await ctx.reply('Введите корректный код валюты (3–4 буквы, например JPY, AED):');
            return true;
        }
        exports.pricingState.set(userId, { flow: 'rate_add_value', currency });
        await ctx.reply(`Введите курс ${currency} к рублю (рублей за 1 единицу валюты):`);
        return true;
    }
    // Добавление курса вручную — шаг 2: значение
    if (state.flow === 'rate_add_value') {
        const rate = parseFloat(text.replace(',', '.'));
        if (isNaN(rate) || rate <= 0) {
            await ctx.reply('Введите положительное число (например: 11.90):');
            return true;
        }
        exports.pricingState.delete(userId);
        const existing = await prisma_1.prisma.currencyRate.findUnique({ where: { currency: state.currency } });
        await prisma_1.prisma.currencyRate.upsert({
            where: { currency: state.currency },
            create: { currency: state.currency, rate, previousRate: null },
            update: { previousRate: existing ? existing.rate : null, rate },
        });
        await ctx.reply(`✅ Курс ${state.currency}: ${rate.toFixed(2)}₽ сохранён`);
        await showRatesMenu(ctx);
        return true;
    }
    // Ввод % для корректировки одного региона
    if (state.flow === 'cadj_region_input_pct') {
        const pct = parseFloat(text.replace(',', '.'));
        if (isNaN(pct) || pct < -100 || pct > 500) {
            await ctx.reply('Введите процент (например: 2.5 или -1.3):');
            return true;
        }
        const { region, currency, changes } = state;
        const regionMap = await (0, currency_1.getRegionCurrencyMap)();
        const flag = Object.entries(exports.REGION_FLAGS).find(([, c]) => c === region)?.[0] ?? '';
        const sign = pct >= 0 ? '+' : '';
        exports.pricingState.set(userId, { flow: 'cadj_region_confirm', changes, region, currency, pct });
        await ctx.reply(`${flag} ${region} — применить ${sign}${pct}%?`, telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback(`✅ Применить ${sign}${pct}%`, 'pricing:cadj_region_apply')],
            [telegraf_1.Markup.button.callback('✏️ Изменить процент', 'pricing:cadj_region_edit_pct')],
            [telegraf_1.Markup.button.callback('❌ Отмена', 'pricing:cancel')],
        ]));
        return true;
    }
    // Ввод % для "весь сток" — конкретного региона
    if (state.flow === 'cadj_all_input_pct') {
        const pct = parseFloat(text.replace(',', '.'));
        if (isNaN(pct) || pct < -100 || pct > 500) {
            await ctx.reply('Введите процент (например: 2.5 или -1.3):');
            return true;
        }
        const newOverrides = { ...state.overrides, [state.editRegion]: pct };
        exports.pricingState.set(userId, { flow: 'cadj_all_review', changes: state.changes, overrides: newOverrides });
        await showCadjAllReview(ctx, userId);
        return true;
    }
    // Ввод % в ручном флоу
    if (state.flow === 'cadj_manual_input_pct') {
        const pct = parseFloat(text.replace(',', '.'));
        if (isNaN(pct) || pct < -100 || pct > 500) {
            await ctx.reply('Введите процент (например: 2.5 или -1.3):');
            return true;
        }
        await processCadjManualPct(ctx, userId, pct);
        return true;
    }
    return false;
}
// ─── Обработчик документов (xlsx прайс-лист) ─────────────────────────────────
async function handlePricingDocument(ctx, userId) {
    const state = exports.pricingState.get(userId);
    if (!state || state.flow !== 'awaiting_file')
        return false;
    const doc = ctx.message?.document;
    if (!doc)
        return false;
    await ctx.reply('⏳ Обрабатываю файл…');
    try {
        const buffer = await downloadTelegramFile(ctx, doc.file_id);
        const updates = await parsePriceListXlsx(buffer);
        if (!updates.length) {
            await ctx.reply('❌ В файле нет строк с заполненной колонкой «Новая цена» (F).', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:file')]]));
            return true;
        }
        const pending = [];
        const notFound = [];
        for (const { sku, newPrice, comment } of updates) {
            const variant = await prisma_1.prisma.productVariant.findUnique({
                where: { sku },
                include: { product: true },
            });
            if (!variant) {
                notFound.push(sku);
                continue;
            }
            const attrs = variant.attributes;
            const regionCode = attrs['Регион'];
            pending.push({
                variantId: variant.id,
                productId: variant.productId,
                productName: variant.product.name,
                brand: variant.product.brand ?? undefined,
                categoryId: variant.product.categoryId ?? undefined,
                variantSku: variant.sku,
                attrs: Object.entries(attrs).filter(([k]) => k !== 'Регион').map(([k, v]) => `${k}: ${v}`).join(', '),
                currentPrice: Number(variant.price),
                newPrice,
                region: regionCode ?? detectRegion(variant.product.name, attrs),
                comment: comment || undefined,
            });
        }
        if (!pending.length) {
            await ctx.reply('❌ Ни один SKU из файла не найден в каталоге.', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('🔙 Назад', 'pricing:file')]]));
            return true;
        }
        // Формируем сообщение предпросмотра
        const previewLines = ['📊 Предпросмотр изменений из файла:\n'];
        for (const v of pending.slice(0, 12)) {
            const regionFlag = v.region ? (Object.entries(exports.REGION_FLAGS).find(([, c]) => c === v.region)?.[0] ?? '') : '';
            const attrsStr = v.attrs ? ` (${v.attrs})` : '';
            previewLines.push(`${v.productName}${attrsStr}${regionFlag ? ' ' + regionFlag : ''}: ${fmtPrice(v.currentPrice)} → ${fmtPrice(v.newPrice)} ₽`);
        }
        if (pending.length > 12)
            previewLines.push(`… и ещё ${pending.length - 12}`);
        previewLines.push(`\nВсего: ${pending.length} вариантов`);
        if (notFound.length)
            previewLines.push(`❌ Не найдено SKU: ${notFound.slice(0, 5).join(', ')}${notFound.length > 5 ? ` и ещё ${notFound.length - 5}` : ''}`);
        exports.pricingState.set(userId, {
            flow: 'preview', source: 'file', markup: null,
            label: 'из файла Excel',
            pendingVariants: pending, excludedVariantIds: [],
        });
        await ctx.reply(previewLines.join('\n'));
        await showPreview(ctx, userId);
    }
    catch (err) {
        console.error('handlePricingDocument error:', err);
        await ctx.reply('❌ Ошибка при обработке файла. Убедитесь, что загружаете xlsx прайс-лист.');
    }
    return true;
}
async function sendDailyCurrencyRates(sendFn) {
    try {
        const changes = await (0, currency_1.updateCurrencyRates)();
        if (!changes.length)
            return null;
        const now = new Date();
        const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
        const lines = [`💱 Курсы валют обновлены (${dateStr}, ${timeStr})\n`];
        for (const c of changes) {
            const pctStr = formatChangePercent(c.changePercent, c.direction);
            lines.push(`${c.flag} ${c.currency}: ${c.previousRate.toFixed(2)}₽ → ${c.newRate.toFixed(2)}₽ ${directionEmoji(c.direction)} ${pctStr}`);
        }
        lines.push('\nХотите скорректировать цены товаров?');
        await sendFn(lines.join('\n'), telegraf_1.Markup.inlineKeyboard([
            [
                telegraf_1.Markup.button.callback('📊 Скорректировать цены', 'pricing:cadj_from_notify'),
                telegraf_1.Markup.button.callback('❌ Пропустить', 'back:main'),
            ],
        ]));
        return { changes };
    }
    catch {
        await sendFn('❌ Не удалось получить курсы валют с ЦБ РФ', telegraf_1.Markup.inlineKeyboard([[telegraf_1.Markup.button.callback('💰 Меню цен', 'pricing:menu')]]));
        return null;
    }
}
// Глобальное хранилище последних изменений курсов (для notify → adjust флоу)
exports.lastCurrencyChanges = [];
//# sourceMappingURL=pricing.js.map