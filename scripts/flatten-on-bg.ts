/**
 * Flatten on background — приводит RGBA-фото (например после Photoroom) к
 * стандарту каталога: 1024×1024 WebP, фон #1a1a1a (как `.product-photo-wrap`).
 *
 * Отличие от `pad-to-square.ts`:
 *   - `pad-to-square` рассчитан на непрозрачные исходники с продуктом на
 *     белом/светлом фоне. Он делает auto-crop светлых полей и pad через
 *     edge-tile (повтор крайней строки). На RGBA-исходниках алгоритм
 *     ломается: прозрачные пиксели берутся как `(0,0,0)` → image looks
 *     dark с артефактами по краям.
 *   - `flatten-on-bg` ничего не кропит и не паддит логикой яркости: продукт
 *     уже отделён от фона (Photoroom), нам нужно только нанести его на
 *     ровный тёмный фон каталога и сжать до 1024×1024.
 *
 * Алгоритм:
 *   1. `flatten({ background: '#1a1a1a' })` — слить альфу с фоном каталога.
 *      После этого изображение становится непрозрачным.
 *   2. `resize(1024, 1024, { fit: 'contain', background: '#1a1a1a' })` —
 *      вписать в квадрат. Если исходник не квадрат — добавит полосы того же
 *      цвета, и они визуально сольются с фоном `.product-photo-wrap` на сайте.
 *   3. `.webp({ quality: 85, effort: 6 })` — те же параметры, что и у
 *      pad-to-square для единообразия.
 *
 * Идемпотентность: skip-up-to-date по mtime (как `optimize-images.ts`/
 * `pad-to-square.ts`).
 *
 * Использование:
 *   ts-node scripts/flatten-on-bg.ts <input> <output_dir>
 *
 *   <input> — папка с PNG/JPG/WebP **или** путь к .zip с фото внутри
 *             (zip распаковывается во временную папку и далее обрабатывается
 *              как обычная директория).
 *
 * Примеры:
 *   ts-node scripts/flatten-on-bg.ts "./Photoroom Apple.zip" ./staging-flat
 *   ts-node scripts/flatten-on-bg.ts ./photoroom-output ./staging-flat
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'

// ── Параметры ─────────────────────────────────────────────────────────────────
const TARGET_SIZE = 1024
const WEBP_QUALITY = 85
const BG_HEX = '#1a1a1a'
const BG_RGB = { r: 0x1a, g: 0x1a, b: 0x1a }
const SUPPORTED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

interface ProcessResult {
  file: string
  origSize: { w: number; h: number }
  hadAlpha: boolean
  outKb: number
}

// ── Распаковка zip (если на вход подали архив) ────────────────────────────────
/**
 * Принимает либо директорию, либо путь к .zip. Для .zip распаковывает в
 * tmpdir и возвращает путь к распакованной папке (либо к подпапке с фото
 * внутри архива). Для директории возвращает её как есть.
 *
 * Если в архиве есть единственная подпапка (типичный кейс Photoroom — он
 * пакует всё в `Photoroom <Brand>/`), берём её как корень.
 */
