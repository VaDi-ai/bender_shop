/**
 * Обучение алиасами из веба (PR-8): «связал один раз — дальше узнаёт сама».
 *
 * Связывание строки «не узнал» с вариантом:
 * 1) создаёт/обновляет PriceAlias по ДВУМ ключам матчера — точный rawMessage
 *    и композит «model storage color» (оба lower) — будущие прайсы матчятся
 *    без подсказки;
 * 2) точечно пере-матчит unmatched-строки существующих preview-батчей по
 *    этим ключам (isActive остаётся false — read-only контракт не трогаем);
 * 3) обновляет счётчики stats затронутых батчей.
 *
 * «Игнорировать» (это не наш товар): PriceAlias.isIgnored — будущие разборы
 * пропускают строку; текущие unmatched-строки остаются как есть (истории
 * батча не переписываем).
 */
import { prisma } from './prisma'
import { logAdminAction } from './audit'

function aliasKeysFor(row: { rawMessage: string; model: string; storage: string | null; color: string | null }): string[] {
  const composite = (row.model + (row.storage ? ' ' + row.storage : '') + (row.color ? ' ' + row.color : '')).trim().toLowerCase()
  const raw = row.rawMessage.trim().toLowerCase()
  return [...new Set([raw, composite].filter(Boolean))]
}

/** Прежнее состояние ключа алиаса для audit.before — upsert затирает его молча. */
export interface AliasPrior { variantId: number | null; productId: number | null; isIgnored: boolean }

/** before по списку ключей: ключ → прежнее состояние или null (алиаса не было). */
async function aliasPriorByKey(keys: string[]): Promise<Record<string, AliasPrior | null>> {
  const prior = await prisma.priceAlias.findMany({
    where: { alias: { in: keys } },
    select: { alias: true, variantId: true, productId: true, isIgnored: true },
  })
  return Object.fromEntries(keys.map(k => {
    const p = prior.find(a => a.alias === k)
    return [k, p ? { variantId: p.variantId, productId: p.productId, isIgnored: p.isIgnored } : null]
  }))
}

/**
 * Наблюдаемый upsert алиаса для легаси-путей бота: create/update передаются
 * НАСКВОЗЬ (поведение байт-в-байт с прежним прямым prisma.priceAlias.upsert),
 * добавляется только запись в AuditLog с прежним состоянием ключа.
 */
export async function auditedAliasUpsert(opts: {
  actor: { telegramId: string }
  alias: string
  create: { alias: string; productId?: number; variantId?: number; isIgnored?: boolean }
  update: Record<string, number | boolean | null>
  via: string
}): Promise<void> {
  const before = await aliasPriorByKey([opts.alias])
  const row = await prisma.priceAlias.upsert({
    where: { alias: opts.alias },
    create: opts.create,
    update: opts.update,
  })
  void logAdminAction({
    adminTelegramId: opts.actor.telegramId,
    action: row.isIgnored ? 'price_alias_ignore' : 'price_alias_link',
    entity: 'PriceAlias',
    entityId: row.id,
    before: { aliases: before },
    after: {
      aliases: [opts.alias], variantId: row.variantId, productId: row.productId,
      ignore: row.isIgnored, via: opts.via,
    },
  })
}

/**
 * Наблюдаемое удаление алиаса (легаси /alias remove): before в AuditLog,
 * та же семантика deleteMany по точному ключу. Возвращает число удалённых.
 */
export async function auditedAliasDelete(opts: {
  actor: { telegramId: string }
  alias: string
  via: string
}): Promise<number> {
  const before = await aliasPriorByKey([opts.alias])
  const deleted = await prisma.priceAlias.deleteMany({ where: { alias: opts.alias } })
  if (deleted.count > 0) {
    void logAdminAction({
      adminTelegramId: opts.actor.telegramId,
      action: 'price_alias_remove',
      entity: 'PriceAlias',
      entityId: opts.alias.slice(0, 80),
      before: { aliases: before },
      after: { deleted: deleted.count, via: opts.via },
    })
  }
  return deleted.count
}

