/**
 * Пересчёт SIM по каталогу (Этап 2, PR-B) — под кнопкой владельца.
 *
 * PR-A применял словарь только к новым разборам; здесь — разовое применение
 * ко ВСЕМУ каталогу, с предпросмотром, транзакцией и откатом.
 *
 * Разделы предпросмотра (смысл, первичное проставление и косметика — врозь):
 *   • semantic    — меняется ЗНАЧЕНИЕ существующего SIM (это видит покупатель);
 *   • added       — SIM не было вовсе, словарь проставляет впервые;
 *   • canonical   — меняется только МЕТКА («2Sim» → «2 SIM»), смысл тот же;
 *   • inherited   — SIM стоит, но правила нет (наследие старого хардкода):
 *                   пересчёт их НЕ трогает, показываем владельцу для обучения.
 * Применяются первые три; наследие — только к обучению.
 *
 * Запись идёт под тем же advisory-локом, что берёт часовой синк (73001):
 * attributes — цельный JSON, параллельная запись потеряла бы одну из правок
 * целиком. Лок занят → 409, вслепую не пишем.
 *
 * Откат: старое значение каждой строки лежит в AuditLog (entity ProductVariant,
 * action sim_recalc, after.recalcId — номер пачки). Конфликт-защита как в
 * откате цен: если после применения значение кто-то менял — строку не трогаем.
 */
import { prisma } from './prisma'
import { log } from './logger'
import { withSyncLock, SyncLockBusy, SYNC_LOCK_BUSY_MESSAGE } from './sync-lock'
import {
  loadSimRules, loadAttrAliases, resolveSimType, canonicalizeSim, detectGeneration,
  SimRuleData, AttrAliasData,
} from './sim-rules'

export interface RecalcRow {
  variantId: number
  fullName: string
  country: string | null
  generation: number | null
  from: string
  to: string
  /** по какому правилу выбрано значение */
  by?: string
}

export interface InheritedRow {
  variantId: number
  fullName: string
  country: string | null
  brand: string | null
  current: string
}

export interface RecalcPreview {
  semantic: RecalcRow[]
  added: RecalcRow[]
  canonical: RecalcRow[]
  inherited: InheritedRow[]
  counts: { semantic: number; added: number; canonical: number; inherited: number }
  /** Разбивка ТОЛЬКО смен существующего значения — «что увидит покупатель». */
  byCountry: Record<string, number>
  /** Разбивка первичных проставлений — отдельно, чтобы не смешивать со сменами. */
  addedByCountry: Record<string, number>
}

export interface VariantRow {
  id: number
  attributes: unknown
  product: { name: string; brand: string | null; category: { name: string } | null }
}

/**
 * Телефон ли это (SIM имеет смысл): категория или распознанное поколение
 * iPhone. ОДИН признак на пересчёт и на очередь обучения — иначе строка,
 * которую пересчёт считает телефоном, не видна владельцу в очереди и правило
 * под неё не завести (расхождение «категория точно Телефоны» против
 * вхождения нашлось на живом каталоге: ~173 андроида).
 */
export function isPhone(v: VariantRow, attrs: Record<string, string> = (v.attributes ?? {}) as Record<string, string>): boolean {
  const cat = v.product.category?.name ?? ''
  if (/телефон|iphone|смартфон/i.test(cat)) return true
  return detectGeneration(attrs.fullName, v.product.name) !== null
}

export function buildPreview(variants: VariantRow[], rules: SimRuleData[], aliases: AttrAliasData[]): RecalcPreview {
  const semantic: RecalcRow[] = []
  const added: RecalcRow[] = []
  const canonical: RecalcRow[] = []
  const inherited: InheritedRow[] = []

  for (const v of variants) {
    const attrs = (v.attributes ?? {}) as Record<string, string>
    if (!isPhone(v, attrs)) continue
    const cur = attrs.SIM
    const names = [attrs.fullName, v.product.name]
    // Пересчёт игнорирует текущее значение (explicit не передаём) — считаем «как надо по словарю»
    const want = resolveSimType({ country: attrs['Страна'], brand: v.product.brand, names }, rules, aliases)
    if (want.reason === 'accessory') continue   // чехол/стекло «для iPhone 17» — не наш домен
    const base = {
      variantId: v.id,
      fullName: attrs.fullName ?? v.product.name,
      country: attrs['Страна'] ?? null,
      generation: detectGeneration(attrs.fullName, v.product.name),
    }

    if (!cur) {
      // SIM не было вовсе: словарь его ПРОСТАВЛЯЕТ впервые. Это не смена
      // значения — отдельный бакет, чтобы не раздувать «сменят значение».
      if (want.simType) added.push({ ...base, from: '—', to: want.simType, by: want.reason })
      continue
    }
    const curCanon = canonicalizeSim(cur, aliases) ?? cur
    if (!want.simType) {
      // значение есть, правила нет — наследие; пересчёт не трогает
      inherited.push({
        variantId: v.id, fullName: base.fullName, country: base.country,
        brand: want.missingBrand ?? v.product.brand ?? null, current: cur,
      })
      continue
    }
    if (want.simType !== curCanon) semantic.push({ ...base, from: cur, to: want.simType, by: want.reason })
    else if (curCanon !== cur) canonical.push({ ...base, from: cur, to: curCanon })
  }

  const tally = (rows: RecalcRow[]): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const r of rows) out[r.country ?? '—'] = (out[r.country ?? '—'] ?? 0) + 1
    return out
  }

  return {
    semantic, added, canonical, inherited,
    counts: {
      semantic: semantic.length, added: added.length,
      canonical: canonical.length, inherited: inherited.length,
    },
    byCountry: tally(semantic),
    addedByCountry: tally(added),
  }
}

