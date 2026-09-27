/**
 * Read-only проверка на проде: JSON-фильтр array_contains находит audit-записи
 * привязок по ключу алиаса (нужно для rollbackAliasEffect / 409-гейта).
 */
import { prisma } from '../lib/prisma'

async function main() {
  const alias = 'macbook air 13 m5 512gb midnight'
  const entries = await prisma.auditLog.findMany({
    where: {
      action: { in: ['price_alias_link', 'price_alias_ignore', 'price_alias_rebind', 'price_alias_update'] },
      after: { path: ['aliases'], array_contains: [alias] },
    },
    orderBy: { id: 'desc' },
    select: { id: true, action: true, createdAt: true, after: true },
  })
  console.log('Найдено записей по ключу «' + alias + '»: ' + entries.length)
  for (const e of entries) {
    const a = e.after as Record<string, unknown>
    console.log(`  #${e.id} ${e.action} ${e.createdAt.toISOString()} variantId=${a.variantId} rematched=${JSON.stringify(a.rematchedRowIds ?? a.rematched)}`)
  }
}

main().finally(() => prisma.$disconnect())