export interface LinkResult {
  ok: boolean
  status: number
  error?: string
  aliases?: string[]
  rematched?: number   // строк в preview-батчах, довязанных этим алиасом
  batchesTouched?: number[]
}

/** Клиент БД: prisma или tx внутри $transaction — счётчики и правки строк
 *  должны уметь жить под одной транзакцией (откат эффекта). */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type Db = any

/** Пересчёт matched/unmatched в stats затронутых батчей (как было в link). */
async function recomputeBatchStats(db: Db, batchIds: number[]): Promise<void> {
  for (const batchId of batchIds) {
    const [total, matched] = await Promise.all([
      db.supplierPrice.count({ where: { batchId } }),
      db.supplierPrice.count({ where: { batchId, variantId: { not: null } } }),
    ])
    const b = await db.priceApplyBatch.findUnique({ where: { id: batchId }, select: { stats: true } })
    await db.priceApplyBatch.update({
      where: { id: batchId },
      data: { stats: { ...(b?.stats as object), matchedRows: matched, matchedVariants: matched, unmatchedRows: total - matched } as object },
    })
  }
}

export async function linkSupplierPriceRow(opts: {
  supplierPriceId: number
  variantId?: number
  ignore?: boolean
  actor: { telegramId: string }
}): Promise<LinkResult> {
  const row = await prisma.supplierPrice.findUnique({ where: { id: opts.supplierPriceId } })
  if (!row) return { ok: false, status: 404, error: 'Строка прайса не найдена' }

  if (!opts.ignore) {
    if (!opts.variantId) return { ok: false, status: 422, error: 'Укажите variantId или ignore' }
    const variant = await prisma.productVariant.findUnique({ where: { id: opts.variantId }, select: { id: true } })
    if (!variant) return { ok: false, status: 404, error: 'Вариант не найден' }
  }

  const keys = aliasKeysFor(row)
  // Наблюдаемость (Фаза A): прежнее состояние обоих ключей — до сих пор upsert
  // перезатирал чужой variantId без следа, и откат был невозможен
  const aliasesBefore = await aliasPriorByKey(keys)
  for (const alias of keys) {
    await prisma.priceAlias.upsert({
      where: { alias },
      update: opts.ignore ? { isIgnored: true, variantId: null, productId: null } : { variantId: opts.variantId!, isIgnored: false },
      create: opts.ignore ? { alias, isIgnored: true } : { alias, variantId: opts.variantId! },
    })
  }

  let rematched = 0
  const rematchedRowIds: number[] = []
  const batchesTouched = new Set<number>()
  if (!opts.ignore) {
    // Точечный пере-матч: unmatched-строки preview-батчей с теми же ключами
    const candidates = await prisma.supplierPrice.findMany({
      where: { variantId: null, batch: { status: 'preview' } },
      select: { id: true, rawMessage: true, model: true, storage: true, color: true, batchId: true },
    })
    for (const c of candidates) {
      if (!aliasKeysFor(c).some(k => keys.includes(k))) continue
      await prisma.supplierPrice.update({ where: { id: c.id }, data: { variantId: opts.variantId! } })
      rematched++
      rematchedRowIds.push(c.id)
      if (c.batchId) batchesTouched.add(c.batchId)
    }
    // Обновить счётчики затронутых батчей
    await recomputeBatchStats(prisma, [...batchesTouched])
  }

  void logAdminAction({
    adminTelegramId: opts.actor.telegramId,
    action: opts.ignore ? 'price_alias_ignore' : 'price_alias_link',
    entity: 'PriceAlias',
    entityId: opts.supplierPriceId,
    // before: прежнее состояние ключей; after: КАКИЕ строки перевязаны, не счётчик —
    // без этого точечный откат (Фаза B) невозможен
    before: { aliases: aliasesBefore },
    after: {
      aliases: keys, variantId: opts.variantId ?? null, ignore: !!opts.ignore,
      rematchedRowIds, batchIds: [...batchesTouched],
    },
  })

  return { ok: true, status: 200, aliases: keys, rematched, batchesTouched: [...batchesTouched] }
}

