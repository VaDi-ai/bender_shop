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
import crypto from 'crypto'
import express, { Router, Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { prisma } from '../lib/prisma'
import { log } from '../lib/logger'
import { logSecurityEvent } from '../lib/security-log'
import { validateTelegramWebApp } from '../lib/telegram-webapp-auth'
import { logAdminAction } from '../lib/audit'
import { validateSupplierInput, supplierDelta } from '../lib/supplier-validation'

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
      // admin_invalid_signature — не-critical: сканер с мусорным заголовком
      // не будит админов (§ hardening 1а); витринное событие осталось critical.
      logSecurityEvent('admin_invalid_signature', { ip: req.ip, scope: 'admin_api' })
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

export async function dashboard(req: AdminRequest, res: Response): Promise<void> {
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

  // Решение владельца (hardening №2): выручка — только owner; счётчики
  // заказов и статус синка — всем активным админам. Manager получает null.
  const showRevenue = req.admin?.role === 'owner'

  res.json({
    orders: {
      today: { count: ordersToday._count, revenue: showRevenue ? Number(ordersToday._sum.totalAmount ?? 0) : null },
      yesterday: { count: ordersYesterday._count, revenue: showRevenue ? Number(ordersYesterday._sum.totalAmount ?? 0) : null },
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

// ─── Поставщики (Этап 1 / PR-5) ───────────────────────────────────────────────
//
// Утверждено владельцем: create/update — owner+manager; deactivate/activate —
// owner-only; жёсткого DELETE нет как класса (Cascade снёс бы историю цен).
// chatId сервер ВСЕГДА генерит сам (web:<uuid>) — привязка к реальному чату
// делается из бота; матчер входящих прайсов сравнивает числовой Telegram
// chat.id и на web:<uuid> не сматчится никогда.

const SUPPLIER_SELECT = {
  id: true, name: true, markup: true, priceTtlDays: true, notes: true,
  isActive: true, chatId: true, chatType: true, lastPriceAt: true, createdAt: true,
} as const

function isUniqueConflict(e: unknown): string | null {
  const err = e as { code?: string; meta?: { target?: string[] } }
  if (err?.code !== 'P2002') return null
  return err.meta?.target?.[0] ?? 'name'
}

export async function listSuppliers(req: AdminRequest, res: Response): Promise<void> {
  const includeInactive = String(req.query.includeInactive ?? '') === '1'
  const suppliers = await prisma.supplier.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
    select: SUPPLIER_SELECT,
  })
  res.json(suppliers.map(s => ({ ...s, markup: Number(s.markup) })))
}

export async function createSupplier(req: AdminRequest, res: Response): Promise<void> {
  const { errors, data } = validateSupplierInput(req.body ?? {}, { partial: false })
  if (errors.length) { res.status(422).json({ error: 'validation', fields: errors }); return }
  try {
    const supplier = await prisma.supplier.create({
      data: {
        name: data.name as string,
        markup: (data.markup as number) ?? 5,
        priceTtlDays: (data.priceTtlDays as number) ?? 3,
        notes: (data.notes as string | null) ?? null,
        // Placeholder до привязки чата из бота; на Telegram chat.id не похож
        chatId: 'web:' + crypto.randomUUID(),
        chatType: 'private',
      },
      select: SUPPLIER_SELECT,
    })
    const admin = req.admin!
    void logAdminAction({ adminTelegramId: admin.telegramId, action: 'create', entity: 'Supplier', entityId: supplier.id, after: data })
    void logSecurityEvent('supplier_created', { name: supplier.name, via: 'web' }, admin.telegramId)
    res.status(201).json({ ...supplier, markup: Number(supplier.markup) })
  } catch (e) {
    const field = isUniqueConflict(e)
    if (field) { res.status(409).json({ error: `Поставщик с таким ${field === 'name' ? 'именем' : field} уже есть`, field }); return }
    throw e
  }
}

export async function updateSupplier(req: AdminRequest, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10)
  if (!Number.isInteger(id)) { res.status(422).json({ error: 'validation', fields: [{ field: 'id', message: 'Неверный ID' }] }); return }
  const { errors, data } = validateSupplierInput(req.body ?? {}, { partial: true })
  if (errors.length) { res.status(422).json({ error: 'validation', fields: errors }); return }
  if (!Object.keys(data).length) { res.status(422).json({ error: 'validation', fields: [{ field: 'body', message: 'Нет полей для изменения' }] }); return }

  const existing = await prisma.supplier.findUnique({ where: { id }, select: SUPPLIER_SELECT })
  if (!existing) { res.status(404).json({ error: 'Поставщик не найден' }); return }

  try {
    const updated = await prisma.supplier.update({ where: { id }, data, select: SUPPLIER_SELECT })
    const admin = req.admin!
    const { before, after } = supplierDelta(existing as unknown as Record<string, unknown>, data)
    if (Object.keys(after).length) {
      void logAdminAction({ adminTelegramId: admin.telegramId, action: 'update', entity: 'Supplier', entityId: id, before, after })
      void logSecurityEvent('supplier_updated', { name: updated.name, fields: Object.keys(after), via: 'web' }, admin.telegramId)
      if ('markup' in after) {
        void logSecurityEvent('supplier_markup_changed', { name: updated.name, from: before.markup, to: after.markup, via: 'web' }, admin.telegramId)
      }
    }
    res.json({ ...updated, markup: Number(updated.markup) })
  } catch (e) {
    const field = isUniqueConflict(e)
    if (field) { res.status(409).json({ error: `Поставщик с таким ${field === 'name' ? 'именем' : field} уже есть`, field }); return }
    throw e
  }
}

export function setSupplierActive(active: boolean) {
  return async function (req: AdminRequest, res: Response): Promise<void> {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'validation', fields: [{ field: 'id', message: 'Неверный ID' }] }); return }
    const existing = await prisma.supplier.findUnique({ where: { id }, select: { id: true, name: true, isActive: true } })
    if (!existing) { res.status(404).json({ error: 'Поставщик не найден' }); return }
    if (existing.isActive === active) { res.json({ ok: true, unchanged: true }); return }
    await prisma.supplier.update({ where: { id }, data: { isActive: active } })
    const admin = req.admin!
    void logAdminAction({
      adminTelegramId: admin.telegramId,
      action: active ? 'activate' : 'deactivate',
      entity: 'Supplier',
      entityId: id,
      before: { isActive: existing.isActive },
      after: { isActive: active },
    })
    void logSecurityEvent('supplier_updated', { name: existing.name, fields: ['isActive'], to: active, via: 'web' }, admin.telegramId)
    res.json({ ok: true })
  }
}

