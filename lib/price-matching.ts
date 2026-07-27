/**
 * Матчинг распарсенных строк прайса к вариантам товара.
 * Вынесено из bot/admin/pricing.ts БЕЗ изменения логики (PR-6): нужен и
 * бот-флоу, и веб-батчам разбора прайсов; lib не должен импортировать bot.
 *
 * Порядок матчинга (обучение алиасами):
 * 1) PriceAlias по трём ключам: «model storage color» / «model» / rawLine;
 *    isIgnored → строка игнорируется; alias.variantId → прямое попадание;
 *    alias.productId → подбор варианта по storage/color (или все варианты).
 * 2) Поиск товара по имени (contains, insensitive) + фильтр по storage/color.
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
        // Найти подходящий вариант по storage/color
        let picked: typeof product.variants[0] | undefined
        for (const variant of product.variants) {
          const attrs = variant.attributes as Record<string, string>
          const vals = Object.values(attrs).map(v => v.toLowerCase())
          if (p.storage && !vals.some(v => v.includes(p.storage!))) continue
          if (p.color && !vals.some(v => v.includes(p.color!.toLowerCase()))) continue
          picked = variant
          break
        }
        if (picked) {
          matched.push({
            rawLine: p.rawLine, parsed: p,
            variantId: picked.id, variantSku: picked.sku,
            productId: product.id, productName: product.name,
            brand: product.brand ?? undefined,
            categoryId: product.categoryId ?? undefined,
            currentPrice: Number(picked.price), supplierPrice: p.price,
          })
          continue
        }
        // Если вариант не найден по атрибутам — применить ко всем вариантам этого продукта
        if (product.variants.length > 0) {
          for (const variant of product.variants) {
            matched.push({
              rawLine: p.rawLine, parsed: p,
              variantId: variant.id, variantSku: variant.sku,
              productId: product.id, productName: product.name,
              brand: product.brand ?? undefined,
              categoryId: product.categoryId ?? undefined,
              currentPrice: Number(variant.price), supplierPrice: p.price,
            })
          }
          continue
        }
      }
    }

    // 2. Стандартный поиск по имени (без алиаса)
    const products = await prisma.product.findMany({
      where: { name: { contains: p.model, mode: 'insensitive' } },
      include: { variants: true },
    })
    if (!products.length) { unmatched.push(p); continue }

    let found: MatchedVariant | null = null
    outer:
    for (const product of products) {
      for (const variant of product.variants) {
        const attrs = variant.attributes as Record<string, string>
        const vals = Object.values(attrs).map((v) => v.toLowerCase())
        if (p.storage && !vals.some((v) => v.includes(p.storage!))) continue
        if (p.color && !vals.some((v) => v.includes(p.color!.toLowerCase()))) continue
        found = {
          rawLine: p.rawLine, parsed: p,
          variantId: variant.id, variantSku: variant.sku,
          productId: product.id, productName: product.name,
          brand: product.brand ?? undefined,
          categoryId: product.categoryId ?? undefined,
          currentPrice: Number(variant.price), supplierPrice: p.price,
        }
        break outer
      }
    }
    found ? matched.push(found) : unmatched.push(p)
  }
  return { matched, unmatched, ignored }
}
