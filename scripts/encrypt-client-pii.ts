/**
 * scripts/encrypt-client-pii.ts
 *
 * One-time migration: encrypts Client PII fields (phone, email, birthDate)
 * with AES-256-GCM via lib/client-crypto.ts.
 *
 * Usage:
 *   ENCRYPTION_KEY=<64-char-hex> npx ts-node scripts/encrypt-client-pii.ts
 *
 * Idempotent: already-encrypted fields are detected and skipped.
 */

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { isEncrypted } from '../lib/crypto'
import { encryptClientField } from '../lib/client-crypto'

const prisma = new PrismaClient()
const BATCH_SIZE = 100
const DRY_RUN = process.argv.includes('--dry-run')

async function main(): Promise<void> {
  if (DRY_RUN) console.log('*** DRY RUN — no changes will be written ***\n')

  const clients = await prisma.client.findMany({
    select: { id: true, phone: true, email: true, birthDate: true },
  })
  console.log(`Found ${clients.length} client(s).`)

  let encrypted = 0
  let skipped = 0

  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE)

    for (const client of batch) {
      const data: Record<string, string | null> = {}
      let needsUpdate = false

      if (client.phone && !isEncrypted(client.phone)) {
        data.phone = encryptClientField(client.phone, 'phone')
        needsUpdate = true
      }
      if (client.email && !isEncrypted(client.email)) {
        data.email = encryptClientField(client.email, 'email')
        needsUpdate = true
      }
      if (client.birthDate && !isEncrypted(client.birthDate)) {
        data.birthDate = encryptClientField(client.birthDate, 'birthDate')
        needsUpdate = true
      }

      if (needsUpdate) {
        if (!DRY_RUN) {
          await prisma.$transaction(async (tx) => {
            await tx.client.update({ where: { id: client.id }, data })
          })
        }
        encrypted++
      } else {
        skipped++
      }
    }

    console.log(`${DRY_RUN ? '[dry-run] ' : ''}Processed ${Math.min(i + BATCH_SIZE, clients.length)}/${clients.length} clients...`)
  }

  console.log(`\nDone. ${DRY_RUN ? '[DRY RUN] Would encrypt' : 'Encrypted'} ${encrypted} clients, skipped ${skipped} (already encrypted).`)
}

main()
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
