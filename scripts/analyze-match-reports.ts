/**
 * Сводка по reports/matched.csv, orphans.csv, unmatched_rows.csv после match-photos.
 *   npx ts-node scripts/analyze-match-reports.ts [reports_dir]
 */
import fs from 'fs'
import path from 'path'

function parseMatched(line: string) {
  const m = /^"([^"]*)",(\d+),"([^"]*)","([^"]*)","([^"]*)"$/.exec(line)
  if (!m) return null
  return { filename: m[1]!, confidence: +m[2]!, reason: m[3]!, rows: m[4]! }
}

function parseOrphan(line: string) {
  const m = /^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"$/.exec(line)
  if (!m) return null
  return {
    filename: m[1]!,
    brand: m[2]!,
    family: m[3]!,
    size: m[4]!,
    color: m[5]!,
    reason: m[6]!,
  }
}

function parseUnmatched(line: string) {
  const m = /^(\d+),"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"$/.exec(line)
  if (!m) return null
  return {
    rowIdx: +m[1]!,
    brand: m[2]!,
    category: m[3]!,
    fullName: m[4]!,
    color: m[5]!,
    size: m[6]!,
    family: m[7]!,
  }
}

function inc(map: Record<string, number>, key: string, n = 1) {
  map[key] = (map[key] ?? 0) + n
}

function topEntries(map: Record<string, number>, limit = 15) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
}

function main() {
  const reportsDir = path.resolve(process.argv[2] ?? './reports')
  const matchedPath = path.join(reportsDir, 'matched.csv')
  const orphansPath = path.join(reportsDir, 'orphans.csv')
  const unmatchedPath = path.join(reportsDir, 'unmatched_rows.csv')

  for (const p of [matchedPath, orphansPath, unmatchedPath]) {
    if (!fs.existsSync(p)) {
      console.error(`Missing: ${p}`)
      process.exit(1)
    }
  }

  const matchedLines = fs.readFileSync(matchedPath, 'utf8').trim().split(/\r?\n/).slice(1)
  const orphanLines = fs.readFileSync(orphansPath, 'utf8').trim().split(/\r?\n/).slice(1)
  const unmatchedLines = fs.readFileSync(unmatchedPath, 'utf8').trim().split(/\r?\n/).slice(1)

  const matchedFiles = new Set<string>()
  const matchedReasons: Record<string, number> = {}
  const matchedBrands: Record<string, number> = {}
  const matchedConf: Record<string, number> = {}
  const rowsWithPhoto = new Set<number>()

  for (const line of matchedLines) {
    const row = parseMatched(line)
    if (!row) continue
    matchedFiles.add(row.filename)
    inc(matchedReasons, row.reason)
    inc(matchedConf, String(row.confidence))
    const brand = row.filename.split(/[\s_]/)[0] ?? '?'
    inc(matchedBrands, brand)
    for (const r of row.rows.split(';')) {
      const n = parseInt(r, 10)
      if (!Number.isNaN(n)) rowsWithPhoto.add(n)
    }
  }

  const orphanFiles = new Set<string>()
  const orphanReasons: Record<string, number> = {}
  const orphanBrands: Record<string, number> = {}
  const orphanFamilies: Record<string, number> = {}

  for (const line of orphanLines) {
    const row = parseOrphan(line)
    if (!row) continue
    orphanFiles.add(row.filename)
    inc(orphanReasons, row.reason)
    inc(orphanBrands, row.brand || '(empty)')
    if (row.family) inc(orphanFamilies, row.family)
  }

  const unmatchedByBrand: Record<string, number> = {}
  const unmatchedByCategory: Record<string, number> = {}
  const unmatchedFamilies: Record<string, number> = {}

  for (const line of unmatchedLines) {
    const row = parseUnmatched(line)
    if (!row) continue
    inc(unmatchedByBrand, row.brand)
    inc(unmatchedByCategory, row.category)
    inc(unmatchedFamilies, row.family)
  }

  const fotoDir = path.resolve('Foto')
  let fotoCount = 0
  if (fs.existsSync(fotoDir)) {
    fotoCount = fs
      .readdirSync(fotoDir)
      .filter(f => /\.(png|webp|jpe?g)$/i.test(f)).length
  }

  const indexedInReports = matchedFiles.size + orphanFiles.size
  const notInReports = Math.max(0, fotoCount - indexedInReports)

  const summary = {
    fotoOnDisk: fotoCount,
    indexedInReports,
    matched: {
      fileEntries: matchedLines.length,
      uniqueFiles: matchedFiles.size,
      sheetRowsWithAtLeastOnePhoto: rowsWithPhoto.size,
      byConfidence: topEntries(matchedConf, 20),
      byReason: topEntries(matchedReasons, 20),
      byBrandPrefix: topEntries(matchedBrands, 15),
    },
    orphans: {
      fileEntries: orphanLines.length,
      uniqueFiles: orphanFiles.size,
      byReason: topEntries(orphanReasons, 20),
      byBrand: topEntries(orphanBrands, 15),
      topFamilies: topEntries(orphanFamilies, 25),
    },
    unmatchedSheetRows: {
      total: unmatchedLines.length,
      byBrand: topEntries(unmatchedByBrand, 15),
      byCategory: topEntries(unmatchedByCategory, 20),
      topFamilies: topEntries(unmatchedFamilies, 30),
    },
    coverage: {
      photosMatchedPct: fotoCount ? ((matchedFiles.size / fotoCount) * 100).toFixed(1) + '%' : 'n/a',
      photosOrphanPct: fotoCount ? ((orphanFiles.size / fotoCount) * 100).toFixed(1) + '%' : 'n/a',
      sheetRowsMatchedPct:
        rowsWithPhoto.size && unmatchedLines.length
          ? ((rowsWithPhoto.size / (rowsWithPhoto.size + unmatchedLines.length)) * 100).toFixed(1) + '%'
          : 'n/a',
      notAccountedInReports: notInReports,
    },
  }

  console.log(JSON.stringify(summary, null, 2))
}

main()
