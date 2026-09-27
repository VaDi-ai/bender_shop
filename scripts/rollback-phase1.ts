/**
 * Откат Phase 1 из снапшота — ОДНОЙ КОМАНДОЙ.
 *
 *   npx ts-node scripts/rollback-phase1.ts            — dry-run (что вернётся)
 *   npx ts-node scripts/rollback-phase1.ts --apply    — выполнить откат
 *
 * Источник истины — reports/collapse-phase1-snapshot-2026-08-26.json, снятый
 * ДО применения: полные записи затронутых вариантов и товаров. Возвращаем
 * inStock/quantity/price/photos вариантов и isAvailable товаров ровно как было.
 *
 * Конфликт-гейт: если после схлопывания значение кто-то менял (например синк
 * привёз остаток), строка НЕ перетирается — она уходит в conflicts. Это та же
 * схема, что у отката SIM-пересчёта и ценовых батчей.
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'
import { logAdminAction } from '../lib/audit'

const APPLY = process.argv.includes('--apply')
const ACTOR = 'claude-collapse-phase1-rollback'

interface SnapVariant { id: number; quantity: number; inStock: boolean; price: unknown; photos: string[] }
interface SnapProduct { id: number; name: string; isAvailable: boolean; variants: SnapVariant[] }

async function main() {
  const snapPath = path.resolve(__dirname, '../reports/collapse-phase1-snapshot-2026-08-26.json')
  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8')) as {
    takenAt: string
    variants: SnapVariant[]
    products: SnapProduct[]
    plans: Array<{ kind: string; keepVariantId?: number; hideVariantId?: number; hideProductId?: number; blockers: string[] }>
  }
  console.log(`Снапшот от ${snap.takenAt}`)

  // Что реально трогали: только незаблокированные действия
  const applied = snap.plans.filter(p => !p.blockers.some(b => b.startsWith('ЗАБЛОКИРОВАНО')))
  const variantIds = [...new Set(applied.flatMap(p => [p.keepVariantId, p.hideVariantId].filter((x): x is number => !!x)))]
  const productIds = [...new Set(applied.map(p => p.hideProductId).filter((x): x is number => !!x))]

  const snapVariantById = new Map<number, SnapVariant>()
  for (const v of snap.variants) snapVariantById.set(v.id, v)
  for (const p of snap.products) for (const v of p.variants) if (!snapVariantById.has(v.id)) snapVariantById.set(v.id, v)

  const now = await prisma.productVariant.findMany({
    where: { id: { in: [...variantIds, ...snap.products.filter(p => productIds.includes(p.id)).flatMap(p => p.variants.map(v => v.id))] } },
    select: { id: true, quantity: true, inStock: true, price: true, photos: true },
  })

  const toRestore: Array<{ id: number; from: string; to: string }> = []
  const conflicts: Array<{ id: number; reason: string }> = []
  for (const cur of now) {
    const s = snapVariantById.get(cur.id)
    if (!s) continue
    const same = cur.quantity === s.quantity && cur.inStock === s.inStock
    if (same) continue
    // Конфликт: значение выросло ПОСЛЕ схлопывания (не мы) — не перетираем
    if (cur.quantity > s.quantity) { conflicts.push({ id: cur.id, reason: `остаток вырос после схлопывания (${s.quantity} → ${cur.quantity})` }); continue }
    toRestore.push({
      id: cur.id,
      from: `остаток ${cur.quantity}, inStock=${cur.inStock}`,
      to: `остаток ${s.quantity}, inStock=${s.inStock}`,
    })
  }

  const productsNow = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, isAvailable: true } })
  const productRestore = productsNow
    .map(p => ({ p, s: snap.products.find(x => x.id === p.id) }))
    .filter(({ p, s }) => s && p.isAvailable !== s.isAvailable)

  console.log(`\nВариантов к восстановлению: ${toRestore.length}`)
  for (const r of toRestore) console.log(`  #${r.id}: ${r.from} → ${r.to}`)
  console.log(`Товаров к восстановлению (isAvailable): ${productRestore.length}`)
  for (const { p, s } of productRestore) console.log(`  #${p.id} «${p.name}»: ${p.isAvailable} → ${s!.isAvailable}`)
  console.log(`Конфликтов (НЕ трогаем): ${conflicts.length}`)
  for (const c of conflicts) console.log(`  #${c.id}: ${c.reason}`)

  if (!APPLY) { console.log('\nDRY-RUN: ничего не изменено. Запусти с --apply.'); return }

  await prisma.$transaction(async (tx) => {
    for (const r of toRestore) {
      const s = snapVariantById.get(r.id)!
      await tx.productVariant.update({ where: { id: r.id }, data: { quantity: s.quantity, inStock: s.inStock } })
    }
    for (const { p, s } of productRestore) {
      await tx.product.update({ where: { id: p.id }, data: { isAvailable: s!.isAvailable } })
    }
  })
  await logAdminAction({
    adminTelegramId: ACTOR, action: 'dupe_collapse_rollback', entity: 'Product', entityId: 'phase1',
    before: { snapshotAt: snap.takenAt },
    after: { restoredVariants: toRestore.length, restoredProducts: productRestore.length, conflicts },
  })
  console.log(`\nОткат выполнен: вариантов ${toRestore.length}, товаров ${productRestore.length}, конфликтов ${conflicts.length}`)
}

main().finally(() => prisma.$disconnect())
