/**
 * Read-only: какие дубли реально всплывают в ПОИСКЕ ПРИВЯЗКИ (/admin/api/variants).
 * Поиск отдаёт варианты, значит товар виден в нём, только если у него есть варианты.
 * Плюс полный разбор всех MacBook-товаров (кейс менеджера).
 */
import { prisma } from '../lib/prisma'

function softKey(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

async function main() {
  const products = await prisma.product.findMany({
    include: { category: { select: { name: true } }, variants: { select: { id: true, inStock: true, quantity: true } } },
  })
  const withVariants = products.filter(p => p.variants.length > 0)

  // Группы, где ДВА И БОЛЕЕ товаров имеют варианты → оба всплывут в поиске привязки
  const groups = new Map<string, typeof withVariants>()
  for (const p of withVariants) {
    const k = softKey(p.name)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(p)
  }
  const visibleDupes = [...groups.entries()].filter(([, rs]) => rs.length > 1)

  const line = (p: (typeof products)[number]): string => {
    const inStock = p.variants.filter(v => v.inStock && v.quantity > 0).length
    const qty = p.variants.reduce((s, v) => s + v.quantity, 0)
    const live = p.isAvailable && inStock > 0
    return `    #${p.id} «${p.name}» [${live ? 'ЖИВОЙ' : 'призрак'}] · кат. ${p.category?.name ?? '—'} · линейка ${p.line ?? '—'}\n` +
      `        вариантов ${p.variants.length} (в наличии ${inStock}) · остаток ${qty} · isAvailable=${p.isAvailable} · обновлён ${p.updatedAt.toISOString().slice(0, 10)}`
  }

  console.log('=== ДУБЛИ, ВИДНЫЕ В ПОИСКЕ ПРИВЯЗКИ (у обоих есть варианты) ===')
  console.log(`Групп: ${visibleDupes.length}\n`)
  for (const [key, rs] of visibleDupes) {
    console.log(`  «${key}» — товаров с вариантами: ${rs.length}`)
    for (const p of rs.sort((a, b) => b.variants.length - a.variants.length)) console.log(line(p))
    console.log('')
  }

  console.log('\n=== ВСЕ ТОВАРЫ MACBOOK (кейс менеджера) ===')
  const macs = products
    .filter(p => /macbook/i.test(p.name))
    .sort((a, b) => softKey(a.name).localeCompare(softKey(b.name)) || a.id - b.id)
  for (const p of macs) console.log(line(p))

  console.log('\n=== ЧТО ВЕРНЁТ ПОИСК ПРИВЯЗКИ ПО ТИПИЧНЫМ ЗАПРОСАМ ===')
  for (const q of ['MacBook', 'MacBook Air', 'MacBook Pro', 'Ipad Air', 'Air 13']) {
    const found = await prisma.productVariant.findMany({
      where: { OR: [{ product: { name: { contains: q, mode: 'insensitive' } } }, { sku: { contains: q, mode: 'insensitive' } }] },
      take: 20, orderBy: { id: 'asc' },
      select: { productId: true, product: { select: { name: true, isAvailable: true } } },
    })
    const byProduct = new Map<number, { name: string; n: number; av: boolean }>()
    for (const v of found) {
      const cur = byProduct.get(v.productId) ?? { name: v.product.name, n: 0, av: v.product.isAvailable }
      cur.n++
      byProduct.set(v.productId, cur)
    }
    console.log(`\n  «${q}» → товаров в выдаче: ${byProduct.size}`)
    for (const [pid, i] of byProduct) console.log(`      #${pid} «${i.name}» · вариантов в выдаче ${i.n} · isAvailable=${i.av}`)
  }
}

main().finally(() => prisma.$disconnect())
