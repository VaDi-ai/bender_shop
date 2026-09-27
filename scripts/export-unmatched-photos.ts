/**
 * Копирует «сироты» (orphans.csv) в отдельную папку + manifest с причинами.
 *   npx ts-node scripts/export-unmatched-photos.ts [foto_dir] [reports_dir] [out_dir]
 *
 * out_dir по умолчанию: <foto_dir>/_unmatched
 */
import fs from 'fs'
import path from 'path'

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

function csvEscape(s: string) {
  return `"${s.replace(/"/g, '""')}"`
}

function explain(row: ReturnType<typeof parseOrphan>): { parseOk: boolean; category: string; detailRu: string } {
  if (!row) return { parseOk: false, category: 'error', detailRu: 'не удалось прочитать строку' }

  const parseOk = Boolean(row.family && row.brand && !/^(Apple|Samsung)\s+(Mac|iPhone|Galaxy|TV)/i.test(row.brand))
  const below = /^below threshold/i.test(row.reason)

  if (below) {
    return {
      parseOk: true,
      category: 'low_confidence',
      detailRu:
        `Имя распознано (brand=${row.brand}, family=${row.family}, color=${row.color || '—'}), ` +
        `но совпадение со строкой таблицы слабое (${row.reason}). ` +
        `Чаще всего в Sheets нет строки с таким family/цветом или min-confidence отсёк матч.`,
    }
  }

  if (!parseOk) {
    if (/^apple\s+/i.test(row.filename) && !row.family) {
      return {
        parseOk: false,
        category: 'apple_flat_no_color',
        detailRu:
          'Плоское имя Apple без цвета в конце (например «Apple MacBook Air 13.png»). ' +
          'Парсер parseAppleFlatMarketing требует цвет в хвосте («… Midnight.png») или вложенный путь с __.',
      }
    }
    if (/^ultra\s+3\b/i.test(row.filename)) {
      return {
        parseOk: false,
        category: 'watch_short_name',
        detailRu:
          'Короткое имя Apple Watch Ultra 3 без префикса «Apple Watch» — generic не вытащил family.',
      }
    }
    if (/^samsung\s+tv\b/i.test(row.filename)) {
      return {
        parseOk: false,
        category: 'samsung_tv',
        detailRu: 'Samsung TV — в стоке нет парсера/строк в таблице под телевизоры.',
      }
    }
    return {
      parseOk: false,
      category: 'parse_weak',
      detailRu:
        `Слабый разбор имени (brand="${row.brand}", family пустой). ` +
        `Ожидается либо «Apple … Color.png», либо вложенный путь Brand__…__model__color.webp.`,
    }
  }

  return {
    parseOk: true,
    category: 'no_sheet_row',
    detailRu:
      `Имя распознано (family=${row.family}, color=${row.color || '—'}, size=${row.size || '—'}), ` +
      `но в текущем листе нет подходящей строки (exact/family/color не сошлись).`,
  }
}

function main() {
  const fotoDir = path.resolve(process.argv[2] ?? 'Foto')
  const reportsDir = path.resolve(process.argv[3] ?? './reports')
  const outDir = path.resolve(process.argv[4] ?? path.join(fotoDir, '_unmatched'))

  const orphansPath = path.join(reportsDir, 'orphans.csv')
  const matchedPath = path.join(reportsDir, 'matched.csv')
  if (!fs.existsSync(orphansPath)) {
    console.error(`Missing ${orphansPath} — сначала npm run match-photos`)
    process.exit(1)
  }
  if (!fs.existsSync(fotoDir)) {
    console.error(`Missing foto dir: ${fotoDir}`)
    process.exit(1)
  }

  const orphanLines = fs.readFileSync(orphansPath, 'utf8').trim().split(/\r?\n/).slice(1)
  const matchedNames = new Set<string>()
  if (fs.existsSync(matchedPath)) {
    for (const line of fs.readFileSync(matchedPath, 'utf8').trim().split(/\r?\n/).slice(1)) {
      const m = /^"([^"]*)"/.exec(line)
      if (m) matchedNames.add(m[1]!)
    }
  }

  const indexed = new Set<string>(matchedNames)
  for (const line of orphanLines) {
    const row = parseOrphan(line)
    if (row) indexed.add(row.filename)
  }

  const allPhotos = fs
    .readdirSync(fotoDir)
    .filter(f => /\.(png|webp|jpe?g)$/i.test(f))

  const notInReports = allPhotos.filter(f => !indexed.has(f))

  fs.mkdirSync(outDir, { recursive: true })

  const manifestHeader =
    'filename,brand,family,size,color,match_reason,parse_ok,category,detail_ru,copied'
  const manifestRows: string[] = [manifestHeader]

  let copied = 0
  let missingOnDisk = 0

  for (const line of orphanLines) {
    const row = parseOrphan(line)
    if (!row) continue
    const { parseOk, category, detailRu } = explain(row)
    const src = path.join(fotoDir, row.filename)
    let copiedFlag = 'no'
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outDir, row.filename))
      copied++
      copiedFlag = 'yes'
    } else {
      missingOnDisk++
      copiedFlag = 'missing'
    }
    manifestRows.push(
      [
        csvEscape(row.filename),
        csvEscape(row.brand),
        csvEscape(row.family),
        csvEscape(row.size),
        csvEscape(row.color),
        csvEscape(row.reason),
        parseOk ? 'yes' : 'no',
        csvEscape(category),
        csvEscape(detailRu),
        copiedFlag,
      ].join(','),
    )
  }

  for (const filename of notInReports) {
    const src = path.join(fotoDir, filename)
    let copiedFlag = 'no'
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outDir, filename))
      copied++
      copiedFlag = 'yes'
    }
    manifestRows.push(
      [
        csvEscape(filename),
        '""',
        '""',
        '""',
        '""',
        csvEscape('not in matched/orphans reports'),
        'unknown',
        csvEscape('not_indexed'),
        csvEscape('Файл на диске, но не попал в последний прогон match-photos (перезапустите матчинг).'),
        copiedFlag,
      ].join(','),
    )
  }

  const manifestName = 'unmatched_photos_manifest.csv'
  const manifestInOut = path.join(outDir, manifestName)
  const manifestInReports = path.join(reportsDir, manifestName)
  const manifestBody = manifestRows.join('\n')
  fs.writeFileSync(manifestInOut, manifestBody, 'utf8')
  if (path.resolve(manifestInReports) !== path.resolve(manifestInOut)) {
    fs.writeFileSync(manifestInReports, manifestBody, 'utf8')
  }

  const byCategory: Record<string, number> = {}
  let parseFailed = 0
  for (const line of orphanLines) {
    const row = parseOrphan(line)
    if (!row) continue
    const { parseOk, category } = explain(row)
    byCategory[category] = (byCategory[category] ?? 0) + 1
    if (!parseOk) parseFailed++
  }

  console.log(
    JSON.stringify(
      {
        fotoDir,
        outDir,
        manifest: manifestInOut,
        manifestCopyInReports: manifestInReports,
        totalPhotosOnDisk: allPhotos.length,
        orphansFromReport: orphanLines.length,
        copiedToFolder: copied,
        missingSourceFiles: missingOnDisk,
        notInLastReport: notInReports.length,
        parseFailedFilename: parseFailed,
        orphansByCategory: byCategory,
      },
      null,
      2,
    ),
  )
}

main()