/** Сводная очередь «не узнал»: unmatched-строки всех preview-батчей. */
export async function listUnmatched(limit = 100): Promise<Array<{
  supplierPriceId: number
  batchId: number | null
  rawLine: string
  model: string
  price: number
  supplierName: string | null
  parsedAt: Date
}>> {
  const rows = await prisma.supplierPrice.findMany({
    where: { variantId: null, batch: { status: 'preview' } },
    orderBy: { id: 'desc' },
    take: limit,
    include: { supplier: { select: { name: true } } },
  })
  return rows.map(r => ({
    supplierPriceId: r.id,
    batchId: r.batchId,
    rawLine: r.rawMessage,
    model: r.model,
    price: Number(r.price),
    supplierName: r.supplier?.name ?? null,
    parsedAt: r.parsedAt,
  }))
}

// ─── Фаза B: управление привязками (list / rebind / update / delete / rollback) ─
//
// Три слоя строго разделены (разведка 2026-08-26):
//   1) правило (PriceAlias) — влияет только на БУДУЩИЙ матчинг;
//   2) эффект в preview — перевязанные unmatched-строки, откатываются здесь;
//   3) применённые цены — ТОЛЬКО штатный откат батча (/price-batches/:id/rollback),
//      алиасные операции их не трогают и кэш витрины не бампают.

const ALIAS_AUDIT_ACTIONS = ['price_alias_link', 'price_alias_ignore', 'price_alias_rebind', 'price_alias_update']

export interface AliasListItem {
  id: number
  alias: string
  isIgnored: boolean
  variantId: number | null
  productId: number | null
  /** Имя товара: от варианта, либо от товара (productId-алиасы бот-легаси) */
  productName: string | null
  /** fullName варианта — что именно проставляет привязка */
  fullName: string | null
  createdAt: Date
  updatedAt: Date
  /** Откуда взялась: via последнего audit-следа (web / bot_alias_add / …) */
  via: string | null
  lastActorId: string | null
  lastActionAt: Date | null
}

/** Список привязок с обогащением вариантом/товаром и последним audit-следом. */
export async function listAliases(opts: { query?: string; limit?: number } = {}): Promise<AliasListItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const aliases = await prisma.priceAlias.findMany({
    where: opts.query?.trim() ? { alias: { contains: opts.query.trim().toLowerCase() } } : undefined,
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })

  const variantIds = [...new Set(aliases.map(a => a.variantId).filter((x): x is number => x !== null))]
  const productIds = [...new Set(aliases.map(a => a.productId).filter((x): x is number => x !== null))]
  const [variants, products, audit] = await Promise.all([
    variantIds.length ? prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, attributes: true, product: { select: { name: true } } },
    }) : [],
    productIds.length ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }) : [],
    // Последний след по каждому ключу: один запрос свежих записей, маппинг в JS
    prisma.auditLog.findMany({
      where: { action: { in: [...ALIAS_AUDIT_ACTIONS, 'price_alias_remove'] } },
      orderBy: { id: 'desc' },
      take: 500,
      select: { adminTelegramId: true, createdAt: true, after: true },
    }),
  ])
  const variantById = new Map(variants.map(v => [v.id, v]))
  const productById = new Map(products.map(p => [p.id, p]))

  const trailByAlias = new Map<string, { via: string | null; who: string; at: Date }>()
  for (const entry of audit) {
    const after = (entry.after ?? {}) as Record<string, unknown>
    const keys = Array.isArray(after.aliases) ? (after.aliases as string[]) : []
    for (const k of keys) {
      if (!trailByAlias.has(k)) {
        trailByAlias.set(k, { via: typeof after.via === 'string' ? after.via : 'web', who: entry.adminTelegramId ?? '', at: entry.createdAt })
      }
    }
  }

  return aliases.map(a => {
    const v = a.variantId !== null ? variantById.get(a.variantId) : undefined
    const attrs = (v?.attributes ?? {}) as Record<string, unknown>
    const trail = trailByAlias.get(a.alias)
    return {
      id: a.id, alias: a.alias, isIgnored: a.isIgnored,
      variantId: a.variantId, productId: a.productId,
      productName: v?.product.name ?? (a.productId !== null ? productById.get(a.productId)?.name ?? null : null),
      fullName: typeof attrs.fullName === 'string' ? attrs.fullName : null,
      createdAt: a.createdAt, updatedAt: a.updatedAt,
      via: trail?.via ?? null, lastActorId: trail?.who || null, lastActionAt: trail?.at ?? null,
    }
  })
}

