import { Decimal } from '@prisma/client/runtime/client'
import { prisma } from './prisma'

// ─── Атомарная продажа ────────────────────────────────────────────────────────

export type AtomicSaleParams = {
  productId: number
  qty: number
  price: number          // цена за единицу
  productName: string
  clientId: number | null
  telegramId: string
  userId: string         // telegram userId кто проводит продажу
  comment: string
}

/**
 * Проводит продажу в одной транзакции:
 *   — проверяет наличие на складе (re-fetch внутри tx)
 *   — создаёт Order + OrderItem
 *   — уменьшает product.quantity / product.stock
 *   — уменьшает variant.quantity + записывает StockMovement
 * Бросает Error при недостатке товара.
 */
export async function atomicSale(
  params: AtomicSaleParams,
): Promise<{ variantId: number | null }> {
  return prisma.$transaction(async (tx) => {
    // Проверяем актуальный остаток
    const product = await tx.product.findUnique({ where: { id: params.productId } })
    if (!product) throw new Error('Товар не найден')
    const available = product.quantity - product.reserved
    if (available < params.qty) {
      throw new Error(`Недостаточно товара (доступно: ${available})`)
    }

    // Выбираем вариант с достаточным количеством (re-fetch внутри tx)
    const variants = await tx.productVariant.findMany({
      where: { productId: params.productId },
      orderBy: { quantity: 'desc' },
    })
    const variant = variants.find((v) => v.quantity >= params.qty) ?? variants[0] ?? null

    // Создаём Order
    await tx.order.create({
      data: {
        clientId: params.clientId,
        telegramId: params.telegramId,
        items: variant
          ? {
              create: [{
                variantId: variant.id,
                quantity: params.qty,
                priceAtPurchase: params.price,
                productName: params.productName,
              }],
            }
          : undefined,
        totalAmount: new Decimal(params.price).times(params.qty).toFixed(2),
        payment: 'crm',
        status: 'completed',
      },
    })

    // Уменьшаем product.quantity + product.stock
    await tx.product.update({
      where: { id: params.productId },
      data: {
        quantity: { decrement: params.qty },
        stock: { decrement: params.qty },
      },
    })

    // Уменьшаем variant.quantity + StockMovement
    if (variant) {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: {
          quantity: { decrement: params.qty },
          inStock: variant.quantity - params.qty > 0,
        },
      })
      await tx.stockMovement.create({
        data: {
          variantId: variant.id,
          type: 'out',
          quantity: params.qty,
          comment: params.comment,
          createdBy: params.userId,
        },
      })
    }

    // Update client stats
    if (params.clientId !== null) {
      await tx.client.update({
        where: { id: params.clientId },
        data: {
          totalRevenue: { increment: new Decimal(params.price).times(params.qty) },
          totalPurchases: { increment: 1 },
        },
      })
    }

    return { variantId: variant?.id ?? null }
  })
}

// Приход товара
export async function stockIn(
  variantId: number,
  qty: number,
  comment: string,
  userId: string
): Promise<void> {
  await prisma.$transaction([
    prisma.productVariant.update({
      where: { id: variantId },
      data: { quantity: { increment: qty }, inStock: true },
    }),
    prisma.stockMovement.create({
      data: { variantId, type: 'in', quantity: qty, comment, createdBy: userId },
    }),
  ])
}

// Списание товара
export async function stockOut(
  variantId: number,
  qty: number,
  comment: string,
  userId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.findUnique({ where: { id: variantId } })
    if (!variant || variant.quantity < qty) throw new Error('Недостаточно товара')

    await tx.productVariant.update({
      where: { id: variantId },
      data: {
        quantity: { decrement: qty },
        inStock: variant.quantity - qty > 0,
      },
    })

    await tx.stockMovement.create({
      data: { variantId, type: 'out', quantity: qty, comment, createdBy: userId },
    })
  })
}

// ─── Атомарное завершение/отмена резерва ──────────────────────────────────────

/**
 * Атомарно обновляет статус резерва и декрементирует Product.reserved.
 * Защита от отрицательного reserved: декрементирует не больше текущего значения.
 */
export async function releaseReserve(
  reservationId: number,
  newStatus: 'cancelled' | 'completed',
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUniqueOrThrow({ where: { id: reservationId } })
    if (reservation.status !== 'active') return

    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: newStatus },
    })

    const product = await tx.product.findUniqueOrThrow({ where: { id: reservation.productId } })
    const decrementQty = Math.min(reservation.quantity, product.reserved)
    if (decrementQty > 0) {
      await tx.product.update({
        where: { id: reservation.productId },
        data: { reserved: { decrement: decrementQty } },
      })
    }
  })
}

// История движения по варианту
export async function getStockHistory(variantId: number) {
  return prisma.stockMovement.findMany({
    where: { variantId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}
