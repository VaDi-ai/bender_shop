/**
 * Обучаемый словарь SIM-типа (Этап 2, PR-A).
 *
 * Заменяет хардкод sheets-sync «iPhone + Китай/Гонконг → 2 SIM, иначе eSIM».
 *
 * Приоритет резолва (утверждён владельцем):
 *   1) явная метка в имени варианта  → канон через AttrValueAlias
 *   2) модельный оверрайд (iPhone Air → eSIM во всём мире, страна игнорируется)
 *   3) правило по стране + поколению (максимальный modelGenFrom ≤ поколения)
 *   4) нет правила → SIM НЕ проставляем, строка идёт в очередь «не узнал»
 *
 * PR-A строго безопасный: словарь работает только для НОВЫХ разборов синка,
 * существующие атрибуты каталога не трогаются (пересчёт — отдельный PR-B).
 */
import { prisma } from './prisma'
import { log } from './logger'

/** Канон значений SIM. «eSIM + eSIM» — две виртуальные (напр. США/Япония с 17-го). */
export const SIM_CANON = ['2 SIM', 'eSIM', 'SIM + eSIM', 'eSIM + eSIM'] as const
export type SimType = typeof SIM_CANON[number]

export interface SimRuleData {
  id: number
  country: string | null
  countryNorm: string
  /** '' = любой бренд */
  brandNorm: string
  /** '' = не модельное правило */
  modelMatch: string
  /** 0 = любое поколение */
  modelGenFrom: number
  simType: string
  source: string
}

export interface AttrAliasData { attrKey: string; rawNorm: string; canonical: string }

export const norm = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase()

/**
 * Поколение модели из имени: «iPhone 17 Pro Max 256 …» → 17.
 * Для не-iPhone вернёт null — сработают только правила без modelGenFrom.
 */
export function detectGeneration(...names: Array<string | null | undefined>): number | null {
  // (?!\d) — не хватать «12» из «128GB»; (?!\s*(?:gb|tb)) — не считать объём
  // памяти поколением («iPhone 128GB Black» → null, а не 12)
  for (const n of names) {
    const m = /iphone\s+(?:se\s+)?(\d{1,2})(?!\d)(?!\s*(?:gb|tb))/i.exec(n ?? '')
    if (m) {
      const g = parseInt(m[1]!, 10)
      if (g >= 5 && g <= 30) return g
    }
  }
  return null
}

/**
 * Аксессуары не получают SIM: стекло/чехол/кабель «для iPhone» проходят по
 * имени, но телефоном не являются (найдено на живом каталоге — «Защитное
 * стекло Remax для iPhone»).
 */
const ACCESSORY_RE = /(чехол|стекло|плёнк|пленк|кабель|адаптер|зарядк|наклейк|держател|подставк|сумк|ремеш|бампер|case|glass|cover|charger)/i

export function isAccessory(...names: Array<string | null | undefined>): boolean {
  return names.some(n => ACCESSORY_RE.test(n ?? ''))
}

/** Канонизация сырого значения SIM по словарю алиасов (+ встроенные дефолты). */
export function canonicalizeSim(raw: string | null | undefined, aliases: AttrAliasData[]): string | null {
  const r = norm(raw)
  if (!r) return null
  const hit = aliases.find(a => a.attrKey === 'SIM' && a.rawNorm === r)
  if (hit) return hit.canonical
  return null
}

export interface ResolveInput {
  /** Значение SIM, явно найденное в имени варианта (если было) */
  explicit?: string | null
  country?: string | null
  brand?: string | null
  /** Полное имя варианта и/или товара — для поколения, модели и фильтра аксессуаров */
  names: Array<string | null | undefined>
}

export interface ResolveResult {
  simType: string | null
  /** Откуда взялось значение — для UI/логов/тестов */
  reason: 'explicit' | 'model' | 'country' | 'accessory' | 'unknown'
  /** Ключ для очереди обучения, когда правило не найдено */
  missingKey?: string
  /** Бренд той же строки: правило заводится под связку «бренд + страна» */
  missingBrand?: string | null
}

