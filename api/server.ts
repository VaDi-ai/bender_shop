/**
 * api/server.ts
 *
 * Express HTTP-сервер:
 *   GET  /shop                    — раздаёт webapp/index.html (Telegram Mini App)
 *   GET  /api/products            — список товаров из БД (фильтр ?category=...)
 *   POST /api/orders              — создание заказа в БД (требует Telegram auth)
 */

import 'dotenv/config'
import crypto from 'crypto'
import fs from 'fs'
import https from 'https'
import path from 'path'
import express, { Request, Response, NextFunction } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import ExcelJS from 'exceljs'
import type { Telegraf } from 'telegraf'
import { prisma } from '../lib/prisma'
import { logSecurityEvent } from '../lib/security-log'
import { getApiKeyValue } from '../lib/api-key-store'
import { handleInstagramVerification } from '../webhooks/instagram'

if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN is required')
const BOT_TOKEN = process.env.BOT_TOKEN
const PORT = Number(process.env.PORT || process.env.API_PORT || 3000)
const WEBAPP_PATH = path.join(__dirname, '../../webapp/index.html')

// ─── Хелпер: форматируем цену ─────────────────────────────────────────────────

export function fmtPrice(amount: number): string {
  return amount.toLocaleString('ru-RU')
}

// ─── Валидация подписи Telegram WebApp ────────────────────────────────────────

function validateTelegramWebApp(initData: string): { valid: boolean; userId?: number } {
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return { valid: false }
    params.delete('hash')

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest()

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex')

    const expected = Buffer.from(expectedHash, 'hex')
    const received = Buffer.from(hash, 'hex')
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received))
      return { valid: false }

    const user = JSON.parse(params.get('user') || '{}')
    return { valid: true, userId: user.id }
  } catch {
    return { valid: false }
  }
}

// ─── Middleware: Telegram Auth ─────────────────────────────────────────────────

function requireTelegramAuth(req: Request, res: Response, next: NextFunction): void {
  const initData = req.headers['x-telegram-init-data'] as string
  if (!initData) {
    res.status(401).json({ error: 'Требуется авторизация Telegram' })
    return
  }
  const { valid, userId } = validateTelegramWebApp(initData)
  if (!valid) {
    logSecurityEvent('invalid_telegram_signature', {
      ip: req.ip,
      initDataLength: initData.length,
      hasHash: initData.includes('hash='),
      fields: [...new URLSearchParams(initData).keys()],
    })
    res.status(401).json({ error: 'Неверная подпись Telegram' })
    return
  }
  ;(req as any).telegramUserId = userId
  next()
}

// ─── Запуск сервера ───────────────────────────────────────────────────────────

