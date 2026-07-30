/**
 * Матчинг распарсенных строк прайса к вариантам товара.
 * Вынесено из bot/admin/pricing.ts (PR-6): нужен и бот-флоу, и веб-батчам
 * разбора прайсов; lib не должен импортировать bot.
 *
 * Принцип: строка либо ТОЧНО ложится на один вариант, либо уходит в unmatched
 * («не узнал») — неверный матч хуже очереди. Поэтому:
 * - модель сравнивается с именем товара ТОЧНО (нормализованное равенство,
 *   не подстрока): «iPhone 17 Pro» не попадает в «iPhone 17 Pro Max»;
 * - память/цвет сверяются с конкретными ключами атрибутов («Память»/«Цвет»),
 *   а не includes по всем значениям подряд;
 * - страна — жёсткий фильтр, если распозналась словарём AttrValueAlias
 *   (attrKey='Страна': 🇭🇰/HK/Hong Kong → «Гонконг»); цена из-под флага не
 *   ложится на вариант другой страны, даже единственный. Нераспознанную
 *   страну НЕ угадываем — она просто не участвует (и логируется, чтобы
 *   владелец добавил алиас);
 * - SIM — только вторичный дизамбигуатор: поставщики пишут его вольно
 *   («1 Sim + eSim» у физически двухсимного Гонконга), поэтому SIM не
 *   ветирует единственного кандидата и применяется, лишь когда после страны
 *   кандидатов больше одного и он сужает ровно до одного;
 * - если после всего кандидатов не ровно один — unmatched, а не «первый
 *   попавшийся» и не «все варианты продукта».
 *
 * Порядок матчинга (обучение алиасами):
 * 1) PriceAlias по трём ключам: «model storage color» / «model» / rawLine;
 *    isIgnored → строка игнорируется; alias.variantId → прямое попадание;
 *    alias.productId → подбор варианта по атрибутам, только однозначный.
 * 2) Поиск товара по имени: contains — лишь предвыборка, дальше точное
 *    нормализованное равенство имени и однозначный вариант.
 */
import { prisma } from './prisma'
import { log } from './logger'

export type ParsedLine = {
  model: string
  storage?: string
  color?: string
  /** Страна из прайса: код/флаг/имя (🇭🇰, HK, Hong Kong) — канонизируется словарём */
  country?: string
  /** Тип SIM из прайса, как написал поставщик («1 Sim + eSim») */
  simType?: string
  price: number
  rawLine: string
}

export type MatchedVariant = {
  rawLine: string
  parsed: ParsedLine
  variantId: number
  variantSku: string
  productId: number
  productName: string
  brand?: string
  categoryId?: number
  currentPrice: number
  supplierPrice: number
}

const STORAGE_ATTR = 'Память'
const COLOR_ATTR = 'Цвет'
const COUNTRY_ATTR = 'Страна'
const SIM_ATTR = 'SIM'

type AttrAlias = { attrKey: string; rawNorm: string; canonical: string }

const rawNorm = (s: string): string => s.trim().toLowerCase()

/** Канон значения по словарю AttrValueAlias; нет в словаре → null (не угадываем). */
function canonByDict(attrKey: string, raw: string | undefined, aliases: AttrAlias[]): string | null {
  if (!raw?.trim()) return null
  const r = rawNorm(raw)
  return aliases.find(a => a.attrKey === attrKey && a.rawNorm === r)?.canonical ?? null
}

/** Страна варианта: атрибут бывает составным («Япония/Индия») — совпадение любой части. */
function variantCountryMatches(attrs: Record<string, unknown>, canon: string, aliases: AttrAlias[]): boolean {
  const val = attrs[COUNTRY_ATTR]
  if (typeof val !== 'string') return false
  return val.split('/').some(part => {
    const c = canonByDict(COUNTRY_ATTR, part, aliases) ?? part.trim()
    return c.toLowerCase() === canon.toLowerCase()
  })
}

/** Нормализация имени модели/товара: регистр, ё→е, схлопнутые пробелы. */
export function normalizeModelName(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
}

/** «256», «256GB», «256 Gb» → «256gb»; «1TB»/«1 Тб» не смешиваются с «1GB». */
export function normalizeStorage(s: string): string {
  const compact = s.toLowerCase().replace(/[\s.]+/g, '')
  return /^\d+$/.test(compact) ? compact + 'gb' : compact
}

