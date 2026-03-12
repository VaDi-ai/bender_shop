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
async function findVariantsByFilter(filterType, filterValue) {
    if (filterType === 'category') {
        return prisma_1.prisma.productVariant.findMany({
            where: { product: { category: { name: filterValue } } },
            include: { product: true },
        });
    }
    if (filterType === 'brand') {
        return prisma_1.prisma.productVariant.findMany({
            where: { product: { brand: filterValue } },
            include: { product: true },
        });
    }
    if (filterType === 'attribute') {
        const [key, val] = filterValue.split(':').map((s) => s.trim());
        const all = await prisma_1.prisma.productVariant.findMany({ include: { product: true } });
        return all.filter((v) => {
            const attrs = v.attributes;
            return attrs[key] === val;
        });
    }
    if (filterType === 'products') {
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
    const promo = await prisma_1.prisma.promotion.findUniqueOrThrow({ where: { id: promotionId } });
    const variants = await findVariantsByFilter(promo.filterType, promo.filterValue);
    if (variants.length === 0)
        return 0;
    // Сохраняем оригинальные цены (пропускаем дубли — на случай повторного вызова)
    await prisma_1.prisma.promotionPrice.createMany({
        data: variants.map((v) => ({
            promotionId,
            variantId: v.id,
            originalPrice: v.price,
        })),
        skipDuplicates: true,
    });
    // Применяем скидку
    for (const variant of variants) {
        const price = new client_1.Decimal(variant.price);
        const discountValue = new client_1.Decimal(promo.discountValue);
        let newPrice;
        if (promo.discountType === 'percent') {
            newPrice = price.mul(new client_1.Decimal(1).sub(discountValue.div(100))).toNumber();
        }
        else {
            newPrice = price.sub(discountValue).toNumber();
        }
        newPrice = Math.max(1, (0, currency_1.roundPrice)(newPrice));
        await prisma_1.prisma.productVariant.update({
            where: { id: variant.id },
            data: { price: newPrice },
        });
    }
    await prisma_1.prisma.promotion.update({
        where: { id: promotionId },
        data: { isActive: true },
    });
    return variants.length;
}
// ─── Отмена акции ─────────────────────────────────────────────────────────────
async function cancelPromotion(promotionId) {
    const prices = await prisma_1.prisma.promotionPrice.findMany({ where: { promotionId } });
    for (const p of prices) {
        await prisma_1.prisma.productVariant.update({
            where: { id: p.variantId },
            data: { price: p.originalPrice },
        });
    }
    await prisma_1.prisma.promotion.update({
        where: { id: promotionId },
        data: { isActive: false },
    });
    await prisma_1.prisma.promotionPrice.deleteMany({ where: { promotionId } });
}
// ─── Строковое описание фильтра ───────────────────────────────────────────────
function filterLabel(filterType, filterValue) {
    if (filterType === 'category')
        return `категория ${filterValue}`;
    if (filterType === 'brand')
        return `бренд ${filterValue}`;
    if (filterType === 'attribute')
        return `атрибут ${filterValue}`;
    if (filterType === 'products') {
        const ids = filterValue.split(',').filter(Boolean);
        return `${ids.length} товар(ов)`;
    }
    return filterValue;
}
//# sourceMappingURL=promotions.js.map