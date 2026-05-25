/**
 * Обнулить колонку «Фото» в Google Sheets (как первый шаг перед новым матчингом или заливкой).
 *
 * По умолчанию dry-run: показывает, сколько непустых ячеек сбросит.
 * Реально писать: добавьте `--write`.
 *
 *   npm run clear-sheet-photos
 *   npm run clear-sheet-photos -- --write
 *   npm run clear-sheet-photos -- --sheet-name=Лист1 --write
 */
import 'dotenv/config'

function colLetter(idx1: number): string {
  if (idx1 < 1 || idx1 > 26) throw new Error(`Unsupported column index: ${idx1}`)
  return String.fromCharCode('A'.charCodeAt(0) + idx1 - 1)
}

const COL_HEADERS = {
  brand: ['Бренд', 'Brand'],
  fullName: ['Название модели', 'Название', 'Model'],
  photo: ['Фото', 'Photo', 'Image'],
} as const

async function main(): Promise<void> {
  const write = process.argv.includes('--write')
  let sheetName = process.env.PRODUCT_SHEET_NAME || 'Лист1'
  for (const a of process.argv) {
    if (a.startsWith('--sheet-name=')) sheetName = a.split('=', 2)[1] ?? sheetName
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readSheet, batchUpdate } = await import('../lib/google-sheets')

  const raw = await readSheet(sheetName)
  if (raw.length === 0) throw new Error(`Sheet '${sheetName}' is empty`)

  const header = raw[0] ?? []
  const findCol = (names: readonly string[]): number => {
    for (let i = 0; i < header.length; i++) {
      const v = String(header[i] ?? '').trim()
      if (names.some(n => v === n)) return i
    }
    return -1
  }
  const cols = {
    brand: findCol(COL_HEADERS.brand),
    fullName: findCol(COL_HEADERS.fullName),
    photo: findCol(COL_HEADERS.photo),
  }
  if (cols.brand < 0 || cols.fullName < 0 || cols.photo < 0) {
    throw new Error(`Missing columns on '${sheetName}': brand/fullName/photo`)
  }

  const photoColIdx1 = cols.photo + 1 // 1-based A=1 → letter
  const letter = colLetter(photoColIdx1)

  const clearedRows: number[] = []
  for (let r = 1; r < raw.length; r++) {
    const row = raw[r] ?? []
    const brand = String(row[cols.brand] ?? '').trim()
    const fullName = String(row[cols.fullName] ?? '').trim()
    if (!brand || !fullName) continue
    const cur = String(row[cols.photo] ?? '').trim()
    if (!cur) continue
    clearedRows.push(r + 1) // 1-based row in Sheets
  }

  console.log(`Sheet '${sheetName}' — строк каталога с непустой «Фото»: ${clearedRows.length}`)
  if (clearedRows.length === 0) {
    console.log('Nothing to clear.')
    return
  }

  if (!write) {
    console.log('\nDry-run. Pass --write to clear cells in Sheets, then run /sync in the bot.')
    return
  }

  const sortedRows = [...clearedRows].sort((a, b) => a - b)
  type RunData = { range: string; values: string[][] }
  const ranges: RunData[] = []
  let runStart = sortedRows[0]!
  let runValues: string[] = ['']
  for (let i = 1; i < sortedRows.length; i++) {
    const rw = sortedRows[i]!
    const prev = sortedRows[i - 1]!
    if (rw === prev + 1) {
      runValues.push('')
    } else {
      ranges.push({
        range: `${letter}${runStart}:${letter}${prev}`,
        values: runValues.map(() => ['']),
      })
      runStart = rw
      runValues = ['']
    }
  }
  ranges.push({
    range: `${letter}${runStart}:${letter}${sortedRows[sortedRows.length - 1]!}`,
    values: runValues.map(() => ['']),
  })

  const data = ranges.map(r => ({
    range: `'${sheetName}'!${r.range}`,
    values: r.values,
  }))
  await batchUpdate(data)
  console.log(`\nCleared photo column (${clearedRows.length} rows, ${ranges.length} ranges). Затем: /sync в боте.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
