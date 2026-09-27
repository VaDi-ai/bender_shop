/**
 * Read-only, часть 2: композитные алиасы «air 13 m5», статусы батчей, аудит за сегодня.
 */
import { prisma } from '../lib/prisma'

async function main() {
  const aliases = await prisma.priceAlias.findMany({
    where: { alias: { contains: 'air 13' } },
    orderBy: { id: 'asc' },
  })
  console.log('=== PriceAlias contains "air 13" (' + aliases.length + ') ===')
  for (const a of aliases) console.log(JSON.stringify(a))

  const batches = await prisma.priceApplyBatch.findMany({
    where: { id: { in: [31, 39, 52, 53] } },
    select: { id: true, status: true, createdAt: true, appliedAt: true, stats: true, supplierId: true },
  })
  console.log('\n=== Батчи 31/39/52/53 ===')
  for (const b of batches) console.log(JSON.stringify(b))

  const today = new Date('2026-08-26T00:00:00+03:00')
  const audit = await prisma.auditLog.findMany({
    where: { createdAt: { gte: today } },
    orderBy: { id: 'asc' },
  }).catch(() => null)
  if (audit) {
    console.log('\n=== AuditLog за сегодня (' + audit.length + ') ===')
    for (const a of audit) {
      const s = JSON.stringify(a)
      console.log(s.length > 900 ? s.slice(0, 900) + '…' : s)
    }
  } else {
    console.log('\n(модель AuditLog не найдена — смотри схему)')
  }
}

main().finally(() => prisma.$disconnect())