/** Пересчёт каталога длиннее ценового батча — держим лок дольше 15 с. */
const LOCK_TIMEOUT_MS = 60_000

export interface SimQueueMissing {
  country: string
  brand: string | null
  count: number
  example: string
  generations: number[]
}

export interface SimQueue {
  /** SIM не проставлен и правила нет — владельцу нужно завести правило */
  missing: SimQueueMissing[]
  /** SIM стоит с прежних времён, правила под него нет — пересчёт не трогает */
  inherited: InheritedRow[]
}

/**
 * Очередь обучения словаря. Признак «телефон» — тот же isPhone, что у
 * пересчёта; группировка по связке «бренд + страна», потому что страновые
 * правила принадлежат Apple и правило под андроид заводится под бренд.
 */
export function buildSimQueue(variants: VariantRow[], rules: SimRuleData[], aliases: AttrAliasData[]): SimQueue {
  const missing = new Map<string, SimQueueMissing>()
  for (const v of variants) {
    const attrs = (v.attributes ?? {}) as Record<string, string>
    if (!isPhone(v, attrs)) continue
    // explicit передаём: строка с уже проставленным SIM в «не узнал» не идёт —
    // она попадёт в inherited, если правила под неё нет
    const r = resolveSimType(
      { explicit: attrs.SIM, country: attrs['Страна'], brand: v.product.brand, names: [attrs.fullName, v.product.name] },
      rules, aliases,
    )
    if (r.reason !== 'unknown') continue
    const brand = r.missingBrand ?? null
    const key = `${brand ?? ''}|${r.missingKey!}`
    const cur = missing.get(key) ?? {
      country: r.missingKey!, brand, count: 0,
      example: attrs.fullName ?? v.product.name, generations: [],
    }
    cur.count++
    const g = detectGeneration(attrs.fullName, v.product.name)
    if (g && !cur.generations.includes(g)) cur.generations.push(g)
    missing.set(key, cur)
  }
  return {
    missing: [...missing.values()].sort((a, b) => b.count - a.count),
    inherited: buildPreview(variants, rules, aliases).inherited,
  }
}

const VARIANT_SELECT = {
  id: true, attributes: true,
  product: { select: { name: true, brand: true, category: { select: { name: true } } } },
} as const

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * db — клиент чтения: снаружи это prisma (read-only предпросмотр), а в
 * applyRecalc сюда передаётся tx из-под лока синка, чтобы preview и запись
 * видели ОДНО состояние каталога.
 */
export async function loadSimQueue(): Promise<SimQueue> {
  const [rules, aliases, variants] = await Promise.all([
    loadSimRules(), loadAttrAliases('SIM'),
    prisma.productVariant.findMany({ select: VARIANT_SELECT }),
  ])
  return buildSimQueue(variants as VariantRow[], rules, aliases)
}

export async function previewRecalc(db: any = prisma): Promise<RecalcPreview> {
  const [rules, aliases, variants] = await Promise.all([
    loadSimRules(), loadAttrAliases('SIM'),
    db.productVariant.findMany({ select: VARIANT_SELECT }),
  ])
  return buildPreview(variants as VariantRow[], rules, aliases)
}

export interface ApplyOutcome {
  ok: boolean
  status: number
  error?: string
  /** Всего записано строк = semantic + added + canonical */
  changed?: number
  semantic?: number
  added?: number
  canonical?: number
  inheritedUntouched?: number
  recalcId?: number
  noop?: boolean
}

/**
 * Применение: смены значения + первичные проставления + доканонизации —
 * одной транзакцией под локом синка. Наследие не трогается: словарного
 * значения для него нет, сначала правило.
 */
