/**
 * scripts/clear-test-products.ts
 *
 * Удаляет все товары и варианты из БД, сохраняя категории и клиентов.
 * Запуск: npx ts-node scripts/clear-test-products.ts
 * С флагом --dry-run только покажет что будет удалено.
 */

import { prisma } from '../lib/prisma'

const dryRun = process.argv.includes('--dry-run')

async function main() {
  const products = await prisma.product.findMany({
    include: { variants: true },
  })

  console.log(`Найдено товаров: ${products.length}`)
  console.log(`Вариантов: ${products.reduce((s, p) => s + p.variants.length, 0)}`)

  if (dryRun) {
    console.log('\n--dry-run: ничего не удалено.')
    for (const p of products.slice(0, 10)) {
      console.log(`  ${p.name} (${p.variants.length} вариантов)`)
    }
    if (products.length > 10) console.log(`  ...и ещё ${products.length - 10}`)
    return
  }

  console.log('\n⚠️ Удаление через 5 секунд... Ctrl+C для отмены.')
  await new Promise(r => setTimeout(r, 5000))

  await prisma.$transaction([
    prisma.stockMovement.deleteMany(),
    prisma.promotionPrice.deleteMany(),
    prisma.promotion.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.supplierPrice.deleteMany(),
    prisma.priceChange.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.product.deleteMany(),
  ])

  console.log('✅ Все товары, варианты, заказы и связанные данные удалены.')
  console.log('📂 Категории сохранены.')
}

main()
  .catch((err) => { console.error('Error:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
