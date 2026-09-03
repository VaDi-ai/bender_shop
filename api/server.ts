/**
 * api/server.ts
 *
 * Express HTTP-сервер:
 *   GET  /shop                    — раздаёт webapp/index.html (Telegram Mini App)
 *   GET  /api/products            — список товаров из БД (фильтр ?category=...)
 *   POST /api/orders              — создание заказа в БД (требует Telegram auth)
 */

import '../lib/load-env'
import { initSentry, Sentry } from '../lib/sentry'
initSentry()
import crypto from 'crypto'
import fs from 'fs'
import https from 'https'
import path from 'path'
import express, { Request, Response, NextFunction } from 'express'
import type { Server } from 'http'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import ExcelJS from 'exceljs'
import type { Telegraf } from 'telegraf'
import { Telegram, Markup } from 'telegraf'
import { prisma } from '../lib/prisma'
import { logSecurityEvent } from '../lib/security-log'
import { encryptClientField, decryptClientField } from '../lib/client-crypto'
import { getApiKeyValue } from '../lib/api-key-store'
import { handleInstagramVerification } from '../webhooks/instagram'
import { DeliveryType } from '../generated/prisma/client'
import { Decimal } from '@prisma/client/runtime/client'
import {
  buildCdnPhotoIndex,
  cleanPhotoUrl,
  readPhotoFilenamesFromDir,
  resolveCdnPhotoUrl,
} from '../lib/cdn-photo-resolve'
import { fmtPrice, formatProductNameWithAttrs, formatAttrPairs } from '../lib/format'
import { assertOrderableVariant } from '../lib/order-checks'
import log from '../lib/logger'
import { flattenRelativePhotoPath } from '../lib/photo-flat-name'
import { trackEvent } from '../lib/events'
import { validateTelegramWebApp } from '../lib/telegram-webapp-auth'
import { buildProfileWriteback } from '../lib/client-profile'
import { suggestAddress, verifyAddress, dadataConfigured, VerifiedAddress } from '../lib/dadata'
import { computeDeliveryCost, deliveryZoneOf, loadDeliveryPricingConfig, DeliveryPricingConfig, DeliveryQuote } from '../lib/delivery-pricing'
import {
  loadPreorderDefaults, resolvePreorder, splitOrderPrepayment, type PreorderPolicy,
  STOCK_OR_PREORDER_WHERE, VISIBLE_VARIANT_WHERE, isProductVisible, variantPreorderView,
  showsPreorderBadge,
} from '../lib/preorder'
import { adminApiRouter } from './admin'

// BigInt → JSON serialization (avitoItemId etc.)
;(BigInt.prototype as any).toJSON = function () { return this.toString() }

if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN is required')
const BOT_TOKEN = process.env.BOT_TOKEN
const PORT = Number(process.env.PORT || process.env.API_PORT || 3000)
const WEBAPP_PATH = path.join(__dirname, '../../webapp/index.html')
const ADMIN_HTML_PATH = path.join(__dirname, '../../webapp/admin.html')

const telegram = new Telegram(BOT_TOKEN)
const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID)
const ADMIN_IDS = (process.env.ADMIN_IDS ?? '').split(',').map((id) => Number(id.trim())).filter(Boolean)


function getImageContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'png': return 'image/png'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'svg': return 'image/svg+xml'
    // Видео рассылок лежит на том же томе /photos (express.static сам ставит
    // эти типы по расширению; карта — для маршрутов, отдающих файл вручную)
    case 'mp4': return 'video/mp4'
    case 'webm': return 'video/webm'
    case 'mov': return 'video/quicktime'
    default: return 'image/jpeg'
  }
}

// ─── Валидация подписи Telegram WebApp ────────────────────────────────────────
// Вынесена в lib/telegram-webapp-auth.ts (переиспользуется админ-API, PR-2).

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
  ;(req as unknown as Record<string, unknown>).telegramId = userId
  next()
}

// ─── Middleware: Admin HMAC auth (для CLI-загрузок без Mini App) ───────────────
//
// Используется на /admin/photos/upload и других CLI-only endpoint'ах.
// Клиент (scripts/upload-photos.ts) считает HMAC-SHA256(BOT_TOKEN, ts:bodyHash)
// и шлёт его в заголовках. Сервер проверяет:
//   - подпись совпадает (timingSafeEqual)
//   - timestamp не старше 5 минут (anti-replay)
//   - body hash совпадает с тем что использован в подписи
//
// Знание BOT_TOKEN = доверие; этот же токен используется для Telegram bot.
function requireAdminHmac(req: Request, res: Response, next: NextFunction): void {
  const ts = String(req.headers['x-admin-timestamp'] ?? '')
  const sig = String(req.headers['x-admin-signature'] ?? '')

  if (!ts || !sig) {
    res.status(401).json({ error: 'Admin signature required' })
    return
  }

  const tsNum = parseInt(ts, 10)
  if (!Number.isFinite(tsNum)) {
    res.status(401).json({ error: 'Bad timestamp' })
    return
  }
  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - tsNum) > 300) {
    logSecurityEvent('admin_hmac_stale', { ip: req.ip, age: nowSec - tsNum })
    res.status(401).json({ error: 'Timestamp out of range' })
    return
  }

  // express.raw кладёт body в Buffer. Если body не пришло — fallback на пустой буфер.
  const body: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex')
  const expected = crypto.createHmac('sha256', BOT_TOKEN).update(`${ts}:${bodyHash}`).digest('hex')

  let ok = false
  try {
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    ok = a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch {
    ok = false
  }

  if (!ok) {
    logSecurityEvent('invalid_admin_hmac', { ip: req.ip, tsAge: nowSec - tsNum, bodyLen: body.length })
    res.status(401).json({ error: 'Bad signature' })
    return
  }
  next()
}

// ─── Запуск сервера ───────────────────────────────────────────────────────────

