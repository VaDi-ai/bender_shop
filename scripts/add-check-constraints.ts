/**
 * scripts/add-check-constraints.ts
 *
 * Adds CHECK constraints to prevent negative stock values.
 * Run once manually: npx ts-node scripts/add-check-constraints.ts
 *
 * Prisma does not support CHECK constraints natively, so we add them via raw SQL.
 * Idempotent: uses IF NOT EXISTS (PostgreSQL 12+).
 */

import 'dotenv/config'
import { prisma } from '../lib/prisma'

async function main() {
  const constraints = [
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_product_quantity') THEN
         ALTER TABLE "Product" ADD CONSTRAINT chk_product_quantity CHECK (quantity >= 0);
       END IF;
     END $$;`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_product_reserved') THEN
         ALTER TABLE "Product" ADD CONSTRAINT chk_product_reserved CHECK (reserved >= 0);
       END IF;
     END $$;`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_product_stock') THEN
         ALTER TABLE "Product" ADD CONSTRAINT chk_product_stock CHECK (stock >= 0);
       END IF;
     END $$;`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_variant_quantity') THEN
         ALTER TABLE "ProductVariant" ADD CONSTRAINT chk_variant_quantity CHECK (quantity >= 0);
       END IF;
     END $$;`,
  ]

  for (const sql of constraints) {
    await prisma.$executeRawUnsafe(sql)
  }

  console.log('CHECK constraints added successfully')
}

main()
  .catch((err) => {
    console.error('Failed to add CHECK constraints:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