export interface AutoMatchedRow {
  supplierPriceId: number
  batchId: number | null
  batchStatus: string | null
  rawLine: string
  model: string
  variantId: number
  productName: string | null
  fullName: string | null
  parsedAt: Date
}

/**
 * Строки прайса, которые система узнала САМА (variantId есть, PriceAlias по
 * ключам строки нет) — их привязку тоже можно переиграть: rebind создаст
 * override-алиас поверх авто-чтения.
 */
export async function listAutoMatched(limit = 100): Promise<AutoMatchedRow[]> {
  const take = Math.min(Math.max(limit, 1), 300)
  const rows = await prisma.supplierPrice.findMany({
    where: { variantId: { not: null } },
    orderBy: { id: 'desc' },
    take: take * 2, // часть отсеется как алиасные — добираем с запасом
    include: { batch: { select: { id: true, status: true } } },
  })
  const allKeys = [...new Set(rows.flatMap(r => aliasKeysFor(r)))]
  const aliased = allKeys.length
    ? new Set((await prisma.priceAlias.findMany({ where: { alias: { in: allKeys } }, select: { alias: true } })).map(a => a.alias))
    : new Set<string>()

  const auto = rows.filter(r => !aliasKeysFor(r).some(k => aliased.has(k))).slice(0, take)
  const variantIds = [...new Set(auto.map(r => r.variantId!))]
  const variants = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, attributes: true, product: { select: { name: true } } },
      })
    : []
  const variantById = new Map(variants.map(v => [v.id, v]))

  return auto.map(r => {
    const v = variantById.get(r.variantId!)
    const attrs = (v?.attributes ?? {}) as Record<string, unknown>
    return {
      supplierPriceId: r.id, batchId: r.batchId, batchStatus: r.batch?.status ?? null,
      rawLine: r.rawMessage, model: r.model,
      variantId: r.variantId!,
      productName: v?.product.name ?? null,
      fullName: typeof attrs.fullName === 'string' ? attrs.fullName : null,
      parsedAt: r.parsedAt,
    }
  })
}

export interface RebindResult extends LinkResult {
  rowUpdated?: boolean
}

/**
 * Перепривязка ЛЮБОГО прочтения прайса — штатная операция, а не ошибка:
 *   • строка уже привязана (руками или алиасом) → перевязываем;
 *   • строку система узнала сама (алиаса нет) → создаём override-алиас поверх
 *     авто-чтения — дальше матчер попадает по алиасу до поиска по имени.
 * Оба ключа строки указывают ровно на вариант (productId у ключей обнуляется —
 * прямое попадание вместо «товар + подбор по атрибутам»). Сама строка
 * перевязывается только в preview-батче; применённая история не переписывается.
 */
