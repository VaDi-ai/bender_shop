/**
 * Read-only аудит привязок MacBook Air M5 (MDHE4/MDHA4/MDHH4):
 * PriceAlias + варианты + строки прайса. Ничего не пишет.
 *   npx ts-node scripts/audit-m5-aliases.ts
 */
import { prisma } from '../lib/prisma'

async function main() {
  const terms = ['mdhe4', 'mdha4', 'mdhh4', 'macbook air m5']
  const aliases = await prisma.priceAlias.findMany({
    where: { OR: terms.map(t => ({ alias: { contains: t } })) },
    orderBy: { updatedAt: 'desc' },
  })
  console.log('=== PriceAlias по терминам (' + aliases.length + ') ===')
  for (const a of aliases) console.log(JSON.stringify(a))

  const variantIds = [...new Set(aliases.map(a => a.variantId).filter((x): x is number => x !== null))]
  if (variantIds.length) {
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: { select: { id: true, name: true, isAvailable: true, attributes: true, price: true } } },
    })
    console.log('\n=== Варианты из алиасов ===')
    for (const v of variants) {
      console.log(JSON.stringify({
        variantId: v.id, sku: v.sku, price: Number(v.price), inStock: v.inStock, quantity: v.quantity,
        attrs: v.attributes,
        product: { id: v.product.id, name: v.product.name, isAvailable: v.product.isAvailable, price: Number(v.product.price), attrs: v.product.attributes },
      }))
    }
  }

  const today = new Date('2026-08-26T00:00:00+03:00')
  const fresh = await prisma.priceAlias.findMany({
    where: { OR: [{ createdAt: { gte: today } }, { updatedAt: { gte: today } }] },
    orderBy: { updatedAt: 'desc' },
  })
  console.log('\n=== PriceAlias за сегодня (' + fresh.length + ') ===')
  for (const a of fresh) console.log(JSON.stringify(a))

  const sp = await prisma.supplierPrice.findMany({
    where: { OR: ['MDHE4', 'MDHA4', 'MDHH4'].map(t => ({ rawMessage: { contains: t, mode: 'insensitive' as const } })) },
    orderBy: { id: 'desc' },
    take: 30,
    select: { id: true, batchId: true, rawMessage: true, model: true, storage: true, color: true, country: true, variantId: true, price: true, parsedAt: true },
  })
  console.log('\n=== SupplierPrice с партномерами (' + sp.length + ') ===')
  for (const r of sp) console.log(JSON.stringify({ ...r, price: Number(r.price) }))

  // Товары MacBook Air M5 на витрине — как сейчас выглядят цвета
  const prods = await prisma.product.findMany({
    where: { name: { contains: 'MacBook Air M5', mode: 'insensitive' } },
    include: { variants: true },
  })
  console.log('\n=== Товары MacBook Air M5 (' + prods.length + ') ===')
  for (const p of prods) {
    console.log(JSON.stringify({ id: p.id, name: p.name, isAvailable: p.isAvailable, price: Number(p.price), attrs: p.attributes }))
    for (const v of p.variants) {
      console.log('  variant ' + JSON.stringify({ id: v.id, sku: v.sku, price: Number(v.price), inStock: v.inStock, quantity: v.quantity, attrs: v.attributes }))
    }
  }
}

main().finally(() => prisma.$disconnect())
