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

// История движения по варианту
export async function getStockHistory(variantId: number) {
  return prisma.stockMovement.findMany({
    where: { variantId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}
