/**
 * Применение и откат батча цен (ADMIN-DESIGN §7.2/7.5, Этап 1 / PR-7).
 *
 * Контракты (усиления владельца к плану):
 * - Свежесть: apply/dry-run ПЕРЕсчитывают по текущим variant.price/costPrice и
 *   свежим правилам; коридор переклассифицируется на момент apply. Preview
 *   PR-6 (тем более reused-батч) — не источник записи.
 * - Advisory-lock синка (73001): занят → 409, вслепую не применяем.
 * - Режим: 'off' → только dry-run; 'test' → real apply ТОЛЬКО батчей
 *   QA-поставщика (QA_SUPPLIER_ID); 'on' → все.
 * - Права: в коридоре ±15% — owner+manager; вне — owner + явный
 *   includeOutOfCorridor (по ПЕРЕсчитанному коридору).
 * - Writeback ЦЕНОВОЙ обязателен: cost (L) + retail (M) в лист по fullName,
 *   в БД congruent lastSyncedCostPrice=cost → синк-инвариант mirror
 *   (см. lib/price-sync-policy.ts), применённое переживает синк.
 * - Фейл writeback: БД-транзакция НЕ откатывается; батч помечается
 *   stats.writebackFailed=true → синк замораживает цены этих вариантов
 *   до успешного повтора (retryWriteback).
 * - Идемпотентность: apply applied-батча → no-op; rolled_back/discarded → 409.
 * - Откат (owner): oldPrice из PriceChange по batchId, oldCost из
 *   stats.applyResult; конфликт (цену трогали после apply) — строку не
 *   откатываем, в conflict-список; writeback отката так же согласованно.
 */
import { prisma } from './prisma'
import { log } from './logger'
import { logAdminAction } from './audit'
import { logSecurityEvent } from './security-log'
import { applyMarkupRules, loadRules } from './markup-rules'
import { classifyCorridor, priceDeltaPct, CorridorClass } from './price-batch'
import { WRITEBACK_COLS } from './sheets-sync'

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

/** Строки писбэка: адресация по fullName (rowIndex листа нестабилен). */
export interface WritebackRow { fullName: string; cost: number; price: number }
export type WritebackFn = (rows: WritebackRow[]) => Promise<{ missing: string[] }>

/** Ищет строки по fullName (колонка E) по всем товарным листам и пишет L (закупка) + M (розница). */
export async function sheetPriceWriteback(rows: WritebackRow[]): Promise<{ missing: string[] }> {
  const { readSheet, getProductSheetNames, batchUpdate } = await import('./google-sheets')
  const wanted = new Map(rows.map(r => [r.fullName.trim().toLowerCase(), r]))
  const updates: Array<{ range: string; values: (string | number)[][] }> = []
  const found = new Set<string>()

  for (const sheetName of await getProductSheetNames()) {
    if (!wanted.size || found.size === wanted.size) break
    const data = await readSheet(sheetName)
    // fullName — колонка E (index 4), как в FALLBACK_INDICES.fullName
    for (let i = 1; i < data.length; i++) {
      const key = String(data[i]?.[4] ?? '').trim().toLowerCase()
      if (!key || !wanted.has(key) || found.has(key)) continue
      const r = wanted.get(key)!
      const rowNum = i + 1
      updates.push({ range: `'${sheetName}'!${WRITEBACK_COLS.costPrice}${rowNum}`, values: [[r.cost]] })
      updates.push({ range: `'${sheetName}'!${WRITEBACK_COLS.price}${rowNum}`, values: [[r.price]] })
      found.add(key)
    }
  }
  if (updates.length) await batchUpdate(updates)
  return { missing: [...wanted.keys()].filter(k => !found.has(k)) }
}

const SYNC_LOCK_KEY = 73001

