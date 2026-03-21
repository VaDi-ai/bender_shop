import { prisma } from './lib/prisma'
import { syncProductsFromSheets } from './lib/sheets-sync'

async function main() {
  console.log('=== Deleting all products ===')
  await prisma.stockMovement.deleteMany()
  await prisma.promotionPrice.deleteMany()
  await prisma.promotion.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.reservation.deleteMany()
  await prisma.priceChange.deleteMany()
  await prisma.productVariant.deleteMany()
  await prisma.product.deleteMany()
  console.log('Done.')

  console.log('\n=== Syncing from Google Sheets ===')
  const result = await syncProductsFromSheets()
  console.log(`Created: ${result.created}, Updated: ${result.updated}, Disabled: ${result.disabled}, Total rows: ${result.total}, Errors: ${result.errors.length}`)
  if (result.errors.length > 0) result.errors.slice(0, 5).forEach(e => console.log(`  ERR: ${e}`))

  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
