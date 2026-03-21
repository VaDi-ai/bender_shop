/**
 * Тестовое обогащение 5 товаров + запись в Google Sheets (J=description, K=specs).
 *
 * Запуск: npx tsx scripts/test-enrich-sheets.ts
 * Требует: GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_SHEET_ID, OPENROUTER_API_KEY
 */

import { prisma } from '../lib/prisma'
import { enrichProductCard } from '../lib/enrich'
import { readSheet, writeCell, getSheetNames } from '../lib/google-sheets'

const TARGET_PRODUCTS = [
  { search: 'Iphone 17 Pro', type: 'телефон' },
  { search: 'Macbook Air M5', type: 'ноутбук' },
  { search: 'Apple Watch S11', type: 'часы' },
  { search: 'Dyson Airwrap', type: 'красота' },
  { search: 'JBL Flip 6', type: 'аудио' },
]

async function main() {
  const allSheets = await getSheetNames()
  const sheetName = allSheets[0]
  if (!sheetName) { console.error('No sheets found'); return }
  console.log(`Sheet: "${sheetName}"`)

  // Read sheet data to build name→row mapping
  const data = await readSheet(sheetName)
  console.log(`Sheet has ${data.length} rows\n`)

  for (const target of TARGET_PRODUCTS) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`🔍 ${target.type}: "${target.search}"`)

    // Find product in DB
    const product = await prisma.product.findFirst({
      where: { name: target.search },
      include: { variants: { select: { id: true, attributes: true }, take: 1 } },
    })

    if (!product) {
      console.log(`  ❌ Product not found in DB`)
      continue
    }
    console.log(`  DB id=${product.id}, variants=${product.variants.length}`)

    // Enrich with force=true
    console.log(`  ⏳ Enriching...`)
    const success = await enrichProductCard(product.id, true)
    if (!success) {
      console.log(`  ❌ Enrichment failed`)
      continue
    }

    // Re-read product to get updated data
    const updated = await prisma.product.findUnique({ where: { id: product.id } })
    if (!updated) continue

    const description = updated.description || ''
    const specs = updated.specs as Record<string, string> | null
    const specsText = specs
      ? Object.entries(specs).map(([k, v]) => `${k}: ${v}`).join('\n')
      : ''

    console.log(`  ✅ Description: "${description.slice(0, 80)}..."`)
    console.log(`  ✅ Specs: ${specs ? Object.keys(specs).length : 0} fields`)

    // Find rows in sheet by matching fullName from variant attributes
    const variantFullNames = product.variants
      .map(v => {
        const a = v.attributes as Record<string, unknown> | null
        return a && typeof a.fullName === 'string' ? a.fullName : null
      })
      .filter(Boolean) as string[]

    // Find first matching row in sheet
    let matchedRow = -1
    for (let i = 1; i < data.length; i++) {
      const sheetFullName = (data[i]?.[4] ?? '').toString().trim()  // Column E (index 4)
      if (variantFullNames.includes(sheetFullName)) {
        matchedRow = i + 1  // 1-indexed for Sheets API
        break
      }
    }

    // Fallback: search by product name in column E
    if (matchedRow === -1) {
      for (let i = 1; i < data.length; i++) {
        const sheetFullName = (data[i]?.[4] ?? '').toString().trim()
        if (sheetFullName.toLowerCase().includes(target.search.toLowerCase().split(' ').slice(0, 2).join(' '))) {
          matchedRow = i + 1
          break
        }
      }
    }

    if (matchedRow === -1) {
      console.log(`  ⚠️ Row not found in sheet — skipping write`)
      continue
    }

    console.log(`  📝 Writing to sheet row ${matchedRow}...`)

    // Write description to column J
    if (description) {
      await writeCell(sheetName, `J${matchedRow}`, description)
      console.log(`  J${matchedRow} ← description (${description.length} chars)`)
    }

    // Write specs to column K
    if (specsText) {
      await writeCell(sheetName, `K${matchedRow}`, specsText)
      console.log(`  K${matchedRow} ← specs (${specsText.split('\n').length} lines)`)
    }

    // Pause between API calls
    await new Promise(r => setTimeout(r, 2000))
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log('Done!')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