async function tryLock(): Promise<boolean> {
  const r = await prisma.$queryRaw<[{ locked: boolean }]>`SELECT pg_try_advisory_lock(${SYNC_LOCK_KEY}) as "locked"`
  return !!r[0]?.locked
}
async function unlock(): Promise<void> {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${SYNC_LOCK_KEY})`
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
  const includeOut = opts.includeOutOfCorridor === true && opts.actor.role === 'owner'
  if (opts.includeOutOfCorridor === true && opts.actor.role !== 'owner') {
    return { ok: false, status: 403, error: 'Применение вне коридора ±15% — только владелец' }
  }

  // Режим (только для реального применения; dry-run разрешён всегда)
  if (!opts.dryRun) {
    const mode = opts.mode ?? resolveApplyMode()
    const qaId = opts.qaSupplierId !== undefined ? opts.qaSupplierId : (parseInt(process.env.QA_SUPPLIER_ID ?? '', 10) || null)
    if (mode === 'off') return { ok: false, status: 403, error: 'Применение цен выключено (PRICE_APPLY_ENABLED) — доступен только dry-run' }
    if (mode === 'test' && (qaId === null || batch.supplierId !== qaId)) {
      return { ok: false, status: 403, error: 'Режим test: применяются только батчи QA-поставщика' }
    }
  }

  // Advisory-lock синка: занят → не применяем вслепую (dry-run не пишет — без лока)
  let locked = false
  if (!opts.dryRun) {
    locked = await tryLock()
    if (!locked) return { ok: false, status: 409, error: 'Идёт синхронизация с таблицей — повторите через минуту' }
  }

  try {
    const spRows = await prisma.supplierPrice.findMany({ where: { batchId: opts.batchId }, orderBy: { id: 'asc' } })
    const variantIds = spRows.map(r => r.variantId).filter((v): v is number => v !== null)
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, price: true, costPrice: true, attributes: true },
    })
    const byId = new Map(variants.map(v => [v.id, v]))
    const rules = await loadRules() // свежие правила, не из preview

    const rows: ApplyRowResult[] = []
    for (const sp of spRows) {
      const base = { supplierPriceId: sp.id, variantId: sp.variantId, rawLine: sp.rawMessage }
      const v = sp.variantId !== null ? byId.get(sp.variantId) : undefined
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

    const applied = rows.filter(r => r.action === 'applied')
    const outcome: ApplyOutcome = {
      ok: true, status: 200, dryRun: opts.dryRun,
      applied: applied.length,
      skippedOutOfCorridor: rows.filter(r => r.action === 'skipped_out_of_corridor').length,
      skippedGone: rows.filter(r => r.action === 'skipped_gone').length,
      rows,
    }

    if (opts.dryRun) return outcome // ничего не пишем: ни БД, ни лист, ни статус

    // ── Реальное применение: транзакция БД ──────────────────────────────────
    const appliedOutOfCorridor = applied.filter(r => r.corridor === 'out').length
    await prisma.$transaction(async tx => {
      for (const r of applied) {
        await tx.priceChange.create({
          data: {
            variantId: r.variantId!, oldPrice: r.oldPrice!, newPrice: r.newPrice!,
            source: 'batch', batchId: opts.batchId, createdBy: opts.actor.telegramId,
          },
        })
        await tx.productVariant.update({
          where: { id: r.variantId! },
          data: { price: r.newPrice!, costPrice: r.newCost!, lastSyncedCostPrice: r.newCost! },
        })
        await tx.supplierPrice.update({ where: { id: r.supplierPriceId }, data: { isActive: true } })
      }
      await tx.priceApplyBatch.update({
        where: { id: opts.batchId },
        data: {
          status: 'applied', appliedAt: new Date(),
          stats: { ...(batch.stats as object), applyResult: JSON.parse(JSON.stringify(outcome)) } as object,
        },
      })
      if (batch.supplierId) {
        await tx.supplier.update({ where: { id: batch.supplierId }, data: { lastPriceAt: new Date() } }).catch(() => null)
      }
    })

    // ── Writeback в лист (после успешной транзакции) ────────────────────────
    const writeback = opts.writebackFn ?? sheetPriceWriteback
    const wbRows: WritebackRow[] = applied
      .map(r => {
        const v = byId.get(r.variantId!)
        const fullName = String((v?.attributes as Record<string, unknown> | null)?.fullName ?? '')
        return fullName ? { fullName, cost: r.newCost!, price: r.newPrice! } : null
      })
      .filter((x): x is WritebackRow => x !== null)
    try {
      const { missing } = await writeback(wbRows)
      outcome.writebackMissing = missing
      if (missing.length) log.warn('Price apply: строки не найдены в листе', { batchId: opts.batchId, missing })
    } catch (e) {
      // БД-транзакцию НЕ откатываем; флаг замораживает цены в синке до повтора
      outcome.writebackFailed = true
      await prisma.priceApplyBatch.update({
        where: { id: opts.batchId },
        data: { stats: { ...(batch.stats as object), applyResult: JSON.parse(JSON.stringify(outcome)), writebackFailed: true } as object },
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
  } finally {
    if (locked) await unlock()
  }
}

export async function rollbackPriceBatch(opts: {
  batchId: number
  actor: Actor
  writebackFn?: WritebackFn
}): Promise<ApplyOutcome> {
  const batch = await prisma.priceApplyBatch.findUnique({ where: { id: opts.batchId } })
  if (!batch) return { ok: false, status: 404, error: 'Батч не найден' }
  if (batch.status !== 'applied') return { ok: false, status: 409, error: `Откат возможен только для applied-батча (сейчас «${batch.status}»)` }

  if (!(await tryLock())) return { ok: false, status: 409, error: 'Идёт синхронизация с таблицей — повторите через минуту' }
  try {
    const applyResult = (batch.stats as Record<string, unknown> | null)?.applyResult as { rows?: ApplyRowResult[] } | undefined
    const appliedRows = (applyResult?.rows ?? []).filter(r => r.action === 'applied')
    const changes = await prisma.priceChange.findMany({ where: { batchId: opts.batchId, source: 'batch' } })
    const changeByVariant = new Map(changes.map(c => [c.variantId, c]))
    const oldCostByVariant = new Map(appliedRows.map(r => [r.variantId!, r.oldCost ?? null]))

    const variants = await prisma.productVariant.findMany({
      where: { id: { in: [...changeByVariant.keys()] } },
      select: { id: true, price: true, attributes: true },
    })
    const conflicts: ApplyOutcome['conflicts'] = []
    const restorable: Array<{ variantId: number; oldPrice: number; newPrice: number; oldCost: number | null; fullName: string }> = []
    for (const v of variants) {
      const c = changeByVariant.get(v.id)!
      if (Number(v.price) !== Number(c.newPrice)) {
        // Кто-то трогал цену после apply (синк/другой батч) — чужую правку не перетираем
        conflicts.push({ variantId: v.id, expectedPrice: Number(c.newPrice), actualPrice: Number(v.price) })
        continue
      }
      restorable.push({
        variantId: v.id, oldPrice: Number(c.oldPrice), newPrice: Number(c.newPrice),
        oldCost: oldCostByVariant.get(v.id) ?? null,
        fullName: String((v.attributes as Record<string, unknown> | null)?.fullName ?? ''),
      })
    }

    await prisma.$transaction(async tx => {
      for (const r of restorable) {
        await tx.productVariant.update({
          where: { id: r.variantId },
          data: { price: r.oldPrice, costPrice: r.oldCost, lastSyncedCostPrice: r.oldCost },
        })
        await tx.priceChange.create({
          data: { variantId: r.variantId, oldPrice: r.newPrice, newPrice: r.oldPrice, source: 'batch_rollback', batchId: opts.batchId, createdBy: opts.actor.telegramId },
        })
      }
      await tx.supplierPrice.updateMany({ where: { batchId: opts.batchId }, data: { isActive: false } })
      await tx.priceApplyBatch.update({
        where: { id: opts.batchId },
        data: { status: 'rolled_back', stats: { ...(batch.stats as object), rollback: { restored: restorable.length, conflicts: conflicts.length } } as object },
      })
    })

    const outcome: ApplyOutcome = { ok: true, status: 200, applied: restorable.length, conflicts }
    // Writeback отката: cost+retail согласованно, чтобы синк не переприменил откаченное
    const writeback = opts.writebackFn ?? sheetPriceWriteback
    try {
      const wbRows = restorable.filter(r => r.fullName && r.oldCost !== null).map(r => ({ fullName: r.fullName, cost: r.oldCost!, price: r.oldPrice }))
      const { missing } = await writeback(wbRows)
      outcome.writebackMissing = missing
    } catch (e) {
      outcome.writebackFailed = true
      await prisma.priceApplyBatch.update({
        where: { id: opts.batchId },
        data: { stats: { ...(batch.stats as object), rollback: { restored: restorable.length, conflicts: conflicts.length }, writebackFailed: true } as object },
      }).catch(() => null)
      log.error('Price rollback writeback failed', { batchId: opts.batchId, error: e instanceof Error ? e.message : String(e) })
    }

    void logAdminAction({
      adminTelegramId: opts.actor.telegramId, action: 'price_batch_rollback', entity: 'PriceApplyBatch', entityId: opts.batchId,
      after: { restored: restorable.length, conflicts: conflicts.length, writebackFailed: !!outcome.writebackFailed },
    })
    return outcome
  } finally {
    await unlock()
  }
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
  const wbRows = appliedRows
    .map(r => ({ fullName: nameById.get(r.variantId!) ?? '', cost: r.newCost!, price: r.newPrice! }))
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
