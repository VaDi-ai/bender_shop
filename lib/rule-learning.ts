/**
 * Обучение разбора от исправлений владельца (шаг 4).
 *
 * Идея: владелец правит атрибут там, где видит проблему (карточка товара), а
 * система замечает ПОВТОРЯЮЩИЙСЯ паттерн и предлагает записать его в словарь.
 * Молча в словарь не попадает ничего — только по явному нажатию.
 *
 * Как считается повтор:
 *   • источник — AuditLog (action='variant_attrs'), который пишет шаг 3;
 *   • в журнале лежат только {ключ: значение} — бренда и страны там НЕТ,
 *     поэтому детектор джойнит обратно ProductVariant → Product и достаёт их
 *     на момент анализа; вариант мог измениться или исчезнуть — такие записи
 *     пропускаем, а не падаем;
 *   • ключ нормализованный: (бренд, страна, атрибут) → значение, а не сырой
 *     текст строки;
 *   • предложение появляется только при ≥3 одинаковых правках.
 *
 * Пространство гипотез узкое — ровно три формы правил, все уже есть в схеме:
 * SimRule (атрибут SIM), AttrValueAlias (прочие значения), PriceAlias
 * (связывание прайса, живёт отдельно и работает как раньше).
 */
import { prisma } from './prisma'
import { log } from './logger'
import { logAdminAction } from './audit'
import { norm } from './sim-rules'

export const REPEATS_REQUIRED = 3
const WINDOW_DAYS = 30

export interface Outcome<T = unknown> { ok: boolean; status: number; error?: string; data?: T }
const bad = (status: number, error: string): Outcome => ({ ok: false, status, error })

export interface PatternKey {
  attr: string
  brand: string | null
  country: string | null
  value: string
}

/** Нормализованный ключ паттерна — по нему и считаем повторы. */
export function patternKey(p: Omit<PatternKey, 'value'>): string {
  return `${p.attr}|${norm(p.brand)}|${norm(p.country)}`
}

export interface Pattern extends PatternKey {
  count: number
  /** Человеческая формулировка правила — её видит владелец ДО записи */
  phrase: string
  /** Одна и та же связка правилась в разные значения — правило не предлагаем */
  conflicting: boolean
  /** Правило с таким ключом уже есть (и с другим значением) */
  conflictsWithExisting: string | null
}

export function rulePhrase(p: Omit<Pattern, 'count' | 'phrase' | 'conflicting' | 'conflictsWithExisting'>): string {
  // Без склонений: «из Индия» читается как ошибка, а падежи всех стран мы не
  // угадаем — держим нейтральную форму «бренд · страна».
  const who = [p.brand, p.country].filter(Boolean).join(' · ')
  return p.attr === 'SIM'
    ? `Все ${who || 'товары'} → SIM: ${p.value}`
    : `Все ${who || 'товары'} → ${p.attr}: ${p.value}`
}

interface RawEdit { attr: string; value: string; variantId: number }

/** Правки из журнала: только ручные, только за окно наблюдения. */
async function recentEdits(): Promise<RawEdit[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const rows = await prisma.auditLog.findMany({
    where: { action: 'variant_attrs', createdAt: { gte: since } },
    orderBy: { id: 'desc' },
    take: 500,
    select: { entityId: true, after: true },
  })

  const out: RawEdit[] = []
  for (const r of rows) {
    const variantId = parseInt(String(r.entityId ?? ''), 10)
    if (!Number.isInteger(variantId)) continue
    const after = (r.after ?? {}) as Record<string, unknown>
    for (const [attr, value] of Object.entries(after)) {
      if (attr === 'overrides' || value === null || value === undefined) continue
      const v = String(value).trim()
      if (!v) continue
      out.push({ attr, value: v, variantId })
    }
  }
  return out
}

/**
 * Что система заметила. Возвращает и «созревшие» паттерны (≥3), и причину,
 * по которой предложение не даётся, — чтобы UI не врал про «нет паттернов».
 */
