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

// ── Новый поставщик из формы «Загрузить прайс» ───────────────────────────────
// Форма сознательно узкая: только name + «цена свежа, дней» (priceTtlDays).
// Наценки у поставщика в этом флоу нет — розница считается по интервалам
// MarkupRule; markup/notes и прочие ключи → 422, не молчаливый игнор.
export function validateBatchNewSupplier(raw: unknown): {
  errors: Array<{ field: string; message: string }>
  data: { name: string; priceTtlDays: number | null }
} {
  const empty = { name: '', priceTtlDays: null }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { errors: [{ field: 'newSupplier', message: 'Заполните нового поставщика' }], data: empty }
  }
  const body = raw as Record<string, unknown>
  const errors: Array<{ field: string; message: string }> = []
  for (const key of Object.keys(body)) {
    if (key !== 'name' && key !== 'priceTtlDays') errors.push({ field: key, message: 'Поле не задаётся при загрузке прайса' })
  }
  const input: Record<string, unknown> = { name: body.name }
  if (body.priceTtlDays !== undefined && body.priceTtlDays !== null && body.priceTtlDays !== '') input.priceTtlDays = body.priceTtlDays
  const base = validateSupplierInput(input, { partial: false })
  errors.push(...base.errors)
  if (errors.length) return { errors, data: empty }
  return { errors: [], data: { name: base.data.name as string, priceTtlDays: (base.data.priceTtlDays as number | undefined) ?? null } }
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

// ─── Правила наценки (Этап 1 / PR-9) ─────────────────────────────────────────
//
// create/update — owner+manager (операционка; AuditLog-дельта + SecurityLog
// markup_rule_changed); enable/disable — owner-only (двигает ВСЕ цены канала
// при пересчёте); жёсткого DELETE нет как класса (как у поставщиков).
// Изменение правил НЕ пересчитывает существующие цены немедленно — влияет на
// следующий синк (path 1) и применение батчей.

const MARKUP_SELECT = { id: true, minCost: true, maxCost: true, mode: true, value: true, channel: true, enabled: true, updatedAt: true } as const

function numRule(r: Record<string, unknown>): Record<string, unknown> {
  return { ...r, minCost: Number(r.minCost), maxCost: r.maxCost === null ? null : Number(r.maxCost), value: Number(r.value) }
}

async function channelRules(channel: string) {
  const rules = await prisma.markupRule.findMany({ where: { channel }, select: MARKUP_SELECT })
  return rules.map(r => ({ id: r.id, minCost: Number(r.minCost), maxCost: r.maxCost === null ? null : Number(r.maxCost), mode: r.mode, value: Number(r.value), enabled: r.enabled }))
}

export async function listMarkupRules(_req: AdminRequest, res: Response): Promise<void> {
  const rules = await prisma.markupRule.findMany({ orderBy: [{ channel: 'asc' }, { minCost: 'asc' }], select: MARKUP_SELECT })
  res.json(rules.map(r => numRule(r as unknown as Record<string, unknown>)))
}

export async function createMarkupRule(req: AdminRequest, res: Response): Promise<void> {
  const { validateMarkupRuleInput, evaluateIntegrityTransition } = await import('../lib/markup-rule-validation')
  const { errors, data } = validateMarkupRuleInput(req.body ?? {}, { partial: false })
  if (errors.length) { res.status(422).json({ error: 'validation', fields: errors }); return }
  const channel = (data.channel as string) ?? 'site'
  const integrity = evaluateIntegrityTransition(await channelRules(channel), { data: { ...data, enabled: data.enabled !== false } as never })
  if (integrity.block) { res.status(422).json({ error: `Набор правил канала «${channel}» ломается: ${integrity.error}` }); return }
  const rule = await prisma.markupRule.create({ data: data as never, select: MARKUP_SELECT })
  const admin = req.admin!
  void logAdminAction({ adminTelegramId: admin.telegramId, action: 'create', entity: 'MarkupRule', entityId: rule.id, after: data })
  void logSecurityEvent('markup_rule_changed', { action: 'create', ruleId: rule.id, channel, via: 'web' }, admin.telegramId)
  res.status(201).json({ ...numRule(rule as unknown as Record<string, unknown>), integrityWarning: integrity.warning ?? null })
}

