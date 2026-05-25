/**
 * Restore paths — переименовывает плоские tech-имена (Photoroom Apple) в
 * иерархический формат с `__`, который понимают парсеры
 * `match-photos-to-sheets.ts` (Apple Watch / iPhone / Samsung / Dyson и
 * generic с extraction цвета).
 *
 * Контекст:
 *   Photoroom отдаёт файлы с tech-именами без префикса дерева:
 *     iphone-17-finish-select-202509-black_AV2.png
 *     macbook-air-finish-select-202601-13inch-midnight.png
 *     S11 Gold Titanium.png
 *
 *   В то же время в `R/` (или `Фото_ready/`) уже лежит «слепок» этих же
 *   файлов с **сохранённой** иерархией:
 *     Apple Stock__iPhone Stock__iPhone 17 Stock__iPhone 17__iPhone 17 Black__iphone-17-finish-select-202509-black_AV2.png
 *
 *   Идея: для каждого tech-name из Photoroom ищем в R/ файл, у которого
 *   tech-name является суффиксом (последний сегмент после `__`). Если
 *   нашли — копируем Photoroom-файл с full-path-именем. Если нет —
 *   оставляем под исходным именем и пишем в отчёт.
 *
 * Использование:
 *   ts-node scripts/restore-paths.ts <flat_input_dir> <reference_dir> <output_dir>
 *
 *   <flat_input_dir>  — папка с плоскими именами (например выгрузка с прозрачным фоном)
 *   <reference_dir>   — папка-шаблон с иерархическими именами (./R, ./Фото_ready)
 *   <output_dir>      — куда складывать переименованные файлы
 *
 * Пример:
 *   ts-node scripts/restore-paths.ts ./staging-flat ./R ./R-final
 *   ts-node scripts/match-photos-to-sheets.ts ./R-final --sheet ./reports https://example.com/photos --write
 *
 * Выход:
 *   - Файлы скопированы в <output_dir> с полным иерархическим именем
 *   - <output_dir>/_restore-report.csv — отчёт по каждому файлу:
 *       flat_name,resolved_path,match_status (matched | ambiguous | not_found)
 */
import fs from 'fs'
import path from 'path'

const SUPPORTED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

interface IndexEntry {
  fullName: string         // полное имя файла, например `Apple Stock__...__iphone-17.png`
  techStem: string         // последний сегмент без расширения (lowercase), например `iphone-17-finish-select-202509-black_av2`
}

/**
 * Извлекает «технический хвост» из иерархического имени: последний сегмент
 * после `__` без расширения, в lowercase.
 *
 * `Apple Stock__iPhone Stock__...__iphone-17-finish-select-202509-black_AV2.png`
 *   → `iphone-17-finish-select-202509-black_av2`
 *
 * Если имя не содержит `__` — возвращает basename без расширения.
 */
function techStemFromHierarchical(filename: string): string {
  const noExt = path.parse(filename).name
  const parts = noExt.split('__')
  const last = parts[parts.length - 1] ?? noExt
  return last.toLowerCase()
}

/**
 * Извлекает stem из плоского имени (basename без расширения, lowercase).
 */
function techStemFromFlat(filename: string): string {
  return path.parse(filename).name.toLowerCase()
}

/**
 * Собирает индекс reference-папки: tech-stem → список full-name'ов.
 * Рекурсивно (на случай если reference хранится в подпапках).
 */
function buildIndex(refDir: string): Map<string, IndexEntry[]> {
  const index = new Map<string, IndexEntry[]>()

  function walk(d: string): void {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name)
      const st = fs.statSync(full)
      if (st.isDirectory()) {
        walk(full)
        continue
      }
      if (!SUPPORTED_EXTS.has(path.extname(name).toLowerCase())) continue

      const stem = techStemFromHierarchical(name)
      const list = index.get(stem) ?? []
      list.push({ fullName: name, techStem: stem })
      index.set(stem, list)
    }
  }
  walk(refDir)
  return index
}

interface ResolveResult {
  status: 'matched' | 'ambiguous' | 'not_found'
  resolvedName: string | null
  candidates: string[]
}

/**
 * Ищет соответствие плоскому имени в индексе. Стратегии:
 *   1. Точное совпадение techStem.
 *   2. Если не нашли — пытаемся найти по содержанию: flat_stem является
 *      подстрокой techStem (на случай минорных различий расширений или
 *      `_AVX` суффиксов в одной из версий).
 */
function resolveFlatName(flatStem: string, index: Map<string, IndexEntry[]>): ResolveResult {
  // 1) exact match
  const exact = index.get(flatStem)
  if (exact && exact.length === 1) {
    return { status: 'matched', resolvedName: exact[0]!.fullName, candidates: [exact[0]!.fullName] }
  }
  if (exact && exact.length > 1) {
    return { status: 'ambiguous', resolvedName: null, candidates: exact.map((e) => e.fullName) }
  }

  // 2) substring match (один из stems содержит flat_stem или наоборот)
  const candidates: IndexEntry[] = []
  for (const [stem, entries] of index.entries()) {
    if (stem === flatStem) continue
    if (stem.includes(flatStem) || flatStem.includes(stem)) {
      candidates.push(...entries)
    }
  }

  if (candidates.length === 1) {
    return {
      status: 'matched',
      resolvedName: candidates[0]!.fullName,
      candidates: [candidates[0]!.fullName],
    }
  }
  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      resolvedName: null,
      candidates: candidates.map((c) => c.fullName),
    }
  }

  return { status: 'not_found', resolvedName: null, candidates: [] }
}

