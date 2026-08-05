/**
 * Применение и откат батча цен (ADMIN-DESIGN §7.2/7.5, Этап 1 / PR-7).
 *
 * Контракты (усиления владельца + фиксы ревью #31):
 * - Свежесть: apply/dry-run ПЕРЕсчитывают по текущим variant.price/costPrice и
 *   свежим правилам; коридор переклассифицируется на момент apply. Preview
 *   PR-6 (тем более reused-батч) — не источник записи.
 * - Лок синка: apply/rollback выполняются в ОДНОЙ транзакции с
 *   pg_try_advisory_xact_lock(73001) первым стейтментом — лок снимается
 *   автоматически на конце tx (нет риска «unlock на другом коннекте пула»).
 *   Занят → 409, вслепую не применяем. Dry-run лока не берёт (не пишет).
 * - Режим: 'off' → только dry-run; 'test' → real apply ТОЛЬКО батчей
 *   QA-поставщика (QA_SUPPLIER_ID); 'on' → все.
 * - Права: в коридоре ±15% — owner+manager; вне — owner + явный
 *   includeOutOfCorridor (по ПЕРЕсчитанному коридору).
 * - Writeback ЦЕНОВОЙ обязателен: cost (L) + retail (M) в лист по fullName;
 *   cost=null пишет ПУСТУЮ ячейку L (иначе откат варианта, чья закупка до
 *   батча была null, отменялся бы ближайшим синком: sheetCost(new) !=
 *   lastSynced(null) → recalc → переприменение. Блокер ревью #31.)
 * - Фейл writeback: БД-транзакция НЕ откатывается; батч помечается
 *   stats.writebackFailed=true → синк замораживает цены ПРИМЕНЁННЫХ строк
 *   (isActive=true) до успешного повтора (retryWriteback).
 * - Идемпотентность: apply applied-батча → no-op; rolled_back/discarded →
 *   409; статус перепроверяется внутри tx (гонка двух apply).
 * - Откат (owner): oldPrice из PriceChange по batchId, oldCost из
 *   stats.applyResult; конфликт (цену трогали после apply) — строку не
 *   откатываем, в conflict-список; writeback отката согласованно, включая
 *   очистку L для null-закупки.
 */
import { prisma } from './prisma'
import { log } from './logger'
import { logAdminAction } from './audit'
import { logSecurityEvent } from './security-log'
import { applyMarkupRules, loadRules } from './markup-rules'
import { classifyCorridor, priceDeltaPct, CorridorClass } from './price-batch'
import { WRITEBACK_COLS } from './sheets-sync'
import { withSyncLock, SyncLockBusy, SYNC_LOCK_BUSY_MESSAGE } from './sync-lock'
import { formatShopTime } from './currency'

export type ApplyMode = 'off' | 'test' | 'on'

export function resolveApplyMode(): ApplyMode {
  const raw = (process.env.PRICE_APPLY_ENABLED ?? 'off').toLowerCase()
  return raw === 'on' || raw === 'true' ? 'on' : raw === 'test' ? 'test' : 'off'
}

export interface Actor { telegramId: string; role: 'owner' | 'manager' }

export interface ApplyRowResult {
  supplierPriceId: number
  variantId: number | null
  rawLine: string
  action: 'applied' | 'skipped_out_of_corridor' | 'skipped_gone'
  corridor: CorridorClass | null
  deltaPct: number | null
  oldPrice?: number
  newPrice?: number
  oldCost?: number | null
  newCost?: number
  /** Кто дал цену: строка батча → её поставщик; уходит в БД и колонку O */
  supplierName?: string | null
}

export interface ApplyOutcome {
  ok: boolean
  status: number            // http-семантика для API-слоя
  error?: string
  alreadyApplied?: boolean
  dryRun?: boolean
  applied?: number
  skippedOutOfCorridor?: number
  skippedGone?: number
  writebackFailed?: boolean
  writebackMissing?: string[] // fullName, не найденные в листе
  rows?: ApplyRowResult[]
  conflicts?: Array<{ variantId: number; expectedPrice: number; actualPrice: number }>
}

