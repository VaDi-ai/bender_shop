/**
 * Пересчёт SIM по каталогу (Этап 2, PR-B) — под кнопкой владельца.
 *
 * PR-A применял словарь только к новым разборам; здесь — разовое применение
 * ко ВСЕМУ каталогу, с предпросмотром, транзакцией и откатом.
 *
 * Три раздела предпросмотра (смысл отдельно от косметики):
 *   • semantic    — меняется ЗНАЧЕНИЕ (это видит покупатель);
 *   • canonical   — меняется только МЕТКА («2Sim» → «2 SIM»), смысл тот же;
 *   • inherited   — SIM стоит, но правила нет (наследие старого хардкода):
 *                   пересчёт их НЕ трогает, показываем владельцу для обучения.
 *
 * Откат: старое значение каждой строки лежит в AuditLog (entity ProductVariant,
 * action sim_recalc, after.recalcId — номер пачки). Конфликт-защита как в
 * откате цен: если после применения значение кто-то менял — строку не трогаем.
 */
import { prisma } from './prisma'
import { log } from './logger'
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
  current: string
}

export interface RecalcPreview {
  semantic: RecalcRow[]
  canonical: RecalcRow[]
  inherited: InheritedRow[]
  counts: { semantic: number; canonical: number; inherited: number }
  byCountry: Record<string, number>
}

export interface VariantRow {
  id: number
  attributes: unknown
  product: { name: string; brand: string | null; category: { name: string } | null }
}

/** Телефон ли это (SIM имеет смысл): категория или распознанное поколение iPhone. */
function isPhone(v: VariantRow, attrs: Record<string, string>): boolean {
  const cat = v.product.category?.name ?? ''
  if (/телефон|iphone|смартфон/i.test(cat)) return true
  return detectGeneration(attrs.fullName, v.product.name) !== null
}

export function buildPreview(variants: VariantRow[], rules: SimRuleData[], aliases: AttrAliasData[]): RecalcPreview {
  const semantic: RecalcRow[] = []
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
      // SIM не было: если словарь знает — это семантическое добавление
      if (want.simType) semantic.push({ ...base, from: '—', to: want.simType, by: want.reason })
      continue
    }
    const curCanon = canonicalizeSim(cur, aliases) ?? cur
    if (!want.simType) {
      // значение есть, правила нет — наследие; пересчёт не трогает
      inherited.push({ variantId: v.id, fullName: base.fullName, country: base.country, current: cur })
      continue
    }
    if (want.simType !== curCanon) semantic.push({ ...base, from: cur, to: want.simType, by: want.reason })
    else if (curCanon !== cur) canonical.push({ ...base, from: cur, to: curCanon })
  }

  const byCountry: Record<string, number> = {}
  for (const r of semantic) byCountry[r.country ?? '—'] = (byCountry[r.country ?? '—'] ?? 0) + 1

  return {
    semantic, canonical, inherited,
    counts: { semantic: semantic.length, canonical: canonical.length, inherited: inherited.length },
    byCountry,
  }
}

const VARIANT_SELECT = {
  id: true, attributes: true,
  product: { select: { name: true, brand: true, category: { select: { name: true } } } },
} as const

export async function previewRecalc(): Promise<RecalcPreview> {
  const [rules, aliases, variants] = await Promise.all([
    loadSimRules(), loadAttrAliases('SIM'),
    prisma.productVariant.findMany({ select: VARIANT_SELECT }),
  ])
  return buildPreview(variants as VariantRow[], rules, aliases)
}

export interface ApplyOutcome {
  ok: boolean
  status: number
  error?: string
  changed?: number
  semantic?: number
  canonical?: number
  inheritedUntouched?: number
  recalcId?: number
  noop?: boolean
}

/**
 * Применение: семантические смены + доканонизации, одной транзакцией.
 * Наследие (inherited) не трогается — у него нет словарного значения.
 */
export async function applyRecalc(actorTelegramId: string): Promise<ApplyOutcome> {
  const preview = await previewRecalc()
  const rows = [...preview.semantic, ...preview.canonical]
  if (!rows.length) {
    return { ok: true, status: 200, noop: true, changed: 0, semantic: 0, canonical: 0, inheritedUntouched: preview.counts.inherited }
  }

  const recalcId = await prisma.$transaction(async tx => {
    // Шапка пачки: её id — номер пачки для отката
    const head = await tx.auditLog.create({
      data: {
        adminTelegramId: actorTelegramId,
        action: 'sim_recalc_batch', entity: 'SimRecalc',
        after: { semantic: preview.counts.semantic, canonical: preview.counts.canonical } as object,
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
    return head.id
  }, { timeout: 60_000 })

  log.info('SIM recalc applied', { recalcId, ...preview.counts })
  return {
    ok: true, status: 200, recalcId,
    changed: rows.length,
    semantic: preview.counts.semantic,
    canonical: preview.counts.canonical,
    inheritedUntouched: preview.counts.inherited,
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

/** Откат последней непрокаченной пачки sim_recalc. */
export async function rollbackRecalc(actorTelegramId: string): Promise<RollbackOutcome> {
  const head = await prisma.auditLog.findFirst({
    where: { entity: 'SimRecalc', action: 'sim_recalc_batch' },
    orderBy: { id: 'desc' },
  })
  if (!head) return { ok: false, status: 404, error: 'Пересчётов ещё не было' }

  const alreadyRolled = await prisma.auditLog.findFirst({
    where: { entity: 'SimRecalc', action: 'sim_recalc_rollback', after: { path: ['recalcId'], equals: head.id } },
  })
  if (alreadyRolled) return { ok: false, status: 409, error: 'Этот пересчёт уже откачен' }

  const rows = await prisma.auditLog.findMany({
    where: { entity: 'ProductVariant', action: 'sim_recalc', after: { path: ['recalcId'], equals: head.id } },
    orderBy: { id: 'asc' },
  })
  if (!rows.length) return { ok: false, status: 404, error: 'Строки пересчёта не найдены' }

  const conflicts: NonNullable<RollbackOutcome['conflicts']> = []
  let restored = 0

  await prisma.$transaction(async tx => {
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
  }, { timeout: 60_000 })

  log.info('SIM recalc rolled back', { recalcId: head.id, restored, conflicts: conflicts.length })
  return { ok: true, status: 200, restored, conflicts, recalcId: head.id }
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
