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
 * - если после фильтров кандидатов больше одного (дубли товаров, варианты
 *   разных стран/SIM при одинаковой памяти и цвете) — unmatched, а не «первый
 *   попавшийся» и не «все варианты продукта».
 *
 * Порядок матчинга (обучение алиасами):
 * 1) PriceAlias по трём ключам: «model storage color» / «model» / rawLine;
 *    isIgnored → строка игнорируется; alias.variantId → прямое попадание;
 *    alias.productId → подбор варианта по storage/color, только однозначный.
 * 2) Поиск товара по имени: contains — лишь предвыборка, дальше точное
 *    нормализованное равенство имени и однозначный вариант.
 */
import { prisma } from './prisma'

export type ParsedLine = {
  model: string
  storage?: string
  color?: string
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

type VariantLike = { attributes: unknown }

/**
 * Варианты, ТОЧНО совпавшие по заявленным в строке память/цвет.
 * Сверка только с ключами «Память»/«Цвет»: попадание подстроки в другие
 * атрибуты (fullName, Страна…) совпадением не считается. Вариант без нужного
 * ключа при заявленном значении — не кандидат: «не смог сверить» ≠ «совпало».
 */
function filterByAttrs<V extends VariantLike>(variants: V[], p: ParsedLine): V[] {
  return variants.filter((v) => {
    const attrs = (v.attributes ?? {}) as Record<string, unknown>
    if (p.storage) {
      const val = attrs[STORAGE_ATTR]
      if (typeof val !== 'string' || normalizeStorage(val) !== normalizeStorage(p.storage)) return false
    }
    if (p.color) {
      const val = attrs[COLOR_ATTR]
      if (typeof val !== 'string' || normalizeColor(val) !== normalizeColor(p.color)) return false
    }
    return true
  })
}

export async function matchVariants(parsed: ParsedLine[]): Promise<{ matched: MatchedVariant[]; unmatched: ParsedLine[]; ignored: ParsedLine[] }> {
  const matched: MatchedVariant[] = []
  const unmatched: ParsedLine[] = []
  const ignored: ParsedLine[] = []

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
        // Алиас указывает товар, вариант ищем по память/цвет. Однозначно нашёлся —
        // матч; ноль или несколько — unmatched: цену на «все варианты сразу» или
        // на первый попавшийся не размазываем.
        const candidates = filterByAttrs(product.variants, p)
        if (candidates.length === 1) {
          const picked = candidates[0]
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
    const candidates = products
      .filter((product) => normalizeModelName(product.name) === modelNorm)
      .flatMap((product) => filterByAttrs(product.variants, p).map((variant) => ({ product, variant })))

    if (candidates.length === 1) {
      const { product, variant } = candidates[0]
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
