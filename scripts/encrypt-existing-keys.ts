/**
 * scripts/encrypt-existing-keys.ts
 *
 * One-time migration: encrypts all plaintext ApiKey.value records.
 * Detection strategy: tries to decrypt each value; if it throws
 * "Invalid encrypted value format" the value is plaintext — encrypt it.
 * If decrypt succeeds the value is already encrypted — skip it.
 *
 * Usage:
 *   ENCRYPTION_KEY=<64-char-hex> npx ts-node scripts/encrypt-existing-keys.ts
 */

import 'dotenv/config'
import { prisma } from '../lib/prisma'
import { encrypt, isEncrypted } from '../lib/crypto'

async function main(): Promise<void> {
  const records = await prisma.apiKey.findMany()
  console.log(`Found ${records.length} ApiKey record(s).`)

  let encrypted = 0
  let skipped = 0
  let errors = 0

  for (const record of records) {
    try {
      if (isEncrypted(record.value)) {
        console.log(`  SKIP  [${record.service}] — already encrypted`)
        skipped++
      } else {
        // Plaintext — encrypt and update
        const encValue = encrypt(record.value)
        console.log(`  ENC   [${record.service}] — format: ${encValue.slice(0, encValue.indexOf(':', 3) + 1)}...`)
        await prisma.apiKey.update({
          where: { id: record.id },
          data: { value: encValue },
        })
        encrypted++
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`  ERROR [${record.service}] — ${message}`)
      errors++
    }
  }

  console.log(
    `\nDone. Encrypted: ${encrypted}, Skipped (already encrypted): ${skipped}, Errors: ${errors}.`
  )

  if (errors > 0) process.exit(1)
}

main()
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    const { pool } = await import('../lib/prisma')
    await pool.end()
  })
