/**
 * Тестовое обогащение 5 товаров + запись во ВСЕ строки Google Sheets.
 * enrichProductCard теперь автоматически пишет в Sheets (J=description, K=specs).
 *
 * Запуск: npx tsx scripts/test-enrich-sheets.ts
 * Требует: GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_SHEET_ID, OPENROUTER_API_KEY
 */

import { prisma } from '../lib/prisma'
import { enrichProductCard } from '../lib/enrich'

const TARGETS = [
  { search: 'Iphone 17 Pro', type: 'телефон' },
  { search: 'Macbook Air M5', type: 'ноутбук' },
  { search: 'Apple Watch S11', type: 'часы' },
  { search: 'Dyson Airwrap', type: 'красота' },
  { search: 'JBL Flip 6', type: 'аудио' },
]

async function main() {
  for (const target of TARGETS) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`🔍 ${target.type}: "${target.search}"`)

    const product = await prisma.product.findFirst({
      where: { name: target.search },
      select: { id: true, name: true, _count: { select: { variants: true } } },
    })

    if (!product) {
      console.log(`  ❌ Not found in DB`)
      continue
    }
    console.log(`  DB id=${product.id}, ${product._count.variants} variants`)

    console.log(`  ⏳ Enriching + writing to ALL sheet rows...`)
    const enriched = await enrichProductCard(product.id, true)
    if (!enriched.ok) {
      console.log(`  ❌ Enrichment failed: ${enriched.reason} — ${enriched.message}`)
      continue
    }

    const updated = await prisma.product.findUnique({ where: { id: product.id } })
    if (!updated) continue

    const specs = updated.specs as Record<string, string> | null
    console.log(`  ✅ Description: "${(updated.description || '').slice(0, 80)}..."`)
    console.log(`  ✅ Specs: ${specs ? Object.keys(specs).length : 0} fields`)

    await new Promise(r => setTimeout(r, 2000))
  }

  console.log(`\n${'='.repeat(60)}\nDone!`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
