/**
 * api/server.ts
 *
 * Лёгкий HTTP-сервер на встроенном модуле http:
 *   GET  /shop           — раздаёт webapp/index.html (Telegram Mini App)
 *   GET  /api/products   — список товаров из БД (фильтр ?category=...)
 *   POST /api/orders     — создание заказа в БД
 */

import 'dotenv/config'
import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'

const BOT_TOKEN = process.env.BOT_TOKEN ?? ''

const PORT = Number(process.env.API_PORT ?? 3000)
const WEBAPP_FILE = path.join(__dirname, '../webapp/index.html')

// ─── Хелпер: читаем тело запроса ─────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

// ─── Хелпер: форматируем цену ─────────────────────────────────────────────────

export function fmtPrice(amount: number): string {
  return amount.toLocaleString('ru-RU')
}

// ─── Запуск сервера ───────────────────────────────────────────────────────────

export function startApiServer(): void {
  const server = http.createServer(async (req, res) => {
    // CORS — нужен для WebApp в Telegram webview
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }

    const url = new URL(req.url ?? '/', `http://localhost`)

    try {
      // ── Раздаём Mini App ────────────────────────────────────────────────────
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/shop')) {
        const html = fs.readFileSync(WEBAPP_FILE)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        return res.end(html)
      }

      // ── GET /api/products ───────────────────────────────────────────────────
      if (req.method === 'GET' && url.pathname === '/api/products') {
        const category = url.searchParams.get('category') || undefined

        const products = await prisma.product.findMany({
          where: {
            isAvailable: true,
            ...(category ? { category: { name: category } } : {}),
          },
          include: { variants: true, category: true },
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
            reserved: v.reserved,
            inStock: v.inStock,
            attributes: v.attributes,
            photos: v.photos,
          })),
        }))

        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(payload))
      }

      // ── GET /api/categories ─────────────────────────────────────────────────
      if (req.method === 'GET' && url.pathname === '/api/categories') {
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

        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(payload))
      }

      // ── GET /api/brands ─────────────────────────────────────────────────────
      if (req.method === 'GET' && url.pathname === '/api/brands') {
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
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(payload))
      }

      // ── GET /api/settings ───────────────────────────────────────────────────
      if (req.method === 'GET' && url.pathname === '/api/settings') {
        const key = url.searchParams.get('key')
        if (!key) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'Missing key param' }))
        }
        const record = await prisma.apiKey.findUnique({ where: { service: 'setting_' + key } })
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
        res.setHeader('Pragma', 'no-cache')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ value: record?.value ?? '' }))
      }

      // ── GET /api/cache-version ──────────────────────────────────────────────
      if (req.method === 'GET' && url.pathname === '/api/cache-version') {
        const record = await prisma.apiKey.findUnique({ where: { service: 'cache_version' } })
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
        res.setHeader('Pragma', 'no-cache')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ version: record?.value ?? '0' }))
      }

      // ── GET /api/hero-banners ────────────────────────────────────────────────
      if (req.method === 'GET' && url.pathname === '/api/hero-banners') {
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
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(payload))
      }

      // ── GET /api/banner/:fileId ─────────────────────────────────────────────
      if (req.method === 'GET' && url.pathname.startsWith('/api/banner/')) {
        const fileId = url.pathname.slice('/api/banner/'.length)
        if (!fileId) {
          res.writeHead(400)
          return res.end('Missing file id')
        }

        // 1. Получаем путь файла от Telegram
        const filePath = await new Promise<string>((resolve, reject) => {
          const tgUrl = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
          https.get(tgUrl, (tgRes) => {
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
          }).on('error', reject)
        })

        // 2. Скачиваем и стримим клиенту
        const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
        await new Promise<void>((resolve, reject) => {
          https.get(downloadUrl, (tgRes) => {
            res.writeHead(200, {
              'Content-Type': 'image/jpeg',
              'Cache-Control': 'public, max-age=86400',
            })
            tgRes.pipe(res)
            tgRes.on('end', resolve)
            tgRes.on('error', reject)
          }).on('error', reject)
        })
        return
      }

      // ── POST /api/orders ────────────────────────────────────────────────────
      if (req.method === 'POST' && url.pathname === '/api/orders') {
        const body = await readBody(req)
        const data = JSON.parse(body) as {
          telegramId?: string
          items: Array<{
            variantId?: number   // торговое предложение (приоритет)
            productId?: number   // для обратной совместимости (без вариантов)
            name: string
            price: string
            qty: number
          }>
          totalAmount: string
          payment: string
        }

        if (!data.items?.length || !data.totalAmount || !data.payment) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'Missing required fields' }))
        }

        // Проверить наличие остатков
        for (const item of data.items) {
          if (item.variantId) {
            const variant = await prisma.productVariant.findUnique({ where: { id: item.variantId } })
            if (!variant || !variant.inStock || variant.quantity < item.qty) {
              res.writeHead(409, { 'Content-Type': 'application/json' })
              return res.end(JSON.stringify({ error: 'Товар закончился', product: item.name }))
            }
          } else if (item.productId) {
            const product = await prisma.product.findUnique({ where: { id: item.productId } })
            if (!product || product.quantity < item.qty) {
              res.writeHead(409, { 'Content-Type': 'application/json' })
              return res.end(JSON.stringify({ error: 'Товар закончился', product: item.name }))
            }
          }
        }

        // Найти клиента по telegramId если передан
        let clientId: number | null = null
        if (data.telegramId) {
          const client = await prisma.client.findUnique({
            where: { source_externalId: { source: 'telegram', externalId: data.telegramId } },
          })
          clientId = client?.id ?? null
        }

        const order = await prisma.order.create({
          data: {
            clientId,
            telegramId: data.telegramId ?? '',
            items: data.items,
            totalAmount: data.totalAmount,
            payment: data.payment,
          },
        })

        // Уменьшить quantity для варианта или товара
        for (const item of data.items) {
          if (item.variantId) {
            const updatedVariant = await prisma.productVariant.update({
              where: { id: item.variantId },
              data: { quantity: { decrement: item.qty } },
            })
            if (updatedVariant.quantity <= 0) {
              await prisma.productVariant.update({
                where: { id: item.variantId },
                data: { inStock: false },
              })
            }
          } else if (item.productId) {
            const updated = await prisma.product.update({
              where: { id: item.productId },
              data: {
                quantity: { decrement: item.qty },
                stock: { decrement: item.qty },
              },
            })
            if (updated.quantity <= 0) {
              await prisma.product.update({
                where: { id: item.productId },
                data: { isAvailable: false },
              })
            }
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ success: true, orderId: order.id }))
      }

      res.writeHead(404)
      res.end('Not found')
    } catch (err) {
      console.error('[API] Ошибка:', err)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error' }))
    }
  })

  server.listen(PORT, () => {
    console.log(`[API] Сервер запущен: http://localhost:${PORT}/shop`)
  })
}