export function resolveSimType(input: ResolveInput, rules: SimRuleData[], aliases: AttrAliasData[]): ResolveResult {
  // 0. Аксессуары — SIM не проставляем вообще
  if (isAccessory(...input.names)) return { simType: null, reason: 'accessory' }

  // 1. Явная метка сильнее словаря
  const explicit = canonicalizeSim(input.explicit, aliases)
  if (explicit) return { simType: explicit, reason: 'explicit' }

  const gen = detectGeneration(...input.names)
  const haystack = input.names.map(n => norm(n)).join(' ')
  const brandNorm = effectiveBrand(input.brand, haystack)

  const genOk = (r: SimRuleData) => r.modelGenFrom === 0 || (gen !== null && gen >= r.modelGenFrom)
  const brandOk = (r: SimRuleData) => r.brandNorm === '' || r.brandNorm === brandNorm
  // Максимальный подходящий modelGenFrom выигрывает (переезд рынка на eSIM-only)
  const byGenDesc = (a: SimRuleData, b: SimRuleData) => b.modelGenFrom - a.modelGenFrom

  // 2. Модельный оверрайд (iPhone Air → eSIM во всём мире)
  const modelHit = rules
    .filter(r => r.modelMatch !== '' && haystack.includes(r.modelMatch) && genOk(r) && brandOk(r))
    .sort(byGenDesc)[0]
  if (modelHit) return { simType: modelHit.simType, reason: 'model' }

  // 3. Правило по стране (полная строка, включая составные «Гонконг/США»)
  const cNorm = norm(input.country)
  if (cNorm) {
    const countryHit = rules
      .filter(r => r.modelMatch === '' && r.countryNorm === cNorm && genOk(r) && brandOk(r))
      .sort(byGenDesc)[0]
    if (countryHit) return { simType: countryHit.simType, reason: 'country' }
  }

  // 4. Брендовое правило без страны (Samsung Galaxy → SIM + eSIM)
  if (brandNorm) {
    const brandHit = rules
      .filter(r => r.modelMatch === '' && r.countryNorm === '' && r.brandNorm !== '' && r.brandNorm === brandNorm && genOk(r))
      .sort(byGenDesc)[0]
    if (brandHit) return { simType: brandHit.simType, reason: 'country' }
  }

  // 5. Не знаем — не угадываем. Сюда попадает и андроид без своего правила:
  // страновой словарь Apple к нему не применяется. В очередь отдаём страну И
  // бренд — правило заводится под связку, иначе оно накроет и Apple.
  return {
    simType: null, reason: 'unknown',
    missingKey: input.country?.trim() || '(без страны)',
    missingBrand: (input.brand ?? '').trim() || brandNorm || null,
  }
}

/**
 * Бренд варианта. Если в карточке он не проставлен — достаём из имени: у
 * страновых правил теперь brandNorm='apple', и iPhone без заполненного бренда
 * иначе перестал бы резолвиться.
 */
export function effectiveBrand(brand: string | null | undefined, haystack: string): string {
  const b = norm(brand)
  if (b) return b
  if (/\b(iphone|ipad|macbook|airpods|apple)\b/.test(haystack)) return 'apple'
  return ''
}

/**
 * Атрибуты для СУЩЕСТВУЮЩЕГО варианта на синке (PR-A, граница безопасности).
 *
 * Словарь применяется только к новым разборам. У варианта, который уже есть в
 * каталоге, SIM сохраняет СМЫСЛ: берём его текущее значение и канонизируем
 * только метку («2Sim» → «2 SIM» — значение то же). Значение по словарю
 * (напр. Индия eSIM → SIM + eSIM) НЕ применяется — это делает PR-B по кнопке
 * владельца, после просмотра /sim-recalc/preview.
 *
 * Если у существующего варианта SIM не было — не добавляем: заполнение пустых
 * это тоже изменение витрины, его показывает preview и применяет PR-B.
 */
export function attributesForExistingVariant(
  newAttrs: Record<string, string>,
  existingAttributes: unknown,
  aliases: AttrAliasData[],
): Record<string, string> {
  const out = { ...newAttrs }
  // Ручная правка владельца сильнее любого разбора: ключи с отметкой
  // attrOverrides возвращаем как есть и словарём не пересчитываем.
  const overrides = ((existingAttributes ?? {}) as Record<string, unknown>).attrOverrides as
    Record<string, { value: string }> | undefined
  if (overrides && typeof overrides === 'object') {
    out.attrOverrides = overrides as unknown as string
    for (const [key, ov] of Object.entries(overrides)) {
      if (ov && typeof ov.value === 'string') out[key] = ov.value
    }
  }
  const cur = (existingAttributes as Record<string, unknown> | null)?.['SIM']
  if (overrides?.SIM) {
    // SIM поправлен руками — оставляем ровно то, что сказал владелец
  } else if (typeof cur === 'string' && cur.trim()) {
    out.SIM = canonicalizeSim(cur, aliases) ?? cur
  } else {
    delete out.SIM
  }
  return out
}

// ─── Загрузка словаря ────────────────────────────────────────────────────────

export async function loadSimRules(): Promise<SimRuleData[]> {
  // Вторичный orderBy по id: resolveSimType сортирует только по modelGenFrom,
  // при равном поколении выбор не должен зависеть от порядка выдачи БД
  const rows = await prisma.simRule.findMany({
    select: { id: true, country: true, countryNorm: true, brandNorm: true, modelMatch: true, modelGenFrom: true, simType: true, source: true },
    orderBy: [{ modelGenFrom: 'desc' }, { id: 'asc' }],
  })
  return rows
}