/**
 * Строки писбэка: адресация по fullName (rowIndex листа нестабилен).
 * cost=null → колонка закупки очищается ('' в L) — откат «безкостовых» строк.
 * supplier/updatedAt (O/P) пишутся, только когда поле задано (undefined =
 * колонку не трогаем); null/'' очищает ячейку — откат снимает имя поставщика.
 */
export interface WritebackRow {
  fullName: string
  cost: number | null
  price: number
  supplier?: string | null
  updatedAt?: string | null
}
export type WritebackFn = (rows: WritebackRow[]) => Promise<{ missing: string[] }>

/**
 * Чистый билдер апдейтов писбэка (юнит-тестируется без Google):
 * fullName — колонка E (index 4); cost=null → L очищается пустой строкой.
 */
export function buildWritebackUpdates(
  rows: WritebackRow[],
  sheets: Array<{ name: string; data: string[][] }>,
): { updates: Array<{ range: string; values: (string | number)[][] }>; missing: string[] } {
  const wanted = new Map(rows.map(r => [r.fullName.trim().toLowerCase(), r]))
  const updates: Array<{ range: string; values: (string | number)[][] }> = []
  const found = new Set<string>()

  for (const sheet of sheets) {
    if (!wanted.size || found.size === wanted.size) break
    for (let i = 1; i < sheet.data.length; i++) {
      const key = String(sheet.data[i]?.[4] ?? '').trim().toLowerCase()
      if (!key || !wanted.has(key) || found.has(key)) continue
      const r = wanted.get(key)!
      const rowNum = i + 1
      updates.push({ range: `'${sheet.name}'!${WRITEBACK_COLS.costPrice}${rowNum}`, values: [[r.cost ?? '']] })
      updates.push({ range: `'${sheet.name}'!${WRITEBACK_COLS.price}${rowNum}`, values: [[r.price]] })
      if (r.supplier !== undefined) {
        updates.push({ range: `'${sheet.name}'!${WRITEBACK_COLS.supplier}${rowNum}`, values: [[r.supplier ?? '']] })
      }
      if (r.updatedAt !== undefined) {
        updates.push({ range: `'${sheet.name}'!${WRITEBACK_COLS.date}${rowNum}`, values: [[r.updatedAt ?? '']] })
      }
      found.add(key)
    }
  }
  return { updates, missing: [...wanted.keys()].filter(k => !found.has(k)) }
}

/** Ищет строки по fullName по всем товарным листам и пишет L (закупка) + M (розница). */
export async function sheetPriceWriteback(rows: WritebackRow[]): Promise<{ missing: string[] }> {
  const { readSheet, getProductSheetNames, batchUpdate } = await import('./google-sheets')
  const sheets: Array<{ name: string; data: string[][] }> = []
  for (const name of await getProductSheetNames()) {
    sheets.push({ name, data: await readSheet(name) })
  }
  const { updates, missing } = buildWritebackUpdates(rows, sheets)
  if (updates.length) await batchUpdate(updates)
  return { missing }
}

class BatchStatusChanged extends Error {
  constructor(public readonly currentStatus: string) { super('status changed') }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ComputedRows {
  rows: ApplyRowResult[]
  fullNameByVariant: Map<number, string>
}

async function computeRows(
  db: any,
  batchId: number,
  rules: Awaited<ReturnType<typeof loadRules>>,
  includeOut: boolean,
  batchSupplierName: string | null,
): Promise<ComputedRows> {
  const spRows = await db.supplierPrice.findMany({ where: { batchId }, orderBy: { id: 'asc' } })
  const variantIds = spRows.map((r: any) => r.variantId).filter((v: any): v is number => v !== null)
  const variants = await db.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, price: true, costPrice: true, attributes: true },
  })
  const byId = new Map(variants.map((v: any) => [v.id, v]))
  const fullNameByVariant = new Map<number, string>(
    variants.map((v: any) => [v.id, String((v.attributes as Record<string, unknown> | null)?.fullName ?? '')]),
  )

  const rows: ApplyRowResult[] = []
  for (const sp of spRows) {
    // Приоритет строки: best_supplier-батч кладёт победителя в supplierName;
    // у батча разбора поставщик один на весь батч.
    const base = {
      supplierPriceId: sp.id, variantId: sp.variantId, rawLine: sp.rawMessage,
      supplierName: (sp.supplierName as string | null) ?? batchSupplierName,
    }
    const v: any = sp.variantId !== null ? byId.get(sp.variantId) : undefined
    if (!v) { rows.push({ ...base, action: 'skipped_gone', corridor: null, deltaPct: null }); continue }
    const currentPrice = Number(v.price)
    const newCost = Number(sp.price)
    const newPrice = applyMarkupRules(newCost, rules)
    const corridor = classifyCorridor(currentPrice, newPrice) // пересчитано на момент apply
    if (corridor === 'out' && !includeOut) {
      rows.push({ ...base, action: 'skipped_out_of_corridor', corridor, deltaPct: priceDeltaPct(currentPrice, newPrice), oldPrice: currentPrice, newPrice, newCost })
      continue
    }
    rows.push({
      ...base, action: 'applied', corridor, deltaPct: priceDeltaPct(currentPrice, newPrice),
      oldPrice: currentPrice, newPrice,
      oldCost: v.costPrice !== null ? Number(v.costPrice) : null, newCost,
    })
  }
  return { rows, fullNameByVariant }
}