export async function updateMarkupRule(req: AdminRequest, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10)
  if (!Number.isInteger(id)) { res.status(422).json({ error: 'validation', fields: [{ field: 'id', message: 'Неверный ID' }] }); return }
  const { validateMarkupRuleInput, evaluateIntegrityTransition } = await import('../lib/markup-rule-validation')
  const { errors, data } = validateMarkupRuleInput(req.body ?? {}, { partial: true })
  if (errors.length) { res.status(422).json({ error: 'validation', fields: errors }); return }
  if (!Object.keys(data).length) { res.status(422).json({ error: 'validation', fields: [{ field: 'body', message: 'Нет полей для изменения' }] }); return }
  // enable/disable — только отдельными owner-роутами
  if ('enabled' in data) { res.status(422).json({ error: 'validation', fields: [{ field: 'enabled', message: 'Включение/выключение — отдельной кнопкой (owner)' }] }); return }
  const existing = await prisma.markupRule.findUnique({ where: { id }, select: MARKUP_SELECT })
  if (!existing) { res.status(404).json({ error: 'Правило не найдено' }); return }
  const channel = (data.channel as string) ?? existing.channel
  const integrity = evaluateIntegrityTransition(await channelRules(channel), { id, data: data as never })
  if (integrity.block) { res.status(422).json({ error: `Набор правил канала «${channel}» ломается: ${integrity.error}` }); return }
  const updated = await prisma.markupRule.update({ where: { id }, data: data as never, select: MARKUP_SELECT })
  const admin = req.admin!
  const { supplierDelta } = await import('../lib/supplier-validation')
  const { before, after } = supplierDelta(existing as unknown as Record<string, unknown>, data)
  if (Object.keys(after).length) {
    void logAdminAction({ adminTelegramId: admin.telegramId, action: 'update', entity: 'MarkupRule', entityId: id, before, after })
    void logSecurityEvent('markup_rule_changed', { action: 'update', ruleId: id, fields: Object.keys(after), via: 'web' }, admin.telegramId)
  }
  res.json(numRule(updated as unknown as Record<string, unknown>))
}

