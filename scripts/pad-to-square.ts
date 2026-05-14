/**
 * Pad to square — приводит фото товаров к единому квадратному виду.
 *
 * Алгоритм:
 *   1. Crop светлых полей (стандартные apple/amazon paddings) по краям,
 *      используя порог яркости. Защита: не обрезать больше 50% по оси.
 *   2. Pad до квадрата через "edge tile" — берём полосу в EDGE_MEDIAN_DEPTH строк
 *      (или столбцов для портрета) у края с отступом 15px, считаем поканальную
 *      МЕДИАНУ по глубине и получаем одну "представительную" 1-px строку, которую
 *      повторяем через `extend({ extendWith: 'copy' })`. Медиана поверх 20 строк
 *      гасит случайные объекты на краю (ремешок, циферблат) — если бы брали одну
 *      строку, такой объект размазался бы полосой через весь pad.
 *      Само повторение — через extend а не resize: resize делает sRGB→linear→sRGB
 *      gamma transform и искажает яркость однородных полос.
 *   3. Защита от bright streaks: если у выбранной краевой полосы есть яркие пятна
 *      (логотип, надпись) при общем тёмном фоне — переключаемся на заливку
 *      медианным цветом, чтобы не размазать "белую полосу" через весь pad.
 *   4. Resize до 1024×1024 (Lanczos3 для основной картинки — там gamma-эффект
 *      безвреден на естественных изображениях), сохранение в WebP quality 85.
 *
 * Пропускает файлы у которых WebP-выход уже свежее исходника (как optimize-images.ts).
 *
 * Использование:
 *   ts-node scripts/pad-to-square.ts <input_dir> <output_dir>
 *
 * Например:
 *   ts-node scripts/pad-to-square.ts D:/R public/uploads/products
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

// ── Параметры (можно редактировать без изменения логики) ─────────────────────
const TARGET_SIZE = 1024              // финальный размер квадрата в пикселях
const WEBP_QUALITY = 85               // качество WebP (по визуальной проверке хватает)
const LIGHT_THRESHOLD = 220           // яркость >220 → крайний столбец/строка считается "светлым полем"
const CROP_MAX_RATIO = 0.5            // не обрезать больше 50% по любой оси (sanity)
const EDGE_OFFSET = 15                // отступ от самого края при выборе строки/столбца для tile
const EDGE_SAMPLE = 3                 // толщина полосы для bright-streak анализа (не для tile)
const EDGE_MEDIAN_DEPTH = 20          // сколько строк/столбцов усреднять (медиана) для "представительной" краевой строки
const SUPPORTED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

// ── Типы ─────────────────────────────────────────────────────────────────────
interface ProcessResult {
  file: string
  origSize: { w: number; h: number }
  cropped: { w: number; h: number }
  outKb: number
  skipped?: boolean
}

// ── Анализ краёв (raw RGB) ───────────────────────────────────────────────────
/**
 * Считает среднюю яркость каждого столбца и каждой строки по raw RGB-данным.
 * Используется для детекта светлых полей.
 */
function analyzeBrightness(raw: Buffer, w: number, h: number, channels: number): {
  cols: Float32Array
  rows: Float32Array
} {
  const cols = new Float32Array(w)
  const rows = new Float32Array(h)
  // accumulate sum, потом делим
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels
      // brightness = средне по RGB (игнорируем alpha если есть)
      const r = raw[i] ?? 0
      const g = raw[i + 1] ?? 0
      const b = raw[i + 2] ?? 0
      const br = (r + g + b) / 3
      rowSum += br
      cols[x] = (cols[x] ?? 0) + br
    }
    rows[y] = rowSum / w
  }
  for (let x = 0; x < w; x++) {
    cols[x] = (cols[x] ?? 0) / h
  }
  return { cols, rows }
}

/**
 * Возвращает bbox области без светлых полей.
 * Если crop окажется агрессивным (>50% по оси) — возвращает исходный bbox.
 */
function findContentBox(cols: Float32Array, rows: Float32Array, w: number, h: number): {
  left: number; top: number; right: number; bottom: number
} {
  let left = 0
  while (left < w && (cols[left] ?? 0) > LIGHT_THRESHOLD) left++
  let right = w - 1
  while (right > left && (cols[right] ?? 0) > LIGHT_THRESHOLD) right--
  let top = 0
  while (top < h && (rows[top] ?? 0) > LIGHT_THRESHOLD) top++
  let bottom = h - 1
  while (bottom > top && (rows[bottom] ?? 0) > LIGHT_THRESHOLD) bottom--

  const cw = right - left + 1
  const ch = bottom - top + 1
  if (cw < w * CROP_MAX_RATIO || ch < h * CROP_MAX_RATIO) {
    return { left: 0, top: 0, right: w - 1, bottom: h - 1 }
  }
  return { left, top, right, bottom }
}

