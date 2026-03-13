"use strict";
/**
 * lib/promotions.ts
 *
 * Бизнес-логика акций:
 *   applyPromotion  — применить скидку к вариантам, сохранить оригинальные цены
 *   cancelPromotion — откатить цены, деактивировать акцию
 *   findVariantsByFilter — выборка вариантов по фильтру акции
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.findVariantsByFilter = findVariantsByFilter;
exports.applyPromotion = applyPromotion;
exports.cancelPromotion = cancelPromotion;
exports.filterLabel = filterLabel;
const client_1 = require("@prisma/client/runtime/client");
const prisma_1 = require("./prisma");
const currency_1 = require("./currency");
const client_2 = require("../generated/prisma/client");
async function findVariantsByFilter(filterType, filterValue) {
    if (filterType === client_2.FilterType.category) {
        return prisma_1.prisma.productVariant.findMany({
            where: { product: { category: { name: filterValue } } },
            include: { product: true },
        });
    }
    if (filterType === client_2.FilterType.brand) {
        return prisma_1.prisma.productVariant.findMany({
            where: { product: { brand: filterValue } },
            include: { product: true },
        });
    }
    if (filterType === client_2.FilterType.attribute) {
        const [key, val] = filterValue.split(':').map((s) => s.trim());
        try {
            const results = await prisma_1.prisma.productVariant.findMany({
                where: { attributes: { path: [key], equals: val } },
                include: { product: true },
            });
            if (results.length > 1000) {
                console.warn(`[promotions] attribute filter "${filterValue}" matched ${results.length} variants, slicing to 1000`);
                return results.slice(0, 1000);
            }
            return results;
        }
        catch (err) {
            console.error('[promotions] attribute filter query failed:', err);
            return [];
        }
    }
    if (filterType === client_2.FilterType.products) {
        const ids = filterValue.split(',').map(Number).filter(Boolean);
        return prisma_1.prisma.productVariant.findMany({
            where: { productId: { in: ids } },
            include: { product: true },
        });
    }
    return [];
}
// ─── Применение акции ─────────────────────────────────────────────────────────
async function applyPromotion(promotionId) {
    // Read promotion and take updatedAt snapshot BEFORE the transaction
    const promo = await prisma_1.prisma.promotion.findUniqueOrThrow({ where: { id: promotionId } });
    const snapshotUpdatedAt = promo.updatedAt;
    const variants = await findVariantsByFilter(promo.filterType, promo.filterValue);
    if (variants.length === 0)
        return 0;
    await prisma_1.prisma.$transaction(async (tx) => {
        // Optimistic lock: verify nobody modified the promotion concurrently
        const current = await tx.promotion.findUniqueOrThrow({ where: { id: promotionId } });
        if (current.updatedAt.getTime() !== snapshotUpdatedAt.getTime()) {
            throw new Error('Акция была изменена параллельно — повторите операцию');
        }
        // Сохраняем оригинальные цены (skipDuplicates — защита от повторного вызова)
        await tx.promotionPrice.createMany({
            data: variants.map((v) => ({
                promotionId,
                variantId: v.id,
                originalPrice: v.price,
            })),
            skipDuplicates: true,
        });
        // Применяем скидку к каждому варианту
        for (const variant of variants) {
            const price = new client_1.Decimal(variant.price);
            const discountValue = new client_1.Decimal(promo.discountValue);
            let newPrice;
            if (promo.discountType === client_2.DiscountType.percent) {
                newPrice = price.mul(new client_1.Decimal(1).sub(discountValue.div(100))).toNumber();
            }
            else {
                newPrice = price.sub(discountValue).toNumber();
            }
            newPrice = Math.max(1, (0, currency_1.roundPrice)(newPrice));
            await tx.productVariant.update({
                where: { id: variant.id },
                data: { price: newPrice },
            });
        }
        await tx.promotion.update({
            where: { id: promotionId },
            data: { isActive: true },
        });
    });
    return variants.length;
}
// ─── Отмена акции ─────────────────────────────────────────────────────────────
async function cancelPromotion(promotionId) {
    const prices = await prisma_1.prisma.promotionPrice.findMany({ where: { promotionId } });
    await prisma_1.prisma.$transaction(async (tx) => {
        // Delete snapshot rows FIRST — ensures no partial state where prices are restored
        // but snapshots still reference the (now-gone) discount prices
        await tx.promotionPrice.deleteMany({ where: { promotionId } });
        // Restore original prices
        for (const p of prices) {
            await tx.productVariant.update({
                where: { id: p.variantId },
                data: { price: p.originalPrice },
            });
        }
        await tx.promotion.update({
            where: { id: promotionId },
            data: { isActive: false },
        });
    });
}
// ─── Строковое описание фильтра ───────────────────────────────────────────────
function filterLabel(filterType, filterValue) {
    if (filterType === client_2.FilterType.category)
        return `категория ${filterValue}`;
    if (filterType === client_2.FilterType.brand)
        return `бренд ${filterValue}`;
    if (filterType === client_2.FilterType.attribute)
        return `атрибут ${filterValue}`;
    if (filterType === client_2.FilterType.products) {
        const ids = filterValue.split(',').filter(Boolean);
        return `${ids.length} товар(ов)`;
    }
    return filterValue;
}
//# sourceMappingURL=promotions.js.map