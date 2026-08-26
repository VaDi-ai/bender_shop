/**
 * Бэкфилл archivedAt — ровно тем вариантам, что схлопнула Phase 1.
 *
 * Источник — AuditLog (action='dupe_collapse'), а НЕ остаток: живой честно
 * распроданный вариант тоже имеет quantity=0, и по остатку его от дубля не
 * отличить. Берём:
 *   • entity='ProductVariant' → сам скрытый вариант-дубль;
 *   • entity='Product'        → все варианты скрытого товара-призрака.
 *
 * Плюс точечная поправка: пара #82/#1762 схлопнулась не туда (скоринг оставил
 * chip-less #82, потому что на него ходил прайс), питание переведено вручную
 * на #1762 — архивируем #82, а #1762 обязан остаться живым.
 *
 *   npx ts-node scripts/backfill-archived-at.ts           — dry-run
 *   npx ts-node scripts/backfill-archived-at.ts --apply   — выполнить
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'
import { logAdminAction } from '../lib/audit'

const APPLY = process.argv.includes('--apply')
/** Обратимость: снимает archivedAt со всех, кого проставил бэкфилл. */
const RESTORE = process.argv.includes('--restore')
const ACTOR = 'claude-archive-backfill'

/** Пара, исправленная вручную: архивируем chip-less, живым остаётся с чипом. */
const MANUAL_FIX = { archive: 82, keepAlive: 1762 }

/** Откат: снять archivedAt со всех вариантов из снапшота бэкфилла. */
async function restore(): Promise<void> {
  const snapFile = path.resolve(__dirname, '../reports/archive-backfill-snapshot-2026-08-26.json')
  const snap = JSON.parse(fs.readFileSync(snapFile, 'utf8')) as { variants: Array<{ id: number }> }
  const ids = snap.variants.map(v => v.id)
  const archived = await prisma.productVariant.count({ where: { id: { in: ids }, archivedAt: { not: null } } })
  console.log(`В снапшоте вариантов: ${ids.length} · сейчас архивных из них: ${archived}`)
  if (!APPLY) { console.log('DRY-RUN восстановления: запусти с --restore --apply'); return }
  const r = await prisma.productVariant.updateMany({ where: { id: { in: ids } }, data: { archivedAt: null } })
  await logAdminAction({
    adminTelegramId: ACTOR, action: 'variant_unarchived', entity: 'ProductVariant', entityId: 'backfill-restore',
    before: { archivedCount: archived }, after: { restored: r.count },
  })
  console.log(`Снят archivedAt с ${r.count} вариантов — они снова видны в пикере.`)
}

async function main() {
  if (RESTORE) return restore()
  const entries = await prisma.auditLog.findMany({
    where: { action: 'dupe_collapse' },
    orderBy: { id: 'asc' },
    select: { id: true, entity: true, entityId: true, after: true },
  })
  console.log(`Записей dupe_collapse в аудите: ${entries.length}`)

  const variantIds = new Set<number>()
  const ghostProductIds = new Set<number>()
  for (const e of entries) {
    const id = parseInt(String(e.entityId ?? ''), 10)
    if (!Number.isInteger(id)) continue
    if (e.entity === 'ProductVariant') variantIds.add(id)
    if (e.entity === 'Product') ghostProductIds.add(id)
  }

  // Варианты товаров-призраков
  const ghostVariants = ghostProductIds.size
    ? await prisma.productVariant.findMany({ where: { productId: { in: [...ghostProductIds] } }, select: { id: true } })
    : []
  for (const v of ghostVariants) variantIds.add(v.id)

  // Ручная поправка
  variantIds.add(MANUAL_FIX.archive)
  variantIds.delete(MANUAL_FIX.keepAlive)

  const targets = await prisma.productVariant.findMany({
    where: { id: { in: [...variantIds] } },
    select: { id: true, sku: true, quantity: true, inStock: true, archivedAt: true, productId: true, product: { select: { name: true, isAvailable: true } } },
    orderBy: { id: 'asc' },
  })

  // Страховка: живой вариант (остаток > 0 у активного товара) не архивируем
  const safe = targets.filter(v => !(v.quantity > 0 && v.inStock && v.product.isAvailable))
  const refused = targets.filter(v => v.quantity > 0 && v.inStock && v.product.isAvailable)
  const already = safe.filter(v => v.archivedAt !== null)
  const todo = safe.filter(v => v.archivedAt === null)

  console.log(`\nКандидатов из аудита: ${targets.length}`)
  console.log(`  из них товаров-призраков: ${ghostProductIds.size} (их вариантов ${ghostVariants.length})`)
  console.log(`  уже архивных: ${already.length}`)
  console.log(`  к архивации: ${todo.length}`)
  console.log(`  ОТКАЗ (живой с остатком — не трогаем): ${refused.length}`)
  for (const r of refused) console.log(`      #${r.id} ${r.sku} «${r.product.name}» остаток ${r.quantity}`)
  console.log(`\n  #${MANUAL_FIX.keepAlive} намеренно НЕ архивируется (полноценный вариант с чипом)`)

  const snap = {
    takenAt: new Date().toISOString(),
    reason: 'before backfill-archived-at',
    variants: todo.map(v => ({ id: v.id, sku: v.sku, archivedAt: v.archivedAt, quantity: v.quantity, inStock: v.inStock })),
  }
  const snapFile = path.resolve(__dirname, '../reports/archive-backfill-snapshot-2026-08-26.json')
  fs.writeFileSync(snapFile, JSON.stringify(snap, null, 2))
  console.log(`\nСнапшот: ${snapFile}`)

  if (!APPLY) { console.log('\nDRY-RUN: ничего не изменено.'); return }

  const now = new Date()
  await prisma.productVariant.updateMany({ where: { id: { in: todo.map(v => v.id) } }, data: { archivedAt: now } })
  await logAdminAction({
    adminTelegramId: ACTOR, action: 'variant_archived', entity: 'ProductVariant', entityId: 'backfill',
    before: { archivedAt: null, ids: todo.map(v => v.id) },
    after: { archivedAt: now.toISOString(), count: todo.length, source: 'audit dupe_collapse' },
  })
  console.log(`\nАрхивировано вариантов: ${todo.length}`)
}

main().finally(() => prisma.$disconnect())