// ── Стратегия заливки края ───────────────────────────────────────────────────
type FillStrategy = 'stretch' | 'solid'

/**
 * Решает чем заполнять pad:
 *   - "solid" если в выбранной полосе есть яркие выбросы при тёмной медиане
 *     (логотип/надпись на самом краю — растягивать нельзя, размажется полосой).
 *   - "stretch" в нормальном случае — растянутая полоса продолжит градиент.
 *
 * Возвращает также медианный цвет (используется для "solid").
 */
function analyzeStrip(stripRaw: Buffer, channels: number): {
  strategy: FillStrategy
  medianColor: { r: number; g: number; b: number }
} {
  const pixelCount = stripRaw.length / channels
  // brightness array + RGB для медианы
  const brightnesses = new Float32Array(pixelCount)
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  for (let i = 0; i < pixelCount; i++) {
    const off = i * channels
    const r = stripRaw[off] ?? 0
    const g = stripRaw[off + 1] ?? 0
    const b = stripRaw[off + 2] ?? 0
    brightnesses[i] = (r + g + b) / 3
    rs.push(r); gs.push(g); bs.push(b)
  }
  // median brightness
  const sortedBr = Array.from(brightnesses).sort((a, b) => a - b)
  const medBr = sortedBr[Math.floor(sortedBr.length / 2)] ?? 0
  let maxBr = 0
  for (const v of brightnesses) if (v > maxBr) maxBr = v

  // bright streak detection: тёмный медианный фон + яркий выброс
  const strategy: FillStrategy = (medBr < 80 && maxBr > 200) ? 'solid' : 'stretch'

  // median color (поканально — это даёт более стабильный цвет чем avg)
  rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b)
  const mid = Math.floor(rs.length / 2)
  const medianColor = {
    r: rs[mid] ?? 0,
    g: gs[mid] ?? 0,
    b: bs[mid] ?? 0,
  }

  return { strategy, medianColor }
}

// ── Медиана по глубине полосы ────────────────────────────────────────────────
/**
 * Берёт вертикальный блок (stripHeight строк по stripWidth пикселей) и возвращает
 * одну репрезентативную строку — поканальная медиана по вертикали на каждый X.
 * Нужно чтобы случайный посторонний объект (ремешок, циферблат), попавший в одну
 * из строк, не протянулся полосой через весь pad — 2 выброса из 20 голосов фоном.
 */
function medianRow(stripRaw: Buffer, stripWidth: number, stripHeight: number, channels: number): Buffer {
  const out = Buffer.alloc(stripWidth * channels)
  const samples = new Array<number>(stripHeight)
  const mid = Math.floor(stripHeight / 2)
  for (let x = 0; x < stripWidth; x++) {
    for (let c = 0; c < channels; c++) {
      for (let y = 0; y < stripHeight; y++) {
        samples[y] = stripRaw[(y * stripWidth + x) * channels + c] ?? 0
      }
      samples.sort((a, b) => a - b)
      out[x * channels + c] = samples[mid] ?? 0
    }
  }
  return out
}

/**
 * Берёт горизонтальный блок (stripHeight строк по stripWidth пикселей) и возвращает
 * один репрезентативный столбец — поканальная медиана по горизонтали на каждый Y.
 * Портретный аналог medianRow.
 */
function medianCol(stripRaw: Buffer, stripWidth: number, stripHeight: number, channels: number): Buffer {
  const out = Buffer.alloc(stripHeight * channels)
  const samples = new Array<number>(stripWidth)
  const mid = Math.floor(stripWidth / 2)
  for (let y = 0; y < stripHeight; y++) {
    for (let c = 0; c < channels; c++) {
      for (let x = 0; x < stripWidth; x++) {
        samples[x] = stripRaw[(y * stripWidth + x) * channels + c] ?? 0
      }
      samples.sort((a, b) => a - b)
      out[y * channels + c] = samples[mid] ?? 0
    }
  }
  return out
}

