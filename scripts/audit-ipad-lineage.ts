/** Read-only: SKU-родословная iPad + «истинные» дубли вариантов (чип В ключе). */
import { prisma } from '../lib/prisma'

const SYS = new Set(['fullName', 'attrOverrides'])
const clean = (a: unknown): Record<string, string> => {
  const o: Record<string, string> = {}
  for (const [k, v] of Object.entries((a ?? {}) as Record<string, unknown>)) {
    if (SYS.has(k) || v === null || v === undefined || typeof v === 'object') continue
    o[k] = String(v).trim().toLowerCase().replace(/\s+/g, ' ')
  }
  return o
}
const fullKey = (a: Record<string, string>): string =>
  Object.entries(a).sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => `${k}=${v}`).join(' | ')

async function main() {
  const ids = [9, 10, 433, 434, 694, 695, 24, 448, 651, 652]
  const prods = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, sku: true, categoryId: true, category: { select: { name: true } } } })
  console.log('=== SKU товаров (чей префикс носят варианты) ===')
  for (const p of prods.sort((a, b) => a.id - b.id)) console.log(`  #${p.id} «${p.name}» · кат. ${p.category?.name ?? '—'} · sku ${p.sku}`)

  for (const pid of [433, 434]) {
    const p = await prisma.product.findUnique({ where: { id: pid }, include: { variants: { select: { id: true, sku: true, attributes: true, quantity: true, inStock: true } } } })
    if (!p) continue
    const pref = new Map<string, number>()
    for (const v of p.variants) {
      const k = v.sku.split('-').slice(0, 3).join('-')
      pref.set(k, (pref.get(k) ?? 0) + 1)
    }
    console.log(`\n=== #${p.id} «${p.name}»: ${p.variants.length} вариантов ===`)
    console.log('  Префиксы sku вариантов: ' + [...pref.entries()].map(([k, n]) => `${k}×${n}`).join(', '))

    // «Истинные» дубли: полный набор атрибутов совпадает (чип В ключе)
    const g = new Map<string, typeof p.variants>()
    for (const v of p.variants) {
      const k = fullKey(clean(v.attributes))
      if (!g.has(k)) g.set(k, [])
      g.get(k)!.push(v)
    }
    const exact = [...g.entries()].filter(([, vs]) => vs.length > 1)
    console.log(`  Истинных дублей (совпадает ВЕСЬ набор атрибутов, включая Чип): ${exact.length} конфигураций, лишних вариантов ${exact.reduce((s, [, vs]) => s + vs.length - 1, 0)}`)
    for (const [k, vs] of exact.slice(0, 8)) {
      console.log(`    ${k}`)
      for (const v of vs) console.log(`        #${v.id} sku ${v.sku} · остаток ${v.quantity}${v.inStock ? ' · в наличии' : ''}`)
    }
    if (exact.length > 8) console.log(`    … и ещё ${exact.length - 8}`)

    // Вариант БЕЗ ключа «Чип» при том, что у товара чип есть у большинства
    const noChip = p.variants.filter(v => clean(v.attributes)['чип'] === undefined && !('Чип' in clean(v.attributes)))
    const noChipReal = p.variants.filter(v => !Object.keys(clean(v.attributes)).includes('Чип'))
    console.log(`  Вариантов БЕЗ атрибута «Чип»: ${noChipReal.length} (ids: ${noChipReal.slice(0, 12).map(v => v.id).join(', ')}${noChipReal.length > 12 ? '…' : ''})`)
    void noChip
  }

  // Общий счёт по каталогу: точные дубли вариантов внутри товара
  const all = await prisma.product.findMany({ include: { variants: { select: { id: true, attributes: true, quantity: true } } } })
  let dupConfigs = 0, dupExtra = 0, affected = 0
  for (const p of all) {
    const g = new Map<string, number>()
    for (const v of p.variants) {
      const k = fullKey(clean(v.attributes))
      g.set(k, (g.get(k) ?? 0) + 1)
    }
    const d = [...g.values()].filter(n => n > 1)
    if (d.length) { affected++; dupConfigs += d.length; dupExtra += d.reduce((s, n) => s + n - 1, 0) }
  }
  console.log(`\n=== ПО ВСЕМУ КАТАЛОГУ: точные дубли вариантов (весь набор атрибутов совпал) ===`)
  console.log(`  Товаров затронуто: ${affected} · задвоенных конфигураций: ${dupConfigs} · лишних вариантов: ${dupExtra}`)
}

main().finally(() => prisma.$disconnect())
