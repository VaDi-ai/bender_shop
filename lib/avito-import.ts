import ExcelJS from 'exceljs'
import log from './logger'
import { prisma } from './prisma'

function parseNum(v: unknown): number | null {
  if (v == null || v === '') return null
  // ExcelJS formula cells: { formula: '=E2-D2', result: 6000 }
  if (typeof v === 'object' && v !== null && 'result' in v) v = (v as { result: unknown }).result
  if (v == null) return null
  const s = String(v).replace(/[\s₽]/g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function parseDate(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  // Excel serial date number
  if (typeof v === 'number') {
    const d = new Date((v - 25569) * 86400000)
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}

function cleanHyperlink(v: unknown): string {
  const s = String(v || '')
  const match = s.match(/=HYPERLINK\([^,]+,\s*"([^"]+)"\)/)
  return match ? match[1]! : s
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
    try {
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
    } catch (err) {
      log.debug('Skip stats row', { row: rowNumber, error: err instanceof Error ? err.message : String(err) })
    }
  })

  let imported = 0
  await prisma.$transaction(async (tx) => {
    await tx.avitoStat.deleteMany({})
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50)
      await tx.avitoStat.createMany({ data: batch })
      imported += batch.length
    }
  })
  return imported
}

/** Import sales from Excel buffer. Returns count of imported rows. */
export async function importAvitoSales(buffer: Buffer): Promise<{ count: number; hasDateColumn: boolean }> {
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ExcelJS Buffer type mismatch
  await wb.xlsx.load(buffer as any)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('No worksheet found')

  // Detect format by header row
  const header1 = String(ws.getRow(1).getCell(1).value || '').toLowerCase()
  const hasDateColumn = header1.includes('дата') || header1.includes('date')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  let skipped = 0

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    try {
      let date: Date
      let productName: string
      let quantity: number
      let costPrice: number
      let sellPrice: number
      let extraCost: number

      if (hasDateColumn) {
        // Old format: Дата | Товар | Кол-во | Закупка | Продажа | Доп расход | Заработано
        const d = parseDate(row.getCell(1).value)
        if (!d) { skipped++; return }
        date = d
        productName = String(row.getCell(2).value || '').trim().slice(0, 200)
        quantity = (parseNum(row.getCell(3).value) as number) || 1
        costPrice = parseNum(row.getCell(4).value) ?? 0
        sellPrice = parseNum(row.getCell(5).value) ?? 0
        extraCost = parseNum(row.getCell(6).value) ?? 0
      } else {
        // New format: Товар | Кол-во | Закупка | Продажа | Доп расход | Выручка
        date = new Date()
        productName = String(row.getCell(1).value || '').trim().slice(0, 200)
        quantity = (parseNum(row.getCell(2).value) as number) || 1
        costPrice = parseNum(row.getCell(3).value) ?? 0
        sellPrice = parseNum(row.getCell(4).value) ?? 0
        extraCost = parseNum(row.getCell(5).value) ?? 0
      }

      if (!productName || sellPrice === 0) { skipped++; return }

      rows.push({
        date,
        productName,
        quantity,
        costPrice,
        sellPrice,
        extraCost,
        profit: sellPrice - costPrice - extraCost,
      })
    } catch (err) {
      skipped++
      log.debug('Skip sales row', { row: rowNumber, error: err instanceof Error ? err.message : String(err) })
    }
  })

  if (skipped > 0) log.info('Sales import skipped rows', { skipped })
  if (!hasDateColumn) log.info('Sales import: no date column, using import date')

  let imported = 0
  await prisma.$transaction(async (tx) => {
    await tx.sale.deleteMany({})
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50)
      await tx.sale.createMany({ data: batch })
      imported += batch.length
    }
  })
  return { count: imported, hasDateColumn }
}
