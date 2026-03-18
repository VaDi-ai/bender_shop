/**
 * scripts/backup-db.ts
 *
 * Creates a JSON dump of key DB tables for backup.
 * Run: npx ts-node scripts/backup-db.ts
 * Result: backup-YYYY-MM-DD-HHmmss.json
 *
 * For full PostgreSQL backup use pg_dump via Railway CLI:
 *   railway run pg_dump -Fc > backup.dump
 */

import 'dotenv/config'
import * as fs from 'fs'
import { prisma } from '../lib/prisma'

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `backup-${timestamp}.json`

  console.log(`Creating backup: ${filename}`)

  const data = {
    exportedAt: new Date().toISOString(),
    version: '1.0',

    products: await prisma.product.findMany({ include: { variants: true } }),
    categories: await prisma.category.findMany(),
    clients: await prisma.client.findMany(),
    orders: await prisma.order.findMany({ include: { items: true } }),
    reservations: await prisma.reservation.findMany(),
    promotions: await prisma.promotion.findMany({ include: { prices: true } }),
    suppliers: await prisma.supplier.findMany(),
    supplierPrices: await prisma.supplierPrice.findMany(),
    segments: await prisma.segment.findMany(),
    templates: await prisma.template.findMany(),
    heroBanners: await prisma.heroBanner.findMany(),
    apiKeys: await prisma.apiKey.findMany(),
    currencyRates: await prisma.currencyRate.findMany(),
    broadcastLogs: await prisma.broadcastLog.findMany(),
    securityLogs: await prisma.securityLog.findMany({ take: 1000, orderBy: { createdAt: 'desc' } }),
    tasks: await prisma.task.findMany(),
    stockMovements: await prisma.stockMovement.findMany({ take: 5000, orderBy: { createdAt: 'desc' } }),
    priceChanges: await prisma.priceChange.findMany({ take: 5000, orderBy: { createdAt: 'desc' } }),
  }

  const json = JSON.stringify(data, null, 2)
  fs.writeFileSync(filename, json)

  const sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2)
  console.log(`Backup saved: ${filename} (${sizeMB} MB)`)
  console.log(`  Products: ${data.products.length}`)
  console.log(`  Clients: ${data.clients.length}`)
  console.log(`  Orders: ${data.orders.length}`)
  console.log(`  Suppliers: ${data.suppliers.length}`)
  console.log(`  Supplier prices: ${data.supplierPrices.length}`)
}

main()
  .catch((err) => { console.error('Backup failed:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