export async function rebindSupplierPriceRow(opts: {
  supplierPriceId: number
  variantId: number
  actor: { telegramId: string }
}): Promise<RebindResult> {
  const row = await prisma.supplierPrice.findUnique({
    where: { id: opts.supplierPriceId },
    include: { batch: { select: { id: true, status: true } } },
  })
  if (!row) return { ok: false, status: 404, error: 'Строка прайса не найдена' }
  const variant = await prisma.productVariant.findUnique({ where: { id: opts.variantId }, select: { id: true } })
  if (!variant) return { ok: false, status: 404, error: 'Вариант не найден' }

  const keys = aliasKeysFor(row)
  const aliasesBefore = await aliasPriorByKey(keys)
  for (const alias of keys) {
    await prisma.priceAlias.upsert({
      where: { alias },
      update: { variantId: opts.variantId, productId: null, isIgnored: false },
      create: { alias, variantId: opts.variantId },
    })
  }

  const rowVariantIdBefore = row.variantId
  const rematchedRowIds: number[] = []
  const batchesTouched = new Set<number>()

  // Сама строка: перевязываем только в preview — история применённых не переписывается
  let rowUpdated = false
  if (row.batch?.status === 'preview' && row.variantId !== opts.variantId) {
    await prisma.supplierPrice.update({ where: { id: row.id }, data: { variantId: opts.variantId } })
    rowUpdated = true
    rematchedRowIds.push(row.id)
    if (row.batchId) batchesTouched.add(row.batchId)
  }

  // Тот же точечный пере-матч, что в linkSupplierPriceRow
  const candidates = await prisma.supplierPrice.findMany({
    where: { variantId: null, batch: { status: 'preview' } },
    select: { id: true, rawMessage: true, model: true, storage: true, color: true, batchId: true },
  })
  for (const c of candidates) {
    if (!aliasKeysFor(c).some(k => keys.includes(k))) continue
    await prisma.supplierPrice.update({ where: { id: c.id }, data: { variantId: opts.variantId } })
    rematchedRowIds.push(c.id)
    if (c.batchId) batchesTouched.add(c.batchId)
  }
  await recomputeBatchStats(prisma, [...batchesTouched])

  void logAdminAction({
    adminTelegramId: opts.actor.telegramId,
    action: 'price_alias_rebind',
    entity: 'PriceAlias',
    entityId: opts.supplierPriceId,
    before: { aliases: aliasesBefore, rowVariantId: rowVariantIdBefore },
    after: { aliases: keys, variantId: opts.variantId, rematchedRowIds, batchIds: [...batchesTouched], rowUpdated },
  })

  return { ok: true, status: 200, aliases: keys, rematched: rematchedRowIds.length, batchesTouched: [...batchesTouched], rowUpdated }
}

export interface AliasUpdateResult extends LinkResult {
  id?: number
}

/**
 * PUT по алиасу: перепривязка на другой вариант ИЛИ переключение ignore.
 * Дельта before/after в AuditLog (паттерн updateMarkupRule); при перепривязке —
 * тот же точечный пере-матч с записью rematchedRowIds.
 */