export async function loadAttrAliases(attrKey?: string): Promise<AttrAliasData[]> {
  const rows = await prisma.attrValueAlias.findMany({
    where: attrKey ? { attrKey } : undefined,
    select: { attrKey: true, rawNorm: true, canonical: true },
  })
  return rows
}

// ─── Сид (идемпотентный; learned-правила не перетираются) ────────────────────

type SeedRule = { country?: string; brand?: string; modelMatch?: string; modelGenFrom?: number; simType: SimType; note?: string }

/** Бренд страновых правил: словарь стран описывает рынок Apple, не андроид. */
const APPLE = 'Apple'

/**
 * Сид — матрица владельца (2026-08, актуально на iPhone 17).
 *
 * ВСЕ страновые правила привязаны к бренду Apple: словарь описывает поведение
 * рынка именно Apple. К Redmi, Poco, Honor, Xiaomi, OnePlus, Huawei, Google
 * это неприменимо — у большинства две физические SIM без eSIM, и страновой
 * дефолт был бы угадыванием. Не-Apple без своего правила уходит в очередь
 * обучения, SIM не проставляется.
 *
 * База (modelGenFrom=0) + точечные оверрайды с 17-го поколения: правило с
 * бОльшим modelGenFrom выигрывает (движок resolveSimType). Страны, выпавшие
 * из матрицы, отзываются в seedSimDictionary — их связки вернутся в очередь
 * «не узнал», а не будут молча жить по устаревшему правилу.
 */
export const SIM_SEED: SeedRule[] = [
  // Две физические SIM — все поколения
  ...['Китай', 'Гонконг', 'Макао'].map(country => ({ country, brand: APPLE, simType: '2 SIM' as SimType })),

  // США: две виртуальные (eSIM-only рынок; каталог ≥15 — база, оверрайд не нужен)
  { country: 'США', brand: APPLE, simType: 'eSIM + eSIM' },

  // Гибрид (база всех поколений)
  ...['ОАЭ', 'Япония', 'Катар', 'Европа', 'Южная Корея', 'Бразилия', 'Индия', 'Сингапур']
    .map(country => ({ country, brand: APPLE, simType: 'SIM + eSIM' as SimType })),

  // Оверрайды с iPhone 17 — переезд рынков
  { country: 'Гонконг', brand: APPLE, modelGenFrom: 17, simType: 'SIM + eSIM', note: 'с 17-го Гонконг — SIM + eSIM' },
  { country: 'ОАЭ', brand: APPLE, modelGenFrom: 17, simType: 'eSIM + eSIM', note: 'с 17-го ОАЭ — две eSIM' },
  { country: 'Япония', brand: APPLE, modelGenFrom: 17, simType: 'eSIM + eSIM', note: 'с 17-го Япония — две eSIM' },

  // Модельный оверрайд: iPhone Air — eSIM во всём мире, страна не важна
  { modelMatch: 'air', modelGenFrom: 17, simType: 'eSIM', note: 'iPhone 17 Air — eSIM-only глобально' },

  // Перенос прежнего хардкода Samsung из sheets-sync
  { brand: 'Samsung', simType: 'SIM + eSIM', note: 'перенесено из хардкода sheets-sync' },
]

/**
 * Страны для матчера прайса: AI-парсер возвращает код (HK), флаг (🇭🇰) или
 * имя — канон каталога по-русски. Набор кодов = то, что умеет отдавать
 * парсер (lib/ai-parser.ts) + русские/английские имена на всякий случай.
 * Нераспознанная страна алиасом не становится — матчер её просто не использует
 * и логирует, владелец добавляет алиас через обучение.
 */
const COUNTRY_ALIAS_SEED: Array<[canonical: string, raws: string[]]> = [
  ['Гонконг', ['🇭🇰', 'hk', 'hong kong', 'гонконг']],
  ['Индия', ['🇮🇳', 'in', 'india', 'индия']],
  ['Япония', ['🇯🇵', 'jp', 'japan', 'япония']],
  ['Европа', ['🇪🇺', 'eu', 'europe', 'европа']],
  ['США', ['🇺🇸', 'us', 'usa', 'сша']],
  ['Китай', ['🇨🇳', 'cn', 'china', 'китай']],
  ['ОАЭ', ['🇦🇪', 'ae', 'uae', 'оаэ']],
  ['Таиланд', ['🇹🇭', 'th', 'thailand', 'таиланд']],
  ['Казахстан', ['🇰🇿', 'kz', 'kazakhstan', 'казахстан']],
  ['Индонезия', ['🇮🇩', 'id', 'indonesia', 'индонезия']],
]