/**
 * Заменяет расширение в иерархическом имени на расширение исходного flat-файла.
 *
 * Например: reference `iphone-17-...-black_AV2.png`, flat `iphone-17-...-black_AV2.webp`
 * → результат: `Apple Stock__...__iphone-17-...-black_AV2.webp` (берём webp как у flat).
 */
function withFlatExtension(hierarchicalName: string, flatExt: string): string {
  const parsed = path.parse(hierarchicalName)
  return parsed.name + flatExt
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const flatDir = process.argv[2]
  const refDir = process.argv[3]
  const outDir = process.argv[4]

  if (!flatDir || !refDir || !outDir) {
    console.error('Usage: ts-node scripts/restore-paths.ts <flat_input_dir> <reference_dir> <output_dir>')
    console.error('')
    console.error('Example:')
    console.error('  ts-node scripts/restore-paths.ts ./staging-flat ./R ./R-final')
    console.error('')
    console.error('Reference dir должна содержать файлы с иерархическими именами вида')
    console.error('  "Apple Stock__iPhone Stock__...__iphone-17-...-black_AV2.png"')
    console.error('(см. результаты Фото/photo.py — папка R/ или Фото_ready/).')
    process.exit(1)
  }

  for (const dir of [flatDir, refDir]) {
    if (!fs.existsSync(dir)) {
      console.error(`Directory not found: ${dir}`)
      process.exit(1)
    }
  }
  fs.mkdirSync(outDir, { recursive: true })

  console.log(`Building index from ${refDir}...`)
  const index = buildIndex(refDir)
  console.log(`Reference entries: ${[...index.values()].reduce((a, b) => a + b.length, 0)}`)
  console.log(`Unique tech-stems: ${index.size}\n`)

  const flatFiles = fs.readdirSync(flatDir).filter((f) =>
    SUPPORTED_EXTS.has(path.extname(f).toLowerCase())
  )
  console.log(`Flat files to process: ${flatFiles.length}\n`)

  const reportRows: string[] = ['flat_name,resolved_path,status,candidates']
  let matched = 0
  let ambiguous = 0
  let notFound = 0
  let collisions = 0
  /** Уже использованные финальные имена — гарантия уникальности на диске. */
  const usedNames = new Set<string>()

  /**
   * Возвращает уникальное имя для outDir: если базовое имя уже занято,
   * добавляет flat_stem перед расширением как disambiguator. Если и это
   * занято — `__dup_N`. flat_stem сам по себе уникален в пределах flat-папки.
   */
  function uniqueName(base: string, flatStem: string): string {
    if (!usedNames.has(base)) return base
    const parsed = path.parse(base)
    const candidate = `${parsed.name}__${flatStem}${parsed.ext}`
    if (!usedNames.has(candidate)) return candidate
    for (let n = 2; n < 100; n++) {
      const fallback = `${parsed.name}__${flatStem}__dup${n}${parsed.ext}`
      if (!usedNames.has(fallback)) return fallback
    }
    throw new Error(`Cannot find unique name for ${base}`)
  }

  for (const flatFile of flatFiles) {
    const flatStem = techStemFromFlat(flatFile)
    const flatExt = path.extname(flatFile)
    const flatPath = path.join(flatDir, flatFile)

    const r = resolveFlatName(flatStem, index)

    if (r.status === 'matched' && r.resolvedName) {
      const baseOut = withFlatExtension(r.resolvedName, flatExt)
      const outName = uniqueName(baseOut, flatStem)
      if (outName !== baseOut) collisions++
      usedNames.add(outName)
      const outPath = path.join(outDir, outName)
      fs.copyFileSync(flatPath, outPath)
      matched++
      reportRows.push(`"${flatFile}","${outName}",matched,""`)
      console.log(`  OK     ${flatFile.slice(0, 50).padEnd(50)} → ${outName.slice(0, 80)}`)
      continue
    }

    if (r.status === 'ambiguous') {
      ambiguous++
      // Берём первый кандидат, но помечаем в отчёте — нужен ручной разбор
      const fallback = r.candidates[0]!
      const baseOut = withFlatExtension(fallback, flatExt)
      const outName = uniqueName(baseOut, flatStem)
      if (outName !== baseOut) collisions++
      usedNames.add(outName)
      const outPath = path.join(outDir, outName)
      fs.copyFileSync(flatPath, outPath)
      const candidatesStr = r.candidates.slice(0, 5).join(' | ').replace(/"/g, '""')
      reportRows.push(`"${flatFile}","${outName}",ambiguous,"${candidatesStr}"`)
      console.log(`  AMB    ${flatFile.slice(0, 50).padEnd(50)} ${r.candidates.length} candidates`)
      continue
    }

    // not_found — копируем под оригинальным именем, чтобы файл не потерялся
    const outName = uniqueName(flatFile, flatStem)
    usedNames.add(outName)
    const outPath = path.join(outDir, outName)
    fs.copyFileSync(flatPath, outPath)
    notFound++
    reportRows.push(`"${flatFile}","${outName}",not_found,""`)
    console.log(`  MISS   ${flatFile.slice(0, 50).padEnd(50)}`)
  }

  const reportPath = path.join(outDir, '_restore-report.csv')
  fs.writeFileSync(reportPath, reportRows.join('\n'), 'utf-8')

  console.log('\n=== Restore summary ===')
  console.log(`  matched:    ${matched}`)
  console.log(`  ambiguous:  ${ambiguous}  (взят первый кандидат — проверь _restore-report.csv)`)
  console.log(`  not_found:  ${notFound}   (файл скопирован под исходным именем — generic-парсер match-photos попробует разобрать)`)
  if (collisions > 0) {
    console.log(`  collisions: ${collisions}  (несколько flat-файлов → одно reference-имя; добавлен flat_stem суффикс для уникальности)`)
  }
  console.log(`\nReport: ${reportPath}`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
