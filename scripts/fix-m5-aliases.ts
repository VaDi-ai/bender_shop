/**
 * Фикс перепутанных привязок MacBook Air M5 13" 16/512 (MDHE4/MDHH4), 2026-08-26.
 *
 * Диагноз (см. reports/alias-snapshot-2026-08-26.json — снапшот ДО правки):
 * - PriceAlias id 22/23 (rawLine и композит «…midnight») указывают на вариант 395,
 *   а 395 — это Sky Blue (fullName «…512GB Sky Blue», алиасы MDHH4 id 24/25 тоже → 395).
 *   Из-за этого строки MDHE4 Midnight ложились на Sky Blue-вариант.
 * - Владелец сегодня перекрыл «Цвет» варианта 395 override'ом на Midnight (аудит id 844) —
 *   на витрине два Midnight 13" 16/512 и ни одного Sky Blue.
 * - В preview-батче 53 строка 740 (MDHE4 Midnight) привязана к 395.
 *
 * Правка (всё обратимо по снапшоту):
 * 1) PriceAlias 22, 23: variantId 395 → 394 (настоящий Midnight 13" 16/512).
 * 2) Вариант 395: Цвет → Sky Blue (через setVariantAttributes — override остаётся,
 *    чтобы синк не вернул мусор; там же аудит и бамп кэша витрины).
 * 3) SupplierPrice 740: variantId 395 → 394 (батч 53 в preview — применит владелец).
 *
 *   npx ts-node scripts/fix-m5-aliases.ts            — dry-run (только снапшот и план)
 *   npx ts-node scripts/fix-m5-aliases.ts --apply    — выполнить
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'
import { setVariantAttributes } from '../lib/product-admin'
import { logAdminAction } from '../lib/audit'

const APPLY = process.argv.includes('--apply')
const ACTOR = 'claude-fix-2026-08-26'

async function snapshot() {
  const [aliases, variants, supplierRows, product] = await Promise.all([
    prisma.priceAlias.findMany({ orderBy: { id: 'asc' } }),
    prisma.productVariant.findMany({ where: { id: { in: [394, 395, 396] } } }),
    prisma.supplierPrice.findMany({ where: { id: { in: [427, 569, 720, 721, 724, 740, 741, 742] } } }),
    prisma.product.findUnique({ where: { id: 448 } }),
  ])
  const snap = {
    takenAt: new Date().toISOString(),
    reason: 'before fix-m5-aliases: перепутанные привязки MDHE4/MDHH4',
    priceAliasFull: aliases,
    variants394_395_396: variants,
    supplierPriceRows: supplierRows,
    product448: product,
  }
  const file = path.resolve(__dirname, '../reports/alias-snapshot-2026-08-26.json')
  fs.writeFileSync(file, JSON.stringify(snap, (_, v) => (typeof v === 'bigint' ? String(v) : v), 2))
  console.log('Снапшот сохранён:', file, `(алиасов: ${aliases.length})`)
}

async function main() {
  await snapshot()
  if (!APPLY) { console.log('\nDry-run: правки не применены. Запусти с --apply.'); return }

  // 1) Алиасы Midnight → настоящий Midnight-вариант 394
  for (const id of [22, 23]) {
    const before = await prisma.priceAlias.findUnique({ where: { id } })
    if (!before) { console.log(`PriceAlias ${id} не найден — пропуск`); continue }
    if (before.variantId !== 395) { console.log(`PriceAlias ${id} уже не на 395 (${before.variantId}) — пропуск`); continue }
    const after = await prisma.priceAlias.update({ where: { id }, data: { variantId: 394 } })
    await logAdminAction({
      adminTelegramId: ACTOR, action: 'manual_fix', entity: 'PriceAlias', entityId: id,
      before: { alias: before.alias, variantId: before.variantId },
      after: { alias: after.alias, variantId: after.variantId },
    })
    console.log(`PriceAlias ${id} «${before.alias}»: variantId ${before.variantId} → ${after.variantId}`)
  }

  // 2) Вариант 395 — вернуть Sky Blue (override остаётся, синк его не перетрёт)
  const r = await setVariantAttributes(ACTOR, 395, { 'Цвет': 'Sky Blue' })
  console.log('Вариант 395 Цвет → Sky Blue:', r.ok ? 'ok' : `ОШИБКА ${r.status} ${r.error}`)

  // 3) Строка 740 батча 53 (preview) — на 394
  const row = await prisma.supplierPrice.findUnique({ where: { id: 740 }, select: { id: true, variantId: true, batchId: true, rawMessage: true } })
  if (row?.variantId === 395) {
    await prisma.supplierPrice.update({ where: { id: 740 }, data: { variantId: 394 } })
    await logAdminAction({
      adminTelegramId: ACTOR, action: 'manual_fix', entity: 'SupplierPrice', entityId: 740,
      before: { variantId: 395 }, after: { variantId: 394, rawLine: row.rawMessage },
    })
    console.log('SupplierPrice 740 (батч 53): variantId 395 → 394')
  } else {
    console.log('SupplierPrice 740: variantId =', row?.variantId, '— пропуск')
  }

  // Контрольный вывод
  const aliasesAfter = await prisma.priceAlias.findMany({ where: { id: { in: [22, 23, 24, 25, 62, 63] } }, orderBy: { id: 'asc' } })
  console.log('\n=== Алиасы после правки ===')
  for (const a of aliasesAfter) console.log(`${a.id}: «${a.alias}» → variant ${a.variantId}`)
  const v395 = await prisma.productVariant.findUnique({ where: { id: 395 }, select: { attributes: true, price: true } })
  console.log('\nВариант 395:', JSON.stringify(v395))
}

main().finally(() => prisma.$disconnect())
