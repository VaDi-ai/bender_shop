/**
 * Админ-API (ADMIN-DESIGN §2, Этап 1 / PR-2).
 *
 * Auth: x-telegram-init-data (та же подпись, что у Кабинета) + запись в AdminUser
 * (isActive). env ADMIN_IDS роуты НЕ гейтит — только сидирует AdminUser при старте.
 *
 * Отказоустойчивость (ADMIN-DESIGN §10.5): в окно, когда сид ещё не добежал
 * (таблица пуста) — 403; БД недоступна — 503. Никаких 500 со стектрейсом.
 *
 * Роли: owner — всё; manager — без системного раздела и вне-коридорных
 * применений цен (гейт закладывается здесь, использоваться начнёт с PR-7).
 */
import express, { Router, Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { prisma } from '../lib/prisma'
import { log } from '../lib/logger'
import { logSecurityEvent } from '../lib/security-log'
import { validateTelegramWebApp } from '../lib/telegram-webapp-auth'

export type AdminRole = 'owner' | 'manager'

export interface AdminContext {
  telegramId: string
  name: string | null
  role: AdminRole
}

/** req.admin после requireAdmin */
export interface AdminRequest extends Request {
  admin?: AdminContext
}

export function requireAdmin(minRole?: 'owner') {
  return async function (req: AdminRequest, res: Response, next: NextFunction): Promise<void> {
    const initData = req.headers['x-telegram-init-data'] as string | undefined
    if (!initData) {
      res.status(401).json({ error: 'Требуется авторизация Telegram' })
      return
    }
    const { valid, userId } = validateTelegramWebApp(initData)
    if (!valid || !userId) {
      logSecurityEvent('invalid_telegram_signature', { ip: req.ip, scope: 'admin_api' })
      res.status(401).json({ error: 'Неверная подпись Telegram' })
      return
    }

    let admin: { telegramId: string; name: string | null; role: string } | null
    try {
      admin = await prisma.adminUser.findUnique({
        where: { telegramId: String(userId) },
        select: { telegramId: true, name: true, role: true, isActive: true },
      }).then(a => (a && a.isActive ? a : null))
    } catch (e) {
      // Деградация, не краш: БД моргнула — админка отвечает 503, витрину не трогаем.
      log.error('Admin auth DB error', { error: e instanceof Error ? e.message : String(e) })
      res.status(503).json({ error: 'База данных недоступна, попробуйте позже' })
      return
    }

    if (!admin) {
      // Сюда же попадает окно незавершённого сида после рестарта — это deny, не ошибка.
      logSecurityEvent('admin_access_denied', { ip: req.ip, telegramId: String(userId) })
      res.status(403).json({ error: 'Нет доступа к админке' })
      return
    }
    if (minRole === 'owner' && admin.role !== 'owner') {
      logSecurityEvent('admin_role_denied', { ip: req.ip, telegramId: admin.telegramId, role: admin.role })
      res.status(403).json({ error: 'Недостаточно прав (нужна роль owner)' })
      return
    }

    req.admin = { telegramId: admin.telegramId, name: admin.name, role: admin.role as AdminRole }
    next()
  }
}

// ─── Дашборд «Что сегодня»: границы суток по МСК (магазин живёт в МСК) ────────

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000

export function mskDayStart(now: Date, daysAgo = 0): Date {
  const msk = new Date(now.getTime() + MSK_OFFSET_MS)
  const dayStartMsk = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate() - daysAgo)
  return new Date(dayStartMsk - MSK_OFFSET_MS)
}

async function dashboard(_req: AdminRequest, res: Response): Promise<void> {
  const now = new Date()
  const today = mskDayStart(now)
  const yesterday = mskDayStart(now, 1)

  const [ordersToday, ordersYesterday, lastSync] = await Promise.all([
    prisma.order.aggregate({
      where: { createdAt: { gte: today } },
      _count: true, _sum: { totalAmount: true },
    }),
    prisma.order.aggregate({
      where: { createdAt: { gte: yesterday, lt: today } },
      _count: true, _sum: { totalAmount: true },
    }),
    prisma.syncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
  ])

  res.json({
    orders: {
      today: { count: ordersToday._count, revenue: Number(ordersToday._sum.totalAmount ?? 0) },
      yesterday: { count: ordersYesterday._count, revenue: Number(ordersYesterday._sum.totalAmount ?? 0) },
    },
    // null, пока PR-4 не начнёт заполнять SyncRun — UI показывает «нет данных»
    lastSync: lastSync && {
      startedAt: lastSync.startedAt,
      finishedAt: lastSync.finishedAt,
      ok: lastSync.ok,
      trigger: lastSync.trigger,
      errors: lastSync.errors,
    },
  })
}

/** Обёртка: любой неожиданный reject роута → 503 без стектрейса наружу. */
function safe(handler: (req: AdminRequest, res: Response) => Promise<void>) {
  return async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      await handler(req, res)
    } catch (e) {
      log.error('Admin API error', { path: req.path, error: e instanceof Error ? e.message : String(e) })
      if (!res.headersSent) res.status(503).json({ error: 'Сервис временно недоступен' })
    }
  }
}

export function adminApiRouter(): Router {
  const router = express.Router()
  // Админов единицы — лимит скорее от залипшего фронта, чем от людей
  router.use(rateLimit({ windowMs: 60_000, max: 120 }))
  router.use(express.json({ limit: '256kb' }))
  router.use(requireAdmin())

  router.get('/me', (req: AdminRequest, res: Response) => {
    res.json(req.admin)
  })

  router.get('/dashboard', safe(dashboard))

  return router
}
