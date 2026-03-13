"use strict";
/**
 * api/server.ts
 *
 * Express HTTP-сервер:
 *   GET  /shop                    — раздаёт webapp/index.html (Telegram Mini App)
 *   GET  /api/products            — список товаров из БД (фильтр ?category=...)
 *   POST /api/orders              — создание заказа в БД (требует Telegram auth)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fmtPrice = fmtPrice;
exports.startApiServer = startApiServer;
require("dotenv/config");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const exceljs_1 = __importDefault(require("exceljs"));
const prisma_1 = require("../lib/prisma");
const stock_1 = require("../lib/stock");
const security_log_1 = require("../lib/security-log");
const api_key_store_1 = require("../lib/api-key-store");
if (!process.env.BOT_TOKEN)
    throw new Error('BOT_TOKEN is required');
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = Number(process.env.PORT || process.env.API_PORT || 3000);
const WEBAPP_PATH = path_1.default.join(__dirname, '../../webapp/index.html');
// ─── Хелпер: форматируем цену ─────────────────────────────────────────────────
function fmtPrice(amount) {
    return amount.toLocaleString('ru-RU');
}
// ─── Валидация подписи Telegram WebApp ────────────────────────────────────────
function validateTelegramWebApp(initData) {
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash)
            return { valid: false };
        params.delete('hash');
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');
        const secretKey = crypto_1.default
            .createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
        const expectedHash = crypto_1.default
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');
        const expected = Buffer.from(expectedHash, 'hex');
        const received = Buffer.from(hash, 'hex');
        if (expected.length !== received.length || !crypto_1.default.timingSafeEqual(expected, received))
            return { valid: false };
        const user = JSON.parse(params.get('user') || '{}');
        return { valid: true, userId: user.id };
    }
    catch {
        return { valid: false };
    }
}
// ─── Middleware: Telegram Auth ─────────────────────────────────────────────────
function requireTelegramAuth(req, res, next) {
    const initData = req.headers['x-telegram-init-data'];
    if (!initData) {
        res.status(401).json({ error: 'Требуется авторизация Telegram' });
        return;
    }
    const { valid, userId } = validateTelegramWebApp(initData);
    if (!valid) {
        (0, security_log_1.logSecurityEvent)('invalid_telegram_signature', {
            ip: req.ip,
            initDataLength: initData.length,
            hasHash: initData.includes('hash='),
            fields: [...new URLSearchParams(initData).keys()],
        });
        res.status(401).json({ error: 'Неверная подпись Telegram' });
        return;
    }
    ;
    req.telegramUserId = userId;
    next();
}
// ─── Запуск сервера ───────────────────────────────────────────────────────────
function startApiServer(bot) {
    const app = (0, express_1.default)();
    app.set('trust proxy', 1);
    // ── Telegram webhook (production, before body parsers) ─────────────────────
    if (bot) {
        app.post('/webhook/telegram', bot.webhookCallback('/webhook/telegram', { secretToken: process.env.WEBHOOK_SECRET }));
    }
    // ── Helmet (безопасные заголовки) ──────────────────────────────────────────
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "https://telegram.org", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                fontSrc: ["'self'", "data:"],
                frameSrc: ["'self'", "https://telegram.org"],
                imgSrc: ["'self'", "data:", "https:"],
            },
        },
    }));
    // ── CORS ─────────────────────────────────────────────────────────────────────
    const allowedOrigins = [
        'https://bendershop.store',
        'https://web.telegram.org',
    ];
    app.use((0, cors_1.default)({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            }
            else if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost')) {
                callback(null, true);
            }
            else {
                console.warn('[API] CORS blocked:', origin);
                callback(new Error('CORS: недопустимый источник'));
            }
        },
        credentials: true,
    }));
    // ── Rate limiting ──────────────────────────────────────────────────────────
    const globalLimiter = (0, express_rate_limit_1.default)({
        windowMs: 60 * 1000,
        max: 100,
        message: { error: 'Слишком много запросов. Подождите минуту.' },
    });
    app.use(globalLimiter);
    const orderLimiter = (0, express_rate_limit_1.default)({
        windowMs: 60 * 1000,
        max: 10,
        message: { error: 'Слишком много заказов. Подождите минуту.' },
    });
    app.use('/api/orders', orderLimiter);
    const photoLimiter = (0, express_rate_limit_1.default)({
        windowMs: 60 * 1000,
        max: 60,
    });
    app.use('/api/banner', photoLimiter);
    const downloadLimiter = (0, express_rate_limit_1.default)({
        windowMs: 60 * 1000,
        max: 5,
        message: { error: 'Слишком много запросов на скачивание. Подождите минуту.' },
    });
    // ── Таймаут для долгих запросов ───────────────────────────────────────────
    app.use((_req, res, next) => {
        res.setTimeout(10000, () => {
            res.status(503).json({ error: 'Сервер не отвечает. Попробуйте позже.' });
        });
        next();
    });
    app.use(express_1.default.json({ limit: '1mb' }));
    // ── GET / и /shop — Mini App ───────────────────────────────────────────────
    app.get('/', (_req, res) => {
        res.redirect('/shop');
    });
    app.get('/shop', (_req, res) => {
        const html = fs_1.default.readFileSync(WEBAPP_PATH);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    });
    // ── GET /health ────────────────────────────────────────────────────────────
    app.get('/health', async (_req, res) => {
        let dbOk = false;
        try {
            await prisma_1.prisma.$queryRaw `SELECT 1`;
            dbOk = true;
        }
        catch { }
        const botOk = bot !== undefined;
        const status = dbOk && botOk ? 'ok' : 'error';
        const code = status === 'ok' ? 200 : 503;
        res.status(code).json({
            status,
            db: dbOk ? 'ok' : 'error',
            bot: botOk ? 'ok' : 'error',
            uptime: Math.floor(process.uptime()),
            version: process.env.npm_package_version ?? '0.0.0',
            timestamp: new Date().toISOString(),
        });
    });
    // ── GET /api/products ──────────────────────────────────────────────────────
    app.get('/api/products', async (req, res) => {
        // Санитизация параметров фильтрации
        const sanitize = (val) => String(val || '')
            .replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s\-_]/g, '')
            .slice(0, 50) || undefined;
        const category = sanitize(req.query.category);
        const brand = sanitize(req.query.brand);
        const products = await prisma_1.prisma.product.findMany({
            where: {
                isAvailable: true,
                ...(category ? { category: { name: category } } : {}),
                ...(brand ? { brand } : {}),
            },
            select: {
                id: true,
                sku: true,
                name: true,
                description: true,
                price: true,
                quantity: true,
                categoryId: true,
                photoUrl: true,
                photos: true,
                badge: true,
                brand: true,
                attributes: true,
                specs: true,
                category: { select: { id: true, name: true } },
                variants: {
                    where: { inStock: true },
                    select: {
                        id: true,
                        sku: true,
                        price: true,
                        quantity: true,
                        attributes: true,
                        photos: true,
                        inStock: true,
                    },
                },
            },
            orderBy: { name: 'asc' },
        });
        const payload = products.map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            description: p.description ?? '',
            price: p.price.toString(),
            category: p.category?.name ?? '',
            categoryId: p.categoryId ?? null,
            photoUrl: p.photoUrl ?? '',
            photos: p.photos,
            quantity: p.quantity,
            badge: p.badge ?? null,
            brand: p.brand ?? null,
            attributes: p.attributes ?? null,
            specs: p.specs ?? null,
            variants: p.variants.map((v) => ({
                id: v.id,
                sku: v.sku,
                price: v.price.toString(),
                quantity: v.quantity,
                inStock: v.inStock,
                attributes: v.attributes,
                photos: v.photos,
            })),
        }));
        res.json(payload);
    });
    // ── GET /api/categories ────────────────────────────────────────────────────
    app.get('/api/categories', async (_req, res) => {
        const categories = await prisma_1.prisma.category.findMany({
            include: { _count: { select: { products: true } } },
            orderBy: { name: 'asc' },
        });
        const payload = categories.map((c) => ({
            id: c.id,
            name: c.name,
            textSide: c.textSide,
            productCount: c._count.products,
            imageUrl: c.imageFile ? `/api/banner/${c.imageFile}` : null,
        }));
        res.json(payload);
    });
    // ── GET /api/brands ────────────────────────────────────────────────────────
    app.get('/api/brands', async (_req, res) => {
        const products = await prisma_1.prisma.product.findMany({
            where: { isAvailable: true },
            select: { name: true, brand: true },
        });
        const map = new Map();
        for (const p of products) {
            const b = p.brand?.trim() || p.name.split(' ')[0];
            if (!b)
                continue;
            map.set(b, (map.get(b) ?? 0) + 1);
        }
        const payload = [...map.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
        res.json(payload);
    });
    // ── GET /api/settings ──────────────────────────────────────────────────────
    app.get('/api/settings', requireTelegramAuth, async (req, res) => {
        const key = req.query.key;
        if (!key) {
            res.status(400).json({ error: 'Missing key param' });
            return;
        }
        const value = await (0, api_key_store_1.getApiKeyValue)('setting_' + key);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.json({ value: value ?? '' });
    });
    // ── GET /api/cache-version ─────────────────────────────────────────────────
    app.get('/api/cache-version', async (_req, res) => {
        const cacheVersion = await (0, api_key_store_1.getApiKeyValue)('cache_version');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.json({ version: cacheVersion ?? '0' });
    });
    // ── GET /api/hero-banners ──────────────────────────────────────────────────
    app.get('/api/hero-banners', async (_req, res) => {
        const banners = await prisma_1.prisma.heroBanner.findMany({
            where: { isActive: true },
            orderBy: { order: 'asc' },
        });
        const payload = banners.map((b) => ({
            id: b.id,
            imageUrl: '/api/banner/' + b.imageFile,
            title: b.title ?? null,
            subtitle: b.subtitle ?? null,
            order: b.order,
        }));
        res.json(payload);
    });
    // ── GET /api/banner/:fileId ────────────────────────────────────────────────
    app.get('/api/banner/:fileId', requireTelegramAuth, async (req, res) => {
        const fileId = String(req.params.fileId ?? '');
        const FILE_ID_RE = /^[A-Za-z0-9_\-]{10,200}$/;
        if (!fileId || !FILE_ID_RE.test(fileId)) {
            res.status(400).send('Invalid file id');
            return;
        }
        const banner = await prisma_1.prisma.heroBanner.findFirst({ where: { imageFile: fileId } });
        if (!banner) {
            res.status(404).send('Not found');
            return;
        }
        const filePath = await new Promise((resolve, reject) => {
            const tgUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`;
            https_1.default
                .get(tgUrl, (tgRes) => {
                let data = '';
                tgRes.on('data', (chunk) => (data += chunk));
                tgRes.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (!json.ok)
                            return reject(new Error('Telegram getFile failed'));
                        resolve(json.result.file_path);
                    }
                    catch (e) {
                        reject(e);
                    }
                });
            })
                .on('error', reject);
        });
        const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        await new Promise((resolve, reject) => {
            https_1.default
                .get(downloadUrl, (tgRes) => {
                res.setHeader('Content-Type', 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                tgRes.pipe(res);
                tgRes.on('end', resolve);
                tgRes.on('error', reject);
            })
                .on('error', reject);
        });
    });
    // ── GET /api/download/price-list ───────────────────────────────────────────
    app.get('/api/download/price-list', downloadLimiter, requireTelegramAuth, async (_req, res) => {
        const { generatePriceListBuffer } = await Promise.resolve().then(() => __importStar(require('../bot/admin/pricing')));
        const buffer = await generatePriceListBuffer();
        const dateStr = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="price-list-${dateStr}.xlsx"`);
        res.send(buffer);
    });
    // ── GET /api/download/template ─────────────────────────────────────────────
    app.get('/api/download/template', downloadLimiter, requireTelegramAuth, async (_req, res) => {
        const variants = await prisma_1.prisma.productVariant.findMany({
            include: { product: true },
            orderBy: { id: 'asc' },
        });
        const wb = new exceljs_1.default.Workbook();
        const ws1 = wb.addWorksheet('Оприходование');
        ws1.columns = [
            { key: 'sku', width: 28 },
            { key: 'qty', width: 15 },
            { key: 'comment', width: 30 },
            { key: 'name', width: 35 },
        ];
        const headerFill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1A1A1A' },
        };
        const headerFont = { bold: true, color: { argb: 'FFCCFF00' } };
        const exampleFill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF2A2A2A' },
        };
        const exampleFont = { color: { argb: 'FF888888' } };
        const headerRow = ws1.addRow(['SKU варианта*', 'Количество*', 'Комментарий', 'Название (справочно)']);
        headerRow.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
        });
        const ex1 = variants[0];
        const ex2 = variants[1];
        const exRows = [
            ex1
                ? [
                    ex1.sku,
                    5,
                    'Приход со склада',
                    ex1.product.name +
                        ' — ' +
                        Object.entries(ex1.attributes)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(', '),
                ]
                : ['VARIANT-SKU-001', 5, 'Приход со склада', 'Название товара'],
            ex2
                ? [
                    ex2.sku,
                    -2,
                    'Возврат',
                    ex2.product.name +
                        ' — ' +
                        Object.entries(ex2.attributes)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(', '),
                ]
                : ['VARIANT-SKU-002', -2, 'Возврат', 'Название товара'],
        ];
        for (const rowData of exRows) {
            const row = ws1.addRow(rowData);
            row.eachCell((cell) => {
                cell.fill = exampleFill;
                cell.font = exampleFont;
            });
        }
        ws1.views = [{ state: 'frozen', ySplit: 1 }];
        const ws2 = wb.addWorksheet('Справочник SKU');
        ws2.columns = [
            { key: 'sku', width: 28 },
            { key: 'product', width: 30 },
            { key: 'attrs', width: 35 },
            { key: 'price', width: 15 },
            { key: 'qty', width: 12 },
            { key: 'reserved', width: 18 },
            { key: 'inStock', width: 14 },
        ];
        const refHeader = ws2.addRow(['SKU', 'Товар', 'Атрибуты', 'Цена', 'Остаток', 'Зарезервировано', 'В наличии']);
        refHeader.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
        });
        const rowFills = ['FF1A1A1A', 'FF111111'];
        variants.forEach((v, i) => {
            const attrs = Object.entries(v.attributes)
                .map(([k, val]) => `${k}: ${val}`)
                .join(', ');
            const row = ws2.addRow([
                v.sku,
                v.product.name,
                attrs,
                v.price.toString(),
                v.quantity,
                v.inStock ? 'Да' : 'Нет',
            ]);
            const fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: rowFills[i % 2] },
            };
            row.eachCell((cell) => {
                cell.fill = fill;
            });
        });
        ws2.views = [{ state: 'frozen', ySplit: 1 }];
        const buffer = await wb.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="bender-shop-template.xlsx"');
        res.send(Buffer.from(buffer));
    });
    // ── POST /api/orders ───────────────────────────────────────────────────────
    app.post('/api/orders', requireTelegramAuth, async (req, res) => {
        const { items, paymentMethod, customerName, customerPhone, deliveryType, deliveryAddress, } = req.body;
        const telegramUserId = req.telegramUserId;
        const telegramId = String(telegramUserId);
        // ── Валидация входящих данных ──────────────────────────────────────────
        if (!Array.isArray(items) || items.length === 0) {
            await (0, security_log_1.logSecurityEvent)('invalid_order_data', { ip: req.ip, reason: 'empty items', telegramId }, telegramId);
            res.status(400).json({ error: 'Корзина пуста' });
            return;
        }
        if (!['cash', 'card'].includes(paymentMethod)) {
            res.status(400).json({ error: 'Неверный способ оплаты' });
            return;
        }
        if (!customerName || customerName.trim().length < 2) {
            res.status(400).json({ error: 'Укажите ФИО' });
            return;
        }
        if (!customerPhone || !/^\+?[\d\s\-()\u00d7]{7,15}$/.test(customerPhone)) {
            res.status(400).json({ error: 'Неверный формат телефона' });
            return;
        }
        if (!['pickup', 'delivery'].includes(deliveryType)) {
            res.status(400).json({ error: 'Неверный тип доставки' });
            return;
        }
        if (deliveryType === 'delivery' && (!deliveryAddress || deliveryAddress.trim().length < 5)) {
            res.status(400).json({ error: 'Укажите адрес доставки' });
            return;
        }
        for (const item of items) {
            if (!Number.isInteger(item.variantId) || item.variantId <= 0) {
                await (0, security_log_1.logSecurityEvent)('invalid_order_data', { ip: req.ip, reason: 'invalid variantId', item, telegramId }, telegramId);
                res.status(400).json({ error: 'Неверный ID товара' });
                return;
            }
            if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
                res.status(400).json({ error: 'Неверное количество товара' });
                return;
            }
            // Игнорировать цену от клиента — она будет загружена из БД ниже
        }
        // ── Загрузка актуальных цен из БД, проверка остатков ──────────────────
        let totalAmount = 0;
        const enrichedItems = [];
        for (const item of items) {
            const variant = await prisma_1.prisma.productVariant.findUnique({
                where: { id: item.variantId },
                include: { product: true },
            });
            if (!variant || !variant.inStock || variant.quantity < item.quantity) {
                res.status(409).json({ error: 'Товар закончился или недоступен' });
                return;
            }
            // Цена всегда из БД — никогда от клиента
            const actualPrice = Number(variant.price);
            if (item.price !== undefined && Number(item.price) !== actualPrice) {
                await (0, security_log_1.logSecurityEvent)('price_manipulation_attempt', {
                    ip: req.ip,
                    telegramId,
                    variantId: item.variantId,
                    submittedPrice: item.price,
                    actualPrice,
                }, telegramId);
            }
            totalAmount += actualPrice * item.quantity;
            enrichedItems.push({
                variantId: variant.id,
                name: variant.product.name,
                price: actualPrice.toString(),
                quantity: item.quantity,
            });
        }
        // ── Найти клиента по telegramId ────────────────────────────────────────
        let clientId = null;
        const client = await prisma_1.prisma.client.findUnique({
            where: { source_externalId: { source: 'telegram', externalId: telegramId } },
        });
        clientId = client?.id ?? null;
        // ── Создать заказ ──────────────────────────────────────────────────────
        const order = await prisma_1.prisma.order.create({
            data: {
                clientId,
                telegramId,
                items: { create: enrichedItems.map(i => ({ variantId: i.variantId, quantity: i.quantity, priceAtPurchase: i.price, productName: i.name })) },
                totalAmount: totalAmount.toString(),
                payment: paymentMethod,
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim(),
                deliveryType,
                deliveryAddress: deliveryAddress?.trim() ?? null,
            },
        });
        // ── Списать со склада ──────────────────────────────────────────────────
        for (const item of enrichedItems) {
            await (0, stock_1.stockOut)(item.variantId, item.quantity, `Заказ #${order.id}`, telegramId);
        }
        res.json({ success: true, orderId: order.id });
    });
    // ── Глобальный обработчик ошибок ───────────────────────────────────────────
    app.use((err, _req, res, _next) => {
        console.error('[API] Ошибка:', err);
        res.status(500).json({ error: 'Internal server error' });
    });
    const server = app.listen(PORT, () => {
        console.log(`[API] Сервер запущен: http://localhost:${PORT}/shop`);
    });
    server.on('error', (err) => { console.error('Listen failed:', err); process.exit(1); });
}
//# sourceMappingURL=server.js.map