/**
 * Read-only симуляция эффекта archivedAt на пикер привязки — ДО деплоя.
 *
 * Колонки в проде ещё нет, поэтому множество «архивных» считаем ровно так же,
 * как это сделает бэкфилл: из AuditLog (action='dupe_collapse') + варианты
 * скрытых товаров-призраков + ручная поправка пары #82/#1762.
 * Затем прогоняем запрос пикера и вычитаем архивных.
 */
import { prisma } from '../lib/prisma'

const MANUAL = { archive: 82, keepAlive: 1762 }

async function archivedSet(): Promise<Set<number>> {
  const entries = await prisma.auditLog.findMany({
    where: { action: 'dupe_collapse' },
    select: { entity: true, entityId: true },
  })
  const variantIds = new Set<number>()
  const ghostProductIds = new Set<number>()
  for (const e of entries) {
    const id = parseInt(String(e.entityId ?? ''), 10)
    if (!Number.isInteger(id)) continue
    if (e.entity === 'ProductVariant') variantIds.add(id)
    if (e.entity === 'Product') ghostProductIds.add(id)
  }
  if (ghostProductIds.size) {
    const gv = await prisma.productVariant.findMany({ where: { productId: { in: [...ghostProductIds] } }, select: { id: true } })
    for (const v of gv) variantIds.add(v.id)
  }
  variantIds.add(MANUAL.archive)
  variantIds.delete(MANUAL.keepAlive)

  // Страховка бэкфилла: живой вариант с остатком у активного товара не архивируем
  const alive = await prisma.productVariant.findMany({
    where: { id: { in: [...variantIds] }, quantity: { gt: 0 }, inStock: true, product: { isAvailable: true } },
    select: { id: true },
  })
  for (const a of alive) variantIds.delete(a.id)
  return variantIds
}

const SYS = new Set(['fullName', 'attrOverrides'])
const label = (attrs: unknown): string =>
  Object.entries((attrs ?? {}) as Record<string, unknown>)
    .filter(([k, v]) => !SYS.has(k) && typeof v === 'string')
    .map(([, v]) => String(v)).join(' · ')

async function main() {
  const archived = await archivedSet()
  console.log(`Архивных вариантов будет проставлено: ${archived.size}`)

  for (const q of ['iPad 11', 'iPad Air', 'MacBook Air M5', 'Apple Watch Ultra 2']) {
    const rows = await prisma.productVariant.findMany({
      where: { OR: [{ product: { name: { contains: q, mode: 'insensitive' } } }, { sku: { contains: q, mode: 'insensitive' } }] },
      take: 20, orderBy: { id: 'asc' },
      select: { id: true, attributes: true, inStock: true, quantity: true, product: { select: { name: true } } },
    })
    const after = rows.filter(v => !archived.has(v.id))
    console.log(`\n══ «${q}» ══`)
    console.log(`  было строк в пикере: ${rows.length} → станет: ${after.length}`)

    const dupBefore = new Map<string, number>()
    for (const v of rows) {
      const k = v.product.name + ' | ' + label(v.attributes)
      dupBefore.set(k, (dupBefore.get(k) ?? 0) + 1)
    }
    const dupAfter = new Map<string, number>()
    for (const v of after) {
      const k = v.product.name + ' | ' + label(v.attributes)
      dupAfter.set(k, (dupAfter.get(k) ?? 0) + 1)
    }
    const dbCount = [...dupBefore.values()].filter(n => n > 1).length
    const daCount = [...dupAfter.values()].filter(n => n > 1).length
    console.log(`  одинаковых с виду строк: было ${dbCount} → станет ${daCount}`)
    for (const v of after) {
      console.log(`      #${v.id}${v.inStock && v.quantity > 0 ? '' : ' (нет в наличии)'} ${v.product.name} | ${label(v.attributes)}`)
    }
    const hiddenNow = rows.filter(v => archived.has(v.id))
    if (hiddenNow.length) console.log(`  спрячется: ${hiddenNow.map(v => '#' + v.id).join(', ')}`)
  }

  // Контроль: живой распроданный вариант РЕАЛЬНОГО товара обязан остаться
  console.log('\n══ КОНТРОЛЬ: живые распроданные варианты (не архив) ══')
  const soldOutLive = await prisma.productVariant.findMany({
    where: { quantity: 0, inStock: false, product: { isAvailable: true } },
    take: 2000, select: { id: true, product: { select: { name: true } } },
  })
  const wouldHide = soldOutLive.filter(v => archived.has(v.id))
  console.log(`  распроданных вариантов у активных товаров: ${soldOutLive.length}`)
  console.log(`  из них попадут в архив: ${wouldHide.length} (это схлопнутые дубли, остальные останутся в пикере)`)
  const sample = soldOutLive.filter(v => !archived.has(v.id)).slice(0, 3)
  for (const s of sample) console.log(`      остаётся видимым: #${s.id} «${s.product.name}»`)
}

main().finally(() => prisma.$disconnect())
