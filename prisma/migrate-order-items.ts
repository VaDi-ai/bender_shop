/**
 * Migration: populate OrderItem table from Order.itemsJson
 *
 * Run with: npx ts-node prisma/migrate-order-items.ts
 *
 * Handles two JSON shapes stored in itemsJson:
 *   Shape A: { productId, name, price, qty }      — legacy (productId lookup needed)
 *   Shape B: { variantId, name, price, quantity }  — newer format
 */

import { prisma } from '../lib/prisma'

async function main() {
  const orders = await prisma.order.findMany({
    where: { itemsJson: { not: null } },
    select: { id: true, itemsJson: true },
    orderBy: { id: 'asc' },
  })

  console.log(`Found ${orders.length} orders with itemsJson to migrate`)

  let totalMigrated = 0
  let totalSkipped = 0

  for (const order of orders) {
    // Skip if OrderItems already exist for this order
    const existingCount = await prisma.orderItem.count({ where: { orderId: order.id } })
    if (existingCount > 0) {
      console.log(`Order ${order.id}: already has ${existingCount} items, skipping`)
      totalSkipped++
      continue
    }

    const rawItems = order.itemsJson as any[]
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      console.log(`Order ${order.id}: empty or invalid itemsJson, skipping`)
      totalSkipped++
      continue
    }

    const itemsToCreate: Array<{
      orderId: number
      variantId: number
      quantity: number
      priceAtPurchase: string
      productName: string
    }> = []

    for (const raw of rawItems) {
      // Normalize quantity
      const quantity: number = raw.quantity ?? raw.qty ?? 1
      const priceAtPurchase: string = String(raw.price ?? '0')
      const productName: string = raw.name ?? 'Товар'

      let variantId: number | null = null

      if (raw.variantId) {
        // Shape B: variantId directly available
        variantId = Number(raw.variantId)
      } else if (raw.productId) {
        // Shape A: find default variant for product
        const variant = await prisma.productVariant.findFirst({
          where: { productId: Number(raw.productId) },
          orderBy: { id: 'asc' },
        })
        if (variant) {
          variantId = variant.id
        } else {
          console.warn(`  Order ${order.id}: no variant found for productId=${raw.productId}, skipping item "${productName}"`)
          continue
        }
      } else {
        console.warn(`  Order ${order.id}: item has neither variantId nor productId, skipping item "${productName}"`)
        continue
      }

      itemsToCreate.push({ orderId: order.id, variantId, quantity, priceAtPurchase, productName })
    }

    if (itemsToCreate.length === 0) {
      console.log(`Order ${order.id}: no valid items to create, skipping`)
      totalSkipped++
      continue
    }

    await prisma.orderItem.createMany({ data: itemsToCreate })
    console.log(`Migrated order ${order.id}: ${itemsToCreate.length} items`)
    totalMigrated++
  }

  console.log(`\nDone. Migrated: ${totalMigrated}, Skipped: ${totalSkipped}`)
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
