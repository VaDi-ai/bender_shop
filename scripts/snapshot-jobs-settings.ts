/**
 * Снапшот рубильников фоновых задач перед переключением (read-only).
 * Пишет в stdout JSON: setting_jobs и старый supplier_notify — как они лежат в ApiKey.
 * Откат: PUT /admin/api/settings/jobs со значениями из снапшота (или все true).
 *
 *   node node_modules/ts-node/dist/bin.js --transpile-only scripts/snapshot-jobs-settings.ts > reports/…/snapshot.json
 */
import { getApiKeyValue } from '../lib/api-key-store'
import { prisma } from '../lib/prisma'

;(async () => {
  const out: Record<string, unknown> = { takenAt: new Date().toISOString(), source: 'ApiKey (read-only)' }
  for (const k of ['setting_jobs', 'supplier_notify']) {
    const row = await prisma.apiKey.findUnique({ where: { service: k }, select: { updatedAt: true } })
    out[k] = { exists: !!row, updatedAt: row?.updatedAt ?? null, value: row ? await getApiKeyValue(k) : null }
  }
  console.log(JSON.stringify(out, null, 2))
  await prisma.$disconnect()
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
