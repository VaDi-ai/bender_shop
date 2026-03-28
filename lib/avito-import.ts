import ExcelJS from 'exceljs'
import { prisma } from './prisma'

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
  const match = s.match(/=HYPERLINK\([^,]+,\s*"([^"]+)"\)/)
  return match ? match[1] : s
}

/** Import Avito statistics from Excel buffer. Returns count of imported rows. */
export async function importAvitoStats(buffer: Buffer): Promise<number> {
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ExcelJS Buffer type mismatch
  await wb.xlsx.load(buffer as any)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('No worksheet found')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []

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
  return imported
}

/** Import sales from Excel buffer. Returns count of imported rows. */
export async function importAvitoSales(buffer: Buffer): Promise<number> {
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ExcelJS Buffer type mismatch
  await wb.xlsx.load(buffer as any)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('No worksheet found')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []

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
  return imported
}
