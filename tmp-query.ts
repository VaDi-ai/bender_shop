import { prisma } from './lib/prisma'

async function main() {
  const prods = await prisma.product.findMany({
    select: { name: true, _count: { select: { variants: true } } },
    orderBy: { name: 'asc' },
  })

  // Print full list
  for (const p of prods) {
    console.log(p._count.variants + ' | ' + p.name)
  }
  console.log('Total:', prods.length)

  // Find suspected duplicates: group by prefix match
  console.log('\n=== SUSPECTED DUPLICATES ===\n')

  const names = prods.map(p => ({ name: p.name, variants: p._count.variants }))
  const suspects: { group: string; items: typeof names }[] = []

  for (let i = 0; i < names.length; i++) {
    const base = names[i]
    const related = names.filter((n, j) =>
      j !== i &&
      n.name !== base.name &&
      (n.name.toLowerCase().startsWith(base.name.toLowerCase()) ||
       base.name.toLowerCase().startsWith(n.name.toLowerCase()))
    )
    if (related.length > 0) {
      const shortest = [base, ...related].sort((a, b) => a.name.length - b.name.length)[0].name
      // Avoid duplicate groups
      if (!suspects.find(s => s.group === shortest)) {
        suspects.push({
          group: shortest,
          items: [base, ...related].sort((a, b) => a.name.length - b.name.length),
        })
      }
    }
  }

  // Also find case-insensitive duplicates
  const ciMap = new Map<string, typeof names>()
  for (const n of names) {
    const key = n.name.toLowerCase()
    if (!ciMap.has(key)) ciMap.set(key, [])
    ciMap.get(key)!.push(n)
  }
  for (const [key, items] of ciMap) {
    if (items.length > 1) {
      console.log(`CASE DUP: ${items.map(i => `"${i.name}" (${i.variants}v)`).join(' vs ')}`)
    }
  }

  // Show top suspects sorted by variant count (biggest groups first)
  suspects.sort((a, b) => b.items.reduce((s, i) => s + i.variants, 0) - a.items.reduce((s, i) => s + i.variants, 0))

  for (const s of suspects.slice(0, 20)) {
    const totalV = s.items.reduce((sum, i) => sum + i.variants, 0)
    console.log(`[${totalV}v] "${s.group}" →`)
    for (const item of s.items) {
      console.log(`    ${item.variants}v | ${item.name}`)
    }
    console.log()
  }

  await prisma.$disconnect()
}

main()