export function setMarkupRuleEnabled(enabled: boolean) {
  return async function (req: AdminRequest, res: Response): Promise<void> {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'validation', fields: [{ field: 'id', message: 'Неверный ID' }] }); return }
    const existing = await prisma.markupRule.findUnique({ where: { id }, select: MARKUP_SELECT })
    if (!existing) { res.status(404).json({ error: 'Правило не найдено' }); return }
    if (existing.enabled === enabled) { res.json({ ok: true, unchanged: true }); return }
    const { evaluateIntegrityTransition } = await import('../lib/markup-rule-validation')
    const integrity = evaluateIntegrityTransition(await channelRules(existing.channel), { id, data: { enabled } })
    if (integrity.block) { res.status(422).json({ error: `Набор правил канала «${existing.channel}» ломается: ${integrity.error}` }); return }
    await prisma.markupRule.update({ where: { id }, data: { enabled } })
    const admin = req.admin!
    void logAdminAction({ adminTelegramId: admin.telegramId, action: enabled ? 'enable' : 'disable', entity: 'MarkupRule', entityId: id, before: { enabled: existing.enabled }, after: { enabled } })
    void logSecurityEvent('markup_rule_changed', { action: enabled ? 'enable' : 'disable', ruleId: id, via: 'web' }, admin.telegramId)
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
    let createdSupplier: { id: number; name: string; priceTtlDays: number } | null = null
    if (body.newSupplier !== undefined) {
      // Экран «Загрузить прайс»: поставщика можно завести не выходя из формы.
      // Права те же, что у POST /suppliers (owner+manager, requireAdmin выше).
      const { errors, data } = validateBatchNewSupplier(body.newSupplier)
      if (errors.length) { res.status(422).json({ error: 'validation', fields: errors }); return }
      try {
        const sup = await prisma.supplier.create({
          data: {
            name: data.name,
            priceTtlDays: data.priceTtlDays ?? 3,
            // Placeholder до привязки чата из бота — как в createSupplier.
            // Наценку не задаём: розница считается по интервалам MarkupRule.
            chatId: 'web:' + crypto.randomUUID(),
            chatType: 'private',
          },
          select: { id: true, name: true, priceTtlDays: true },
        })
        createdSupplier = sup
        supplierId = sup.id
        const admin = req.admin!
        void logAdminAction({ adminTelegramId: admin.telegramId, action: 'create', entity: 'Supplier', entityId: sup.id, after: { name: sup.name, priceTtlDays: sup.priceTtlDays } })
        void logSecurityEvent('supplier_created', { name: sup.name, via: 'web-price-upload' }, admin.telegramId)
      } catch (e) {
        if (isUniqueConflict(e)) { res.status(409).json({ error: 'Поставщик с таким именем уже есть — выберите его в списке', field: 'name' }); return }
        throw e
      }
    } else if (body.supplierId !== undefined && body.supplierId !== null && body.supplierId !== '') {
      supplierId = parseInt(String(body.supplierId), 10)
      if (!Number.isInteger(supplierId)) { res.status(422).json({ error: 'validation', fields: [{ field: 'supplierId', message: 'Неверный поставщик' }] }); return }
      const sup = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { isActive: true } })
      if (!sup) { res.status(404).json({ error: 'Поставщик не найден' }); return }
    }
    const { createPriceBatch } = await import('../lib/price-batch')
    const result = await createPriceBatch({ source, text, supplierId, createdBy: req.admin!.telegramId })
    res.status(result.reused ? 200 : 201).json(createdSupplier ? { ...result, supplier: createdSupplier } : result)
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

  // ── Очередь «не узнал» + обучение алиасами (PR-8) ─────────────────────────
  router.get('/unmatched', safe(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '100'), 10) || 100, 1), 300)
    const { listUnmatched } = await import('../lib/price-alias')
    res.json(await listUnmatched(limit))
  }))

  // Поиск вариантов для связывания «не узнал» — по ВСЕМУ каталогу, включая
  // товары не в наличии: витринный /api/products их скрывает, а прайс чаще
  // всего приходит именно на закончившийся товар (находка сквозного QA).
  router.get('/variants', safe(async (req, res) => {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 2) { res.json([]); return }
    const variants = await prisma.productVariant.findMany({
      where: {
        OR: [
          { product: { name: { contains: q, mode: 'insensitive' } } },
          { sku: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { id: 'asc' },
      select: { id: true, attributes: true, price: true, inStock: true, product: { select: { name: true } } },
    })
    res.json(variants.map(v => {
      const attrs = (v.attributes ?? {}) as Record<string, string>
      return {
        variantId: v.id,
        productName: v.product.name,
        attrs: Object.entries(attrs).filter(([k]) => k !== 'fullName').map(([, x]) => x).join(' · '),
        price: Number(v.price),
        inStock: v.inStock,
      }
    }))
  }))

  router.post('/aliases', safe(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const supplierPriceId = parseInt(String(body.supplierPriceId), 10)
    if (!Number.isInteger(supplierPriceId)) { res.status(422).json({ error: 'validation', fields: [{ field: 'supplierPriceId', message: 'Укажите строку прайса' }] }); return }
    const ignore = body.ignore === true
    const variantId = body.variantId !== undefined ? parseInt(String(body.variantId), 10) : undefined
    if (!ignore && !Number.isInteger(variantId)) { res.status(422).json({ error: 'validation', fields: [{ field: 'variantId', message: 'Укажите вариант или ignore' }] }); return }
    const { linkSupplierPriceRow } = await import('../lib/price-alias')
    const result = await linkSupplierPriceRow({ supplierPriceId, variantId: ignore ? undefined : variantId, ignore, actor: { telegramId: req.admin!.telegramId } })
    res.status(result.status).json(result)
  }))

  // Заведение нового товара из строки «не узнал» — owner-only; товар создаётся
  // ВСЕГДА СКРЫТЫМ (isAvailable=false), цена на витрину не пишется.
  router.post('/unmatched/:id/create-product', ownerOnly, safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'validation', fields: [{ field: 'id', message: 'Неверный ID' }] }); return }
    const { createProductFromPriceRow } = await import('../lib/product-from-price')
    const result = await createProductFromPriceRow({ supplierPriceId: id, actor: { telegramId: req.admin!.telegramId } })
    res.status(result.status).json(result)
  }))

  // ── Правила наценки (PR-9) ────────────────────────────────────────────────
  router.get('/markup-rules', safe(listMarkupRules))
  router.post('/markup-rules', safe(createMarkupRule))
  router.put('/markup-rules/:id', safe(updateMarkupRule))
  router.post('/markup-rules/:id/enable', ownerOnly, safe(setMarkupRuleEnabled(true)))
  router.post('/markup-rules/:id/disable', ownerOnly, safe(setMarkupRuleEnabled(false)))

  // ── Словарь SIM по странам (Этап 2 / PR-A) ────────────────────────────────
  // Учат owner+manager (операционка); удаление seed-правил — owner-only.
  router.get('/sim-rules', safe(async (_req, res) => {
    const rules = await prisma.simRule.findMany({ orderBy: [{ countryNorm: 'asc' }, { modelGenFrom: 'asc' }] })
    res.json(rules)
  }))

  router.post('/sim-rules', safe(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    const { SIM_CANON, norm } = await import('../lib/sim-rules')
    const simType = String(b.simType ?? '')
    if (!(SIM_CANON as readonly string[]).includes(simType)) {
      res.status(422).json({ error: 'validation', fields: [{ field: 'simType', message: `Тип SIM — один из: ${SIM_CANON.join(', ')}` }] }); return
    }
    const country = typeof b.country === 'string' && b.country.trim() ? b.country.trim() : null
    const modelMatch = typeof b.modelMatch === 'string' && b.modelMatch.trim() ? b.modelMatch.trim().toLowerCase() : null
    const brand = typeof b.brand === 'string' && b.brand.trim() ? b.brand.trim() : null
    if (!country && !modelMatch && !brand) {
      res.status(422).json({ error: 'validation', fields: [{ field: 'country', message: 'Укажите страну, модель или бренд' }] }); return
    }
    const modelGenFrom = b.modelGenFrom === undefined || b.modelGenFrom === null || b.modelGenFrom === ''
      ? null : parseInt(String(b.modelGenFrom), 10)
    if (modelGenFrom !== null && (!Number.isInteger(modelGenFrom) || modelGenFrom < 5 || modelGenFrom > 30)) {
      res.status(422).json({ error: 'validation', fields: [{ field: 'modelGenFrom', message: 'Поколение — целое от 5 до 30 или пусто' }] }); return
    }
    const key = { countryNorm: norm(country), brandNorm: norm(brand), modelMatch: modelMatch ?? '', modelGenFrom: modelGenFrom ?? 0 }
    const where = { countryNorm_brandNorm_modelMatch_modelGenFrom: key }
    const before = await prisma.simRule.findUnique({ where })
    const rule = await prisma.simRule.upsert({
      where,
      update: { simType, source: 'learned', note: typeof b.note === 'string' ? b.note.slice(0, 300) : undefined },
      create: { ...key, country, brand, simType, source: 'learned', note: typeof b.note === 'string' ? b.note.slice(0, 300) : null },
    })
    void logAdminAction({
      adminTelegramId: req.admin!.telegramId,
      action: before ? 'update' : 'create', entity: 'SimRule', entityId: rule.id,
      before: before ? { simType: before.simType } : undefined,
      after: { country, modelMatch, modelGenFrom, simType },
    })
    res.status(before ? 200 : 201).json(rule)
  }))

  router.delete('/sim-rules/:id', ownerOnly, safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'validation', fields: [{ field: 'id', message: 'Неверный ID' }] }); return }
    const rule = await prisma.simRule.findUnique({ where: { id } })
    if (!rule) { res.status(404).json({ error: 'Правило не найдено' }); return }
    await prisma.simRule.delete({ where: { id } })
    void logAdminAction({ adminTelegramId: req.admin!.telegramId, action: 'delete', entity: 'SimRule', entityId: id, before: { country: rule.country, simType: rule.simType, source: rule.source } })
    res.json({ ok: true })
  }))

  // Очередь обучения словаря: «SIM не определён» + «SIM стоит без правила».
  // Логика в lib/sim-recalc.ts — тот же признак «телефон», что у пересчёта.
  router.get('/sim-queue', safe(async (_req, res) => {
    const { loadSimQueue } = await import('../lib/sim-recalc')
    res.json(await loadSimQueue())
  }))

  // ── Пересчёт SIM по каталогу (PR-B) ──────────────────────────────────────
  // Предпросмотр read-only: четыре раздела, чтобы смысл был виден отдельно от
  // первичного проставления и косметики. Применение и откат — owner-only,
  // одной транзакцией под локом синка, с AuditLog как источником отката.
  router.get('/sim-recalc/preview', safe(async (_req, res) => {
    const { previewRecalc, lastRecalcState } = await import('../lib/sim-recalc')
    const [preview, last] = await Promise.all([previewRecalc(), lastRecalcState()])
    res.json({
      counts: preview.counts,
      byCountry: preview.byCountry,
      addedByCountry: preview.addedByCountry,
      semantic: preview.semantic.slice(0, 200),
      added: preview.added.slice(0, 200),
      canonical: preview.canonical.slice(0, 100),
      inherited: preview.inherited.slice(0, 100),
      lastRecalc: last,
    })
  }))

  router.post('/sim-recalc/apply', ownerOnly, safe(async (req, res) => {
    const { applyRecalc } = await import('../lib/sim-recalc')
    const r = await applyRecalc(req.admin!.telegramId)
    res.status(r.status).json(r)
  }))

  router.post('/sim-recalc/rollback', ownerOnly, safe(async (req, res) => {
    const { rollbackRecalc } = await import('../lib/sim-recalc')
    const r = await rollbackRecalc(req.admin!.telegramId)
    res.status(r.status).json(r)
  }))

  // ── ВИТРИНА (пласт 1): баннеры, категории, бегущая строка, хиты ───────────
  //
  // Права: смотреть — оба; менять — owner+manager (операционка витрины);
  // удалять баннер — owner (единственное необратимое действие раздела).
  // Каждая мутация пишет AuditLog, каждая картинка проходит валидацию по
  // содержимому, а не по имени файла.
  router.get('/storefront', safe(async (_req, res) => {
    const sf = await import('../lib/storefront-admin')
    const [banners, categories, marquee, hits] = await Promise.all([
      sf.listBanners(), sf.listCategories(), sf.getMarquee(), sf.listHits(),
    ])
    res.json({ banners, categories, marquee, hits })
  }))

  // Загрузка картинки: тело — сам файл (image/*), не base64. Ответ — публичная
  // ссылка /photos/…webp, её кладут в баннер, категорию или в ячейку фото.
  router.post('/photos/upload',
    express.raw({ type: ['image/*', 'application/octet-stream'], limit: '6mb' }),
    safe(async (req, res) => {
      const { storePhoto } = await import('../lib/photo-store')
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
      const hint = String((req.query.name ?? 'photo')).slice(0, 60)
      const r = await storePhoto(body, hint)
      if (!r.ok) { res.status(r.status).json({ error: r.error }); return }
      void logAdminAction({
        adminTelegramId: req.admin!.telegramId, action: 'create', entity: 'Photo',
        entityId: r.photo!.fileName, after: { url: r.photo!.url, bytes: r.photo!.bytes },
      })
      res.status(201).json(r.photo)
    }))

  router.post('/banners', safe(async (req, res) => {
    const { createBanner } = await import('../lib/storefront-admin')
    const r = await createBanner(req.admin!.telegramId, (req.body ?? {}) as Record<string, unknown>)
    res.status(r.status).json(r.ok ? r.data : { error: r.error })
  }))

  router.put('/banners/:id', safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { updateBanner } = await import('../lib/storefront-admin')
    const r = await updateBanner(req.admin!.telegramId, id, (req.body ?? {}) as Record<string, unknown>)
    res.status(r.status).json(r.ok ? { ok: true, ...(r.data as object) } : { error: r.error })
  }))

  router.post('/banners/:id/move', safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    const dir = (req.body as { dir?: unknown })?.dir === 'down' ? 1 : -1
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { moveBanner } = await import('../lib/storefront-admin')
    const r = await moveBanner(req.admin!.telegramId, id, dir as -1 | 1)
    res.status(r.status).json(r.ok ? { ok: true } : { error: r.error })
  }))

  router.delete('/banners/:id', ownerOnly, safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { deleteBanner } = await import('../lib/storefront-admin')
    const r = await deleteBanner(req.admin!.telegramId, id)
    res.status(r.status).json(r.ok ? { ok: true } : { error: r.error })
  }))

  router.put('/categories/:id/photo', safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { setCategoryPhoto } = await import('../lib/storefront-admin')
    const body = (req.body ?? {}) as { imageUrl?: unknown }
    const r = await setCategoryPhoto(req.admin!.telegramId, id, body.imageUrl ?? null)
    res.status(r.status).json(r.ok ? { ok: true } : { error: r.error })
  }))

  router.put('/settings/marquee', safe(async (req, res) => {
    const { setMarquee } = await import('../lib/storefront-admin')
    const r = await setMarquee(req.admin!.telegramId, (req.body as { value?: unknown })?.value)
    res.status(r.status).json(r.ok ? { ok: true, ...(r.data as object) } : { error: r.error })
  }))

  router.post('/hits/:productId', safe(async (req, res) => {
    const productId = parseInt(String(req.params.productId), 10)
    if (!Number.isInteger(productId)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { setHit } = await import('../lib/storefront-admin')
    const r = await setHit(req.admin!.telegramId, productId, (req.body as { featured?: unknown })?.featured === true)
    res.status(r.status).json(r.ok ? { ok: true, ...((r.data as object) ?? {}) } : { error: r.error })
  }))

  // Пауза приёма заказов — owner: это остановка продаж.
  router.get('/maintenance', safe(async (_req, res) => {
    const { getMaintenance } = await import('../lib/storefront-admin')
    res.json(await getMaintenance())
  }))

  router.put('/maintenance', ownerOnly, safe(async (req, res) => {
    const b = (req.body ?? {}) as { enabled?: unknown; note?: unknown }
    const { setMaintenance } = await import('../lib/storefront-admin')
    const r = await setMaintenance(req.admin!.telegramId, b.enabled === true, b.note)
    res.status(r.status).json({ ok: true, ...(r.data as object) })
  }))

  router.post('/cache-reset', safe(async (req, res) => {
    const { bumpCacheVersion } = await import('../lib/storefront-admin')
    const r = await bumpCacheVersion(req.admin!.telegramId)
    res.status(r.status).json({ ok: true, ...(r.data as object) })
  }))

  // Поиск товаров (для хитов и карточек товара). Ищем по ВСЕМУ каталогу,
  // включая скрытые — иначе не подсказать, почему товара нет на витрине.
  router.get('/products', safe(async (req, res) => {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 2) { res.json([]); return }
    const products = await prisma.product.findMany({
      where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] },
      take: 20,
      orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true, name: true, sku: true, photoUrl: true, isFeatured: true, isAvailable: true,
        category: { select: { name: true } },
        variants: { where: { inStock: true, quantity: { gt: 0 } }, select: { id: true }, take: 1 },
      },
    })
    res.json(products.map(p => ({
      id: p.id, name: p.name, sku: p.sku, photoUrl: p.photoUrl || null,
      category: p.category?.name ?? null, isFeatured: p.isFeatured,
      inStock: p.isAvailable && p.variants.length > 0,
    })))
  }))

  // ── ТОВАРЫ (пласт 2): карточка, фото, описание, скрытие с витрины ─────────
  //
  // Фото и описание уходят ПИСБЭКОМ в таблицу и только потом в БД: синк —
  // зеркало листа, и запись «только в базу» он бы стёр ближайшим прогоном.
  // Ошибки в товарах: идём ОТ проблем, а не от словаря. Только видимое покупателю.
  router.get('/products/issues', safe(async (_req, res) => {
    const { listProductIssues } = await import('../lib/product-admin')
    res.json(await listProductIssues())
  }))

  router.get('/products/:id', safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { getProductCard } = await import('../lib/product-admin')
    const card = await getProductCard(id)
    if (!card) { res.status(404).json({ error: 'Товар не найден' }); return }
    res.json(card)
  }))

  router.put('/products/:id/photo', safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { setProductMainPhoto } = await import('../lib/photo-writeback')
    const body = (req.body ?? {}) as { imageUrl?: unknown }
    const r = await setProductMainPhoto(req.admin!.telegramId, id, body.imageUrl == null ? null : String(body.imageUrl))
    res.status(r.status).json(r.ok ? { ok: true, photoUrl: r.photoUrl, productPhotos: r.productPhotos, fullName: r.fullName } : { error: r.error })
  }))

  router.put('/variants/:id/photo', safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { setVariantPhoto } = await import('../lib/photo-writeback')
    const body = (req.body ?? {}) as { imageUrl?: unknown }
    const r = await setVariantPhoto(req.admin!.telegramId, id, body.imageUrl == null ? null : String(body.imageUrl))
    res.status(r.status).json(r.ok ? { ok: true, photoUrl: r.photoUrl, productPhotos: r.productPhotos, fullName: r.fullName } : { error: r.error })
  }))

  // ── ПАРСЕР: что выучено, что предлагается, журнал обучения ────────────────
  router.get('/parser/dictionary', safe(async (_req, res) => {
    const { listDictionary, ripePatterns, learningLog } = await import('../lib/rule-learning')
    const [rules, patterns, journal] = await Promise.all([listDictionary(), ripePatterns(), learningLog()])
    res.json({ rules, patterns, journal })
  }))

  // Запись правила — owner: меняет поведение системы на весь каталог
  router.post('/parser/learn', ownerOnly, safe(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    const { learnRule } = await import('../lib/rule-learning')
    const r = await learnRule(req.admin!.telegramId, {
      attr: String(b.attr ?? ''), value: String(b.value ?? ''),
      brand: b.brand ? String(b.brand) : null, country: b.country ? String(b.country) : null,
    })
    res.status(r.status).json(r.ok ? { ok: true, ...(r.data as object) } : { error: r.error })
  }))

  router.delete('/parser/rules/:kind/:id', ownerOnly, safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { forgetRule } = await import('../lib/rule-learning')
    const r = await forgetRule(req.admin!.telegramId, String(req.params.kind), id)
    res.status(r.status).json(r.ok ? { ok: true, ...((r.data as object) ?? {}) } : { error: r.error })
  }))

  // Ручная правка атрибутов предложения (owner+manager): override сильнее словаря
  router.put('/variants/:id/attributes', safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { setVariantAttributes } = await import('../lib/product-admin')
    const body = (req.body ?? {}) as Record<string, unknown>
    const r = await setVariantAttributes(req.admin!.telegramId, id, body)
    if (!r.ok) { res.status(r.status).json({ error: r.error }); return }

    // Появился ли повторяющийся паттерн — покажем владельцу формулировку ДО
    // записи. Само правило не пишется: только по нажатию «Запомнить».
    let suggestion = null
    try {
      const { patternFor } = await import('../lib/rule-learning')
      const v = await prisma.productVariant.findUnique({
        where: { id }, select: { attributes: true, product: { select: { brand: true } } },
      })
      const attrs = (v?.attributes ?? {}) as Record<string, string>
      for (const [attr, val] of Object.entries(body)) {
        if (attr === 'attrOverrides' || !val) continue
        const found = await patternFor(attr, v?.product.brand ?? null, attrs['Страна'] ?? null, String(val))
        if (found) { suggestion = found; break }
      }
    } catch (e) { log.warn('pattern detect failed', { error: e instanceof Error ? e.message : String(e) }) }

    res.json({ ok: true, ...(r.data as object), suggestion })
  }))

  router.put('/products/:id/description', safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { setProductDescription } = await import('../lib/product-admin')
    const r = await setProductDescription(req.admin!.telegramId, id, (req.body as { text?: unknown })?.text)
    res.status(r.status).json(r.ok ? { ok: true, ...((r.data as object) ?? {}) } : { error: r.error })
  }))

  // Скрытие товара с витрины — owner: это прямое вычитание из продаж.
  router.post('/products/:id/visibility', ownerOnly, safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { setProductVisible } = await import('../lib/product-admin')
    const r = await setProductVisible(req.admin!.telegramId, id, (req.body as { visible?: unknown })?.visible === true)
    res.status(r.status).json(r.ok ? { ok: true, ...((r.data as object) ?? {}) } : { error: r.error })
  }))

  // ── АКЦИИ (пласт 3): черновик → предпросмотр → запуск → отмена ────────────
  //
  // Черновик и предпросмотр — операционка (owner+manager). Запуск, остановка
  // и «отменить все» двигают ЦЕНЫ, поэтому только owner.
  router.get('/promotions', safe(async (_req, res) => {
    const { listPromotions, filterOptions } = await import('../lib/promotion-admin')
    const [promotions, options] = await Promise.all([listPromotions(), filterOptions()])
    res.json({ promotions, options })
  }))

  router.post('/promotions/preview', safe(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    const { previewPromotion } = await import('../lib/promotion-admin')
    const r = await previewPromotion(
      b.filterType as never, String(b.filterValue ?? ''),
      b.discountType as never, Number(b.discountValue),
    )
    res.status(r.status).json(r.ok ? r.data : { error: r.error })
  }))

  router.post('/promotions', safe(async (req, res) => {
    const { createPromotion } = await import('../lib/promotion-admin')
    const r = await createPromotion(req.admin!.telegramId, (req.body ?? {}) as Record<string, unknown>)
    res.status(r.status).json(r.ok ? { ok: true, ...(r.data as object) } : { error: r.error })
  }))

  router.post('/promotions/stop-all', ownerOnly, safe(async (req, res) => {
    const { stopAllPromotions } = await import('../lib/promotion-admin')
    const r = await stopAllPromotions(req.admin!.telegramId)
    res.status(r.status).json({ ok: true, ...(r.data as object) })
  }))

  router.post('/promotions/:id/launch', ownerOnly, safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { launchPromotion } = await import('../lib/promotion-admin')
    const r = await launchPromotion(req.admin!.telegramId, id)
    res.status(r.status).json(r.ok ? { ok: true, ...(r.data as object) } : { error: r.error })
  }))

  router.post('/promotions/:id/stop', ownerOnly, safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { stopPromotion } = await import('../lib/promotion-admin')
    const r = await stopPromotion(req.admin!.telegramId, id)
    res.status(r.status).json(r.ok ? { ok: true, ...(r.data as object) } : { error: r.error })
  }))

  router.delete('/promotions/:id', ownerOnly, safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { deleteDraft } = await import('../lib/promotion-admin')
    const r = await deleteDraft(req.admin!.telegramId, id)
    res.status(r.status).json(r.ok ? { ok: true } : { error: r.error })
  }))

  // ── АНАЛИТИКА, КЛИЕНТЫ, РАССЫЛКИ (пласт 4) ────────────────────────────────
  //
  // Аналитика и клиенты — чтение; суммы и полные контакты видит только
  // владелец (деньги и ПДн). Рассылка уходит живым людям и не отменяется —
  // отправка owner-only, с обязательным предпросмотром и репетицией «себе».
  router.get('/insights', safe(async (req, res) => {
    const { getInsights } = await import('../lib/insights-admin')
    const days = parseInt(String(req.query.days ?? '30'), 10) || 30
    res.json(await getInsights(req.admin!.role as never, days))
  }))

  router.get('/clients', safe(async (req, res) => {
    const { findClients } = await import('../lib/insights-admin')
    res.json(await findClients(req.admin!.role as never, String(req.query.q ?? '')))
  }))

  router.get('/clients/:id', safe(async (req, res) => {
    const id = parseInt(String(req.params.id), 10)
    if (!Number.isInteger(id)) { res.status(422).json({ error: 'Неверный ID' }); return }
    const { getClientCard } = await import('../lib/insights-admin')
    const card = await getClientCard(req.admin!.role as never, id)
    if (!card) { res.status(404).json({ error: 'Клиент не найден' }); return }
    res.json(card)
  }))

  router.get('/broadcasts', safe(async (_req, res) => {
    const { broadcastHistory } = await import('../lib/broadcast-admin')
    res.json(await broadcastHistory())
  }))

  router.post('/broadcasts/preview', safe(async (req, res) => {
    const { previewBroadcast } = await import('../lib/broadcast-admin')
    const r = await previewBroadcast((req.body as { text?: unknown })?.text)
    res.status(r.status).json(r.ok ? r.data : { error: r.error })
  }))

  router.post('/broadcasts/send', ownerOnly, safe(async (req, res) => {
    const b = (req.body ?? {}) as { text?: unknown; mode?: unknown }
    const { sendBroadcast } = await import('../lib/broadcast-admin')
    // mode: 'self' — репетиция себе, 'dry' — только счёт получателей, иначе всем
    const opts = b.mode === 'self'
      ? { onlyTo: req.admin!.telegramId }
      : b.mode === 'dry' ? { dryRun: true } : {}
    const r = await sendBroadcast(req.admin!.telegramId, b.text, opts)
    res.status(r.status).json(r.ok ? { ok: true, ...(r.data as object) } : { error: r.error })
  }))

  // ── Команда магазина: кто имеет доступ (owner-only) ───────────────────────
  router.get('/team', ownerOnly, safe(async (req, res) => {
    const { listTeam } = await import('../lib/admin-team')
    res.json(await listTeam(req.admin!.telegramId))
  }))

  router.post('/team', ownerOnly, safe(async (req, res) => {
    const { addTeamMember } = await import('../lib/admin-team')
    const r = await addTeamMember(req.admin!.telegramId, (req.body ?? {}) as Record<string, unknown>)
    res.status(r.status).json(r.ok ? { ok: true, ...(r.data as object) } : { error: r.error })
  }))

  router.put('/team/:telegramId', ownerOnly, safe(async (req, res) => {
    const id = String(req.params.telegramId ?? '')
    if (!/^\d{5,15}$/.test(id)) { res.status(422).json({ error: 'Неверный Telegram ID' }); return }
    const { updateTeamMember } = await import('../lib/admin-team')
    const r = await updateTeamMember(req.admin!.telegramId, id, (req.body ?? {}) as Record<string, unknown>)
    res.status(r.status).json(r.ok ? { ok: true, ...((r.data as object) ?? {}) } : { error: r.error })
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
