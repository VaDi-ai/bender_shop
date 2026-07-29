/**
 * Гонка акции с синком: применение и отмена пишут variant.price, значит
 * должны идти под тем же advisory-локом (73001), что применение цен и
 * обновление SIM. Проверяем на реальной БД: лок занят → цену не трогаем.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const RUN = process.env.INTEGRATION_DB === '1'

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any
let applyPromotion: any, cancelPromotion: any, SyncLockBusy: any, getFrozenVariantIds: any

function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try { host = new URL(url).hostname } catch { /* noop */ }
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
    throw new Error(`INTEGRATION_DB=1 с не-локальной БД (host="${host}") — отказ.`)
  }
}

describe.skipIf(!RUN)('акции под локом синка', () => {
  let productId: number
  let variantId: number
  let promoId: number

  beforeAll(async () => {
    assertDisposableDb()
    ;({ prisma } = await import('../../lib/prisma'))
    ;({ applyPromotion, cancelPromotion } = await import('../../lib/promotions'))
    ;({ SyncLockBusy } = await import('../../lib/sync-lock'))
    ;({ getFrozenVariantIds } = await import('../../lib/price-sync-policy'))
  })

  beforeEach(async () => {
    await prisma.promotionPrice.deleteMany()
    await prisma.promotion.deleteMany()
    await prisma.productVariant.deleteMany()
    await prisma.product.deleteMany()

    const cat = await prisma.category.upsert({ where: { name: 'iPhone' }, update: {}, create: { name: 'iPhone' } })
    const p = await prisma.product.create({
      data: { sku: 'promo-1', name: 'iPhone 17 Pro', brand: 'Apple', price: 100000, categoryId: cat.id, attributes: {} },
    })
    productId = p.id
    const v = await prisma.productVariant.create({
      data: { productId: p.id, sku: 'promo-1-v', price: 100000, quantity: 3, inStock: true, attributes: { fullName: 'iPhone 17 Pro 256' } },
    })
    variantId = v.id
    const promo = await prisma.promotion.create({
      data: { name: 'Минус десять', discountType: 'percent', discountValue: 10, filterType: 'category', filterValue: 'iPhone', isActive: false },
    })
    promoId = promo.id
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.promotionPrice.deleteMany()
    await prisma.promotion.deleteMany()
    await prisma.productVariant.deleteMany()
    await prisma.product.deleteMany()
    await prisma.$disconnect()
  })

  const priceOf = async () => Number((await prisma.productVariant.findUnique({ where: { id: variantId } })).price)

  it('лок свободен: скидка применяется и снимается как раньше', async () => {
    expect(await applyPromotion(promoId)).toBe(1)
    expect(await priceOf()).toBe(90000)
    expect((await prisma.promotion.findUnique({ where: { id: promoId } })).isActive).toBe(true)
    expect(await prisma.promotionPrice.count({ where: { promotionId: promoId } })).toBe(1)

    await cancelPromotion(promoId)
    expect(await priceOf()).toBe(100000)                       // цена вернулась
    expect((await prisma.promotion.findUnique({ where: { id: promoId } })).isActive).toBe(false)
    expect(await prisma.promotionPrice.count({ where: { promotionId: promoId } })).toBe(0)
  })

  it('лок занят синком: применение НЕ трогает цену и отдаёт busy', async () => {
    await prisma.$transaction(async (tx: any) => {
      const got = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(73001) as "l"`
      expect(got[0].l).toBe(true)
      await expect(applyPromotion(promoId)).rejects.toBeInstanceOf(SyncLockBusy)
    })
    expect(await priceOf()).toBe(100000)                       // цена не тронута
    expect((await prisma.promotion.findUnique({ where: { id: promoId } })).isActive).toBe(false)
    expect(await prisma.promotionPrice.count()).toBe(0)        // снимков не наплодили
  })

  it('лок занят синком: отмена НЕ трогает цену и отдаёт busy', async () => {
    await applyPromotion(promoId)
    expect(await priceOf()).toBe(90000)

    await prisma.$transaction(async (tx: any) => {
      const got = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(73001) as "l"`
      expect(got[0].l).toBe(true)
      await expect(cancelPromotion(promoId)).rejects.toBeInstanceOf(SyncLockBusy)
    })
    // акция осталась идущей, скидка на месте, снимок цел — откатывать нечего
    expect(await priceOf()).toBe(90000)
    expect((await prisma.promotion.findUnique({ where: { id: promoId } })).isActive).toBe(true)
    expect(await prisma.promotionPrice.count({ where: { promotionId: promoId } })).toBe(1)

    // после освобождения лока отмена проходит обычным порядком
    await cancelPromotion(promoId)
    expect(await priceOf()).toBe(100000)
  })

  it('заморозка активной акции не сломана: вариант под акцией — frozen', async () => {
    expect((await getFrozenVariantIds(prisma)).has(variantId)).toBe(false)
    await applyPromotion(promoId)
    expect((await getFrozenVariantIds(prisma)).has(variantId)).toBe(true)
    await cancelPromotion(promoId)
    expect((await getFrozenVariantIds(prisma)).has(variantId)).toBe(false)
  })
})