function summarize(rows: ApplyRowResult[], dryRun: boolean): ApplyOutcome {
  return {
    ok: true, status: 200, dryRun,
    applied: rows.filter(r => r.action === 'applied').length,
    skippedOutOfCorridor: rows.filter(r => r.action === 'skipped_out_of_corridor').length,
    skippedGone: rows.filter(r => r.action === 'skipped_gone').length,
    rows,
  }
}

export async function applyPriceBatch(opts: {
  batchId: number
  actor: Actor
  dryRun: boolean
  includeOutOfCorridor?: boolean
  mode?: ApplyMode           // default: env PRICE_APPLY_ENABLED
  qaSupplierId?: number | null // default: env QA_SUPPLIER_ID
  writebackFn?: WritebackFn  // тестам подменяем лист
}): Promise<ApplyOutcome> {
  const batch = await prisma.priceApplyBatch.findUnique({ where: { id: opts.batchId } })
  if (!batch) return { ok: false, status: 404, error: 'Батч не найден' }
  if (batch.status === 'applied') return { ok: true, status: 200, alreadyApplied: true }
  if (batch.status !== 'preview') return { ok: false, status: 409, error: `Батч в статусе «${batch.status}» — применение невозможно` }

  // Гейт вне-коридорного применения — только owner (по пересчитанному коридору ниже)
  if (opts.includeOutOfCorridor === true && opts.actor.role !== 'owner') {
    return { ok: false, status: 403, error: 'Применение вне коридора ±15% — только владелец' }
  }
  const includeOut = opts.includeOutOfCorridor === true && opts.actor.role === 'owner'

  // Движок «лучший поставщик» применяет только владелец (решение 2026-08);
  // dry-run оставляем менеджеру — превью безопасно.
  if (batch.source === 'best_supplier' && !opts.dryRun && opts.actor.role !== 'owner') {
    return { ok: false, status: 403, error: 'Обновление по лучшему поставщику применяет только владелец' }
  }

  const rules = await loadRules() // свежие правила, не из preview
  const batchSupplierName = batch.supplierId
    ? (await prisma.supplier.findUnique({ where: { id: batch.supplierId }, select: { name: true } }))?.name ?? null
    : null

  // ── Dry-run: только чтение, без лока/статусов/записи ──────────────────────
  if (opts.dryRun) {
    const { rows } = await computeRows(prisma, opts.batchId, rules, includeOut, batchSupplierName)
    return summarize(rows, true)
  }

  // ── Режим реального применения ─────────────────────────────────────────────
  const mode = opts.mode ?? resolveApplyMode()
  const qaId = opts.qaSupplierId !== undefined ? opts.qaSupplierId : (parseInt(process.env.QA_SUPPLIER_ID ?? '', 10) || null)
  if (mode === 'off') return { ok: false, status: 403, error: 'Применение цен выключено (PRICE_APPLY_ENABLED) — доступен только dry-run' }
  if (mode === 'test' && (qaId === null || batch.supplierId !== qaId)) {
    return { ok: false, status: 403, error: 'Режим test: применяются только батчи QA-поставщика' }
  }

  let computed: ComputedRows
  let outcome: ApplyOutcome
  let appliedStamp: Date = new Date()
  try {
    const res = await withSyncLock(async tx => {
      // Перепроверка статуса внутри tx: гонка двух параллельных apply
      const fresh = await tx.priceApplyBatch.findUnique({ where: { id: opts.batchId }, select: { status: true, stats: true, supplierId: true } })
      if (!fresh || fresh.status !== 'preview') throw new BatchStatusChanged(fresh?.status ?? 'deleted')

      // Чтение и пересчёт ВНУТРИ tx — синк не вклинится между чтением и записью
      const c = await computeRows(tx, opts.batchId, rules, includeOut, batchSupplierName)
      const o = summarize(c.rows, false)
      const applied = c.rows.filter(r => r.action === 'applied')
      const appliedAt = new Date()

      for (const r of applied) {
        await tx.priceChange.create({
          data: {
            variantId: r.variantId!, oldPrice: r.oldPrice!, newPrice: r.newPrice!,
            source: 'batch', batchId: opts.batchId, createdBy: opts.actor.telegramId,
          },
        })
        await tx.productVariant.update({
          where: { id: r.variantId! },
          data: {
            price: r.newPrice!, costPrice: r.newCost!, lastSyncedCostPrice: r.newCost!,
            // Аудит «кто/когда»: уходит писбэком в O/P вместе с ценой
            bestSupplierName: r.supplierName ?? null, priceUpdatedAt: appliedAt,
          },
        })
        await tx.supplierPrice.update({ where: { id: r.supplierPriceId }, data: { isActive: true } })
      }
      await tx.priceApplyBatch.update({
        where: { id: opts.batchId },
        data: {
          status: 'applied', appliedAt,
          stats: { ...(fresh.stats as object), applyResult: JSON.parse(JSON.stringify(o)) } as object,
        },
      })
      if (fresh.supplierId) {
        await tx.supplier.update({ where: { id: fresh.supplierId }, data: { lastPriceAt: new Date() } }).catch(() => null)
      }
      return { c, o, appliedAt }
    })
    computed = res.c
    outcome = res.o
    appliedStamp = res.appliedAt
  } catch (e) {
    if (e instanceof SyncLockBusy) return { ok: false, status: 409, error: SYNC_LOCK_BUSY_MESSAGE }
    if (e instanceof BatchStatusChanged) {
      return e.currentStatus === 'applied'
        ? { ok: true, status: 200, alreadyApplied: true }
        : { ok: false, status: 409, error: `Батч в статусе «${e.currentStatus}» — применение невозможно` }
    }
    throw e
  }

  // ── Writeback в лист (после коммита; фейл НЕ откатывает БД) ───────────────
  const applied = outcome.rows!.filter(r => r.action === 'applied')
  const appliedOutOfCorridor = applied.filter(r => r.corridor === 'out').length
  const writeback = opts.writebackFn ?? sheetPriceWriteback
  const appliedAtSheet = formatShopTime(appliedStamp)
  const wbRows: WritebackRow[] = applied
    .map((r): WritebackRow | null => {
      const fullName = computed.fullNameByVariant.get(r.variantId!) ?? ''
      return fullName
        ? { fullName, cost: r.newCost!, price: r.newPrice!, supplier: r.supplierName ?? '', updatedAt: appliedAtSheet }
        : null
    })
    .filter((x): x is WritebackRow => x !== null)
  try {
    const { missing } = await writeback(wbRows)
    outcome.writebackMissing = missing
    if (missing.length) log.warn('Price apply: строки не найдены в листе', { batchId: opts.batchId, missing })
  } catch (e) {
    outcome.writebackFailed = true
    const b = await prisma.priceApplyBatch.findUnique({ where: { id: opts.batchId }, select: { stats: true } })
    await prisma.priceApplyBatch.update({
      where: { id: opts.batchId },
      data: { stats: { ...(b?.stats as object), writebackFailed: true } as object },
    }).catch(() => null)
    log.error('Price apply writeback failed', { batchId: opts.batchId, error: e instanceof Error ? e.message : String(e) })
  }

  void logAdminAction({
    adminTelegramId: opts.actor.telegramId, action: 'price_batch_apply', entity: 'PriceApplyBatch', entityId: opts.batchId,
    after: { applied: outcome.applied, skippedOutOfCorridor: outcome.skippedOutOfCorridor, skippedGone: outcome.skippedGone, appliedOutOfCorridor, writebackFailed: !!outcome.writebackFailed },
  })
  void logSecurityEvent('price_batch_applied', { batchId: opts.batchId, applied: outcome.applied }, opts.actor.telegramId)
  if (appliedOutOfCorridor > 0) {
    // CRITICAL (решение владельца) — троттлинг алертов из hardening уже есть
    void logSecurityEvent('price_out_of_corridor_applied', { batchId: opts.batchId, count: appliedOutOfCorridor }, opts.actor.telegramId)
  }
  return outcome
}