export async function updateAlias(opts: {
  id: number
  variantId?: number
  ignore?: boolean
  actor: { telegramId: string }
}): Promise<AliasUpdateResult> {
  const alias = await prisma.priceAlias.findUnique({ where: { id: opts.id } })
  if (!alias) return { ok: false, status: 404, error: 'Привязка не найдена' }
  if (opts.ignore === true && opts.variantId !== undefined) {
    return { ok: false, status: 422, error: 'Либо вариант, либо ignore — не одновременно' }
  }
  if (opts.ignore !== true && opts.variantId === undefined) {
    return { ok: false, status: 422, error: 'Укажите variantId или ignore' }
  }

  const before = { alias: alias.alias, variantId: alias.variantId, productId: alias.productId, isIgnored: alias.isIgnored }
  const rematchedRowIds: number[] = []
  const batchesTouched = new Set<number>()

  if (opts.ignore === true) {
    await prisma.priceAlias.update({ where: { id: alias.id }, data: { isIgnored: true, variantId: null, productId: null } })
  } else {
    const variant = await prisma.productVariant.findUnique({ where: { id: opts.variantId! }, select: { id: true } })
    if (!variant) return { ok: false, status: 404, error: 'Вариант не найден' }
    await prisma.priceAlias.update({ where: { id: alias.id }, data: { variantId: opts.variantId!, productId: null, isIgnored: false } })

    // Пере-матч по ЭТОМУ ключу — как в linkSupplierPriceRow
    const candidates = await prisma.supplierPrice.findMany({
      where: { variantId: null, batch: { status: 'preview' } },
      select: { id: true, rawMessage: true, model: true, storage: true, color: true, batchId: true },
    })
    for (const c of candidates) {
      if (!aliasKeysFor(c).includes(alias.alias)) continue
      await prisma.supplierPrice.update({ where: { id: c.id }, data: { variantId: opts.variantId! } })
      rematchedRowIds.push(c.id)
      if (c.batchId) batchesTouched.add(c.batchId)
    }
    await recomputeBatchStats(prisma, [...batchesTouched])
  }

  void logAdminAction({
    adminTelegramId: opts.actor.telegramId,
    action: 'price_alias_update',
    entity: 'PriceAlias',
    entityId: alias.id,
    before,
    after: {
      aliases: [alias.alias],
      variantId: opts.ignore === true ? null : opts.variantId!,
      ignore: opts.ignore === true,
      rematchedRowIds, batchIds: [...batchesTouched],
    },
  })

  return { ok: true, status: 200, id: alias.id, aliases: [alias.alias], rematched: rematchedRowIds.length, batchesTouched: [...batchesTouched] }
}

/** «Забыть привязку» (owner) — паттерн forgetRule: before в AuditLog. */
export async function deleteAlias(opts: { id: number; actor: { telegramId: string } }): Promise<LinkResult> {
  const alias = await prisma.priceAlias.findUnique({ where: { id: opts.id } })
  if (!alias) return { ok: false, status: 404, error: 'Привязка не найдена' }
  await prisma.priceAlias.delete({ where: { id: alias.id } })
  void logAdminAction({
    adminTelegramId: opts.actor.telegramId,
    action: 'price_alias_remove',
    entity: 'PriceAlias',
    entityId: alias.id,
    before: { alias: alias.alias, variantId: alias.variantId, productId: alias.productId, isIgnored: alias.isIgnored },
    after: { via: 'web_forget' },
  })
  return { ok: true, status: 200, aliases: [alias.alias] }
}

export interface AliasRollbackResult {
  ok: boolean
  status: number
  error?: string
  restored?: number
  conflicts?: Array<{ rowId: number; expected: number; actual: number | null }>
  /** Применённые батчи, где алиас поучаствовал: цены откатывать ТОЛЬКО штатным
   *  /price-batches/:id/rollback — здесь их не трогаем */
  appliedBatches?: number[]
  batchesTouched?: number[]
}

/**
 * Откат ЭФФЕКТА привязки (owner): вернуть в «не узнал» строки preview-батчей,
 * перевязанные этим алиасом. Схема — копия rollbackRecalc (lib/sim-recalc.ts):
 * транзакция, per-row конфликт-гейт, защита от повторного отката. Сам алиас
 * остаётся (его снимает DELETE); применённые цены не трогаются.
 */
