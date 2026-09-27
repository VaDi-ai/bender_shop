/** Read-only: состояние для QA Фазы C — батчи, алиасы M5, QA-менеджер, unmatched. */
import { prisma } from '../lib/prisma'

async function main() {
  const batches = await prisma.priceApplyBatch.findMany({
    orderBy: { id: 'desc' }, take: 5,
    select: { id: true, status: true, createdAt: true },
  })
  console.log('=== Последние батчи ===')
  for (const b of batches) console.log(JSON.stringify(b))

  const aliases = await prisma.priceAlias.findMany({ where: { id: { in: [22, 23, 24, 25] } } })
  console.log('\n=== Алиасы 22-25 ===')
  for (const a of aliases) console.log(JSON.stringify({ id: a.id, alias: a.alias, variantId: a.variantId }))

  const rows = await prisma.supplierPrice.findMany({
    where: { id: { in: [740, 741, 742] } },
    select: { id: true, variantId: true, batchId: true },
  })
  console.log('\n=== Строки 740-742 ===')
  for (const r of rows) console.log(JSON.stringify(r))

  const team = await prisma.adminUser.findMany({ select: { id: true, telegramId: true, name: true, role: true, isActive: true } })
  console.log('\n=== AdminUser ===')
  for (const t of team) console.log(JSON.stringify({ ...t, telegramId: '…' + t.telegramId.slice(-3) }))
}

main().finally(() => prisma.$disconnect())
