/**
 * Разведка (read-only): какие значения колонки «Страна» реально стоят в листе,
 * с разбивкой по поколению iPhone. Ничего не пишет.
 *
 *   node node_modules/ts-node/dist/bin.js --transpile-only scripts/audit-sheet-countries.ts
 */
import { readSheet, getProductSheetNames } from '../lib/google-sheets'
import { mapHeaders } from '../lib/sheets-sync'
import { detectGeneration } from '../lib/sim-rules'

;(async () => {
  const out: Record<string, { n: number; gens: Record<string, number>; example: string }> = {}
  for (const sheet of await getProductSheetNames()) {
    const data = await readSheet(sheet)
    if (!data.length) continue
    const COL = mapHeaders(data[0]!, data.slice(1)) as unknown as Record<string, number | undefined>
    for (const row of data.slice(1)) {
      const cell = (i: number | undefined) => (i === undefined ? '' : String(row[i] ?? '').trim())
      const name = cell(COL.fullName)
      if (!name) continue
      const raw = cell(COL.country)
      const k = JSON.stringify(raw)
      const e = out[k] ??= { n: 0, gens: {}, example: name }
      e.n++
      const g = String(detectGeneration(name))
      e.gens[g] = (e.gens[g] ?? 0) + 1
    }
  }
  console.log(JSON.stringify({ takenAt: new Date().toISOString(), countries: out }, null, 2))
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