/** Канон меток: то, что раньше приходило сырьём из листа. */
export const ALIAS_SEED: Array<{ attrKey: string; raw: string; canonical: string }> = [
  { attrKey: 'SIM', raw: '2sim', canonical: '2 SIM' },
  { attrKey: 'SIM', raw: '2 sim', canonical: '2 SIM' },
  { attrKey: 'SIM', raw: 'dual sim', canonical: '2 SIM' },
  { attrKey: 'SIM', raw: '2 сим', canonical: '2 SIM' },
  { attrKey: 'SIM', raw: 'esim', canonical: 'eSIM' },
  { attrKey: 'SIM', raw: 'e-sim', canonical: 'eSIM' },
  { attrKey: 'SIM', raw: 'есим', canonical: 'eSIM' },
  { attrKey: 'SIM', raw: '1sim+esim', canonical: 'SIM + eSIM' },
  { attrKey: 'SIM', raw: 'sim+esim', canonical: 'SIM + eSIM' },
  { attrKey: 'SIM', raw: 'sim + esim', canonical: 'SIM + eSIM' },
  // Форма из прайсов поставщиков («1 Sim + eSim»)
  { attrKey: 'SIM', raw: '1 sim + esim', canonical: 'SIM + eSIM' },
  { attrKey: 'SIM', raw: '1 sim+esim', canonical: 'SIM + eSIM' },
  { attrKey: 'SIM', raw: '1sim + esim', canonical: 'SIM + eSIM' },
  // Две виртуальные (США/Япония с 17-го)
  { attrKey: 'SIM', raw: 'esim+esim', canonical: 'eSIM + eSIM' },
  { attrKey: 'SIM', raw: 'esim + esim', canonical: 'eSIM + eSIM' },
  { attrKey: 'SIM', raw: '2 esim', canonical: 'eSIM + eSIM' },
  { attrKey: 'SIM', raw: 'две виртуальные', canonical: 'eSIM + eSIM' },
  { attrKey: 'SIM', raw: 'two esim', canonical: 'eSIM + eSIM' },
  ...COUNTRY_ALIAS_SEED.flatMap(([canonical, raws]) =>
    raws.map(raw => ({ attrKey: 'Страна', raw, canonical }))),
]

export async function seedSimDictionary(): Promise<{ rules: number; aliases: number }> {
  let rules = 0
  for (const r of SIM_SEED) {
    const countryNorm = norm(r.country)
    const key = {
      countryNorm,
      brandNorm: norm(r.brand),
      modelMatch: norm(r.modelMatch),
      modelGenFrom: r.modelGenFrom ?? 0,
    }
    const where = { countryNorm_brandNorm_modelMatch_modelGenFrom: key }
    const existing = await prisma.simRule.findUnique({ where })
    // learned не перетираем — владелец мог поправить правило под себя
    if (existing && existing.source === 'learned') continue
    await prisma.simRule.upsert({
      where,
      update: { simType: r.simType, country: r.country ?? null, brand: r.brand ?? null, note: r.note ?? null },
      create: { ...key, country: r.country ?? null, brand: r.brand ?? null, simType: r.simType, source: 'seed', note: r.note ?? null },
    })
    rules++
  }
  // Отзыв устаревшего сида: правило со source='seed', которого больше нет в
  // SIM_SEED, удаляем (страна выпала из матрицы владельца или ключ сменился —
  // включая исторические бесбрендовые правила). Его связки честно вернутся в
  // очередь «не узнал». learned не трогаем — владелец заводил его осознанно.
  const seedKeys = new Set(SIM_SEED.map(r =>
    [norm(r.country), norm(r.brand), norm(r.modelMatch), r.modelGenFrom ?? 0].join('|')))
  const seedRows = await prisma.simRule.findMany({ where: { source: 'seed' } })
  const stale = seedRows.filter(row =>
    !seedKeys.has([row.countryNorm, row.brandNorm, row.modelMatch, row.modelGenFrom].join('|')))
  if (stale.length) {
    await prisma.simRule.deleteMany({ where: { id: { in: stale.map(s => s.id) } } })
    log.info('SIM dictionary: retired stale seed rules', {
      count: stale.length,
      keys: stale.map(s => `${s.country ?? s.countryNorm}${s.modelGenFrom ? `≥${s.modelGenFrom}` : ''}`).slice(0, 30),
    })
  }

  let aliases = 0
  for (const a of ALIAS_SEED) {
    const where = { attrKey_rawNorm: { attrKey: a.attrKey, rawNorm: a.raw } }
    const existing = await prisma.attrValueAlias.findUnique({ where })
    if (existing && existing.source === 'learned') continue
    await prisma.attrValueAlias.upsert({
      where,
      update: { canonical: a.canonical },
      create: { attrKey: a.attrKey, rawNorm: a.raw, canonical: a.canonical, source: 'seed' },
    })
    aliases++
  }
  log.info('SIM dictionary seeded', { rules, aliases })
  return { rules, aliases }
}