// ── Pad до квадрата ──────────────────────────────────────────────────────────
async function padToSquare(input: sharp.Sharp, w: number, h: number): Promise<Buffer> {
  if (w === h) {
    return input.png().toBuffer()
  }

  const target = Math.max(w, h)
  const isLandscape = w > h
  const channels = 3
  const offset = EDGE_OFFSET

  if (isLandscape) {
    const padTop = Math.floor((target - h) / 2)
    const padBot = target - h - padTop

    // Анализ-полосы (EDGE_SAMPLE строк) — для определения стратегии
    const topSampleBuf = await input
      .clone()
      .extract({ left: 0, top: offset, width: w, height: EDGE_SAMPLE })
      .raw().toBuffer()
    const topAnalysis = analyzeStrip(topSampleBuf, channels)

    const botSampleBuf = await input
      .clone()
      .extract({ left: 0, top: h - offset - EDGE_SAMPLE, width: w, height: EDGE_SAMPLE })
      .raw().toBuffer()
    const botAnalysis = analyzeStrip(botSampleBuf, channels)

    // Сколько строк реально доступно для медианы (clamp если картинка очень тонкая)
    const depth = Math.max(1, Math.min(EDGE_MEDIAN_DEPTH, h - offset))

    // Top fill
    let topFillBuf: Buffer
    if (topAnalysis.strategy === 'solid') {
      topFillBuf = await sharp({
        create: { width: w, height: padTop, channels: 3, background: topAnalysis.medianColor },
      }).png().toBuffer()
    } else {
      // Берём depth строк от offset, считаем поканальную медиану по вертикали
      // → получаем одну "представительную" 1px строку без случайных выбросов
      // (ремешок/циферблат/прочее), и повторяем её через extend({ extendWith: 'copy' }).
      // Именно extend, а не resize — resize делает sRGB→linear→sRGB gamma transform
      // и искажает яркость однородных полос.
      const topStripBuf = await input.clone()
        .extract({ left: 0, top: offset, width: w, height: depth })
        .raw().toBuffer()
      const topMedianRow = medianRow(topStripBuf, w, depth, channels)
      topFillBuf = await sharp(topMedianRow, { raw: { width: w, height: 1, channels: 3 } })
        .extend({ top: 0, bottom: padTop - 1, left: 0, right: 0, extendWith: 'copy' })
        .png().toBuffer()
    }

    // Bot fill
    let botFillBuf: Buffer
    if (botAnalysis.strategy === 'solid') {
      botFillBuf = await sharp({
        create: { width: w, height: padBot, channels: 3, background: botAnalysis.medianColor },
      }).png().toBuffer()
    } else {
      const botStripBuf = await input.clone()
        .extract({ left: 0, top: h - offset - depth, width: w, height: depth })
        .raw().toBuffer()
      const botMedianRow = medianRow(botStripBuf, w, depth, channels)
      // 1 строка + extend bottom (padBot - 1) = padBot строк всего
      botFillBuf = await sharp(botMedianRow, { raw: { width: w, height: 1, channels: 3 } })
        .extend({ top: 0, bottom: padBot - 1, left: 0, right: 0, extendWith: 'copy' })
        .png().toBuffer()
    }

    const origBuf = await input.clone().png().toBuffer()

    return sharp({
      create: { width: w, height: target, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .composite([
        { input: topFillBuf, left: 0, top: 0 },
        { input: origBuf, left: 0, top: padTop },
        { input: botFillBuf, left: 0, top: padTop + h },
      ])
      .png()
      .toBuffer()
  } else {
    // Portrait: pad left/right
    const padLeft = Math.floor((target - w) / 2)
    const padRight = target - w - padLeft

    const leftSampleBuf = await input
      .clone()
      .extract({ left: offset, top: 0, width: EDGE_SAMPLE, height: h })
      .raw().toBuffer()
    const leftAnalysis = analyzeStrip(leftSampleBuf, channels)

    const rightSampleBuf = await input
      .clone()
      .extract({ left: w - offset - EDGE_SAMPLE, top: 0, width: EDGE_SAMPLE, height: h })
      .raw().toBuffer()
    const rightAnalysis = analyzeStrip(rightSampleBuf, channels)

    const depth = Math.max(1, Math.min(EDGE_MEDIAN_DEPTH, w - offset))

    let leftFillBuf: Buffer
    if (leftAnalysis.strategy === 'solid') {
      leftFillBuf = await sharp({
        create: { width: padLeft, height: h, channels: 3, background: leftAnalysis.medianColor },
      }).png().toBuffer()
    } else {
      // Медиана по горизонтали поверх depth столбцов — портретный аналог top/bot.
      const leftStripBuf = await input.clone()
        .extract({ left: offset, top: 0, width: depth, height: h })
        .raw().toBuffer()
      const leftMedianCol = medianCol(leftStripBuf, depth, h, channels)
      leftFillBuf = await sharp(leftMedianCol, { raw: { width: 1, height: h, channels: 3 } })
        .extend({ top: 0, bottom: 0, left: padLeft - 1, right: 0, extendWith: 'copy' })
        .png().toBuffer()
    }

    let rightFillBuf: Buffer
    if (rightAnalysis.strategy === 'solid') {
      rightFillBuf = await sharp({
        create: { width: padRight, height: h, channels: 3, background: rightAnalysis.medianColor },
      }).png().toBuffer()
    } else {
      const rightStripBuf = await input.clone()
        .extract({ left: w - offset - depth, top: 0, width: depth, height: h })
        .raw().toBuffer()
      const rightMedianCol = medianCol(rightStripBuf, depth, h, channels)
      rightFillBuf = await sharp(rightMedianCol, { raw: { width: 1, height: h, channels: 3 } })
        .extend({ top: 0, bottom: 0, left: 0, right: padRight - 1, extendWith: 'copy' })
        .png().toBuffer()
    }

    const origBuf = await input.clone().png().toBuffer()

    return sharp({
      create: { width: target, height: h, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .composite([
        { input: leftFillBuf, left: 0, top: 0 },
        { input: origBuf, left: padLeft, top: 0 },
        { input: rightFillBuf, left: padLeft + w, top: 0 },
      ])
      .png()
      .toBuffer()
  }
}

// ── Главный pipeline для одного файла ────────────────────────────────────────
async function processOne(inputPath: string, outputPath: string): Promise<ProcessResult> {
  const meta = await sharp(inputPath).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  if (w === 0 || h === 0) {
    throw new Error(`Could not read dimensions for ${inputPath}`)
  }

  // Step 1: получить raw RGB для анализа яркости
  const flatBuf = await sharp(inputPath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { cols, rows } = analyzeBrightness(flatBuf.data, w, h, 3)
  const bbox = findContentBox(cols, rows, w, h)
  const cropW = bbox.right - bbox.left + 1
  const cropH = bbox.bottom - bbox.top + 1

  // Step 2: crop (если нужно) → pad to square
  const cropped = sharp(inputPath)
    .removeAlpha()
    .extract({ left: bbox.left, top: bbox.top, width: cropW, height: cropH })

  const squareBuf = await padToSquare(cropped, cropW, cropH)

  // Step 3: resize to TARGET_SIZE и WebP
  await sharp(squareBuf)
    .resize(TARGET_SIZE, TARGET_SIZE, { kernel: sharp.kernel.lanczos3 })
    .webp({ quality: WEBP_QUALITY, effort: 6 })
    .toFile(outputPath)

  const outKb = Math.round(fs.statSync(outputPath).size / 1024)

  return {
    file: path.basename(inputPath),
    origSize: { w, h },
    cropped: { w: cropW, h: cropH },
    outKb,
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const inputDir = process.argv[2]
  const outputDir = process.argv[3]

  if (!inputDir || !outputDir) {
    console.error('Usage: ts-node scripts/pad-to-square.ts <input_dir> <output_dir>')
    process.exit(1)
  }

  if (!fs.existsSync(inputDir)) {
    console.error(`Input directory not found: ${inputDir}`)
    process.exit(1)
  }

  fs.mkdirSync(outputDir, { recursive: true })

  const files = fs.readdirSync(inputDir).filter(f =>
    SUPPORTED_EXTS.has(path.extname(f).toLowerCase())
  )

  console.log(`Found ${files.length} files in ${inputDir}`)
  console.log(`Output: ${outputDir}\n`)

  let processed = 0
  let skipped = 0
  let errors = 0

  for (const file of files) {
    const inputPath = path.join(inputDir, file)
    const outputName = path.parse(file).name + '.webp'
    const outputPath = path.join(outputDir, outputName)

    // Skip if output is newer than input (как optimize-images.ts)
    if (fs.existsSync(outputPath)) {
      const srcStat = fs.statSync(inputPath)
      const dstStat = fs.statSync(outputPath)
      if (dstStat.mtimeMs >= srcStat.mtimeMs) {
        skipped++
        continue
      }
    }

    try {
      const r = await processOne(inputPath, outputPath)
      const o = `${r.origSize.w}×${r.origSize.h}`
      const c = `${r.cropped.w}×${r.cropped.h}`
      const tag = (r.cropped.w !== r.origSize.w || r.cropped.h !== r.origSize.h) ? 'CROP' : '    '
      console.log(`  ${tag}  ${o.padStart(11)} → ${c.padStart(11)}  ${r.outKb.toString().padStart(4)}K  ${file.slice(0, 60)}`)
      processed++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ERROR  ${file}: ${msg}`)
      errors++
    }
  }

  console.log(`\nDone: ${processed} processed, ${skipped} skipped (already up-to-date), ${errors} errors`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