function resolveInputDir(input: string): { dir: string; tmpToCleanup: string | null } {
  const stat = fs.statSync(input)
  if (stat.isDirectory()) {
    return { dir: input, tmpToCleanup: null }
  }

  if (path.extname(input).toLowerCase() !== '.zip') {
    throw new Error(`Unsupported input: ${input} (expected dir or .zip)`)
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bender-flatten-'))
  console.log(`Extracting ${input} → ${tmpRoot}...`)
  // Используем встроенный tar (поддерживает zip на Windows 10+ и macOS)
  // как самый портативный вариант без новых зависимостей.
  try {
    execSync(`tar -xf "${input}" -C "${tmpRoot}"`, { stdio: 'inherit' })
  } catch (err) {
    throw new Error(`Failed to extract zip via tar: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Если в распакованном дереве один корневой каталог — используем его
  const entries = fs.readdirSync(tmpRoot)
  if (entries.length === 1) {
    const onlyEntry = entries[0]!
    const onlyPath = path.join(tmpRoot, onlyEntry)
    if (fs.statSync(onlyPath).isDirectory()) {
      return { dir: onlyPath, tmpToCleanup: tmpRoot }
    }
  }

  return { dir: tmpRoot, tmpToCleanup: tmpRoot }
}

// ── Обработка одного файла ────────────────────────────────────────────────────
async function processOne(inputPath: string, outputPath: string): Promise<ProcessResult> {
  const meta = await sharp(inputPath).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  if (w === 0 || h === 0) {
    throw new Error(`Could not read dimensions for ${inputPath}`)
  }
  const hadAlpha = Boolean(meta.hasAlpha)

  // 1) flatten — слить альфу с фоном каталога. Для непрозрачных PNG это no-op.
  // 2) resize contain — вписать в квадрат, полосы того же тёмного цвета.
  // 3) webp — финальный формат.
  const info = await sharp(inputPath)
    .flatten({ background: BG_RGB })
    .resize(TARGET_SIZE, TARGET_SIZE, {
      fit: 'contain',
      background: BG_RGB,
      kernel: sharp.kernel.lanczos3,
    })
    .webp({ quality: WEBP_QUALITY, effort: 6 })
    .toFile(outputPath)

  return {
    file: path.basename(inputPath),
    origSize: { w, h },
    hadAlpha,
    outKb: Math.round(info.size / 1024),
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const inputArg = process.argv[2]
  const outputDir = process.argv[3]

  if (!inputArg || !outputDir) {
    console.error('Usage: ts-node scripts/flatten-on-bg.ts <input_dir_or_zip> <output_dir>')
    console.error('')
    console.error('Examples:')
    console.error('  ts-node scripts/flatten-on-bg.ts "./Photoroom Apple.zip" ./staging-flat')
    console.error('  ts-node scripts/flatten-on-bg.ts ./photoroom-output ./staging-flat')
    console.error('')
    console.error(`Output: 1024×1024 WebP, фон ${BG_HEX} (соответствует .product-photo-wrap в каталоге)`)
    process.exit(1)
  }

  if (!fs.existsSync(inputArg)) {
    console.error(`Input not found: ${inputArg}`)
    process.exit(1)
  }

  const { dir: inputDir, tmpToCleanup } = resolveInputDir(inputArg)

  fs.mkdirSync(outputDir, { recursive: true })

  // Собираем все файлы рекурсивно (Photoroom может вложить в подпапки)
  const files: string[] = []
  function walk(d: string): void {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name)
      const st = fs.statSync(full)
      if (st.isDirectory()) walk(full)
      else if (SUPPORTED_EXTS.has(path.extname(name).toLowerCase())) files.push(full)
    }
  }
  walk(inputDir)

  console.log(`Found ${files.length} files`)
  console.log(`Output: ${outputDir}`)
  console.log(`Target: ${TARGET_SIZE}×${TARGET_SIZE} WebP q${WEBP_QUALITY}, фон ${BG_HEX}\n`)

  let processed = 0
  let skipped = 0
  let errors = 0
  let bytesIn = 0
  let bytesOut = 0

  for (const inputPath of files) {
    const baseName = path.parse(inputPath).name + '.webp'
    const outputPath = path.join(outputDir, baseName)

    // Skip if output is newer than input
    if (fs.existsSync(outputPath)) {
      const srcStat = fs.statSync(inputPath)
      const dstStat = fs.statSync(outputPath)
      if (dstStat.mtimeMs >= srcStat.mtimeMs) {
        skipped++
        continue
      }
    }

    try {
      const inSize = fs.statSync(inputPath).size
      const r = await processOne(inputPath, outputPath)
      bytesIn += inSize
      bytesOut += r.outKb * 1024
      const sizeStr = `${r.origSize.w}×${r.origSize.h}`
      const alphaTag = r.hadAlpha ? 'RGBA' : 'RGB '
      console.log(`  ${alphaTag}  ${sizeStr.padStart(11)}  →  ${r.outKb.toString().padStart(4)}K  ${path.basename(inputPath).slice(0, 70)}`)
      processed++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ERROR  ${path.basename(inputPath)}: ${msg}`)
      errors++
    }
  }

  console.log(`\nDone: ${processed} processed, ${skipped} skipped, ${errors} errors`)
  if (processed > 0) {
    console.log(`Total: ${(bytesIn / 1024 / 1024).toFixed(1)} MB → ${(bytesOut / 1024 / 1024).toFixed(1)} MB`)
  }

  // Cleanup tmp
  if (tmpToCleanup) {
    try {
      fs.rmSync(tmpToCleanup, { recursive: true, force: true })
    } catch {
      // Не критично — tmpdir почистится при перезагрузке
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