export async function rollbackPriceBatch(opts: {
  batchId: number
  actor: Actor
  writebackFn?: WritebackFn
}): Promise<ApplyOutcome> {
  const batch = await prisma.priceApplyBatch.findUnique({ where: { id: opts.batchId } })
  if (!batch) return { ok: false, status: 404, error: 'Батч не найден' }
  if (batch.status !== 'applied') return { ok: false, status: 409, error: `Откат возможен только для applied-батча (сейчас «${batch.status}»)` }

  type Restorable = { variantId: number; oldPrice: number; newPrice: number; oldCost: number | null; fullName: string }
  let restorable: Restorable[]
  let conflicts: NonNullable<ApplyOutcome['conflicts']>
  try {
    const res = await withSyncLock(async tx => {
      const fresh = await tx.priceApplyBatch.findUnique({ where: { id: opts.batchId }, select: { status: true, stats: true } })
      if (!fresh || fresh.status !== 'applied') throw new BatchStatusChanged(fresh?.status ?? 'deleted')

      const applyResult = (fresh.stats as Record<string, unknown> | null)?.applyResult as { rows?: ApplyRowResult[] } | undefined
      const appliedRows = (applyResult?.rows ?? []).filter(r => r.action === 'applied')
      const changes = await tx.priceChange.findMany({ where: { batchId: opts.batchId, source: 'batch' } })
      const changeByVariant = new Map(changes.map((c: any) => [c.variantId, c]))
      const oldCostByVariant = new Map(appliedRows.map(r => [r.variantId!, r.oldCost ?? null]))

      const variants = await tx.productVariant.findMany({
        where: { id: { in: [...changeByVariant.keys()] as number[] } },
        select: { id: true, price: true, attributes: true },
      })
      const localConflicts: NonNullable<ApplyOutcome['conflicts']> = []
      const localRestorable: Restorable[] = []
      for (const v of variants) {
        const c: any = changeByVariant.get(v.id)!
        if (Number(v.price) !== Number(c.newPrice)) {
          // Кто-то трогал цену после apply (синк/другой батч) — чужую правку не перетираем
          localConflicts.push({ variantId: v.id, expectedPrice: Number(c.newPrice), actualPrice: Number(v.price) })
          continue
        }
        localRestorable.push({
          variantId: v.id, oldPrice: Number(c.oldPrice), newPrice: Number(c.newPrice),
          oldCost: oldCostByVariant.get(v.id) ?? null,
          fullName: String((v.attributes as Record<string, unknown> | null)?.fullName ?? ''),
        })
      }

      for (const r of localRestorable) {
        await tx.productVariant.update({
          where: { id: r.variantId },
          // Прежнего поставщика не знаем — честно снимаем имя; дата обновления
          // реальная (цена только что изменилась откатом)
          data: {
            price: r.oldPrice, costPrice: r.oldCost, lastSyncedCostPrice: r.oldCost,
            bestSupplierName: null, priceUpdatedAt: new Date(),
          },
        })
        await tx.priceChange.create({
          data: { variantId: r.variantId, oldPrice: r.newPrice, newPrice: r.oldPrice, source: 'batch_rollback', batchId: opts.batchId, createdBy: opts.actor.telegramId },
        })
      }
      await tx.supplierPrice.updateMany({ where: { batchId: opts.batchId }, data: { isActive: false } })
      await tx.priceApplyBatch.update({
        where: { id: opts.batchId },
        data: { status: 'rolled_back', stats: { ...(fresh.stats as object), rollback: { restored: localRestorable.length, conflicts: localConflicts.length } } as object },
      })
      return { localRestorable, localConflicts }
    })
    restorable = res.localRestorable
    conflicts = res.localConflicts
  } catch (e) {
    if (e instanceof SyncLockBusy) return { ok: false, status: 409, error: SYNC_LOCK_BUSY_MESSAGE }
    if (e instanceof BatchStatusChanged) return { ok: false, status: 409, error: `Откат возможен только для applied-батча (сейчас «${e.currentStatus}»)` }
    throw e
  }

  const outcome: ApplyOutcome = { ok: true, status: 200, applied: restorable.length, conflicts }
  // Writeback отката: ВСЕ восстановленные строки, включая oldCost=null —
  // для них закупка в листе ОЧИЩАЕТСЯ (иначе синк переприменит батч: блокер #31)
  const writeback = opts.writebackFn ?? sheetPriceWriteback
  try {
    const rolledAtSheet = formatShopTime(new Date())
    const wbRows = restorable
      .filter(r => r.fullName)
      .map(r => ({ fullName: r.fullName, cost: r.oldCost, price: r.oldPrice, supplier: '', updatedAt: rolledAtSheet }))
    const { missing } = await writeback(wbRows)
    outcome.writebackMissing = missing
  } catch (e) {
    outcome.writebackFailed = true
    const b = await prisma.priceApplyBatch.findUnique({ where: { id: opts.batchId }, select: { stats: true } })
    await prisma.priceApplyBatch.update({
      where: { id: opts.batchId },
      data: { stats: { ...(b?.stats as object), writebackFailed: true } as object },
    }).catch(() => null)
    log.error('Price rollback writeback failed', { batchId: opts.batchId, error: e instanceof Error ? e.message : String(e) })
  }

  void logAdminAction({
    adminTelegramId: opts.actor.telegramId, action: 'price_batch_rollback', entity: 'PriceApplyBatch', entityId: opts.batchId,
    after: { restored: restorable.length, conflicts: conflicts.length, writebackFailed: !!outcome.writebackFailed },
  })
  return outcome
}

