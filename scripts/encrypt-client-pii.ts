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

async function main(): Promise<void> {
  const clients = await prisma.client.findMany({
    select: { id: true, phone: true, email: true, birthDate: true },
  })
  console.log(`Found ${clients.length} client(s).`)

  let encrypted = 0
  let skipped = 0

  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE)
    const updates: Promise<unknown>[] = []

    for (const client of batch) {
      const data: Record<string, string | null> = {}
      let needsUpdate = false

      if (client.phone && !isEncrypted(client.phone)) {
        data.phone = encryptClientField(client.phone)
        needsUpdate = true
      }
      if (client.email && !isEncrypted(client.email)) {
        data.email = encryptClientField(client.email)
        needsUpdate = true
      }
      // birthDate is now String? — encrypt if present and not already encrypted
      if (client.birthDate && !isEncrypted(client.birthDate)) {
        // birthDate may be an ISO string or Date-like string from the old DateTime column
        data.birthDate = encryptClientField(client.birthDate)
        needsUpdate = true
      }

      if (needsUpdate) {
        updates.push(prisma.client.update({ where: { id: client.id }, data }))
        encrypted++
      } else {
        skipped++
      }
    }

    await Promise.all(updates)
    console.log(`Encrypted ${Math.min(i + BATCH_SIZE, clients.length)}/${clients.length} clients...`)
  }

  console.log(`\nDone. Encrypted ${encrypted} clients, skipped ${skipped} (already encrypted).`)
}

main()
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
