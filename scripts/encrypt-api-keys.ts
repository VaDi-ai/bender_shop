/**
 * scripts/encrypt-api-keys.ts
 *
 * One-time migration: encrypts all plaintext ApiKey.value records with AES-256-GCM.
 *
 * Run ONCE after setting ENCRYPTION_KEY in the environment, before deploying the
 * new application code that expects encrypted values.
 *
 * Usage:
 *   ENCRYPTION_KEY=<64-char-hex> npx ts-node scripts/encrypt-api-keys.ts
 *
 * The script is idempotent: already-encrypted records are detected and skipped.
 */

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { encrypt, isEncrypted } from '../lib/crypto'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  const records = await prisma.apiKey.findMany()
  console.log(`Found ${records.length} ApiKey record(s).`)

  let encrypted = 0
  let skipped = 0

  for (const record of records) {
    if (isEncrypted(record.value)) {
      console.log(`  SKIP  [${record.service}] — already encrypted`)
      skipped++
      continue
    }

    const encValue = encrypt(record.value)
    await prisma.apiKey.update({
      where: { id: record.id },
      data: { value: encValue },
    })
    console.log(`  ENC   [${record.service}]`)
    encrypted++
  }

  console.log(`\nDone. Encrypted: ${encrypted}, Skipped (already encrypted): ${skipped}.`)
}

main()
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
