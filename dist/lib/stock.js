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
    const updated = await prisma_1.prisma.productVariant.updateMany({
        where: { id: variantId, quantity: { gte: qty } },
        data: { quantity: { decrement: qty }, inStock: true },
    });
    if (updated.count === 0)
        throw new Error('Недостаточно товара');
    // Mark out-of-stock atomically after decrement
    await prisma_1.prisma.productVariant.updateMany({
        where: { id: variantId, quantity: { lte: 0 } },
        data: { inStock: false },
    });
    await prisma_1.prisma.stockMovement.create({
        data: { variantId, type: 'out', quantity: qty, comment, createdBy: userId },
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