export function startApiServer(bot?: Telegraf): Server {
  const app = express()
  app.set('trust proxy', 1)

  // Cache webapp/index.html at startup to avoid fs.readFileSync on every request
  let indexHtml: Buffer | null = null
  try {
    indexHtml = fs.readFileSync(WEBAPP_PATH)
  } catch {
    log.warn('webapp/index.html not found at startup', { path: WEBAPP_PATH })
  }
  let adminHtml: Buffer | null = null
  try {
    adminHtml = fs.readFileSync(ADMIN_HTML_PATH)
  } catch {
    log.warn('webapp/admin.html not found at startup', { path: ADMIN_HTML_PATH })
  }

  // ── Telegram webhook (production, before body parsers) ─────────────────────
  // WEBHOOK_SECRET is validated at bot startup (bot/index.ts) for production
  if (bot) {
    if (!process.env.WEBHOOK_SECRET) {
      throw new Error('WEBHOOK_SECRET is required for Telegram webhook verification')
    }
    app.post('/webhook/telegram', bot.webhookCallback('/webhook/telegram', { secretToken: process.env.WEBHOOK_SECRET }))
  }

  // ── Instagram webhook verification (GET) ──────────────────────────────────
  app.get('/webhook/instagram', handleInstagramVerification)

  // ── Helmet (безопасные заголовки) ──────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // TODO: When webapp migrates to external CSS/JS files, replace 'unsafe-inline' with nonce:
        // const nonce = crypto.randomBytes(16).toString('base64')
        // res.locals.cspNonce = nonce
        // scriptSrc: [`'nonce-${nonce}'`]
        scriptSrc: ["'self'", "https://telegram.org", "'unsafe-inline'", "https://api-maps.yandex.ru", "https://yandex.ru"],
        scriptSrcAttr: ["'unsafe-inline'"], // for onclick handlers in webapp
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", "data:"],
        frameSrc: ["'self'", "https://telegram.org", "https://yandex.ru", "https://*.yandex.ru", "https://*.yandex.net", "https://api-maps.yandex.ru", "https://yandex.ru/map-widget/"],
        imgSrc: ["'self'", "data:", "https://api.telegram.org", "https://t.me", "https://*.yandex.ru", "https://*.yandex.net", "https://api-maps.yandex.ru"],
        connectSrc: ["'self'", "https://bendershop.store", "https://api.telegram.org", "https://web.telegram.org", "https://*.yandex.ru", "https://*.yandex.net"],
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
          log.warn('CORS blocked', { origin })
          callback(new Error('CORS: недопустимый источник'))
        }
      },
      credentials: true,
    })
  )

  // ── Rate limiting ──────────────────────────────────────────────────────────
  // Глобальный лимит покрывает все запросы. Исключение — /photos: каталог может
  // содержать 50+ изображений на странице, и каждое отображение каталога иначе
  // мгновенно проедало бы половину лимита (100/min). Защита от перебора /photos
  // обеспечивается тем, что фото — статические файлы (нет дорогих запросов
  // к БД), плюс кеш-заголовки на 1 день уменьшают количество запросов.
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Слишком много запросов. Подождите минуту.' },
    skip: (req) => req.path.startsWith('/photos/'),
  })
  app.use(globalLimiter)

  const orderLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Слишком много заказов. Подождите минуту.' },
  })
  app.use('/api/orders', orderLimiter)

  const photoLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 200,
  })
  app.use('/api/banner', photoLimiter)
  app.use('/api/photo', photoLimiter)

  const downloadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Слишком много запросов на скачивание. Подождите минуту.' },
  })

  const trackLimiter = rateLimit({ windowMs: 60_000, max: 100 })
  app.use('/api/track', trackLimiter)

  // Автоподсказки адреса стреляют на каждый ввод — свой лимит, чтобы не
  // съедали глобальный и не позволяли выкачивать DaData через наш прокси.
  const deliveryLimiter = rateLimit({
    windowMs: 60_000,
    max: 30,
    message: { error: 'Слишком много запросов адреса. Подождите минуту.' },
  })
  app.use('/api/delivery', deliveryLimiter)

  // ── Админ-API (ADMIN-DESIGN §2, PR-2): initData-auth + AdminUser, свой лимитер внутри ──
  app.use('/admin/api', adminApiRouter())

  // /admin/photos/upload — заливка zip с фотками владельцем магазина.
  // HMAC-подпись от BOT_TOKEN (см. requireAdminHmac ниже) → ADMIN_IDS не
  // нужен на стороне API, доверие основано на знании BOT_TOKEN.
  // Лимит мягкий (10/мин) на случай повторов из-за обрывов сети.
  const adminUploadLimiter = rateLimit({ windowMs: 60_000, max: 10 })

  // ── Таймаут для долгих запросов ───────────────────────────────────────────
  app.use((_req, res, next) => {
    res.setTimeout(10_000, () => {
      res.status(503).json({ error: 'Сервер не отвечает. Попробуйте позже.' })
    })
    next()
  })

  app.use(express.json({ limit: '1mb' }))

  // ─── Request logging (skip /health) ────────────────────────────────────────
  app.use((req, _res, next) => {
    if (req.path !== '/health' && req.path !== '/api/cache-version') {
      log.debug('HTTP request', { method: req.method, path: req.path })
    }
    next()
  })

  // ── Legal pages ──────────────────────────────────────────────────────────
  const legalPages: Record<string, string> = {
    terms: 'terms-of-sale.html',
    agreement: 'user-agreement.html',
    privacy: 'privacy-policy.html',
  }

  app.get('/terms', (_req, res) => res.redirect('/legal/terms'))
  app.get('/agreement', (_req, res) => res.redirect('/legal/agreement'))
  app.get('/privacy', (_req, res) => res.redirect('/legal/privacy'))

  app.get('/legal/:doc', (req, res) => {
    const file = legalPages[req.params.doc]
    if (!file) { res.status(404).send('Not found'); return }
    const filePath = path.join(__dirname, '../../public/legal', file)
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.sendFile(filePath)
    } else {
      res.status(404).send('Document not found')
    }
  })

  // ── GET / и /shop — Mini App ───────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.redirect('/shop')
  })

  // ── GET /api/promotions — активные акции для витрины (таб «Акции») ─────────
  //
  // Один запрос с include (без N+1): PromotionPrice → variant.productId.
  // Скидки уже применены к ценам вариантов движком lib/promotions.ts —
  // эндпоинт только описывает, ЧТО сейчас по акции.
  app.get('/api/promotions', async (_req, res, next) => {
    try {
      const now = new Date()
      const promos = await prisma.promotion.findMany({
        where: {
          isActive: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: { createdAt: 'desc' },
        include: {
          prices: { select: { variant: { select: { productId: true } } } },
        },
      })
      res.setHeader('Cache-Control', 'public, max-age=60')
      res.json(promos.map(p => {
        const productIds = [...new Set(p.prices.map(pr => pr.variant.productId))]
        return {
          id: p.id,
          name: p.name,
          discountType: p.discountType,           // percent | fixed
          discountValue: Number(p.discountValue),
          endsAt: p.endsAt ? p.endsAt.toISOString() : null,
          productCount: productIds.length,
          productIds,
        }
      // Витрина не показывает акции без применённых товаров: isActive без
      // PromotionPrice — валидный стейт «включил, но не применил», запись в БД
      // не трогаем. TODO(админ-раздел акций, Этап 4): показывать такие акции
      // владельцу как ворнинг «активна, но цены не применены».
      }).filter(p => p.productCount > 0))
    } catch (err) { if (!res.headersSent) next(err) }
  })

  // ── Event tracking endpoint ──────────────────────────────────────────────────
  const ALLOWED_EVENT_TYPES = ['view_product', 'add_to_cart', 'remove_from_cart', 'search', 'filter_brand', 'filter_category', 'filter_line', 'checkout_start']
  app.post('/api/track', express.json(), (req: Request, res: Response) => {
    const { type, productId, data, sessionId } = req.body
    if (!type || typeof type !== 'string') { res.status(400).json({ error: 'type required' }); return }
    if (!ALLOWED_EVENT_TYPES.includes(type)) { res.status(400).json({ error: 'invalid type' }); return }
    trackEvent({
      type,
      productId: typeof productId === 'number' ? productId : undefined,
      data: typeof data === 'object' && data !== null ? data : undefined,
      sessionId: typeof sessionId === 'string' ? sessionId.slice(0, 64) : undefined,
      source: 'webapp',
    })
    res.json({ ok: true })
  })

  // Service Worker (no-cache for instant update)
  app.get('/sw.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript')
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(__dirname, '../../public/sw.js'))
  })

  // Static: public assets (no-photo placeholder, etc.)
  app.use(express.static(path.join(__dirname, '../../public')))

  // Static: category images
  app.use('/categories', express.static(path.join(__dirname, '../../public/categories')))

  // Static: product photos.
  //
  // PHOTOS_DIR указывает на директорию с фото товаров (обычно квадратные WebP из стокового пайплайна).
  // На Railway это mount path для Volume (например /data/photos) — фото живут отдельно от репозитория.
  // Локально без переменной — отдаётся из public/uploads/products (для разработки).
  //
  // Cache: 1 день в браузере + ETag для revalidation (default Express). Не immutable,
  // т.к. имена файлов человекочитаемые (apple_watch_s11_42_titanium.webp), и менеджер
  // может обновить фото того же товара под тем же именем — нужно чтобы клиенты узнали.
  const photosDir = process.env.PHOTOS_DIR
    ? path.resolve(process.env.PHOTOS_DIR)
    : path.join(__dirname, '../../public/uploads/products')
  if (!fs.existsSync(photosDir)) {
    log.warn('PHOTOS_DIR does not exist, /photos route will return 404', { photosDir })
  }
  const cdnPhotoIndex = buildCdnPhotoIndex(readPhotoFilenamesFromDir(photosDir))
  if (cdnPhotoIndex.exact.size > 0) {
    log.info('CDN photo index built', { files: cdnPhotoIndex.exact.size })
  }

  /**
   * Картинка баннера/категории. Бот кладёт telegram file_id (отдаём через
   * прокси /api/banner), веб-админка — готовую ссылку (/photos/... или
   * https://): её отдаём как есть, прокси не нужен.
   */
  function publicImageFileUrl(imageFile: string | null): string | null {
    if (!imageFile) return null
    const v = imageFile.trim()
    if (!v) return null
    if (/^https?:\/\//i.test(v) || v.startsWith('/photos/')) return v
    return '/api/banner/' + v
  }

  function normalizePublicPhotoUrl(url: string): string {
    const s = cleanPhotoUrl(url)
    if (!s) return s
    return resolveCdnPhotoUrl(s, cdnPhotoIndex.exact.size > 0 ? cdnPhotoIndex : null)
  }
  app.use('/photos', express.static(photosDir, {
    maxAge: '1d',
    fallthrough: true,
    index: false,
  }))

  // ── GET /admin/photos/info ───────────────────────────────────────────────────
  //
  // Возвращает статус PHOTOS_DIR (количество файлов, общий размер, последнее
  // обновление). Используется владельцем для проверки что upload реально
  // долетел до Volume. Защита та же что у upload — HMAC от BOT_TOKEN.
  app.get('/admin/photos/info', adminUploadLimiter, requireAdminHmac, (_req, res) => {
    if (!process.env.PHOTOS_DIR) {
      res.json({ photosDir: null, exists: false, configured: false })
      return
    }
    if (!fs.existsSync(photosDir)) {
      res.json({ photosDir, exists: false, configured: true })
      return
    }
    let count = 0
    let bytes = 0
    let latestMtime = 0
    try {
      for (const name of fs.readdirSync(photosDir)) {
        const full = path.join(photosDir, name)
        const st = fs.statSync(full)
        if (!st.isFile()) continue
        count++
        bytes += st.size
        if (st.mtimeMs > latestMtime) latestMtime = st.mtimeMs
      }
    } catch (err) {
      log.error('Failed to read PHOTOS_DIR', { err: err instanceof Error ? err.message : String(err) })
      res.status(500).json({ error: 'Failed to read PHOTOS_DIR' })
      return
    }
    res.json({
      photosDir,
      exists: true,
      configured: true,
      count,
      bytes,
      sizeMb: +(bytes / 1024 / 1024).toFixed(2),
      latestMtime: latestMtime > 0 ? new Date(latestMtime).toISOString() : null,
    })
  })

  // ── POST /admin/photos/upload ────────────────────────────────────────────────
  //
  // Заливка zip-архива с готовыми WebP-фотками в PHOTOS_DIR.
  // Auth: requireAdminHmac (HMAC от BOT_TOKEN + 5-минутный timestamp).
  // Парсер: express.raw application/zip, лимит 250 MB.
  // Распаковка: adm-zip (чистый JS, не зависит от системного tar/unzip),
  // copy в PHOTOS_DIR с защитой от path traversal: относительный путь внутри zip →
  // то же «плоское» имя, что и у `npm run match-photos` (`lib/photo-flat-name.ts`).
  //
  // Возвращает JSON { uploaded, skipped, errors, photosDir }.
  // skipped = файл с тем же mtime≥ что у нового => не перезаписываем.
  // Локальная обёртка: `npm run upload-photos <zip>` (scripts/upload-photos.ts).
  app.post(
    '/admin/photos/upload',
    adminUploadLimiter,
    express.raw({ type: 'application/zip', limit: '250mb' }),
    requireAdminHmac,
    async (req: Request, res: Response) => {
      const body = req.body as Buffer
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: 'Empty body. Use Content-Type: application/zip.' })
        return
      }

      // Защита: PHOTOS_DIR должен быть задан и существовать. Если нет —
      // делать ничего нельзя, т.к. иначе /photos/* вернёт 404 для свежих файлов.
      if (!process.env.PHOTOS_DIR) {
        res.status(503).json({ error: 'PHOTOS_DIR is not configured on this server' })
        return
      }
      if (!fs.existsSync(photosDir)) {
        try {
          fs.mkdirSync(photosDir, { recursive: true })
        } catch (err) {
          log.error('Failed to create PHOTOS_DIR', { photosDir, err: err instanceof Error ? err.message : String(err) })
          res.status(500).json({ error: 'PHOTOS_DIR missing and could not be created' })
          return
        }
      }

      // Распаковка в tmp dir
      const os = await import('os')
      const tmpExtract = path.join(os.tmpdir(), `bender-extract-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`)

      let cleanedTmp = false
      const cleanup = (): void => {
        if (cleanedTmp) return
        cleanedTmp = true
        try { fs.rmSync(tmpExtract, { recursive: true, force: true }) } catch { /* ignore */ }
      }

      try {
        fs.mkdirSync(tmpExtract, { recursive: true })

        // adm-zip: чистый JS, не зависит от системного tar/unzip (GNU tar zip не понимает).
        const AdmZip = (await import('adm-zip')).default
        try {
          const zip = new AdmZip(body)
          zip.extractAllTo(tmpExtract, /* overwrite */ true)
        } catch (err) {
          log.error('zip extraction failed', { err: err instanceof Error ? err.message : String(err) })
          cleanup()
          res.status(400).json({ error: `Failed to extract zip: ${err instanceof Error ? err.message : String(err)}` })
          return
        }

        // Рекурсивно собираем все image-файлы, копируем в photosDir с именем =
        // flatten(relative от корня распакованного архива).
        const extractRoot = path.resolve(tmpExtract)
        const IMAGE_EXTS = new Set(['.webp', '.png', '.jpg', '.jpeg'])
        let uploaded = 0
        let skipped = 0
        const errors: string[] = []

        const walk = (dir: string): void => {
          for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name)
            let st: fs.Stats
            try {
              st = fs.lstatSync(full)
            } catch {
              continue
            }
            if (st.isSymbolicLink()) {
              continue
            }
            if (st.isDirectory()) {
              walk(full)
              continue
            }
            if (!st.isFile()) continue
            const ext = path.extname(name).toLowerCase()
            if (!IMAGE_EXTS.has(ext)) continue

            const fileResolved = path.resolve(full)
            const relNative = path.relative(extractRoot, fileResolved)
            if (relNative.startsWith('..') || path.isAbsolute(relNative)) {
              errors.push(`${relNative}: skipped (outside extract root)`)
              continue
            }
            const photosRootResolved = path.resolve(photosDir)
            const destName = flattenRelativePhotoPath(relNative)
            const destPath = path.resolve(path.join(photosRootResolved, destName))
            const relIntoPhotos = path.relative(photosRootResolved, destPath)
            if (
              destPath !== photosRootResolved &&
              (relIntoPhotos.startsWith('..') || path.isAbsolute(relIntoPhotos))
            ) {
              errors.push(`${destName}: skipped (refused path outside PHOTOS_DIR)`)
              continue
            }

            try {
              if (fs.existsSync(destPath)) {
                const dstSt = fs.statSync(destPath)
                if (dstSt.mtimeMs >= st.mtimeMs) {
                  skipped++
                  continue
                }
              }
              fs.copyFileSync(full, destPath)
              uploaded++
            } catch (err) {
              errors.push(`${destName}: ${err instanceof Error ? err.message : String(err)}`)
            }
          }
        }
        walk(tmpExtract)

        cleanup()

        log.info('Admin photos upload', { uploaded, skipped, errors: errors.length, sizeBytes: body.length })
        await logSecurityEvent('photos_uploaded', { uploaded, skipped, errors: errors.length, sizeMb: +(body.length / 1024 / 1024).toFixed(2) })
        res.json({
          uploaded,
          skipped,
          errors,
          photosDir,
        })
      } catch (err) {
        cleanup()
        log.error('Photos upload failed', { err: err instanceof Error ? err.message : String(err) })
        if (!res.headersSent) {
          res.status(500).json({ error: err instanceof Error ? err.message : 'upload failed' })
        }
      }
    }
  )

  // Telegram-webview кэширует HTML агрессивно: без этих заголовков владелец
  // после деплоя видит СТАРУЮ страницу (headless — новую). Оба Mini App
  // отдаём как no-store; ассеты (шрифты, фото) кэшируются своими правилами.
  // Версия отданного HTML — чтобы по curl -I было видно, какая сборка у клиента
  // (весь CSS/JS обоих Mini App инлайновый, внешние ассеты — только статичные
  // шрифты и favicon, их кэш не мешает обновлениям).
  const APP_VERSION = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7)
    || String(Math.floor(Date.now() / 1000))

  function sendMiniApp(res: Response, html: Buffer): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    res.setHeader('Pragma', 'no-cache')   // старые webview понимают только это
    res.setHeader('Expires', '0')
    res.setHeader('X-App-Version', APP_VERSION)
    res.setHeader('Content-Length', String(html.length))
    // res.end (не res.send): send сам проставляет ETag → кривые webview/прокси
    // отвечают 304 из своего кэша даже при no-store. Здесь ETag не нужен вовсе.
    res.end(html)
  }

  app.get('/shop', (_req, res) => {
    if (!indexHtml) {
      res.status(503).send('webapp not available')
      return
    }
    sendMiniApp(res, indexHtml)
  })

  // ── GET /admin — админка (Mini App). HTML отдаётся всем, данные — за
  // requireAdmin в /admin/api/* (тот же паттерн, что /shop + Кабинет).
  app.get('/admin', (_req, res) => {
    if (!adminHtml) {
      res.status(503).send('admin webapp not available')
      return
    }
    sendMiniApp(res, adminHtml)
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
    } catch { /* ignore: health check — DB unreachable is reported via status */ }

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

  /** Витрина раньше смотрела только на variant.photos; в БД иногда есть только photoUrls — склеиваем уникально. */
  function variantPhotosPublic(v: { photos?: string[] | null; photoUrls?: string[] | null }): string[] {
    const out: string[] = []
    const seen = new Set<string>()
    const pushRaw = (x: unknown) => {
      const s = typeof x === 'string' ? normalizePublicPhotoUrl(x) : ''
      if (!s || seen.has(s)) return
      seen.add(s)
      out.push(s)
    }
    for (const s of v.photos ?? []) pushRaw(s)
    for (const s of v.photoUrls ?? []) pushRaw(s)
    return out
  }

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

      // Дефолты магазина нужны, чтобы досеять полузаполненные предзаказы
      const preorderDefaults = await loadPreorderDefaults()

      const products = await prisma.product.findMany({
        where: {
          isAvailable: true,
          ...STOCK_OR_PREORDER_WHERE,
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
          coverPhoto: true,
          photos: true,
          badge: true,
          brand: true,
          line: true,
          sortOrder: true,
          attributes: true,
          specs: true,
          isFeatured: true,
          createdAt: true,
          isPreorder: true,
          preorderMode: true,
          prepaymentKind: true,
          prepaymentValue: true,
          preorderEta: true,
          preorderTerms: true,
          category: { select: { id: true, name: true } },
          variants: {
            // Предзаказные варианты живут при нулевом остатке — они и есть смысл
            where: VISIBLE_VARIANT_WHERE,
            select: {
              id: true,
              sku: true,
              price: true,
              quantity: true,
              attributes: true,
              photos: true,
              photoUrls: true,
              inStock: true,
              isPreorder: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      })

      // Полузаполненный предзаказ (флаг есть, условий нет) на витрину не идёт:
      // кнопка «оформить» с неизвестной суммой хуже, чем отсутствие товара.
      const visible = products.filter(p => isProductVisible({
        ...p,
        preorderMode: p.preorderMode as never,
        prepaymentKind: p.prepaymentKind as never,
        hasLiveVariants: p.variants.some(v => v.inStock && v.quantity > 0),
      }, preorderDefaults))

      const payload = visible.map((p) => {
        // Политика считается один раз на товар; суммы — на каждый вариант,
        // потому что цены у вариантов разные, а процент один.
        const readiness = resolvePreorder({
          ...p,
          preorderMode: p.preorderMode as never,
          prepaymentKind: p.prepaymentKind as never,
        }, preorderDefaults)
        const policy = readiness.kind === 'ready' ? readiness.policy : null

        return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        description: p.description ?? '',
        price: p.price.toString(),
        category: p.category?.name ?? '',
        categoryId: p.categoryId ?? null,
        // Phase 2: дрилл-даун бренд → линейка → модель считается на клиенте
        line: p.line ?? null,
        sortOrder: p.sortOrder,
        photoUrl: normalizePublicPhotoUrl(p.photoUrl ?? ''),
        // Обложка из админки — клиент предпочитает её; пусто → photoUrl/первый вариант
        coverPhoto: p.coverPhoto ? normalizePublicPhotoUrl(p.coverPhoto) : null,
        photos: (p.photos ?? []).map(normalizePublicPhotoUrl).filter(Boolean),
        quantity: p.quantity,
        badge: p.badge ?? null,
        brand: p.brand ?? null,
        attributes: p.attributes ?? null,
        specs: p.specs ?? null,
        isFeatured: p.isFeatured,
        createdAt: p.createdAt.toISOString(),
        salesCount: p.variants.reduce((s, v) => s + (v.quantity || 0), 0),
        // Карточка предзаказная ЦЕЛИКОМ — то есть купить сейчас нечего. У товара
        // с живыми предложениями и одним предзаказным вариантом флага здесь нет:
        // бейдж «Предзаказ» на товаре, который лежит на складе, обманывает
        // покупателя. Предзаказность такого товара — на уровне варианта ниже.
        isPreorder: showsPreorderBadge({
          isPreorder: p.isPreorder,
          ready: policy !== null,
          hasLiveVariants: p.variants.some(v => v.inStock && v.quantity > 0),
        }),
        preorderEta: policy?.eta ?? null,
        variants: p.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          price: v.price.toString(),
          quantity: v.quantity,
          inStock: v.inStock,
          attributes: v.attributes,
          photos: variantPhotosPublic(v),
          // Предзаказный вариант покупается при нулевом остатке. Суммы считает
          // СЕРВЕР — на чекауте они пересчитываются заново и должны совпасть.
          isPreorder: v.isPreorder && policy !== null,
          preorder: v.isPreorder && policy ? variantPreorderView(v.price, policy) : null,
        })),
        }
      })

      res.set('Cache-Control', 'private, no-store, must-revalidate')
      res.json(payload)
    } catch (err) {
      if (!res.headersSent) next(err)
    }
  })

  // ── GET /api/categories ────────────────────────────────────────────────────
  app.get('/api/categories', async (_req, res, next) => {
    try {
      // Счётчик считается в JS, а не через _count: готовность предзаказа
      // зависит от дефолтов магазина, и SQL её не проверит. Разошедшийся
      // счётчик («iPhone · 11» при 10 показанных) — та же болезнь, что была
      // с латентными дублями, лечим её тем же способом: один источник правды.
      const preorderDefaults = await loadPreorderDefaults()
      const [categories, catProducts] = await Promise.all([
        prisma.category.findMany({ orderBy: { name: 'asc' } }),
        prisma.product.findMany({
          where: { isAvailable: true, ...STOCK_OR_PREORDER_WHERE },
          select: {
            categoryId: true, isPreorder: true, preorderMode: true, prepaymentKind: true,
            prepaymentValue: true, preorderEta: true, preorderTerms: true,
            variants: { where: { inStock: true, quantity: { gt: 0 } }, select: { id: true }, take: 1 },
          },
        }),
      ])

      const countByCategory = new Map<number, number>()
      for (const p of catProducts) {
        if (p.categoryId === null) continue
        if (!isProductVisible({
          ...p,
          preorderMode: p.preorderMode as never,
          prepaymentKind: p.prepaymentKind as never,
          hasLiveVariants: p.variants.length > 0,
        }, preorderDefaults)) continue
        countByCategory.set(p.categoryId, (countByCategory.get(p.categoryId) ?? 0) + 1)
      }

      const payload = categories
        .filter((c) => (countByCategory.get(c.id) ?? 0) > 0)
        .map((c) => ({
          id: c.id,
          name: c.name,
          textSide: c.textSide,
          productCount: countByCategory.get(c.id) ?? 0,
          imageUrl: publicImageFileUrl(c.imageFile),
        }))

      res.json(payload)
    } catch (err) {
      if (!res.headersSent) next(err)
    }
  })

  // ── GET /api/brands ────────────────────────────────────────────────────────
  app.get('/api/brands', async (_req, res, next) => {
    try {
      const [products, brandImages] = await Promise.all([
        prisma.product.findMany({
          // Счётчик = что реально видно на витрине (как /api/products):
          // товары без in-stock вариантов не считаем, иначе «Apple · 98»
          // при 23 покупаемых
          where: { isAvailable: true, ...STOCK_OR_PREORDER_WHERE },
          select: {
            name: true, brand: true,
            isPreorder: true, preorderMode: true, prepaymentKind: true,
            prepaymentValue: true, preorderEta: true, preorderTerms: true,
            variants: { where: { inStock: true, quantity: { gt: 0 } }, select: { id: true }, take: 1 },
          },
        }),
        prisma.brandImage.findMany({
          where: { imageFile: { not: null } },
          select: { brandNorm: true, imageFile: true },
        }),
      ])
      const logoByNorm = new Map(brandImages.map((i) => [i.brandNorm, i.imageFile]))
      // Досеиваем полузаполненные предзаказы — как в /api/products и /api/categories
      const preorderDefaults = await loadPreorderDefaults()
      const map = new Map<string, number>()
      for (const p of products) {
        if (!isProductVisible({
          ...p,
          preorderMode: p.preorderMode as never,
          prepaymentKind: p.prepaymentKind as never,
          hasLiveVariants: p.variants.length > 0,
        }, preorderDefaults)) continue
        const b = p.brand?.trim() || p.name.split(' ')[0]
        if (!b) continue
        map.set(b, (map.get(b) ?? 0) + 1)
      }
      const BRAND_POPULARITY = [
        'Apple', 'Samsung', 'Sony', 'Xiaomi', 'JBL', 'Dyson',
        'LG', 'Garmin', 'DJI', 'Google', 'Huawei', 'Beats',
        'Marshall', 'Honor', 'Poco', 'OnePlus', 'Yandex',
        'Ray-Ban', 'Nintendo', 'Fujifilm', 'Hisense', 'Insta360',
        'Oakley', 'Canon', 'GoPro', 'Meta', 'Bowers & Wilkins',
        'Medicube', 'Plaud', 'Whoop', 'Microsoft', 'Valve', 'Asus',
      ]
      const payload = [...map.entries()]
        .map(([name, count]) => ({
          name,
          count,
          imageUrl: publicImageFileUrl(logoByNorm.get(name.trim().toLowerCase()) ?? null),
        }))
        .sort((a, b) => {
          const ai = BRAND_POPULARITY.indexOf(a.name)
          const bi = BRAND_POPULARITY.indexOf(b.name)
          return (ai !== -1 ? ai : 999) - (bi !== -1 ? bi : 999)
        })
      res.json(payload)
    } catch (err) {
      if (!res.headersSent) next(err)
    }
  })

  // ── GET /api/trends ───────────────────────────────────────────────────────
  app.get('/api/trends', async (_req, res, next) => {
    try {
      const { getCurrentTrends } = await import('../lib/trends')
      const trends = await getCurrentTrends()
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.json(trends || { categories: [], brands: [], featuredProducts: [] })
    } catch (err) { if (!res.headersSent) next(err) }
  })

  // ── GET /api/settings ──────────────────────────────────────────────────────
  const PUBLIC_SETTINGS = new Set(['marquee', 'store_name', 'currency', 'cache_version', 'hero_banners', 'promo_banner', 'maintenance', 'maintenance_note'])

  app.get('/api/settings', async (req, res, next) => {
    try {
      const key = req.query.key as string
      if (!key) {
        res.status(400).json({ error: 'Missing key param' })
        return
      }
      if (!PUBLIC_SETTINGS.has(key)) {
        res.status(404).json({ error: 'Setting not found' })
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

  // ── Платная доставка: прокси подсказок и предварительная оценка ───────────
  // Токен DaData живёт только на сервере; фронт ходит сюда. Флаг выключен →
  // config отвечает enabled:false и фронт не включает автокомплит/расчёт —
  // поведение чекаута остаётся прежним. Нужен только DADATA_TOKEN (Suggestions):
  // платный Clean упрощённой модели «Москва → фикс» не требуется.
  const deliveryPricingEnabled = () =>
    process.env.DELIVERY_PRICING_ENABLED === 'true' && dadataConfigured()

  app.get('/api/delivery/config', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.json({ enabled: deliveryPricingEnabled() })
  })

  app.post('/api/delivery/suggest', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!deliveryPricingEnabled()) {
        res.json({ suggestions: [] })
        return
      }
      const query = typeof req.body?.query === 'string' ? req.body.query : ''
      const suggestions = await suggestAddress(query)
      res.json({ suggestions: suggestions ?? [] })
    } catch (err) {
      if (!res.headersSent) next(err)
    }
  })

  // Оценка для UI: сервер геокодит и считает по своим тарифам, но это
  // ПРЕДВАРИТЕЛЬНАЯ цифра — окончательная считается заново при создании
  // заказа из проверенного адреса и серверной суммы товаров.
  app.post('/api/delivery/quote', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!deliveryPricingEnabled()) {
        res.json({ enabled: false })
        return
      }
      const address = typeof req.body?.address === 'string' ? req.body.address.trim() : ''
      if (address.length < 5) {
        res.status(400).json({ error: 'Укажите адрес' })
        return
      }
      let itemsTotal = new Decimal(0)
      try {
        const raw = req.body?.itemsTotal
        if (raw !== undefined && raw !== null && raw !== '') itemsTotal = new Decimal(String(raw))
        if (!itemsTotal.isFinite() || itemsTotal.isNegative()) itemsTotal = new Decimal(0)
      } catch { itemsTotal = new Decimal(0) }
      const [verified, config] = await Promise.all([verifyAddress(address), loadDeliveryPricingConfig()])
      const quote = computeDeliveryCost(verified, config, itemsTotal)
      res.json({
        enabled: true,
        preliminary: true,
        mode: quote.mode,
        ...(quote.mode === 'fixed'
          ? { cost: quote.cost.toFixed(0), zone: quote.zone, free: quote.free }
          : {}),
      })
    } catch (err) {
      if (!res.headersSent) next(err)
    }
  })

  // ── Кабинет: профиль пользователя (Telegram-auth) ──────────────────────────
  // Профиль хранится на Client (source=telegram, externalId=telegramId). phone/email/
  // birthDate шифруются (lib/client-crypto); fullName — открыто. Дата рождения — строка
  // «дд.мм.гггг», хранится как есть (шифрованно). История заказов — по Order.telegramId.
  function tgUserFromReq(req: Request): { id?: number; username?: string; first_name?: string; last_name?: string } {
    try { return JSON.parse(new URLSearchParams(req.headers['x-telegram-init-data'] as string).get('user') || '{}') } catch { return {} }
  }
  const safeDecrypt = (v: string | null): string => {
    try { return decryptClientField(v) ?? '' } catch { return '' }
  }

  app.get('/api/profile', requireTelegramAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const telegramId = String((req as unknown as { telegramId: number }).telegramId)
      const tgUser = tgUserFromReq(req)
      const client = await prisma.client.findUnique({
        where: { source_externalId: { source: 'telegram', externalId: telegramId } },
      })
      const hasProfile = !!client?.pdnConsentAt   // согласие уже дано → чекбокс прячем
      res.setHeader('Cache-Control', 'private, no-store, must-revalidate')
      res.json({
        fullName: client?.fullName ?? '',
        birthDate: safeDecrypt(client?.birthDate ?? null),
        phone: safeDecrypt(client?.phone ?? null),
        email: safeDecrypt(client?.email ?? null),
        telegramUsername: client?.telegramUsername ?? tgUser.username ?? '',
        createdAt: client?.createdAt ? client.createdAt.toISOString() : null,
        hasProfile,        // true → согласие на ПДн уже собрано, чекбокс можно скрыть
      })
    } catch (err) { if (!res.headersSent) next(err) }
  })

  app.put('/api/profile', requireTelegramAuth, express.json(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const telegramId = String((req as unknown as { telegramId: number }).telegramId)
      const body = (req.body ?? {}) as Record<string, unknown>
      const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
      const fullName = clean(body.fullName).slice(0, 120)
      const birthDate = clean(body.birthDate)
      const phone = clean(body.phone).slice(0, 32)
      const email = clean(body.email).slice(0, 120)

      // Валидация формата (пустое поле допустимо — просто не сохраняем его)
      const fields: string[] = []
      if (birthDate) {
        if (!/^\d{2}\.\d{2}\.\d{4}$/.test(birthDate)) fields.push('birthDate')
        else {
          const parts = birthDate.split('.')
          const d = Number(parts[0]), m = Number(parts[1]), y = Number(parts[2])
          const dt = new Date(y, m - 1, d)
          if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d || y < 1900 || y > new Date().getFullYear()) fields.push('birthDate')
        }
      }
      if (phone && !/^\+?[0-9][0-9\s()\-]{6,19}$/.test(phone)) fields.push('phone')
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) fields.push('email')
      if (fields.length) { res.status(400).json({ error: 'validation', fields }); return }

      const existing = await prisma.client.findUnique({
        where: { source_externalId: { source: 'telegram', externalId: telegramId } },
      })
      const alreadyConsented = !!existing?.pdnConsentAt
      const settingPII = !!(fullName || birthDate || phone || email)
      // Согласие на обработку ПДн обязательно при ПЕРВОМ сохранении перс. данных
      if (settingPII && !alreadyConsented && body.consent !== true) {
        res.status(400).json({ error: 'consent_required' }); return
      }

      // НЕ затираем существующее значение пустым: пишем только непустые поля
      const data: Record<string, any> = {}
      if (fullName) data.fullName = fullName
      if (birthDate) data.birthDate = encryptClientField(birthDate)
      if (phone) data.phone = encryptClientField(phone)
      if (email) data.email = encryptClientField(email)
      // Юр. факт согласия: timestamp рядом с клиентом (первый раз), + запись в security-log ниже
      if (settingPII && !alreadyConsented) data.pdnConsentAt = new Date()

      const tgUser = tgUserFromReq(req)
      const nameForRecord = fullName || existing?.name || tgUser.username || tgUser.first_name || ('tg_' + telegramId)
      await prisma.client.upsert({
        where: { source_externalId: { source: 'telegram', externalId: telegramId } },
        update: data,
        create: { name: nameForRecord, source: 'telegram', externalId: telegramId, telegramUsername: tgUser.username ?? null, ...data },
      })
      if (settingPII && !alreadyConsented) {
        await logSecurityEvent('pdn_consent', { telegramId, at: new Date().toISOString() }, telegramId)
      }
      res.json({ ok: true })
    } catch (err) { if (!res.headersSent) next(err) }
  })

  app.get('/api/my-orders', requireTelegramAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const telegramId = String((req as unknown as { telegramId: number }).telegramId)
      const orders = await prisma.order.findMany({
        where: { telegramId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { items: { select: { productName: true, quantity: true, priceAtPurchase: true } } },
      })
      res.setHeader('Cache-Control', 'private, no-store, must-revalidate')
      res.json(orders.map(o => ({
        id: o.id,
        createdAt: o.createdAt.toISOString(),
        totalAmount: o.totalAmount.toString(),
        status: o.status,
        items: o.items.map(i => ({ name: i.productName, quantity: i.quantity, price: i.priceAtPurchase.toString() })),
      })))
    } catch (err) { if (!res.headersSent) next(err) }
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
        imageUrl: publicImageFileUrl(b.imageFile),
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

    // file_id может принадлежать баннеру ИЛИ фото категории: раньше
    // категорийные картинки из бота отдавали 404, потому что искали только
    // в HeroBanner.
    const [banner, category] = await Promise.all([
      prisma.heroBanner.findFirst({ where: { imageFile: fileId }, select: { id: true } }),
      prisma.category.findFirst({ where: { imageFile: fileId }, select: { id: true } }),
    ])
    if (!banner && !category) {
      res.status(404).send('Not found')
      return
    }

    try {
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
          .get(downloadUrl, async (tgRes) => {
            try {
              const chunks: Buffer[] = []
              for await (const chunk of tgRes) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
              }
              const inputBuffer = Buffer.concat(chunks)

              try {
                const sharp = (await import('sharp')).default
                const optimized = await sharp(inputBuffer)
                  .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
                  .webp({ quality: 85 })
                  .toBuffer()

                res.setHeader('Content-Type', 'image/webp')
                res.setHeader('Cache-Control', 'public, max-age=86400')
                res.end(optimized)
              } catch {
                // Fallback: sharp не справился — отдать оригинал
                res.setHeader('Content-Type', getImageContentType(filePath))
                res.setHeader('Cache-Control', 'public, max-age=86400')
                res.end(inputBuffer)
              }
              resolve()
            } catch (err) {
              reject(err)
            }
          })
          .on('error', reject)
        request.setTimeout(10_000, () => {
          request.destroy(new Error('Telegram download timeout'))
        })
      })
    } catch (err) {
      if (!res.headersSent) {
        res.status(404).json({ error: 'File not available' })
      }
    }
  })

  // ── GET /api/photo/:fileId — прокси фото товаров для Avito XML ─────────────
  app.get('/api/photo/:fileId', async (req, res) => {
    const fileId = String(req.params.fileId ?? '')
    const FILE_ID_RE_PHOTO = /^[A-Za-z0-9_\-]{10,200}$/
    if (!fileId || !FILE_ID_RE_PHOTO.test(fileId)) { res.status(400).send('Invalid'); return }

    try {
      const filePath = await new Promise<string>((resolve, reject) => {
        const tgUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
        const request = https
          .get(tgUrl, (tgRes) => {
            let data = ''
            tgRes.on('data', (chunk: string) => (data += chunk))
            tgRes.on('end', () => {
              try {
                const json = JSON.parse(data)
                if (!json.ok) return reject(new Error('Telegram getFile failed'))
                resolve(json.result.file_path as string)
              } catch (e) { reject(e) }
            })
          })
          .on('error', reject)
        request.setTimeout(10_000, () => { request.destroy(new Error('timeout')) })
      })

      const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
      await new Promise<void>((resolve, reject) => {
        const request = https
          .get(downloadUrl, (tgRes) => {
            res.setHeader('Content-Type', getImageContentType(filePath))
            res.setHeader('Cache-Control', 'public, max-age=604800')
            tgRes.pipe(res)
            tgRes.on('end', resolve)
            tgRes.on('error', reject)
          })
          .on('error', reject)
        request.setTimeout(10_000, () => { request.destroy(new Error('timeout')) })
      })
    } catch {
      if (!res.headersSent) res.status(404).json({ error: 'File not available' })
    }
  })

  // ── GET /api/avito-feed.xml — XML Autoload для Avito ──────────────────────
  app.get('/api/avito-feed.xml', downloadLimiter, async (_req, res) => {
    try {
      const products = await prisma.product.findMany({
        where: { isAvailable: true, avitoEnabled: true },
        include: { category: true },
      })

      const AVITO_CAT: Record<string, { category: string; goodsType?: string }> = {
        'Телефоны': { category: 'Телефоны', goodsType: 'Смартфоны' },
        'Планшеты': { category: 'Планшеты и электронные книги', goodsType: 'Планшеты' },
        'Ноутбуки': { category: 'Ноутбуки' },
        'Аудио': { category: 'Аудио и видео', goodsType: 'Наушники' },
        'Часы': { category: 'Часы и украшения', goodsType: 'Наручные часы' },
        'Desktop': { category: 'Настольные компьютеры' },
        'Компьютеры': { category: 'Настольные компьютеры' },
        'Игровые консоли': { category: 'Игры, приставки и программы', goodsType: 'Игровые приставки' },
        'Телевизоры': { category: 'Телевизоры и проекторы', goodsType: 'Телевизоры' },
        'Умный дом': { category: 'Бытовая электроника' },
        'Красота и уход': { category: 'Бытовая техника', goodsType: 'Красота и здоровье' },
        'Фототехника': { category: 'Фототехника' },
        'Экшн-камеры': { category: 'Фототехника', goodsType: 'Экшн-камеры' },
        'Дроны': { category: 'Фототехника', goodsType: 'Квадрокоптеры' },
        'Гаджеты': { category: 'Бытовая электроника' },
        'Аксессуары': { category: 'Аксессуары' },
        'Дисплеи': { category: 'Мониторы' },

        // Линейки из колонки «Категория». После удаления «Общей категории» из таблицы
        // Product.category хранит именно линейку, поэтому без этих ключей фид молча
        // отбрасывал бы все объявления (маппинг не найден → continue).
        'iPhone': { category: 'Телефоны', goodsType: 'Смартфоны' },
        'Galaxy S': { category: 'Телефоны', goodsType: 'Смартфоны' },
        'Galaxy Z': { category: 'Телефоны', goodsType: 'Смартфоны' },
        'iPad': { category: 'Планшеты и электронные книги', goodsType: 'Планшеты' },
        'MacBook': { category: 'Ноутбуки' },
        'iMac': { category: 'Настольные компьютеры' },
        'Mac Mini': { category: 'Настольные компьютеры' },
        'Mac Studio': { category: 'Настольные компьютеры' },
        'Apple Watch': { category: 'Часы и украшения', goodsType: 'Наручные часы' },
        'Фитнес-часы': { category: 'Часы и украшения', goodsType: 'Наручные часы' },
        'Фитнес-браслеты': { category: 'Часы и украшения', goodsType: 'Наручные часы' },
        'AirPods': { category: 'Аудио и видео', goodsType: 'Наушники' },
        'Пылесосы': { category: 'Бытовая техника', goodsType: 'Пылесосы' },
        'Фены': { category: 'Бытовая техника', goodsType: 'Красота и здоровье' },
        'Стайлеры': { category: 'Бытовая техника', goodsType: 'Красота и здоровье' },
        'Выпрямители': { category: 'Бытовая техника', goodsType: 'Красота и здоровье' },
        'Уход за кожей': { category: 'Бытовая техника', goodsType: 'Красота и здоровье' },
        'Климатическая техника': { category: 'Бытовая техника' },
        'Фотоаппараты': { category: 'Фототехника' },
        'Мгновенная фотография': { category: 'Фототехника' },
        'Стабилизаторы': { category: 'Фототехника' },
        'Панорамные камеры': { category: 'Фототехника', goodsType: 'Экшн-камеры' },
        'Веб-камеры': { category: 'Бытовая электроника' },
        'Микрофоны': { category: 'Аудио и видео' },
        'VR-гарнитуры': { category: 'Игры, приставки и программы', goodsType: 'Игровые приставки' },
        'Расходные материалы': { category: 'Аксессуары' },
        'Защитные стекла': { category: 'Аксессуары' },
      }

      const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      const address = process.env.AVITO_ADDRESS || 'Москва, ул. Барклая, д. 8, ТЦ Горбушка, Павильон 202'
      const phone = process.env.AVITO_PHONE || ''
      const manager = process.env.AVITO_MANAGER || 'Bender Shop'
      const baseUrl = process.env.WEBAPP_URL || 'https://bendershop.store'

      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<Ads formatVersion="3" target="Avito.ru">\n'

      for (const p of products) {
        const catName = p.category?.name || ''
        const mapping = AVITO_CAT[catName]
        if (!mapping) continue

        xml += '  <Ad>\n'
        xml += `    <Id>bshop-${p.id}</Id>\n`
        xml += `    <Title>${escXml((p.name || '').slice(0, 100))}</Title>\n`
        xml += `    <Description>${escXml((p.description || p.name || '').slice(0, 7500))}</Description>\n`
        xml += `    <Price>${Math.round(Number(p.price))}</Price>\n`
        xml += `    <Category>${escXml(mapping.category)}</Category>\n`
        if (mapping.goodsType) xml += `    <GoodsType>${escXml(mapping.goodsType)}</GoodsType>\n`
        xml += `    <Condition>Новое</Condition>\n`
        xml += `    <Address>${escXml(address)}</Address>\n`
        if (phone) xml += `    <ContactPhone>${escXml(phone)}</ContactPhone>\n`
        xml += `    <ManagerName>${escXml(manager)}</ManagerName>\n`

        if (p.photos.length > 0) {
          xml += '    <Images>\n'
          for (const fid of p.photos.slice(0, 10)) {
            xml += `      <Image url="${baseUrl}/api/photo/${fid}"/>\n`
          }
          xml += '    </Images>\n'
        }

        xml += '  </Ad>\n'
      }

      xml += '</Ads>'
      res.setHeader('Content-Type', 'application/xml; charset=utf-8')
      res.setHeader('Cache-Control', 'public, max-age=1800')
      res.send(xml)
    } catch (err) {
      log.error('Avito XML generation failed', { error: err instanceof Error ? err.message : String(err) })
      if (!res.headersSent) res.status(500).send('Internal error')
    }
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
        fgColor: { argb: 'FF2B579A' },
      }
      const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } }
      const exampleFill: ExcelJS.FillPattern = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF3CD' },
      }
      const exampleFont: Partial<ExcelJS.Font> = { color: { argb: 'FF856404' } }

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
                formatAttrPairs(ex1.attributes),
            ]
          : ['VARIANT-SKU-001', 5, 'Приход со склада', 'Название товара'],
        ex2
          ? [
              ex2.sku,
              -2,
              'Возврат',
              ex2.product.name +
                ' — ' +
                formatAttrPairs(ex2.attributes),
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

      const rowFills = ['FFFFFFFF', 'FFF2F2F2']
      variants.forEach((v, i) => {
        const attrs = formatAttrPairs(v.attributes)
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
  app.post('/api/orders', async (req: Request, res: Response, next: NextFunction) => {
    // Пауза приёма заказов (владелец включает в админке). Гейт именно
    // серверный: витрина тоже прячет оформление, но полагаться на клиент,
    // когда речь про деньги и обязательства перед покупателем, нельзя.
    try {
      if ((await getApiKeyValue('setting_maintenance')) === '1') {
        const note = (await getApiKeyValue('setting_maintenance_note')) || ''
        res.status(503).json({
          error: note || 'Магазин временно не принимает заказы. Загляните чуть позже — товары и цены на месте.',
          maintenance: true,
        })
        return
      }
    } catch { /* настройка недоступна — не мешаем продавать */ }

    const {
      items,
      customerName,
      customerPhone,
      deliveryType,
      deliveryAddress,
      customerComment,
    } = req.body

    // Frontend sends "payment", accept both field names
    const paymentMethod: string | undefined = req.body.paymentMethod || req.body.payment

    log.info('Order received', {
      items: req.body.items?.length ?? 0,
      payment: req.body.paymentMethod || req.body.payment,
      delivery: req.body.deliveryMethod || req.body.delivery,
      hasTelegramAuth: !!req.headers['x-telegram-init-data'],
    })

    // Telegram auth: optional — validate if header present, fallback to form data
    let telegramId = ''
    const initData = req.headers['x-telegram-init-data'] as string | undefined
    if (initData) {
      const { valid, userId } = validateTelegramWebApp(initData)
      if (valid && userId) {
        telegramId = String(userId)
      }
    }

    // Fallback: use telegramId from body if sent by frontend (unverified)
    if (!telegramId && req.body.telegramId) {
      telegramId = 'unverified_' + String(req.body.telegramId)
      log.warn('Unverified telegramId from body', { telegramId })
    }

    // If no Telegram auth, require name + phone from form
    if (!telegramId) {
      if (!customerName || customerName.trim().length < 2 || !customerPhone) {
        res.status(400).json({ error: 'Укажите ФИО и телефон' })
        return
      }
      telegramId = 'web_' + Date.now()
    }

    // ── Валидация входящих данных ──────────────────────────────────────────
    if (!Array.isArray(items) || items.length === 0) {
      log.warn('Order validation failed', { reason: 'empty items', telegramId })
      await logSecurityEvent('invalid_order_data', { ip: req.ip, reason: 'empty items', telegramId }, telegramId)
      res.status(400).json({ error: 'Корзина пуста' })
      return
    }
    // Потолок позиций: честная корзина столько не набирает, а каждая позиция —
    // запрос в БД внутри транзакции заказа
    if (items.length > 50) {
      log.warn('Order validation failed', { reason: 'too many items', count: items.length, telegramId })
      await logSecurityEvent('invalid_order_data', { ip: req.ip, reason: 'too many items', count: items.length, telegramId }, telegramId)
      res.status(400).json({ error: 'Слишком много позиций в заказе' })
      return
    }

    if (!paymentMethod || !['cash', 'card'].includes(paymentMethod)) {
      log.warn('Order validation failed', { reason: 'invalid paymentMethod', paymentMethod, rawPayment: req.body.payment, rawPaymentMethod: req.body.paymentMethod })
      res.status(400).json({ error: 'Неверный способ оплаты' })
      return
    }

    if (!customerName || customerName.trim().length < 2) {
      log.warn('Order validation failed', { reason: 'invalid customerName', length: (customerName || '').length })
      res.status(400).json({ error: 'Укажите ФИО' })
      return
    }

    const phoneDigits = (customerPhone || '').replace(/\D/g, '')
    if (phoneDigits.length !== 11 || !phoneDigits.startsWith('7')) {
      log.warn('Order validation failed', { reason: 'invalid phone', digits: phoneDigits.length })
      res.status(400).json({ error: 'Неверный формат телефона. Используйте +7 (XXX) XXX-XX-XX' })
      return
    }

    if (!['pickup', 'delivery'].includes(deliveryType)) {
      log.warn('Order validation failed', { reason: 'invalid deliveryType', deliveryType })
      res.status(400).json({ error: 'Неверный тип доставки' })
      return
    }

    if (deliveryType === 'delivery' && (!deliveryAddress || deliveryAddress.trim().length < 5)) {
      log.warn('Order validation failed', { reason: 'missing delivery address' })
      res.status(400).json({ error: 'Укажите адрес доставки' })
      return
    }

    // Normalize item fields: frontend sends qty/price as string
    for (const item of items) {
      item.variantId = parseInt(item.variantId) || 0
      item.quantity = parseInt(item.quantity ?? item.qty) || 0
      item.price = parseFloat(item.price) || 0

      if (item.variantId <= 0) {
        log.warn('Order validation failed', { reason: 'invalid variantId', variantId: item.variantId })
        await logSecurityEvent('invalid_order_data', { ip: req.ip, reason: 'invalid variantId', item, telegramId }, telegramId)
        res.status(400).json({ error: 'Неверный ID товара' })
        return
      }
      if (item.quantity < 1 || item.quantity > 99) {
        log.warn('Order validation failed', { reason: 'invalid quantity', variantId: item.variantId, quantity: item.quantity })
        res.status(400).json({ error: 'Неверное количество товара' })
        return
      }
    }

    // ── Платная доставка: геокод адреса ДО транзакции ──────────────────────
    // Сеть внутри транзакции недопустима. Клиентские оценки не принимаем:
    // сервер сам геокодит поданный адрес. Любой сбой DaData → null → заказ
    // всё равно пройдёт, но со статусом «стоимость уточнит оператор».
    const deliveryPricingOn = deliveryPricingEnabled() && deliveryType === 'delivery'
    let deliveryVerified: VerifiedAddress | null = null
    let deliveryConfig: DeliveryPricingConfig | null = null
    if (deliveryPricingOn) {
      ;[deliveryVerified, deliveryConfig] = await Promise.all([
        verifyAddress(String(deliveryAddress)),
        loadDeliveryPricingConfig(),
      ])
    }

    // ── Весь заказ атомарно: проверка остатков, создание заказа, списание ──
    try {
      let pdnConsentNew = false // A4: согласие впервые проставлено в этом заказе
      let deliveryQuote: DeliveryQuote | null = null
      const order = await prisma.$transaction(async (tx) => {
        let totalDecimal = new Decimal(0)
        const enrichedItems: Array<{
          variantId: number
          productId: number
          name: string
          price: string
          quantity: number
          newQty: number
          isPreorder: boolean
        }> = []
        // Позиции для расчёта предоплаты: считаем СЕРВЕРОМ, как цены и доставку
        const preorderLines: Array<{ lineTotal: Decimal; policy: PreorderPolicy | null; name: string }> = []
        // Дефолты магазина читаем один раз на заказ
        const preorderDefaults = await loadPreorderDefaults()

        // Загрузка актуальных цен из БД, проверка остатков
        for (const item of items) {
          const variant = await tx.productVariant.findUnique({
            where: { id: item.variantId },
            include: { product: true },
          })

          const stockCheckEnabled = process.env.STOCK_WRITEOFF_ENABLED === 'true'
          // Скрытый товар / черновик (price=0) не покупается никогда,
          // остаток — при включённом списании (lib/order-checks.ts)
          assertOrderableVariant(variant, item.quantity, stockCheckEnabled, item.variantId)

          // Цена всегда из БД — никогда от клиента
          const variantPrice = new Decimal(variant.price)
          if (item.price !== undefined && !variantPrice.equals(new Decimal(item.price))) {
            try {
              await logSecurityEvent('price_manipulation_attempt', {
                ip: req.ip,
                telegramId,
                variantId: item.variantId,
                submittedPrice: item.price,
                actualPrice: variantPrice.toFixed(2),
              }, telegramId)
            } catch { /* logging must not break order creation */ }
          }
          const lineTotal = variantPrice.times(item.quantity)
          totalDecimal = totalDecimal.plus(lineTotal)

          // Предзаказ: политика складывается из полей товара поверх дефолтов
          // магазина. Полузаполненный предзаказ не продаём — иначе взяли бы с
          // покупателя сумму, которой никто не назначал.
          const readiness = resolvePreorder(variant.product, preorderDefaults)
          if (readiness.kind === 'incomplete') {
            log.warn('Preorder not configured, order rejected', {
              variantId: item.variantId, gaps: readiness.gaps,
            })
            throw Object.assign(
              new Error('Предзаказ этого товара пока не настроен — напишите менеджеру'),
              { isStockConflict: true },
            )
          }
          const policy = readiness.kind === 'ready' ? readiness.policy : null
          const itemName = formatProductNameWithAttrs(variant.product.name, variant.attributes)
          preorderLines.push({ lineTotal, policy, name: itemName })

          enrichedItems.push({
            variantId: variant.id,
            productId: variant.productId,
            isPreorder: policy !== null,
            // Сохраняем имя товара вместе с атрибутами варианта в OrderItem.productName.
            // Это автоматически подтянет атрибуты во все уведомления: админам в топик
            // продаж, админам в личку, в CRM-топик клиента, в личку клиенту.
            // Старые заказы остаются со своими именами — несогласованность приемлема.
            name: itemName,
            price: variantPrice.toFixed(2),
            quantity: item.quantity,
            newQty: variant.quantity - item.quantity,
          })
        }

        // Стоимость доставки: чистый расчёт (сеть отработала до транзакции).
        // Итог заказа = товары из БД + доставка; порог бесплатной считается
        // от суммы товаров. Фолбэк «уточнит оператор» — deliveryCost=null,
        // к сумме ничего не прибавляется (НЕ ноль-рублей-доставка).
        if (deliveryPricingOn) {
          deliveryQuote = computeDeliveryCost(deliveryVerified, deliveryConfig, totalDecimal)
          if (deliveryQuote.mode === 'fixed') totalDecimal = totalDecimal.plus(deliveryQuote.cost)
        }

        // Предоплата: только по предзаказным позициям и только от товаров
        // (доставка в неё не входит — решение владельца). Остаток заказа —
        // «итог минус предоплата»: туда попадают и обычные позиции, и доставка,
        // ровно то, что оператор возьмёт при выдаче.
        const prep = splitOrderPrepayment(preorderLines)
        const prepaymentAmount = prep.isPreorder ? prep.prepayment : null
        const remainingAmount = prepaymentAmount ? totalDecimal.minus(prepaymentAmount) : null

        // Найти или создать клиента
        const isRealTelegram = telegramId && !telegramId.startsWith('web_')
        const clientSource = isRealTelegram ? 'telegram' as const : 'shop' as const
        let client = await tx.client.findUnique({
          where: { source_externalId: { source: clientSource, externalId: telegramId } },
        })
        if (!client) {
          const defaultSeg = await tx.segment.findFirst({ where: { isDefault: true } })
          // A4: без ПДн-гейта в профиль ничего не пишем — раньше сюда уходил
          // ТЕЛЕФОН ОТКРЫТЫМ ТЕКСТОМ без согласия. Теперь профиль наполняет
          // только buildProfileWriteback ниже (шифрование + гейт согласия).
          client = await tx.client.create({
            data: {
              name: customerName.trim(),
              source: clientSource,
              externalId: telegramId,
              segmentId: defaultSeg?.id ?? null,
            },
          })
        }

        // A4: обратная запись профиля из заказа — только при согласии
        // (галочка чекаута pdnConsent или уже проставленный pdnConsentAt),
        // только пустые поля, телефон шифруется.
        const writeback = buildProfileWriteback(
          { fullName: client.fullName, phone: client.phone, pdnConsentAt: client.pdnConsentAt },
          { fullName: customerName, phone: customerPhone },
          req.body.pdnConsent === true,
        )
        if (writeback.data) {
          await tx.client.update({ where: { id: client.id }, data: writeback.data })
          pdnConsentNew = writeback.consentIsNew
        }

        // Создать заказ
        const order = await tx.order.create({
          data: {
            clientId: client.id,
            telegramId,
            items: {
              create: enrichedItems.map((i) => ({
                variantId: i.variantId,
                quantity: i.quantity,
                priceAtPurchase: i.price,
                productName: i.name,
                isPreorder: i.isPreorder,
              })),
            },
            totalAmount: totalDecimal.toFixed(2),
            // Условия снимаем КОПИЕЙ: их потом поменяют, а обязательство перед
            // покупателем остаётся тем, что он видел на чекауте.
            isPreorder: prep.isPreorder,
            prepaymentAmount: prepaymentAmount ? prepaymentAmount.toFixed(2) : null,
            remainingAmount: remainingAmount ? remainingAmount.toFixed(2) : null,
            preorderTermsSnapshot: prep.terms,
            payment: paymentMethod as 'cash' | 'card',
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            deliveryType: deliveryType as DeliveryType,
            deliveryAddress: deliveryAddress?.trim() ?? null,
            customerComment: typeof customerComment === 'string' ? customerComment.trim().slice(0, 500) : null,
            // Разложение доставки: зона/гео пишутся и в режиме «оператор»
            // (когда получены) — оператору важно видеть, что адрес вне Москвы.
            // Км (deliveryDistanceKm) упрощённая модель не считает — остаётся NULL,
            // колонка зарезервирована под ручной ввод «км от метро».
            ...(deliveryPricingOn ? {
              deliveryCost: deliveryQuote?.mode === 'fixed' ? deliveryQuote.cost.toFixed(2) : null,
              deliveryZone: deliveryZoneOf(deliveryVerified),
              deliveryGeoLat: deliveryVerified?.geoLat ?? null,
              deliveryGeoLon: deliveryVerified?.geoLon ?? null,
              deliveryQcGeo: deliveryVerified?.qcGeo ?? null,
            } : {}),
          },
        })

        // Списать со склада (только если складской учёт включён)
        const doWriteoff = process.env.STOCK_WRITEOFF_ENABLED === 'true'
        for (const item of enrichedItems) {
          // Предзаказ со склада не списывается и движения не порождает: товара
          // физически нет, а движение «out» на несуществующий остаток увело бы
          // складскую историю в минус и посчиталось бы продажей в отчётах.
          if (item.isPreorder) continue
          if (doWriteoff) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: {
                quantity: { decrement: item.quantity },
                inStock: item.newQty > 0,
              },
            })
            // Decrement Product-level quantity/stock (mirrors atomicSale behavior)
            await tx.product.update({
              where: { id: item.productId },
              data: {
                quantity: { decrement: item.quantity },
                stock: { decrement: item.quantity },
              },
            })
          }
          await tx.stockMovement.create({
            data: {
              variantId: item.variantId,
              type: 'out',
              quantity: item.quantity,
              comment: `Заказ #${order.id}`,
              createdBy: telegramId,
            },
          })
          // Complete active reservation if exists
          const activeReserve = await tx.reservation.findFirst({
            where: { productId: item.productId, variantId: item.variantId, status: 'active' },
          })
          if (activeReserve) {
            await tx.reservation.update({
              where: { id: activeReserve.id },
              data: { status: 'completed' },
            })
            await tx.product.update({
              where: { id: item.productId },
              data: { reserved: { decrement: Math.min(activeReserve.quantity, item.quantity) } },
            })
          }
        }

        // Обновить статистику клиента
        await tx.client.update({
          where: { id: client.id },
          data: {
            totalPurchases: { increment: 1 },
            totalRevenue: { increment: totalDecimal },
            lastPurchaseDate: new Date(),
          },
        })

        return order
      })

      trackEvent({
        type: 'order_created',
        data: {
          orderId: order.id,
          itemCount: items.length,
          total: Number(order.totalAmount),
          payment: paymentMethod,
          delivery: deliveryType,
        },
        source: telegramId.startsWith('unverified_') || telegramId.startsWith('web_') ? 'web' : 'telegram',
      })

      // A4: юр. факт первого согласия — в security-log (как в PUT /api/profile)
      if (pdnConsentNew) {
        try {
          await logSecurityEvent('pdn_consent', { telegramId, at: new Date().toISOString(), source: 'checkout' }, telegramId)
        } catch { /* лог не должен ломать заказ */ }
      }

      // Ответ клиенту СРАЗУ — до уведомлений
      log.info('Order created', { orderId: order.id, telegramId, items: items.length, total: Number(order.totalAmount), paymentMethod })
      if (!res.headersSent) {
        // При включённом расчёте доставки фронт показывает итог СЕРВЕРА
        // (клиентская цифра — лишь предварительная оценка). При выключенном
        // флаге ответ остаётся прежним byte-в-byte.
        if (deliveryPricingEnabled()) {
          res.json({
            success: true,
            orderId: order.id,
            totalAmount: order.totalAmount.toString(),
            deliveryCost: order.deliveryCost !== null ? order.deliveryCost.toString() : null,
            deliveryPending: deliveryPricingOn && order.deliveryCost === null,
          })
        } else {
          res.json({ success: true, orderId: order.id })
        }
        log.debug('Order response sent', { orderId: order.id })
      }

      // ── Уведомления в фоне (не блокируют ответ) ────────────────────
      const totalStr = order.totalAmount.toString()
      ;(async () => {
        try {
          const enrichedItems: Array<{ name: string; quantity: number; price: string }> = []
          const orderItems = await prisma.orderItem.findMany({
            where: { orderId: order.id },
          })
          for (const oi of orderItems) {
            enrichedItems.push({
              name: oi.productName,
              quantity: oi.quantity,
              price: oi.priceAtPurchase.toString(),
            })
          }

          const itemLines = enrichedItems.map(i =>
            `  • ${i.name} × ${i.quantity} — ${Number(i.price).toLocaleString('ru-RU')}₽`
          ).join('\n')

          const cardSurcharge = paymentMethod === 'card' ? '\n💳 Эквайринг +14%' : ''
          let deliveryText = deliveryType === 'pickup'
            ? '📍 Самовывоз (ТЦ Горбушка, 202)'
            : `🚚 Доставка: ${deliveryAddress}`
          if (deliveryPricingOn) {
            if (order.deliveryCost !== null) {
              const costRub = Number(order.deliveryCost)
              deliveryText += costRub === 0
                ? ' — бесплатно, порог по сумме (Москва)'
                : ` — ${costRub.toLocaleString('ru-RU')}₽ (Москва)`
            } else {
              // Регион из геокода подсказывает оператору, почему авто-цены нет
              // (Московская обл / другой регион / адрес не распознан).
              const regionNote = deliveryVerified?.regionWithType
                ? ` (${deliveryVerified.regionWithType} — вне Москвы)`
                : ' (адрес не распознан)'
              deliveryText += ` — ❗ стоимость уточнит оператор${regionNote}`
            }
          }
          const commentLine = customerComment ? `\n💬 Комментарий: ${String(customerComment).slice(0, 200)}` : ''

          // Получить клиента (telegram или shop)
          const isRealTg = telegramId && !telegramId.startsWith('web_')
          let client = await prisma.client.findUnique({
            where: { source_externalId: { source: isRealTg ? 'telegram' : 'shop', externalId: telegramId } },
          })

          // Создать CRM топик если его нет
          if (client && !client.telegramTopicId && CRM_GROUP_ID && isRealTg) {
            try {
              const topic = await telegram.createForumTopic(CRM_GROUP_ID, `${client.name}`)
              client = await prisma.client.update({
                where: { id: client.id },
                data: { telegramTopicId: topic.message_thread_id },
              })
            } catch (err) { log.error('Topic creation error', { error: err instanceof Error ? err.message : String(err) }) }
          }
          const tgUsername = client?.telegramUsername ?? null
          const tgLink = tgUsername
            ? `https://t.me/${tgUsername.replace('@', '')}`
            : `tg://user?id=${telegramId}`
          const tgLine = tgUsername ? `📱 Telegram: ${tgUsername} (${tgLink})` : `📱 Telegram: ${tgLink}`

          // Разложение итога: при посчитанной доставке оператор видит
          // «товары + доставка = итого», при фолбэке — что итог БЕЗ доставки.
          const totalLines = [`💵 Итого: ${totalStr}₽`]
          if (deliveryPricingOn && order.deliveryCost !== null) {
            const goodsStr = new Decimal(order.totalAmount.toString()).minus(order.deliveryCost.toString()).toFixed(2)
            totalLines.unshift(`🛍 Товары: ${goodsStr}₽ + доставка ${order.deliveryCost.toString()}₽`)
          } else if (deliveryPricingOn && order.deliveryCost === null) {
            totalLines.push(`(доставка НЕ включена — уточнит оператор)`)
          }

          // Предзаказ виден оператору первой строкой: он берёт предоплату руками,
          // и суммы должны быть перед глазами, а не в глубине сообщения.
          const preorderLines: string[] = []
          if (order.isPreorder && order.prepaymentAmount !== null) {
            const pre = Number(order.prepaymentAmount).toLocaleString('ru-RU')
            const rest = order.remainingAmount !== null
              ? Number(order.remainingAmount).toLocaleString('ru-RU')
              : '—'
            preorderLines.push(`⏳ ПРЕДЗАКАЗ — предоплата ${pre} ₽ · остаток ${rest} ₽`)
            const preNames = orderItems.filter(i => i.isPreorder).map(i => i.productName)
            if (preNames.length && preNames.length !== orderItems.length) {
              // Смешанная корзина: без этой строки непонятно, за что предоплата
              preorderLines.push(`   предоплата только за: ${preNames.join(', ')}`)
            }
            if (order.preorderTermsSnapshot) preorderLines.push(`   ${order.preorderTermsSnapshot}`)
            preorderLines.push('')
          }

          const orderText = [
            `🛒 Новый заказ #${order.id}`,
            '',
            ...preorderLines,
            `👤 ${customerName.trim()}`,
            `📞 ${customerPhone.trim()}`,
            tgLine,
            deliveryText,
            `💰 ${paymentMethod === 'cash' ? 'Наличные' : 'Карта'}${cardSurcharge}${commentLine}`,
            '',
            `📦 Товары:`,
            itemLines,
            '',
            ...totalLines,
          ].join('\n')

          // 1. Отправить в топик продаж CRM-группы
          if (CRM_GROUP_ID) {
            try {
              const salesTopicId = await getApiKeyValue('sales_topic')
              if (salesTopicId) {
                await telegram.sendMessage(CRM_GROUP_ID, orderText, {
                  message_thread_id: Number(salesTopicId),
                })
              }
            } catch (e) {
              log.error('Failed to send to CRM group', { error: e instanceof Error ? e.message : String(e) })
            }
          }

          // 2. Отправить всем админам в личку (с кнопкой перехода к клиенту если есть топик)
          const orderButtons = (client?.telegramTopicId && CRM_GROUP_ID)
            ? Markup.inlineKeyboard([[
                Markup.button.url('👤 Перейти к клиенту', `https://t.me/c/${String(CRM_GROUP_ID).replace('-100', '')}/${client.telegramTopicId}`),
              ]])
            : undefined
          for (const adminId of ADMIN_IDS) {
            try {
              await telegram.sendMessage(adminId, orderText, orderButtons)
            } catch { /* ignore */ }
          }

          // (Дубль заказа в персональный топик клиента убран — решение владельца:
          // заказ = одно сообщение в «Продажи и резервы» + личка админам. Топик
          // по-прежнему создаётся выше, кнопка «Перейти к клиенту» остаётся.)

          // 4. Подтверждение клиенту в личку
          try {
            await telegram.sendMessage(telegramId, [
              `✅ Ваш заказ #${order.id} оформлен!`,
              '',
              `📦 ${enrichedItems.map(i => i.name).join(', ')}`,
              `💵 Итого: ${totalStr}₽`,
              '',
              deliveryType === 'pickup'
                ? '📍 Заберите заказ по адресу: Барклая 8, ТЦ Горбушка, Павильон 202\n⏰ Ежедневно с 11:00 до 20:00'
                : `🚚 Доставка по адресу: ${deliveryAddress}`,
              '',
              'Мы свяжемся с вами для подтверждения!',
            ].join('\n'))
          } catch { /* ignore: user may have blocked bot */ }
        } catch (err) {
          log.error('Order notification error', { error: err instanceof Error ? err.message : String(err) })
        }
      })()
    } catch (err: any) {
      Sentry.captureException(err, { tags: { operation: 'create-order' } })
      if (err.isStockConflict) {
        log.info('Order stock conflict', { telegramId, reason: err.message })
        // Тексты правил написаны для покупателя (скрытый товар, черновик без
        // цены, ненастроенный предзаказ) — отдаём их как есть. Раньше любой
        // отказ выглядел как «товар закончился», и покупатель шёл ждать
        // поступления там, где ждать было нечего.
        if (!res.headersSent) {
          res.status(409).json({ error: err.message || 'Товар закончился или недоступен' })
        }
        return
      }
      if (!res.headersSent) next(err)
    }
  })

  // ── Sentry error handler (must be before custom error handler) ─────────────
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app)
  }

  // ── Глобальный обработчик ошибок ───────────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    log.error('Unhandled API error', { error: err.message, stack: err.stack })
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' })
  })

  const server = app.listen(PORT, '0.0.0.0', () => {
    log.info('Server listening', { port: PORT, url: `http://localhost:${PORT}/shop` })
  })
  server.on('error', (err) => { log.error('Listen failed', { error: err.message }); process.exit(1) })

  return server
}
