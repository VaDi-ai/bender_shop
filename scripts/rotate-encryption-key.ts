/**
 * scripts/rotate-encryption-key.ts
 *
 * Re-encrypts all ApiKey and Client PII fields with the latest encryption key.
 * Run after adding ENCRYPTION_KEY_V2 (or higher) to rotate from the old key.
 *
 * Usage:
 *   npx ts-node scripts/rotate-encryption-key.ts
 *   npx ts-node scripts/rotate-encryption-key.ts --dry-run
 *
 * Idempotent: skips values already encrypted with the latest key version.
 */

import 'dotenv/config'
import { prisma } from '../lib/prisma'
import { decrypt, encrypt, isEncrypted, getEncryptedKeyVersion } from '../lib/crypto'

const BATCH_SIZE = 100
const DRY_RUN = process.argv.includes('--dry-run')

function getLatestVersion(): number {
  for (let v = 10; v >= 1; v--) {
    if (process.env[`ENCRYPTION_KEY_V${v}`]) return v
  }
  return 1
}

async function main() {
  const targetVersion = getLatestVersion()
  console.log(`Target key version: V${targetVersion}`)
  if (DRY_RUN) console.log('*** DRY RUN — no changes will be written ***\n')

  // ── Re-encrypt ApiKey records ─────────────────────────────────────────────
  const apiKeys = await prisma.apiKey.findMany()
  let apiKeysRotated = 0
  let apiKeysSkipped = 0

  for (const record of apiKeys) {
    const currentVersion = getEncryptedKeyVersion(record.value)
    if (currentVersion === targetVersion) {
      apiKeysSkipped++
      continue
    }

    try {
      // Try decrypting with AAD first, then without
      let plaintext: string
      try {
        plaintext = decrypt(record.value, record.service)
      } catch {
        plaintext = decrypt(record.value)
      }

      const reEncrypted = encrypt(plaintext, record.service)
      if (!DRY_RUN) {
        await prisma.apiKey.update({
          where: { service: record.service },
          data: { value: reEncrypted, keyVersion: targetVersion },
        })
      }
      apiKeysRotated++
    } catch (err) {
      console.error(`Failed to rotate ApiKey "${record.service}":`, err)
    }
  }

  console.log(`ApiKeys: rotated ${apiKeysRotated}, skipped ${apiKeysSkipped}`)

  // ── Re-encrypt Client PII ─────────────────────────────────────────────────
  const clients = await prisma.client.findMany({
    select: { id: true, phone: true, email: true, birthDate: true },
  })

  let clientsRotated = 0
  let clientsSkipped = 0

  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE)

    for (const client of batch) {
      const data: Record<string, string | null> = {}
      let needsUpdate = false

      for (const field of ['phone', 'email', 'birthDate'] as const) {
        const value = client[field]
        if (!value || !isEncrypted(value)) continue
        const currentVersion = getEncryptedKeyVersion(value)
        if (currentVersion === targetVersion) continue

        try {
          let plaintext: string
          try {
            plaintext = decrypt(value, field)
          } catch {
            plaintext = decrypt(value)
          }
          data[field] = encrypt(plaintext, field)
          needsUpdate = true
        } catch (err) {
          console.error(`Failed to rotate Client #${client.id} ${field}:`, err)
        }
      }

      if (needsUpdate) {
        if (!DRY_RUN) {
          await prisma.$transaction(async (tx) => {
            await tx.client.update({ where: { id: client.id }, data })
          })
        }
        clientsRotated++
      } else {
        clientsSkipped++
      }
    }

    console.log(`${DRY_RUN ? '[dry-run] ' : ''}Processed ${Math.min(i + BATCH_SIZE, clients.length)}/${clients.length} clients...`)
  }

  console.log(`\nClients: rotated ${clientsRotated}, skipped ${clientsSkipped}`)
  console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Key rotation complete.`)
}

main()
  .catch((err) => {
    console.error('Key rotation failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
