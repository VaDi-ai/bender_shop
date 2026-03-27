import 'dotenv/config'
import ExcelJS from 'exceljs'
import { prisma } from '../lib/prisma'

function parseNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const s = String(v).replace(/\s/g, '').replace('₽', '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function parseDate(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}

function cleanHyperlink(v: unknown): string {
  const s = String(v || '')
  // Excel HYPERLINK formula: =HYPERLINK("url","text") → extract text
  const match = s.match(/=HYPERLINK\([^,]+,\s*"([^"]+)"\)/)
  return match ? match[1] : s
}

async function importStats(filePath: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('No worksheet found')

  const rows: Parameters<typeof prisma.avitoStat.createMany>[0]['data'] = []

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return

    rows.push({
      listingId: cleanHyperlink(row.getCell(1).value).slice(0, 50),
      category: String(row.getCell(5).value || ''),
      subcategory: String(row.getCell(6).value || ''),
      parameter: String(row.getCell(7).value || ''),
      title: cleanHyperlink(row.getCell(8).value).slice(0, 200),
      price: parseNum(row.getCell(9).value) as number | null,
      publishedAt: parseDate(row.getCell(10).value),
      unpublishedAt: parseDate(row.getCell(11).value),
      daysOnAvito: parseNum(row.getCell(12).value) as number | null,
      impressions: parseNum(row.getCell(14).value) as number | null,
      viewConversion: parseNum(row.getCell(15).value),
      views: parseNum(row.getCell(16).value) as number | null,
      avgViewPrice: parseNum(row.getCell(17).value),
      contactConversion: parseNum(row.getCell(18).value),
      contacts: parseNum(row.getCell(20).value) as number | null,
      chats: parseNum(row.getCell(21).value) as number | null,
      phoneLooks: parseNum(row.getCell(22).value) as number | null,
      avgContactPrice: parseNum(row.getCell(25).value),
      favorites: parseNum(row.getCell(26).value) as number | null,
      totalSpend: parseNum(row.getCell(32).value),
      promoSpend: parseNum(row.getCell(35).value),
    })
  })

  let imported = 0
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50)
    await prisma.avitoStat.createMany({ data: batch })
    imported += batch.length
  }

  console.log(`Imported ${imported} Avito stats from ${filePath}`)
}

async function importSales(filePath: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('No worksheet found')

  const rows: Parameters<typeof prisma.sale.createMany>[0]['data'] = []

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return

    const dateVal = row.getCell(1).value
    if (!dateVal) return

    const costPrice = parseNum(row.getCell(4).value) ?? 0
    const sellPrice = parseNum(row.getCell(5).value) ?? 0
    const extraCost = parseNum(row.getCell(6).value) ?? 0

    rows.push({
      date: dateVal instanceof Date ? dateVal : new Date(String(dateVal)),
      productName: String(row.getCell(2).value || '').slice(0, 200),
      quantity: (parseNum(row.getCell(3).value) as number) || 1,
      costPrice,
      sellPrice,
      extraCost,
      profit: sellPrice - costPrice - extraCost,
    })
  })

  let imported = 0
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50)
    await prisma.sale.createMany({ data: batch })
    imported += batch.length
  }

  console.log(`Imported ${imported} sales from ${filePath}`)
}

async function main() {
  const args = process.argv.slice(2)
  const files = args.filter(a => a.endsWith('.xlsx'))

  if (args.includes('--stats') || args.includes('--all')) {
    const file = files.find(f => /татистик/i.test(f)) || files[0]
    if (!file) { console.error('Specify xlsx file path'); process.exit(1) }
    await importStats(file)
  }

  if (args.includes('--sales') || args.includes('--all')) {
    const file = files.find(f => /асход|продаж/i.test(f)) || files[0]
    if (!file) { console.error('Specify xlsx file path'); process.exit(1) }
    await importSales(file)
  }

  if (!args.includes('--stats') && !args.includes('--sales') && !args.includes('--all')) {
    console.log('Usage:')
    console.log('  npx ts-node scripts/import-avito-stats.ts --stats <file.xlsx>')
    console.log('  npx ts-node scripts/import-avito-stats.ts --sales <file.xlsx>')
    console.log('  npx ts-node scripts/import-avito-stats.ts --all <stats.xlsx> <sales.xlsx>')
  }

  await prisma.$disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
