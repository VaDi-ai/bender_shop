/**
 * scripts/restore-db.ts
 *
 * Restores data from a JSON backup.
 * Run: npx ts-node scripts/restore-db.ts backup-2026-03-18.json
 *
 * WARNING: Overwrites ALL data in the DB!
 * Use --dry-run for preview.
 */

import 'dotenv/config'
import * as fs from 'fs'
import { prisma } from '../lib/prisma'

const args = process.argv.slice(2)
const filename = args.find(a => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')

if (!filename) {
  console.error('Usage: npx ts-node scripts/restore-db.ts <backup-file.json> [--dry-run]')
  process.exit(1)
}

if (process.env.NODE_ENV === 'production' && !args.includes('--force')) {
  console.error('ERROR: restore in production requires --force flag')
  process.exit(1)
}

async function main() {
  const raw = fs.readFileSync(filename!, 'utf-8')
  const data = JSON.parse(raw)

  console.log(`Restore from: ${filename}`)
  console.log(`Exported at: ${data.exportedAt}`)
  console.log(`Products: ${data.products?.length ?? 0}`)
  console.log(`Clients: ${data.clients?.length ?? 0}`)
  console.log(`Orders: ${data.orders?.length ?? 0}`)

  if (dryRun) {
    console.log('\n--dry-run: No changes made.')
    return
  }

  console.log('\nStarting restore in 5 seconds... Press Ctrl+C to cancel.')
  await new Promise(r => setTimeout(r, 5000))

  // Delete in reverse-dependency order
  console.log('Clearing existing data...')
  await prisma.$transaction([
    prisma.supplierPrice.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.priceChange.deleteMany(),
    prisma.promotionPrice.deleteMany(),
    prisma.promotion.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.reservation.deleteMany(),
    prisma.task.deleteMany(),
    prisma.message.deleteMany(),
    prisma.tag.deleteMany(),
    prisma.client.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.segment.deleteMany(),
    prisma.heroBanner.deleteMany(),
    prisma.broadcastLog.deleteMany(),
    prisma.securityLog.deleteMany(),
    prisma.template.deleteMany(),
    prisma.currencyRate.deleteMany(),
    prisma.apiKey.deleteMany(),
  ])

  // Create in dependency order
  console.log('Restoring data...')

  if (data.segments?.length) {
    for (const s of data.segments) {
      await prisma.segment.create({ data: { id: s.id, name: s.name, isDefault: s.isDefault, color: s.color } })
    }
    console.log(`  Segments: ${data.segments.length}`)
  }

  if (data.categories?.length) {
    for (const c of data.categories) {
      await prisma.category.create({ data: { id: c.id, name: c.name, textSide: c.textSide, imageFile: c.imageFile } })
    }
    console.log(`  Categories: ${data.categories.length}`)
  }

  if (data.products?.length) {
    for (const p of data.products) {
      const { variants, ...productData } = p
      await prisma.product.create({ data: { ...productData, createdAt: new Date(productData.createdAt), updatedAt: new Date(productData.updatedAt) } })
      if (variants?.length) {
        for (const v of variants) {
          await prisma.productVariant.create({ data: { ...v, createdAt: new Date(v.createdAt) } })
        }
      }
    }
    console.log(`  Products: ${data.products.length}`)
  }

  if (data.clients?.length) {
    for (const c of data.clients) {
      await prisma.client.create({ data: { ...c, createdAt: new Date(c.createdAt), updatedAt: new Date(c.updatedAt), lastPurchaseDate: c.lastPurchaseDate ? new Date(c.lastPurchaseDate) : null } })
    }
    console.log(`  Clients: ${data.clients.length}`)
  }

  if (data.suppliers?.length) {
    for (const s of data.suppliers) {
      await prisma.supplier.create({ data: { ...s, createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt), lastPriceAt: s.lastPriceAt ? new Date(s.lastPriceAt) : null } })
    }
    console.log(`  Suppliers: ${data.suppliers.length}`)
  }

  if (data.apiKeys?.length) {
    for (const k of data.apiKeys) {
      await prisma.apiKey.create({ data: { ...k, createdAt: new Date(k.createdAt), updatedAt: new Date(k.updatedAt) } })
    }
    console.log(`  API Keys: ${data.apiKeys.length}`)
  }

  console.log('\nRestore complete.')
}

main()
  .catch((err) => { console.error('Restore failed:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