export function startApiServer(bot?: Telegraf): void {
  const app = express()
  app.set('trust proxy', 1)

  // Cache webapp/index.html at startup to avoid fs.readFileSync on every request
  let indexHtml: Buffer | null = null
  try {
    indexHtml = fs.readFileSync(WEBAPP_PATH)
  } catch {
    console.warn('[API] webapp/index.html not found at startup:', WEBAPP_PATH)
  }

  // ── Telegram webhook (production, before body parsers) ─────────────────────
  if (bot) {
    app.post('/webhook/telegram', bot.webhookCallback('/webhook/telegram', { secretToken: process.env.WEBHOOK_SECRET }))
  }

  // ── Instagram webhook verification (GET) ──────────────────────────────────
  app.get('/webhook/instagram', handleInstagramVerification)

  // ── Helmet (безопасные заголовки) ──────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://telegram.org", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-hashes'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", "data:"],
        frameSrc: ["'self'", "https://telegram.org"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }))

  // ── CORS ─────────────────────────────────────────────────────────────────────
  const allowedOrigins = [
    'https://bendershop.store',
    'https://web.telegram.org',
  ]
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true)
        } else if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost')) {
          callback(null, true)
        } else {
          console.warn('[API] CORS blocked:', origin)
          callback(new Error('CORS: недопустимый источник'))
        }
      },
      credentials: true,
    })
  )

  // ── Rate limiting ──────────────────────────────────────────────────────────
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Слишком много запросов. Подождите минуту.' },
  })
  app.use(globalLimiter)

  const orderLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Слишком много заказов. Подождите минуту.' },
  })
  app.use('/api/orders', orderLimiter)

  const photoLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
  })
  app.use('/api/banner', photoLimiter)

  const downloadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Слишком много запросов на скачивание. Подождите минуту.' },
  })

  // ── Таймаут для долгих запросов ───────────────────────────────────────────
  app.use((_req, res, next) => {
    res.setTimeout(10_000, () => {
      res.status(503).json({ error: 'Сервер не отвечает. Попробуйте позже.' })
    })
    next()
  })

  app.use(express.json({ limit: '1mb' }))

  // ── GET / и /shop — Mini App ───────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.redirect('/shop')
  })

  app.get('/shop', (_req, res) => {
    if (!indexHtml) {
      res.status(503).send('webapp not available')
      return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(indexHtml)
  })

  // ── GET /health ────────────────────────────────────────────────────────────
  app.get('/health', async (_req, res) => {
    let dbOk = false
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 2000)),
      ])
      dbOk = true
    } catch {}

    const botStatus = bot !== undefined ? 'ok' : 'unavailable'
    const status = dbOk ? 'ok' : 'error'
    const code = dbOk ? 200 : 503

    res.status(code).json({
      status,
      db: dbOk ? 'ok' : 'error',
      bot: botStatus,
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version ?? '0.0.0',
      timestamp: new Date().toISOString(),
    })
  })

  // ── GET /api/products ──────────────────────────────────────────────────────
  app.get('/api/products', async (req, res, next) => {
    try {
      // Санитизация параметров фильтрации
      const sanitize = (val: unknown) =>
        String(val || '')
          .replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s\-_]/g, '')
          .slice(0, 50) || undefined

      const category = sanitize(req.query.category)
      const brand    = sanitize(req.query.brand)

      const products = await prisma.product.findMany({
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
      })

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
      }))

      res.json(payload)
    } catch (err) {
      if (!res.headersSent) next(err)
    }
  })

  // ── GET /api/categories ────────────────────────────────────────────────────
  app.get('/api/categories', async (_req, res, next) => {
    try {
      const categories = await prisma.category.findMany({
        include: { _count: { select: { products: true } } },
        orderBy: { name: 'asc' },
      })

      const payload = categories.map((c) => ({
        id: c.id,
        name: c.name,
        textSide: c.textSide,
        productCount: c._count.products,
        imageUrl: c.imageFile ? `/api/banner/${c.imageFile}` : null,
      }))

      res.json(payload)
    } catch (err) {
      if (!res.headersSent) next(err)
    }
  })

  // ── GET /api/brands ────────────────────────────────────────────────────────
  app.get('/api/brands', async (_req, res, next) => {
    try {
      const products = await prisma.product.findMany({
        where: { isAvailable: true },
        select: { name: true, brand: true },
      })
      const map = new Map<string, number>()
      for (const p of products) {
        const b = p.brand?.trim() || p.name.split(' ')[0]
        if (!b) continue
        map.set(b, (map.get(b) ?? 0) + 1)
      }
      const payload = [...map.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
      res.json(payload)
    } catch (err) {
      if (!res.headersSent) next(err)
    }
  })

  // ── GET /api/settings ──────────────────────────────────────────────────────
  app.get('/api/settings', async (req, res, next) => {
    try {
      const key = req.query.key as string
      if (!key) {
        res.status(400).json({ error: 'Missing key param' })
        return
      }
      const value = await getApiKeyValue('setting_' + key)
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.json({ value: value ?? '' })
    } catch (err) {
      if (!res.headersSent) next(err)
    }
  })

  // ── GET /api/cache-version ─────────────────────────────────────────────────
  app.get('/api/cache-version', async (_req, res, next) => {
    try {
      const cacheVersion = await getApiKeyValue('cache_version')
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.json({ version: cacheVersion ?? '0' })
    } catch (err) {
      if (!res.headersSent) next(err)
    }
  })

  // ── GET /api/hero-banners ──────────────────────────────────────────────────
  app.get('/api/hero-banners', async (_req, res, next) => {
    try {
      const banners = await prisma.heroBanner.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' },
      })
      const payload = banners.map((b) => ({
        id: b.id,
        imageUrl: '/api/banner/' + b.imageFile,
        title: b.title ?? null,
        subtitle: b.subtitle ?? null,
        order: b.order,
      }))
      res.json(payload)
    } catch (err) {
      if (!res.headersSent) next(err)
    }
  })

  // ── GET /api/banner/:fileId ────────────────────────────────────────────────
  app.get('/api/banner/:fileId', async (req, res) => {
    const fileId = String(req.params.fileId ?? '')
    const FILE_ID_RE = /^[A-Za-z0-9_\-]{10,200}$/
    if (!fileId || !FILE_ID_RE.test(fileId)) {
      res.status(400).send('Invalid file id')
      return
    }

    const banner = await prisma.heroBanner.findFirst({ where: { imageFile: fileId } })
    if (!banner) {
      res.status(404).send('Not found')
      return
    }

    const filePath = await new Promise<string>((resolve, reject) => {
      const tgUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
      const request = https
        .get(tgUrl, (tgRes) => {
          let data = ''
          tgRes.on('data', (chunk) => (data += chunk))
          tgRes.on('end', () => {
            try {
              const json = JSON.parse(data)
              if (!json.ok) return reject(new Error('Telegram getFile failed'))
              resolve(json.result.file_path as string)
            } catch (e) {
              reject(e)
            }
          })
        })
        .on('error', reject)
      request.setTimeout(10_000, () => {
        request.destroy(new Error('Telegram API timeout'))
      })
    })

    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
    await new Promise<void>((resolve, reject) => {
      const request = https
        .get(downloadUrl, (tgRes) => {
          res.setHeader('Content-Type', 'image/jpeg')
          res.setHeader('Cache-Control', 'public, max-age=86400')
          tgRes.pipe(res)
          tgRes.on('end', resolve)
          tgRes.on('error', reject)
        })
        .on('error', reject)
      request.setTimeout(10_000, () => {
        request.destroy(new Error('Telegram download timeout'))
      })
    })
  })

  // ── GET /api/download/price-list ───────────────────────────────────────────
  app.get('/api/download/price-list', downloadLimiter, requireTelegramAuth, async (_req, res, next) => {
    try {
      const { generatePriceListBuffer } = await import('../bot/admin/pricing')
      const buffer = await generatePriceListBuffer()
      const dateStr = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader('Content-Disposition', `attachment; filename="price-list-${dateStr}.xlsx"`)
      res.send(buffer)
    } catch (err) {
      if (!res.headersSent) next(err)
    }
  })

  // ── GET /api/download/template ─────────────────────────────────────────────
  app.get('/api/download/template', downloadLimiter, requireTelegramAuth, async (_req, res, next) => {
    try {
      const variants = await prisma.productVariant.findMany({
        include: { product: true },
        orderBy: { id: 'asc' },
      })

      const wb = new ExcelJS.Workbook()

      const ws1 = wb.addWorksheet('Оприходование')
      ws1.columns = [
        { key: 'sku', width: 28 },
        { key: 'qty', width: 15 },
        { key: 'comment', width: 30 },
        { key: 'name', width: 35 },
      ]

      const headerFill: ExcelJS.FillPattern = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1A1A1A' },
      }
      const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFCCFF00' } }
      const exampleFill: ExcelJS.FillPattern = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2A2A2A' },
      }
      const exampleFont: Partial<ExcelJS.Font> = { color: { argb: 'FF888888' } }

      const headerRow = ws1.addRow(['SKU варианта*', 'Количество*', 'Комментарий', 'Название (справочно)'])
      headerRow.eachCell((cell) => {
        cell.fill = headerFill
        cell.font = headerFont
      })

      const ex1 = variants[0]
      const ex2 = variants[1]

      const exRows = [
        ex1
          ? [
              ex1.sku,
              5,
              'Приход со склада',
              ex1.product.name +
                ' — ' +
                Object.entries(ex1.attributes as Record<string, string>)
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
                Object.entries(ex2.attributes as Record<string, string>)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', '),
            ]
          : ['VARIANT-SKU-002', -2, 'Возврат', 'Название товара'],
      ]

      for (const rowData of exRows) {
        const row = ws1.addRow(rowData)
        row.eachCell((cell) => {
          cell.fill = exampleFill
          cell.font = exampleFont
        })
      }
      ws1.views = [{ state: 'frozen', ySplit: 1 }]

      const ws2 = wb.addWorksheet('Справочник SKU')
      ws2.columns = [
        { key: 'sku', width: 28 },
        { key: 'product', width: 30 },
        { key: 'attrs', width: 35 },
        { key: 'price', width: 15 },
        { key: 'qty', width: 12 },
        { key: 'reserved', width: 18 },
        { key: 'inStock', width: 14 },
      ]

      const refHeader = ws2.addRow(['SKU', 'Товар', 'Атрибуты', 'Цена', 'Остаток', 'Зарезервировано', 'В наличии'])
      refHeader.eachCell((cell) => {
        cell.fill = headerFill
        cell.font = headerFont
      })

      const rowFills = ['FF1A1A1A', 'FF111111']
      variants.forEach((v, i) => {
        const attrs = Object.entries(v.attributes as Record<string, string>)
          .map(([k, val]) => `${k}: ${val}`)
          .join(', ')
        const row = ws2.addRow([
          v.sku,
          v.product.name,
          attrs,
          v.price.toString(),
          v.quantity,
          v.inStock ? 'Да' : 'Нет',
        ])
        const fill: ExcelJS.FillPattern = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowFills[i % 2] },
        }
        row.eachCell((cell) => {
          cell.fill = fill
        })
      })
      ws2.views = [{ state: 'frozen', ySplit: 1 }]

      const buffer = await wb.xlsx.writeBuffer()
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader('Content-Disposition', 'attachment; filename="bender-shop-template.xlsx"')
      res.send(Buffer.from(buffer))
    } catch (err) {
      if (!res.headersSent) next(err)
    }
  })

  // ── POST /api/orders ───────────────────────────────────────────────────────
  app.post('/api/orders', requireTelegramAuth, async (req: Request, res: Response, next: NextFunction) => {
    const {
      items,
      paymentMethod,
      customerName,
      customerPhone,
      deliveryType,
      deliveryAddress,
    } = req.body

    const telegramUserId = (req as any).telegramUserId as number
    const telegramId = String(telegramUserId)

    // ── Валидация входящих данных ──────────────────────────────────────────
    if (!Array.isArray(items) || items.length === 0) {
      await logSecurityEvent('invalid_order_data', { ip: req.ip, reason: 'empty items', telegramId }, telegramId)
      res.status(400).json({ error: 'Корзина пуста' })
      return
    }

    if (!['cash', 'card'].includes(paymentMethod)) {
      res.status(400).json({ error: 'Неверный способ оплаты' })
      return
    }

    if (!customerName || customerName.trim().length < 2) {
      res.status(400).json({ error: 'Укажите ФИО' })
      return
    }

    if (!customerPhone || !/^\+?[\d\s\-()\u00d7]{7,15}$/.test(customerPhone)) {
      res.status(400).json({ error: 'Неверный формат телефона' })
      return
    }

    if (!['pickup', 'delivery'].includes(deliveryType)) {
      res.status(400).json({ error: 'Неверный тип доставки' })
      return
    }

    if (deliveryType === 'delivery' && (!deliveryAddress || deliveryAddress.trim().length < 5)) {
      res.status(400).json({ error: 'Укажите адрес доставки' })
      return
    }

    for (const item of items) {
      if (!Number.isInteger(item.variantId) || item.variantId <= 0) {
        await logSecurityEvent('invalid_order_data', { ip: req.ip, reason: 'invalid variantId', item, telegramId }, telegramId)
        res.status(400).json({ error: 'Неверный ID товара' })
        return
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
        res.status(400).json({ error: 'Неверное количество товара' })
        return
      }
    }

    // ── Весь заказ атомарно: проверка остатков, создание заказа, списание ──
    try {
      const order = await prisma.$transaction(async (tx) => {
        let totalAmount = 0
        const enrichedItems: Array<{
          variantId: number
          name: string
          price: string
          quantity: number
          newQty: number
        }> = []

        // Загрузка актуальных цен из БД, проверка остатков
        for (const item of items) {
          const variant = await tx.productVariant.findUnique({
            where: { id: item.variantId },
            include: { product: true },
          })

          if (!variant || !variant.inStock || variant.quantity < item.quantity) {
            throw Object.assign(new Error('Товар закончился или недоступен'), { isStockConflict: true })
          }

          // Цена всегда из БД — никогда от клиента
          const actualPrice = Number(variant.price)
          if (item.price !== undefined && Number(item.price) !== actualPrice) {
            // Fire-and-forget: logging runs outside this transaction
            void logSecurityEvent('price_manipulation_attempt', {
              ip: req.ip,
              telegramId,
              variantId: item.variantId,
              submittedPrice: item.price,
              actualPrice,
            }, telegramId)
          }
          totalAmount += actualPrice * item.quantity

          enrichedItems.push({
            variantId: variant.id,
            name: variant.product.name,
            price: actualPrice.toString(),
            quantity: item.quantity,
            newQty: variant.quantity - item.quantity,
          })
        }

        // Найти клиента по telegramId
        const client = await tx.client.findUnique({
          where: { source_externalId: { source: 'telegram', externalId: telegramId } },
        })

        // Создать заказ
        const order = await tx.order.create({
          data: {
            clientId: client?.id ?? null,
            telegramId,
            items: {
              create: enrichedItems.map((i) => ({
                variantId: i.variantId,
                quantity: i.quantity,
                priceAtPurchase: i.price,
                productName: i.name,
              })),
            },
            totalAmount: totalAmount.toString(),
            payment: paymentMethod,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            deliveryType,
            deliveryAddress: deliveryAddress?.trim() ?? null,
          },
        })

        // Списать со склада
        for (const item of enrichedItems) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: {
              quantity: { decrement: item.quantity },
              inStock: item.newQty > 0,
            },
          })
          await tx.stockMovement.create({
            data: {
              variantId: item.variantId,
              type: 'out',
              quantity: item.quantity,
              comment: `Заказ #${order.id}`,
              createdBy: telegramId,
            },
          })
        }

        return order
      })

      if (!res.headersSent) res.json({ success: true, orderId: order.id })
    } catch (err: any) {
      if (err.isStockConflict) {
        if (!res.headersSent) res.status(409).json({ error: 'Товар закончился или недоступен' })
        return
      }
      if (!res.headersSent) next(err)
    }
  })

  // ── Глобальный обработчик ошибок ───────────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API] Ошибка:', err)
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' })
  })

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[API] Сервер запущен: http://localhost:${PORT}/shop`)
  })
  server.on('error', (err) => { console.error('Listen failed:', err); process.exit(1) })

  // Graceful HTTP drain: stop accepting connections, allow up to 10s to finish in-flight requests
  const closeServer = () => {
    server.close()
    setTimeout(() => {}, 10_000).unref()
  }
  process.once('SIGTERM', closeServer)
  process.once('SIGINT', closeServer)
}
