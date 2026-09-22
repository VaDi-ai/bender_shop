/**
 * Разведка страновых SIM-правил (read-only): как страны записаны в «Страна» у
 * iPhone-вариантов по поколениям, какие SimRule и алиасы 'Страна' лежат в БД,
 * какие страны приходят в прайсах поставщиков. Пишет JSON в stdout.
 *
 *   node node_modules/ts-node/dist/bin.js --transpile-only scripts/audit-sim-countries.ts > reports/…/audit.json
 */
import { prisma } from '../lib/prisma'
import { detectGeneration } from '../lib/sim-rules'

;(async () => {
  const variants = await prisma.productVariant.findMany({
    select: { id: true, attributes: true, inStock: true, product: { select: { name: true, brand: true, isAvailable: true } } },
  })
  const byCountry: Record<string, { gen: Record<string, number>; sim: Record<string, number>; example: string }> = {}
  for (const v of variants) {
    const a = (v.attributes ?? {}) as Record<string, string>
    const name = `${a.fullName ?? ''} ${v.product.name}`
    if (!/iphone/i.test(name)) continue
    const g = detectGeneration(a.fullName, v.product.name)
    const c = a['Страна'] ?? '(нет)'
    const e = byCountry[JSON.stringify(c)] ??= { gen: {}, sim: {}, example: a.fullName ?? v.product.name }
    e.gen[String(g)] = (e.gen[String(g)] ?? 0) + 1
    e.sim[a.SIM ?? '(нет)'] = (e.sim[a.SIM ?? '(нет)'] ?? 0) + 1
  }
  const rules = await prisma.simRule.findMany({ orderBy: [{ countryNorm: 'asc' }, { modelGenFrom: 'asc' }] })
  const countryAliases = await prisma.attrValueAlias.findMany({ where: { attrKey: 'Страна' }, orderBy: { canonical: 'asc' } })
  const supplierCountries = await prisma.supplierPrice.groupBy({ by: ['country'], _count: { _all: true } })
  console.log(JSON.stringify({
    takenAt: new Date().toISOString(),
    iphoneCountries: byCountry,
    simRules: rules,
    countryAliases: countryAliases.map(a => ({ raw: a.rawNorm, canonical: a.canonical, source: a.source })),
    supplierCountries: supplierCountries.map(s => ({ country: s.country, n: s._count._all })),
  }, null, 2))
  await prisma.$disconnect(); process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