/** Повторить непроехавший writeback applied-батча; успех снимает заморозку цен в синке. */
export async function retryWriteback(batchId: number, actor: Actor, writebackFn?: WritebackFn): Promise<ApplyOutcome> {
  const batch = await prisma.priceApplyBatch.findUnique({ where: { id: batchId } })
  if (!batch) return { ok: false, status: 404, error: 'Батч не найден' }
  const stats = batch.stats as Record<string, unknown> | null
  if (batch.status !== 'applied' || stats?.writebackFailed !== true) {
    return { ok: false, status: 409, error: 'Повтор доступен только для applied-батча с непроехавшим writeback' }
  }
  const applyResult = stats?.applyResult as { rows?: ApplyRowResult[] } | undefined
  const appliedRows = (applyResult?.rows ?? []).filter(r => r.action === 'applied')
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: appliedRows.map(r => r.variantId!) } },
    select: { id: true, attributes: true },
  })
  const nameById = new Map(variants.map(v => [v.id, String((v.attributes as Record<string, unknown> | null)?.fullName ?? '')]))
  const retryStamp = formatShopTime(batch.appliedAt ?? new Date())
  const wbRows: WritebackRow[] = appliedRows
    .map(r => ({
      fullName: nameById.get(r.variantId!) ?? '', cost: r.newCost!, price: r.newPrice!,
      supplier: r.supplierName ?? '', updatedAt: retryStamp,
    }))
    .filter(r => r.fullName)
  try {
    const { missing } = await (writebackFn ?? sheetPriceWriteback)(wbRows)
    const { writebackFailed: _drop, ...rest } = stats as Record<string, unknown>
    await prisma.priceApplyBatch.update({ where: { id: batchId }, data: { stats: rest as object } })
    void logAdminAction({ adminTelegramId: actor.telegramId, action: 'price_batch_writeback_retry', entity: 'PriceApplyBatch', entityId: batchId, after: { ok: true, missing } })
    return { ok: true, status: 200, writebackMissing: missing }
  } catch (e) {
    return { ok: false, status: 502, error: 'Запись в таблицу снова не удалась: ' + (e instanceof Error ? e.message : String(e)) }
  }
}