export async function detectPatterns(): Promise<Pattern[]> {
  const edits = await recentEdits()
  if (!edits.length) return []

  // Джойн к каталогу: бренда и страны в журнале нет. Вариант мог исчезнуть —
  // тогда правку просто не учитываем.
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: [...new Set(edits.map(e => e.variantId))] } },
    select: { id: true, attributes: true, product: { select: { brand: true } } },
  })
  const byId = new Map(variants.map(v => [v.id, v]))

  const groups = new Map<string, { key: PatternKey; values: Map<string, number> }>()
  for (const e of edits) {
    const v = byId.get(e.variantId)
    if (!v) continue                                   // вариант удалён — пропускаем
    const attrs = (v.attributes ?? {}) as Record<string, string>
    const brand = v.product.brand ?? null
    const country = attrs['Страна'] ?? null
    if (!brand && !country) continue                   // пустой ключ — обобщать не на что

    const k = patternKey({ attr: e.attr, brand, country })
    const g = groups.get(k) ?? { key: { attr: e.attr, brand, country, value: e.value }, values: new Map() }
    g.values.set(e.value, (g.values.get(e.value) ?? 0) + 1)
    groups.set(k, g)
  }

  const [simRules, aliases] = await Promise.all([
    prisma.simRule.findMany({ select: { countryNorm: true, brandNorm: true, modelMatch: true, simType: true } }),
    prisma.attrValueAlias.findMany({ select: { attrKey: true, rawNorm: true, canonical: true } }),
  ])

  const out: Pattern[] = []
  for (const g of groups.values()) {
    const values = [...g.values.entries()].sort((a, b) => b[1] - a[1])
    const [topValue, count] = values[0]!
    const conflicting = values.length > 1        // одну связку правили по-разному
    const key = { ...g.key, value: topValue }

    let conflictsWithExisting: string | null = null
    if (key.attr === 'SIM') {
      const hit = simRules.find(r => r.modelMatch === '' && r.countryNorm === norm(key.country) && (r.brandNorm === '' || r.brandNorm === norm(key.brand)))
      if (hit && hit.simType !== topValue) conflictsWithExisting = hit.simType
    } else {
      const hit = aliases.find(a => a.attrKey === key.attr && a.rawNorm === norm(topValue))
      if (hit && hit.canonical !== topValue) conflictsWithExisting = hit.canonical
    }

    out.push({ ...key, count, conflicting, conflictsWithExisting, phrase: rulePhrase(key) })
  }
  return out.sort((a, b) => b.count - a.count)
}

/** Готово ли предложение: ≥3 повторов, без противоречий и конфликтов. */
export function isRipe(p: Pattern): boolean {
  return p.count >= REPEATS_REQUIRED && !p.conflicting && !p.conflictsWithExisting && !!(p.brand || p.country)
}

export async function ripePatterns(): Promise<Pattern[]> {
  return (await detectPatterns()).filter(isRipe)
}

/** Есть ли созревший паттерн под конкретную правку — для чекбокса в карточке. */
export async function patternFor(attr: string, brand: string | null, country: string | null, value: string): Promise<Pattern | null> {
  const k = patternKey({ attr, brand, country })
  const found = (await detectPatterns()).find(p => patternKey(p) === k && p.value === value)
  return found && isRipe(found) ? found : null
}

// ─── Запись правила ──────────────────────────────────────────────────────────

/**
 * Пишет правило в словарь. Только три формы; всё остальное остаётся ручной
 * правкой конкретной строки. Вызывается ТОЛЬКО по явному согласию владельца.
 */
export async function learnRule(actor: string, p: PatternKey): Promise<Outcome> {
  const attr = String(p.attr ?? '').trim()
  const value = String(p.value ?? '').trim()
  if (!attr || !value) return bad(422, 'Не понял, какое правило записывать')
  if (!p.brand && !p.country) return bad(422, 'Правило не к чему привязать — нужен бренд или страна')

  if (attr === 'SIM') {
    const key = {
      countryNorm: norm(p.country), brandNorm: norm(p.brand), modelMatch: '', modelGenFrom: 0,
    }
    const existing = await prisma.simRule.findUnique({
      where: { countryNorm_brandNorm_modelMatch_modelGenFrom: key },
    })
    if (existing && existing.simType !== value) {
      return bad(409, `Правило для этой связки уже есть: ${existing.simType}. Сначала забудьте старое`)
    }
    const rule = await prisma.simRule.upsert({
      where: { countryNorm_brandNorm_modelMatch_modelGenFrom: key },
      update: { simType: value, source: 'learned', note: 'выучено из правок владельца' },
      create: { ...key, country: p.country, brand: p.brand, simType: value, source: 'learned', note: 'выучено из правок владельца' },
    })
    void logAdminAction({
      adminTelegramId: actor, action: 'rule_learned', entity: 'SimRule', entityId: rule.id,
      after: { attr, brand: p.brand, country: p.country, value, phrase: rulePhrase(p) },
    })
    log.info('Rule learned from edits', { kind: 'SimRule', id: rule.id })
    return { ok: true, status: 201, data: { kind: 'SimRule', id: rule.id, phrase: rulePhrase(p) } }
  }

  // Прочие атрибуты обобщаются только как канон значения
  const where = { attrKey_rawNorm: { attrKey: attr, rawNorm: norm(value) } }
  const existing = await prisma.attrValueAlias.findUnique({ where })
  if (existing && existing.canonical !== value) {
    return bad(409, `Для «${value}» уже задан канон «${existing.canonical}». Сначала забудьте старое`)
  }
  const alias = await prisma.attrValueAlias.upsert({
    where, update: { canonical: value, source: 'learned' },
    create: { attrKey: attr, rawNorm: norm(value), canonical: value, source: 'learned' },
  })
  void logAdminAction({
    adminTelegramId: actor, action: 'rule_learned', entity: 'AttrValueAlias', entityId: alias.id,
    after: { attr, value, phrase: rulePhrase(p) },
  })
  return { ok: true, status: 201, data: { kind: 'AttrValueAlias', id: alias.id, phrase: rulePhrase(p) } }
}