export async function applyRecalc(actorTelegramId: string): Promise<ApplyOutcome> {
  try {
    return await withSyncLock(async tx => {
      // Предпросмотр считается ВНУТРИ лока: между чтением и записью синк не
      // вклинится, иначе он перезапишет весь JSON attributes целиком.
      const preview = await previewRecalc(tx)
      const rows = [...preview.semantic, ...preview.added, ...preview.canonical]
      const counts = preview.counts
      if (!rows.length) {
        return {
          ok: true, status: 200, noop: true, changed: 0,
          semantic: 0, added: 0, canonical: 0, inheritedUntouched: counts.inherited,
        }
      }

      // Шапка пачки: её id — номер пачки для отката
      const head = await tx.auditLog.create({
        data: {
          adminTelegramId: actorTelegramId,
          action: 'sim_recalc_batch', entity: 'SimRecalc',
          after: { semantic: counts.semantic, added: counts.added, canonical: counts.canonical } as object,
        },
        select: { id: true },
      })

      for (const r of rows) {
        const v = await tx.productVariant.findUnique({ where: { id: r.variantId }, select: { attributes: true } })
        if (!v) continue
        const attrs = { ...((v.attributes ?? {}) as Record<string, unknown>) }
        const before = attrs.SIM ?? null
        attrs.SIM = r.to
        await tx.productVariant.update({ where: { id: r.variantId }, data: { attributes: attrs as object } })
        await tx.auditLog.create({
          data: {
            adminTelegramId: actorTelegramId,
            action: 'sim_recalc', entity: 'ProductVariant', entityId: String(r.variantId),
            before: { SIM: before } as object,
            after: { SIM: r.to, recalcId: head.id } as object,
          },
        })
      }

      log.info('SIM recalc applied', { recalcId: head.id, ...counts })
      return {
        ok: true, status: 200, recalcId: head.id,
        changed: rows.length,
        semantic: counts.semantic,
        added: counts.added,
        canonical: counts.canonical,
        inheritedUntouched: counts.inherited,
      }
    }, LOCK_TIMEOUT_MS)
  } catch (e) {
    if (e instanceof SyncLockBusy) return { ok: false, status: 409, error: SYNC_LOCK_BUSY_MESSAGE }
    throw e
  }
}

export interface RollbackOutcome {
  ok: boolean
  status: number
  error?: string
  restored?: number
  conflicts?: Array<{ variantId: number; expected: string; actual: string | null }>
  recalcId?: number
}

/** Откат последней непрокаченной пачки sim_recalc — тоже под локом синка. */
export async function rollbackRecalc(actorTelegramId: string): Promise<RollbackOutcome> {
  try {
    return await withSyncLock(async tx => {
      const head = await tx.auditLog.findFirst({
        where: { entity: 'SimRecalc', action: 'sim_recalc_batch' },
        orderBy: { id: 'desc' },
      })
      if (!head) return { ok: false, status: 404, error: 'Обновлений по словарю ещё не было' }

      const alreadyRolled = await tx.auditLog.findFirst({
        where: { entity: 'SimRecalc', action: 'sim_recalc_rollback', after: { path: ['recalcId'], equals: head.id } },
      })
      if (alreadyRolled) return { ok: false, status: 409, error: 'Это обновление уже откачено' }

      const rows = await tx.auditLog.findMany({
        where: { entity: 'ProductVariant', action: 'sim_recalc', after: { path: ['recalcId'], equals: head.id } },
        orderBy: { id: 'asc' },
      })
      if (!rows.length) return { ok: false, status: 404, error: 'Строки обновления не найдены' }

      const conflicts: NonNullable<RollbackOutcome['conflicts']> = []
      let restored = 0

      for (const r of rows) {
        const variantId = Number(r.entityId)
        const applied = (r.after as Record<string, unknown>)?.SIM as string
        const before = (r.before as Record<string, unknown>)?.SIM as string | null
        const v = await tx.productVariant.findUnique({ where: { id: variantId }, select: { attributes: true } })
        if (!v) continue
        const attrs = { ...((v.attributes ?? {}) as Record<string, unknown>) }
        const current = (attrs.SIM as string | undefined) ?? null
        if (current !== applied) {
          // после пересчёта значение меняли — чужую правку не перетираем
          conflicts.push({ variantId, expected: applied, actual: current })
          continue
        }
        if (before === null || before === undefined) delete attrs.SIM
        else attrs.SIM = before
        await tx.productVariant.update({ where: { id: variantId }, data: { attributes: attrs as object } })
        restored++
      }

      await tx.auditLog.create({
        data: {
          adminTelegramId: actorTelegramId,
          action: 'sim_recalc_rollback', entity: 'SimRecalc',
          after: { recalcId: head.id, restored, conflicts: conflicts.length } as object,
        },
      })

      log.info('SIM recalc rolled back', { recalcId: head.id, restored, conflicts: conflicts.length })
      return { ok: true, status: 200, restored, conflicts, recalcId: head.id }
    }, LOCK_TIMEOUT_MS)
  } catch (e) {
    if (e instanceof SyncLockBusy) return { ok: false, status: 409, error: SYNC_LOCK_BUSY_MESSAGE }
    throw e
  }
}

/** Есть ли применённый и неоткаченный пересчёт (для кнопки «Откатить» в UI). */
export async function lastRecalcState(): Promise<{ recalcId: number; appliedAt: Date; rolledBack: boolean } | null> {
  const head = await prisma.auditLog.findFirst({
    where: { entity: 'SimRecalc', action: 'sim_recalc_batch' },
    orderBy: { id: 'desc' },
  })
  if (!head) return null
  const rolled = await prisma.auditLog.findFirst({
    where: { entity: 'SimRecalc', action: 'sim_recalc_rollback', after: { path: ['recalcId'], equals: head.id } },
  })
  return { recalcId: head.id, appliedAt: head.createdAt, rolledBack: !!rolled }
}