export async function rollbackAliasEffect(opts: { id: number; actor: { telegramId: string } }): Promise<AliasRollbackResult> {
  const alias = await prisma.priceAlias.findUnique({ where: { id: opts.id } })
  if (!alias) return { ok: false, status: 404, error: 'Привязка не найдена' }
  if (alias.variantId === null) return { ok: false, status: 422, error: 'У ignore-привязки нет эффекта на строках — откатывать нечего' }

  // Защита от повторного отката: последний след эффекта vs последний откат
  const [lastEffect, lastRollback] = await Promise.all([
    prisma.auditLog.findFirst({
      where: { action: { in: ALIAS_AUDIT_ACTIONS }, after: { path: ['aliases'], array_contains: [alias.alias] } },
      orderBy: { id: 'desc' }, select: { id: true, after: true },
    }),
    prisma.auditLog.findFirst({
      where: { action: 'price_alias_rollback', after: { path: ['alias'], equals: alias.alias } },
      orderBy: { id: 'desc' }, select: { id: true },
    }),
  ])
  if (lastRollback && (!lastEffect || lastRollback.id > lastEffect.id)) {
    return { ok: false, status: 409, error: 'Эффект этой привязки уже откачен' }
  }

  // Какие строки перевязал алиас: rematchedRowIds из аудита (Фаза A) + для
  // до-A привязок консервативный фолбэк — строки с variantId алиаса, чьи ключи
  // содержат этот алиас (перевязанные именно ИМ, а не однофамильцы по имени)
  const effectEntries = await prisma.auditLog.findMany({
    where: { action: { in: ALIAS_AUDIT_ACTIONS }, after: { path: ['aliases'], array_contains: [alias.alias] } },
    orderBy: { id: 'desc' }, take: 100, select: { after: true },
  })
  const auditRowIds = new Set<number>()
  for (const e of effectEntries) {
    const ids = ((e.after ?? {}) as Record<string, unknown>).rematchedRowIds
    if (Array.isArray(ids)) for (const id of ids) if (Number.isInteger(id)) auditRowIds.add(id as number)
  }

  const byVariant = await prisma.supplierPrice.findMany({
    where: { variantId: alias.variantId },
    include: { batch: { select: { id: true, status: true } } },
  })
  const fallbackRows = byVariant.filter(r => aliasKeysFor(r).includes(alias.alias))
  const auditRows = auditRowIds.size
    ? await prisma.supplierPrice.findMany({
        where: { id: { in: [...auditRowIds] } },
        include: { batch: { select: { id: true, status: true } } },
      })
    : []
  const candidates = [...new Map([...auditRows, ...fallbackRows].map(r => [r.id, r])).values()]

  const conflicts: NonNullable<AliasRollbackResult['conflicts']> = []
  const appliedBatches = new Set<number>()
  const toRestore: Array<{ id: number; batchId: number | null }> = []
  for (const r of candidates) {
    if (r.batch && r.batch.status !== 'preview') {
      // Слой 3: применённые цены — только штатный откат батча
      if (r.variantId === alias.variantId) appliedBatches.add(r.batch.id)
      continue
    }
    if (r.variantId === null) continue                       // уже отвязана
    if (r.variantId !== alias.variantId) {                   // конфликт-гейт: перевязали после
      conflicts.push({ rowId: r.id, expected: alias.variantId, actual: r.variantId })
      continue
    }
    toRestore.push({ id: r.id, batchId: r.batchId })
  }

  const batchesTouched = new Set<number>()
  await prisma.$transaction(async (tx: Db) => {
    for (const r of toRestore) {
      await tx.supplierPrice.update({ where: { id: r.id }, data: { variantId: null } })
      if (r.batchId) batchesTouched.add(r.batchId)
    }
    await recomputeBatchStats(tx, [...batchesTouched])
  })

  void logAdminAction({
    adminTelegramId: opts.actor.telegramId,
    action: 'price_alias_rollback',
    entity: 'PriceAlias',
    entityId: alias.id,
    before: { variantId: alias.variantId, restoredRowIds: toRestore.map(r => r.id) },
    after: {
      alias: alias.alias, restored: toRestore.length,
      conflicts, appliedBatches: [...appliedBatches], batchIds: [...batchesTouched],
    },
  })

  return {
    ok: true, status: 200,
    restored: toRestore.length, conflicts,
    appliedBatches: [...appliedBatches], batchesTouched: [...batchesTouched],
  }
}
