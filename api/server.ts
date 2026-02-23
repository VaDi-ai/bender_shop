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
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'

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
            ...(category ? { category } : {}),
          },
          orderBy: { name: 'asc' },
        })

        const payload = products.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description ?? '',
          price: p.price.toString(),
          category: p.category ?? '',
          photoUrl: p.photoUrl ?? '',
        }))

        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify(payload))
      }

      // ── POST /api/orders ────────────────────────────────────────────────────
      if (req.method === 'POST' && url.pathname === '/api/orders') {
        const body = await readBody(req)
        const data = JSON.parse(body) as {
          telegramId?: string
          items: Array<{ productId: number; name: string; price: string; qty: number }>
          totalAmount: string
          payment: string
        }

        if (!data.items?.length || !data.totalAmount || !data.payment) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'Missing required fields' }))
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
