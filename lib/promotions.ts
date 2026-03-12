/**
 * lib/promotions.ts
 *
 * Бизнес-логика акций:
 *   applyPromotion  — применить скидку к вариантам, сохранить оригинальные цены
 *   cancelPromotion — откатить цены, деактивировать акцию
 *   findVariantsByFilter — выборка вариантов по фильтру акции
 */

import { Decimal } from '@prisma/client/runtime/client'
import { prisma } from './prisma'
import { roundPrice } from './currency'
import type { ProductVariantModel } from '../generated/prisma/models'
import type { ProductModel } from '../generated/prisma/models'

// ─── Выборка вариантов по фильтру ────────────────────────────────────────────

type VariantWithProduct = ProductVariantModel & { product: ProductModel }

export async function findVariantsByFilter(
  filterType: string,
  filterValue: string,
): Promise<VariantWithProduct[]> {
  if (filterType === 'category') {
    return prisma.productVariant.findMany({
      where: { product: { category: { name: filterValue } } },
      include: { product: true },
    })
  }

  if (filterType === 'brand') {
    return prisma.productVariant.findMany({
      where: { product: { brand: filterValue } },
      include: { product: true },
    })
  }

  if (filterType === 'attribute') {
    const [key, val] = filterValue.split(':').map((s) => s.trim())
    try {
      const results = await prisma.productVariant.findMany({
        where: { attributes: { path: [key], equals: val } },
        include: { product: true },
      })
      if (results.length > 1000) {
        console.warn(`[promotions] attribute filter "${filterValue}" matched ${results.length} variants, slicing to 1000`)
        return results.slice(0, 1000)
      }
      return results
    } catch (err) {
      console.error('[promotions] attribute filter query failed:', err)
      return []
    }
  }

  if (filterType === 'products') {
    const ids = filterValue.split(',').map(Number).filter(Boolean)
    return prisma.productVariant.findMany({
      where: { productId: { in: ids } },
      include: { product: true },
    })
  }

  return []
}

// ─── Применение акции ─────────────────────────────────────────────────────────

export async function applyPromotion(promotionId: number): Promise<number> {
  const promo = await prisma.promotion.findUniqueOrThrow({ where: { id: promotionId } })
  const variants = await findVariantsByFilter(promo.filterType, promo.filterValue)

  if (variants.length === 0) return 0

  const operations = [
    // Сохраняем оригинальные цены (пропускаем дубли — на случай повторного вызова)
    prisma.promotionPrice.createMany({
      data: variants.map((v) => ({
        promotionId,
        variantId: v.id,
        originalPrice: v.price,
      })),
      skipDuplicates: true,
    }),
    // Применяем скидку
    ...variants.map((variant) => {
      const price = new Decimal(variant.price)
      const discountValue = new Decimal(promo.discountValue)
      let newPrice: number
      if (promo.discountType === 'percent') {
        newPrice = price.mul(new Decimal(1).sub(discountValue.div(100))).toNumber()
      } else {
        newPrice = price.sub(discountValue).toNumber()
      }
      newPrice = Math.max(1, roundPrice(newPrice))
      return prisma.productVariant.update({
        where: { id: variant.id },
        data: { price: newPrice },
      })
    }),
    prisma.promotion.update({
      where: { id: promotionId },
      data: { isActive: true },
    }),
  ]

  await prisma.$transaction(operations)
  return variants.length
}

// ─── Отмена акции ─────────────────────────────────────────────────────────────

export async function cancelPromotion(promotionId: number): Promise<void> {
  const prices = await prisma.promotionPrice.findMany({ where: { promotionId } })

  const operations = [
    ...prices.map((p) =>
      prisma.productVariant.update({
        where: { id: p.variantId },
        data: { price: p.originalPrice },
      })
    ),
    prisma.promotion.update({
      where: { id: promotionId },
      data: { isActive: false },
    }),
    prisma.promotionPrice.deleteMany({ where: { promotionId } }),
  ]

  await prisma.$transaction(operations)
}

// ─── Строковое описание фильтра ───────────────────────────────────────────────

export function filterLabel(filterType: string, filterValue: string): string {
  if (filterType === 'category') return `категория ${filterValue}`
  if (filterType === 'brand') return `бренд ${filterValue}`
  if (filterType === 'attribute') return `атрибут ${filterValue}`
  if (filterType === 'products') {
    const ids = filterValue.split(',').filter(Boolean)
    return `${ids.length} товар(ов)`
  }
  return filterValue
}
