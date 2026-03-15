"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.atomicSale = atomicSale;
exports.stockIn = stockIn;
exports.stockOut = stockOut;
exports.getStockHistory = getStockHistory;
const prisma_1 = require("./prisma");
/**
 * Проводит продажу в одной транзакции:
 *   — проверяет наличие на складе (re-fetch внутри tx)
 *   — создаёт Order + OrderItem
 *   — уменьшает product.quantity / product.stock
 *   — уменьшает variant.quantity + записывает StockMovement
 * Бросает Error при недостатке товара.
 */
async function atomicSale(params) {
    return prisma_1.prisma.$transaction(async (tx) => {
        // Проверяем актуальный остаток
        const product = await tx.product.findUnique({ where: { id: params.productId } });
        if (!product)
            throw new Error('Товар не найден');
        const available = product.quantity - product.reserved;
        if (available < params.qty) {
            throw new Error(`Недостаточно товара (доступно: ${available})`);
        }
        // Выбираем вариант с достаточным количеством (re-fetch внутри tx)
        const variants = await tx.productVariant.findMany({
            where: { productId: params.productId },
            orderBy: { quantity: 'desc' },
        });
        const variant = variants.find((v) => v.quantity >= params.qty) ?? variants[0] ?? null;
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
                totalAmount: params.price * params.qty,
                payment: 'crm',
                status: 'completed',
            },
        });
        // Уменьшаем product.quantity + product.stock
        await tx.product.update({
            where: { id: params.productId },
            data: {
                quantity: { decrement: params.qty },
                stock: { decrement: params.qty },
            },
        });
        // Уменьшаем variant.quantity + StockMovement
        if (variant) {
            await tx.productVariant.update({
                where: { id: variant.id },
                data: {
                    quantity: { decrement: params.qty },
                    inStock: variant.quantity - params.qty > 0,
                },
            });
            await tx.stockMovement.create({
                data: {
                    variantId: variant.id,
                    type: 'out',
                    quantity: params.qty,
                    comment: params.comment,
                    createdBy: params.userId,
                },
            });
        }
        return { variantId: variant?.id ?? null };
    });
}
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