// ─── Витрина словаря ─────────────────────────────────────────────────────────

export interface LearnedRule {
  kind: 'SimRule' | 'AttrValueAlias'
  id: number
  phrase: string
  source: string
  /** Правило из сида вернётся при перезапуске — «забыть» его бессмысленно */
  fromSeed: boolean
}

export async function listDictionary(): Promise<LearnedRule[]> {
  const [sim, aliases] = await Promise.all([
    prisma.simRule.findMany({ orderBy: [{ source: 'asc' }, { id: 'asc' }] }),
    prisma.attrValueAlias.findMany({ orderBy: [{ source: 'asc' }, { id: 'asc' }] }),
  ])
  return [
    ...sim.map(r => ({
      kind: 'SimRule' as const, id: r.id, source: r.source, fromSeed: r.source === 'seed',
      phrase: rulePhrase({ attr: 'SIM', brand: r.brand, country: r.country, value: r.simType })
        + (r.modelGenFrom ? ` (с ${r.modelGenFrom}-го поколения)` : ''),
    })),
    ...aliases.map(a => ({
      kind: 'AttrValueAlias' as const, id: a.id, source: a.source, fromSeed: a.source === 'seed',
      phrase: `«${a.rawNorm}» читаем как «${a.canonical}» (${a.attrKey})`,
    })),
  ]
}

/**
 * «Забыть правило» — останавливает БУДУЩИЙ вывод по нему. Уже проставленные
 * значения на товарах не откатывает: их двигает только «обновить по словарю».
 */
export async function forgetRule(actor: string, kind: string, id: number): Promise<Outcome> {
  if (kind === 'SimRule') {
    const r = await prisma.simRule.findUnique({ where: { id } })
    if (!r) return bad(404, 'Правило не найдено')
    await prisma.simRule.delete({ where: { id } })
    void logAdminAction({
      adminTelegramId: actor, action: 'rule_forgotten', entity: 'SimRule', entityId: id,
      before: { country: r.country, brand: r.brand, simType: r.simType, source: r.source },
    })
    return {
      ok: true, status: 200,
      data: { note: r.source === 'seed' ? 'Это правило из базовой поставки — оно вернётся при следующем перезапуске' : null },
    }
  }
  if (kind === 'AttrValueAlias') {
    const a = await prisma.attrValueAlias.findUnique({ where: { id } })
    if (!a) return bad(404, 'Правило не найдено')
    await prisma.attrValueAlias.delete({ where: { id } })
    void logAdminAction({
      adminTelegramId: actor, action: 'rule_forgotten', entity: 'AttrValueAlias', entityId: id,
      before: { attrKey: a.attrKey, rawNorm: a.rawNorm, canonical: a.canonical, source: a.source },
    })
    return {
      ok: true, status: 200,
      data: { note: a.source === 'seed' ? 'Это правило из базовой поставки — оно вернётся при следующем перезапуске' : null },
    }
  }
  return bad(422, 'Неизвестный тип правила')
}

/** Журнал «правка → правило» для витрины «Парсера». */
export async function learningLog(limit = 20): Promise<Array<{ id: number; at: Date; who: string; phrase: string; action: string }>> {
  const rows = await prisma.auditLog.findMany({
    where: { action: { in: ['rule_learned', 'rule_forgotten'] } },
    orderBy: { id: 'desc' }, take: Math.min(limit, 50),
    select: { id: true, createdAt: true, adminTelegramId: true, action: true, after: true, before: true, entity: true },
  })
  return rows.map(r => ({
    id: r.id,
    at: r.createdAt,
    who: r.adminTelegramId,
    action: r.action,
    phrase: String(((r.after ?? {}) as Record<string, unknown>).phrase
      ?? `${r.entity} #${(r.before as Record<string, unknown>)?.canonical ?? ''}`).slice(0, 120),
  }))
}
