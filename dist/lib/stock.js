"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stockIn = stockIn;
exports.stockOut = stockOut;
exports.getStockHistory = getStockHistory;
const prisma_1 = require("./prisma");
// Приход товара
async function stockIn(variantId, qty, comment, userId) {
    await prisma_1.prisma.$transaction([
        prisma_1.prisma.productVariant.update({
            where: { id: variantId },
            data: { quantity: { increment: qty }, inStock: true },
        }),
        prisma_1.prisma.stockMovement.create({
            data: { variantId, type: 'in', quantity: qty, comment, createdBy: userId },
        }),
    ]);
}
// Списание товара
async function stockOut(variantId, qty, comment, userId) {
    await prisma_1.prisma.$transaction(async (tx) => {
        const variant = await tx.productVariant.findUnique({ where: { id: variantId } });
        if (!variant || variant.quantity < qty)
            throw new Error('Недостаточно товара');
        await tx.productVariant.update({
            where: { id: variantId },
            data: {
                quantity: { decrement: qty },
                inStock: variant.quantity - qty > 0,
            },
        });
        await tx.stockMovement.create({
            data: { variantId, type: 'out', quantity: qty, comment, createdBy: userId },
        });
    });
}
// История движения по варианту
async function getStockHistory(variantId) {
    return prisma_1.prisma.stockMovement.findMany({
        where: { variantId },
        orderBy: { createdAt: 'desc' },
        take: 50,
    });
}
//# sourceMappingURL=stock.js.map