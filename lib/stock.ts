import { prisma } from './prisma'

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
  const updated = await prisma.productVariant.updateMany({
    where: { id: variantId, quantity: { gte: qty } },
    data: { quantity: { decrement: qty }, inStock: true },
  })
  if (updated.count === 0) throw new Error('Недостаточно товара')

  // Mark out-of-stock atomically after decrement
  await prisma.productVariant.updateMany({
    where: { id: variantId, quantity: { lte: 0 } },
    data: { inStock: false },
  })

  await prisma.stockMovement.create({
    data: { variantId, type: 'out', quantity: qty, comment, createdBy: userId },
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