/** owner-гейт для отдельных роутов (базовый requireAdmin уже отработал). */
export function ownerOnly(req: AdminRequest, res: Response, next: NextFunction): void {
  if (req.admin?.role !== 'owner') {
    logSecurityEvent('admin_role_denied', { ip: req.ip, telegramId: req.admin?.telegramId, role: req.admin?.role })
    res.status(403).json({ error: 'Недостаточно прав (нужна роль owner)' })
    return
  }
  next()
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

  // ── Разбор прайсов (PR-6, СТРОГО READ-ONLY) ───────────────────────────────
  // Создание/просмотр — owner+manager (это не применение). Применение с
  // owner-гейтом вне коридора — PR-7. Цены вариантов и таблица не трогаются.
  router.post('/price-batches', safe(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const source = body.source === 'file' ? 'file' as const : 'paste' as const
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (text.length < 15) { res.status(422).json({ error: 'validation', fields: [{ field: 'text', message: 'Вставьте текст прайса (от 15 символов)' }] }); return }
    if (text.length > 64_000) { res.status(422).json({ error: 'validation', fields: [{ field: 'text', message: 'Текст длиннее 64 КБ — разбейте на части' }] }); return }
    let supplierId: number | null = null
    if (body.supplierId !== undefined && body.supplierId !== null && body.supplierId !== '') {
      supplierId = parseInt(String(body.supplierId), 10)
      if (!Number.isInteger(supplierId)) { res.status(422).json({ error: 'validation', fields: [{ field: 'supplierId', message: 'Неверный поставщик' }] }); return }
      const sup = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { isActive: true } })
      if (!sup) { res.status(404).json({ error: 'Поставщик не найден' }); return }
    }
    const { createPriceBatch } = await import('../lib/price-batch')
    const result = await createPriceBatch({ source, text, supplierId, createdBy: req.admin!.telegramId })
    res.status(result.reused ? 200 : 201).json(result)
  }))

  router.get('/price-batches', safe(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100)
    const batches = await prisma.priceApplyBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, source: true, status: true, supplierId: true, createdBy: true, createdAt: true, stats: true, supplier: { select: { name: true } } },
    })
    res.json(batches)
  }))

  router.get('/price-batches/:id', safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'validation', fields: [{ field: 'id', message: 'Неверный ID' }] }); return }
    const { getBatchPreview } = await import('../lib/price-batch')
    const { resolveApplyMode } = await import('../lib/price-apply')
    const preview = await getBatchPreview(id)
    if (!preview) { res.status(404).json({ error: 'Батч не найден' }); return }
    const mode = resolveApplyMode()
    const qaId = parseInt(process.env.QA_SUPPLIER_ID ?? '', 10) || null
    res.json({
      ...preview,
      applyMode: mode,
      // dry-run доступен всегда; реальное применение — по режиму/поставщику
      canApply: mode === 'on' || (mode === 'test' && qaId !== null && preview.batch.supplierId === qaId),
    })
  }))

  // ── Применение / откат (PR-7) ─────────────────────────────────────────────
  router.post('/price-batches/:id/apply', safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'validation', fields: [{ field: 'id', message: 'Неверный ID' }] }); return }
    const body = (req.body ?? {}) as Record<string, unknown>
    const { applyPriceBatch } = await import('../lib/price-apply')
    const result = await applyPriceBatch({
      batchId: id,
      actor: { telegramId: req.admin!.telegramId, role: req.admin!.role },
      dryRun: body.dryRun === true,
      includeOutOfCorridor: body.includeOutOfCorridor === true,
    })
    res.status(result.status).json(result)
  }))

  router.post('/price-batches/:id/rollback', ownerOnly, safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'validation', fields: [{ field: 'id', message: 'Неверный ID' }] }); return }
    const { rollbackPriceBatch } = await import('../lib/price-apply')
    const result = await rollbackPriceBatch({ batchId: id, actor: { telegramId: req.admin!.telegramId, role: req.admin!.role } })
    res.status(result.status).json(result)
  }))

  router.post('/price-batches/:id/retry-writeback', safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'validation', fields: [{ field: 'id', message: 'Неверный ID' }] }); return }
    const { retryWriteback } = await import('../lib/price-apply')
    const result = await retryWriteback(id, { telegramId: req.admin!.telegramId, role: req.admin!.role })
    res.status(result.status).json(result)
  }))

  // ── Синк (PR-4): журнал прогонов + ручной запуск ──────────────────────────
  router.get('/sync-runs', safe(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100)
    const runs = await prisma.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit })
    res.json(runs)
  }))

  // ── Поставщики (PR-5) ─────────────────────────────────────────────────────
  router.get('/suppliers', safe(listSuppliers))
  router.post('/suppliers', safe(createSupplier))
  router.put('/suppliers/:id', safe(updateSupplier))
  router.post('/suppliers/:id/deactivate', ownerOnly, safe(setSupplierActive(false)))
  router.post('/suppliers/:id/activate', ownerOnly, safe(setSupplierActive(true)))

  router.post('/sync', safe(async (req, res) => {
    // Долгий прогон (десятки секунд) — не держим запрос: конкурентность закрыта
    // advisory-lock'ом внутри syncProductsFromSheets, повторный тап просто скипнется.
    const admin = req.admin!
    const { syncProductsFromSheets } = await import('../lib/sheets-sync')
    void syncProductsFromSheets(undefined, { trigger: 'manual', startedBy: admin.telegramId })
      .catch(e => log.error('Manual sync from admin API failed', { error: e instanceof Error ? e.message : String(e) }))
    void logAdminAction({ adminTelegramId: admin.telegramId, action: 'sync_trigger', entity: 'SyncRun' })
    res.status(202).json({ started: true })
  }))

  return router
}