function normalizeColor(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Точное совпадение по заявленным в строке память/цвет.
 * Сверка только с ключами «Память»/«Цвет»: попадание подстроки в другие
 * атрибуты (fullName, Страна…) совпадением не считается. Вариант без нужного
 * ключа при заявленном значении — не кандидат: «не смог сверить» ≠ «совпало».
 */
function matchesStorageColor(attrs: Record<string, unknown>, p: ParsedLine): boolean {
  if (p.storage) {
    const val = attrs[STORAGE_ATTR]
    if (typeof val !== 'string' || normalizeStorage(val) !== normalizeStorage(p.storage)) return false
  }
  if (p.color) {
    const val = attrs[COLOR_ATTR]
    if (typeof val !== 'string' || normalizeColor(val) !== normalizeColor(p.color)) return false
  }
  return true
}

/**
 * Отбор кандидатов: память/цвет → страна (жёстко, если распозналась) →
 * SIM (вторично, только если сузил ровно до одного). Итог не «ровно один» —
 * зона ответственности вызывающего: unmatched.
 */
function narrowCandidates<T>(items: T[], attrsOf: (t: T) => Record<string, unknown>, p: ParsedLine, aliases: AttrAlias[]): T[] {
  let cands = items.filter(t => matchesStorageColor(attrsOf(t), p))

  if (p.country?.trim()) {
    const canon = canonByDict(COUNTRY_ATTR, p.country, aliases)
    if (canon) {
      cands = cands.filter(t => variantCountryMatches(attrsOf(t), canon, aliases))
    } else {
      // Не угадываем: страна не участвует в отборе, но владельцу нужен след,
      // чтобы завести алиас (AttrValueAlias attrKey='Страна').
      log.warn('price-matching: страна из прайса не распознана словарём', { raw: p.country, rawLine: p.rawLine })
    }
  }

  if (cands.length > 1 && p.simType?.trim()) {
    const canon = canonByDict(SIM_ATTR, p.simType, aliases)
    if (canon) {
      const narrowed = cands.filter(t => {
        const val = attrsOf(t)[SIM_ATTR]
        return typeof val === 'string' && (canonByDict(SIM_ATTR, val, aliases) ?? val.trim()) === canon
      })
      if (narrowed.length === 1) cands = narrowed
    }
  }
  return cands
}

async function loadMatcherAliases(): Promise<AttrAlias[]> {
  return prisma.attrValueAlias.findMany({
    where: { attrKey: { in: [COUNTRY_ATTR, SIM_ATTR] } },
    select: { attrKey: true, rawNorm: true, canonical: true },
  })
}

export async function matchVariants(parsed: ParsedLine[]): Promise<{ matched: MatchedVariant[]; unmatched: ParsedLine[]; ignored: ParsedLine[] }> {
  const matched: MatchedVariant[] = []
  const unmatched: ParsedLine[] = []
  const ignored: ParsedLine[] = []
  if (!parsed.length) return { matched, unmatched, ignored }

  // Словарь канонизации (страна/SIM) — один раз на весь батч
  const attrAliases = await loadMatcherAliases()

  for (const p of parsed) {
    // 1. Проверить PriceAlias
    const aliasFull = (p.model + (p.storage ? ' ' + p.storage : '') + (p.color ? ' ' + p.color : '')).trim().toLowerCase()
    const alias = await prisma.priceAlias.findFirst({
      where: {
        OR: [
          { alias: aliasFull },
          { alias: p.model.trim().toLowerCase() },
          { alias: p.rawLine.trim().toLowerCase() },
        ],
      },
    })

    if (alias?.isIgnored) {
      ignored.push(p)
      continue
    }

    if (alias?.variantId) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: alias.variantId },
        include: { product: true },
      })
      if (variant) {
        matched.push({
          rawLine: p.rawLine, parsed: p,
          variantId: variant.id, variantSku: variant.sku,
          productId: variant.productId, productName: variant.product.name,
          brand: variant.product.brand ?? undefined,
          categoryId: variant.product.categoryId ?? undefined,
          currentPrice: Number(variant.price), supplierPrice: p.price,
        })
        continue
      }
    }

    if (alias?.productId) {
      const product = await prisma.product.findUnique({
        where: { id: alias.productId },
        include: { variants: true },
      })
      if (product) {
        // Алиас указывает товар, вариант ищем по атрибутам. Однозначно нашёлся —
        // матч; ноль или несколько — unmatched: цену на «все варианты сразу» или
        // на первый попавшийся не размазываем.
        const candidates = narrowCandidates(product.variants, v => (v.attributes ?? {}) as Record<string, unknown>, p, attrAliases)
        const picked = candidates.length === 1 ? candidates[0] : undefined
        if (picked) {
          matched.push({
            rawLine: p.rawLine, parsed: p,
            variantId: picked.id, variantSku: picked.sku,
            productId: product.id, productName: product.name,
            brand: product.brand ?? undefined,
            categoryId: product.categoryId ?? undefined,
            currentPrice: Number(picked.price), supplierPrice: p.price,
          })
        } else {
          unmatched.push(p)
        }
        continue
      }
    }

    // 2. Стандартный поиск по имени (без алиаса): contains — только предвыборка
    // из БД, реальное условие — точное нормализованное равенство имени.
    const products = await prisma.product.findMany({
      where: { name: { contains: p.model, mode: 'insensitive' } },
      include: { variants: true },
    })
    const modelNorm = normalizeModelName(p.model)
    // Пары product×variant по всем точным тёзкам сразу: SIM-доотбор должен
    // видеть полный список кандидатов, а не сужать внутри одного товара.
    const pairs = products
      .filter((product) => normalizeModelName(product.name) === modelNorm)
      .flatMap((product) => product.variants.map((variant) => ({ product, variant })))
    const candidates = narrowCandidates(pairs, (t) => (t.variant.attributes ?? {}) as Record<string, unknown>, p, attrAliases)

    const single = candidates.length === 1 ? candidates[0] : undefined
    if (single) {
      const { product, variant } = single
      matched.push({
        rawLine: p.rawLine, parsed: p,
        variantId: variant.id, variantSku: variant.sku,
        productId: product.id, productName: product.name,
        brand: product.brand ?? undefined,
        categoryId: product.categoryId ?? undefined,
        currentPrice: Number(variant.price), supplierPrice: p.price,
      })
    } else {
      unmatched.push(p)
    }
  }
  return { matched, unmatched, ignored }
}
