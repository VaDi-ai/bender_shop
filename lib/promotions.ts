/**
 * lib/promotions.ts
 *
 * Бизнес-логика акций:
 *   applyPromotion  — применить скидку к вариантам, сохранить оригинальные цены
 *   cancelPromotion — откатить цены, деактивировать акцию
 *   findVariantsByFilter — выборка вариантов по фильтру акции
 *
 * Запись цен идёт под общим advisory-локом синка (lib/sync-lock.ts, ключ
 * 73001) — тем же, что держат применение цен и обновление SIM. Без него
 * параллельный часовой синк мог затереть скидку прямо в момент её применения
 * (или восстановленную цену в момент отмены): заморозка активной акции
 * защищает steady-state, но не сам момент apply/cancel. Лок занят → наверх
 * летит SyncLockBusy, вызывающая сторона отвечает человеческим «идёт
 * синхронизация, повторите» и НИЧЕГО не пишет.
 */

import { Decimal } from '@prisma/client/runtime/client'
import { prisma } from './prisma'
import { withSyncLock } from './sync-lock'
import { roundPrice } from './currency'
import { DiscountType, FilterType } from '../generated/prisma/client'
import log from './logger'
import type { ProductVariantModel } from '../generated/prisma/models'
import type { ProductModel } from '../generated/prisma/models'

// ─── Выборка вариантов по фильтру ────────────────────────────────────────────

type VariantWithProduct = ProductVariantModel & { product: ProductModel }

export async function findVariantsByFilter(
  filterType: FilterType | string,
  filterValue: string,
  tx?: typeof prisma,
): Promise<VariantWithProduct[]> {
  const db = tx ?? prisma

  if (filterType === FilterType.category) {
    return db.productVariant.findMany({
      where: { product: { category: { name: filterValue } } },
      include: { product: true },
    })
  }

  if (filterType === FilterType.brand) {
    return db.productVariant.findMany({
      where: { product: { brand: filterValue } },
      include: { product: true },
    })
  }

  if (filterType === FilterType.attribute) {
    const [key, val] = filterValue.split(':').map((s) => s.trim()) as [string, string]
    try {
      const results = await db.productVariant.findMany({
        where: { attributes: { path: [key], equals: val } },
        include: { product: true },
      })
      if (results.length > 1000) {
        log.warn('[promotions] attribute filter matched too many variants, slicing to 1000', { filterValue, matchCount: results.length })
        return results.slice(0, 1000)
      }
      return results
    } catch (err) {
      log.error('[promotions] attribute filter query failed', { err: err instanceof Error ? err.message : String(err) })
      return []
    }
  }

  if (filterType === FilterType.products) {
    const ids = filterValue.split(',').map(Number).filter(Boolean)
    return db.productVariant.findMany({
      where: { productId: { in: ids } },
      include: { product: true },
    })
  }

  return []
}

/** Акция может задевать до 1000 строк — держим лок дольше ценового батча. */
const PROMO_LOCK_TIMEOUT_MS = 60_000

// ─── Применение акции ─────────────────────────────────────────────────────────

export async function applyPromotion(promotionId: number): Promise<number> {
  // Read promotion and take updatedAt snapshot BEFORE the transaction
  const promo = await prisma.promotion.findUniqueOrThrow({ where: { id: promotionId } })
  if (promo.isActive) {
    throw new Error('Акция уже активна')
  }
  const snapshotUpdatedAt = promo.updatedAt

  let variantCount = 0

  await withSyncLock(async (tx) => {
    // Optimistic lock: verify nobody modified the promotion concurrently
    const current = await tx.promotion.findUniqueOrThrow({ where: { id: promotionId } })
    if (current.updatedAt.getTime() !== snapshotUpdatedAt.getTime()) {
      throw new Error('Акция была изменена параллельно — повторите операцию')
    }

    // TODO: replace cast when findVariantsByFilter accepts TransactionClient
    const variants = await findVariantsByFilter(promo.filterType, promo.filterValue, tx as unknown as typeof prisma)
    if (variants.length === 0) return

    // Сохраняем оригинальные цены (skipDuplicates — защита от повторного вызова)
    await tx.promotionPrice.createMany({
      data: variants.map((v) => ({
        promotionId,
        variantId: v.id,
        originalPrice: v.price,
      })),
      skipDuplicates: true,
    })

    // Применяем скидку к каждому варианту
    for (const variant of variants) {
      const price = new Decimal(variant.price)
      const discountValue = new Decimal(promo.discountValue)
      let discountedPrice: Decimal
      if (promo.discountType === DiscountType.percent) {
        discountedPrice = price.mul(new Decimal(1).sub(discountValue.div(100)))
      } else {
        discountedPrice = price.sub(discountValue)
      }
      const newPrice = Math.max(1, roundPrice(discountedPrice.toNumber()))
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { price: newPrice },
      })
    }

    await tx.promotion.update({
      where: { id: promotionId },
      data: { isActive: true },
    })

    variantCount = variants.length
  }, PROMO_LOCK_TIMEOUT_MS)

  return variantCount
}

// ─── Отмена акции ─────────────────────────────────────────────────────────────

export async function cancelPromotion(promotionId: number): Promise<void> {
  await withSyncLock(async (tx) => {
    const prices = await tx.promotionPrice.findMany({ where: { promotionId } })

    // Delete snapshot rows FIRST — ensures no partial state where prices are restored
    // but snapshots still reference the (now-gone) discount prices
    await tx.promotionPrice.deleteMany({ where: { promotionId } })

    // Restore original prices
    for (const p of prices) {
      await tx.productVariant.update({
        where: { id: p.variantId },
        data: { price: p.originalPrice },
      })
    }

    await tx.promotion.update({
      where: { id: promotionId },
      data: { isActive: false },
    })
  }, PROMO_LOCK_TIMEOUT_MS)
}

// ─── Строковое описание фильтра ───────────────────────────────────────────────

export function filterLabel(filterType: FilterType | string, filterValue: string): string {
  if (filterType === FilterType.category) return `категория ${filterValue}`
  if (filterType === FilterType.brand) return `бренд ${filterValue}`
  if (filterType === FilterType.attribute) return `атрибут ${filterValue}`
  if (filterType === FilterType.products) {
    const ids = filterValue.split(',').filter(Boolean)
    return `${ids.length} товар(ов)`
  }
  return filterValue
}
