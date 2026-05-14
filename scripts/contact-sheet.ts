/**
 * Contact-sheet builder — временный инструмент для визуальной приёмки результатов pad-to-square.
 *
 * Два режима:
 *   1) Pairs — originals_dir непустой. Каждая строка = одна пара "оригинал | результат",
 *      имя файла мелким текстом сверху. Удобно для 10-20 файлов.
 *   2) Grid-only — originals_dir = "". Сетка только результатов по GRID_COLS колонок,
 *      имена файлов (укороченные) под каждым превью. При count > MAX_PER_SHEET
 *      автоматически разбивается на несколько файлов: <stem>-1.png, <stem>-2.png, ...
 *
 * Usage:
 *   ts-node scripts/contact-sheet.ts <originals_dir|""> <results_dir> <output_path>
 *
 * NB: это не production-скрипт. Используется только для ручной проверки при
 * интеграции R-padded. После приёмки 644 файлов может быть удалён.
 */
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

// ── Параметры ────────────────────────────────────────────────────────────────
const THUMB = 256
const GAP = 8
const LABEL_H = 18
const BG = { r: 26, g: 26, b: 26 }       // тот же цвет что в карточке каталога
const SHEET_BG = { r: 15, g: 15, b: 15 }
const GRID_COLS = 6
const MAX_PER_SHEET = 200                 // split grid на chunks если больше
const ORIG_EXTS = new Set(['.webp', '.png', '.jpg', '.jpeg'])
const RESULT_EXTS = new Set(['.webp'])      // pad-to-square пишет только webp; исключает сам contact-sheet

// ── Хелперы ──────────────────────────────────────────────────────────────────
function listImages(dir: string, exts: Set<string>): string[] {
  if (!dir || !fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => exts.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function truncateLabel(name: string, maxChars: number): string {
  return name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name
}

async function thumbnail(filePath: string): Promise<Buffer> {
  return await sharp(filePath)
    .resize(THUMB, THUMB, { fit: 'contain', background: BG })
    .png()
    .toBuffer()
}

function labelSvg(text: string, width: number): Buffer {
  const safe = escapeXml(truncateLabel(text, Math.floor(width / 6)))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL_H}">
    <rect width="100%" height="100%" fill="rgb(15,15,15)"/>
    <text x="4" y="${LABEL_H - 5}" font-family="Consolas, 'Courier New', monospace" font-size="11" fill="rgb(200,200,200)">${safe}</text>
  </svg>`
  return Buffer.from(svg)
}

function basenameNoExt(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

// ── Pairs mode ───────────────────────────────────────────────────────────────
interface Pair { name: string; origPath: string | null; resultPath: string }

async function buildPairsSheet(pairs: Pair[], outPath: string): Promise<void> {
  const rowW = THUMB * 2 + GAP
  const rowH = LABEL_H + GAP + THUMB
  const totalH = pairs.length * (rowH + GAP)
  const canvas = sharp({ create: { width: rowW, height: totalH, channels: 3, background: SHEET_BG } })

  const composites: sharp.OverlayOptions[] = []
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i]!
    const top = i * (rowH + GAP)
    composites.push({ input: labelSvg(p.name, rowW), top, left: 0 })
    if (p.origPath) {
      composites.push({ input: await thumbnail(p.origPath), top: top + LABEL_H + GAP, left: 0 })
    }
    composites.push({ input: await thumbnail(p.resultPath), top: top + LABEL_H + GAP, left: THUMB + GAP })
  }

  await canvas.composite(composites).png().toFile(outPath)
}

// ── Grid mode ────────────────────────────────────────────────────────────────
async function buildGridSheet(resultPaths: { name: string; full: string }[], outPath: string): Promise<void> {
  const cols = GRID_COLS
  const rows = Math.ceil(resultPaths.length / cols)
  const cellW = THUMB
  const cellH = LABEL_H + GAP + THUMB
  const totalW = cols * cellW + (cols - 1) * GAP
  const totalH = rows * cellH + (rows - 1) * GAP
  const canvas = sharp({ create: { width: totalW, height: totalH, channels: 3, background: SHEET_BG } })

  const composites: sharp.OverlayOptions[] = []
  for (let i = 0; i < resultPaths.length; i++) {
    const r = resultPaths[i]!
    const col = i % cols
    const row = Math.floor(i / cols)
    const left = col * (cellW + GAP)
    const top = row * (cellH + GAP)
    composites.push({ input: labelSvg(r.name, cellW), top, left })
    composites.push({ input: await thumbnail(r.full), top: top + LABEL_H + GAP, left })
  }

  await canvas.composite(composites).png().toFile(outPath)
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length !== 3) {
    console.error('Usage: ts-node scripts/contact-sheet.ts <originals_dir|""> <results_dir> <output_path>')
    process.exit(1)
  }
  const [origDir, resultsDir, outPath] = args as [string, string, string]

  if (!fs.existsSync(resultsDir)) {
    console.error(`Results dir does not exist: ${resultsDir}`)
    process.exit(1)
  }

  const resultFiles = listImages(resultsDir, RESULT_EXTS)
  if (resultFiles.length === 0) {
    console.error(`No .webp images found in ${resultsDir}`)
    process.exit(1)
  }

  if (origDir) {
    const origFiles = listImages(origDir, ORIG_EXTS)
    const origByStem = new Map<string, string>()
    for (const f of origFiles) origByStem.set(basenameNoExt(f), path.join(origDir, f))

    const pairs: Pair[] = resultFiles.map((f) => ({
      name: f,
      origPath: origByStem.get(basenameNoExt(f)) ?? null,
      resultPath: path.join(resultsDir, f),
    }))

    console.log(`Pairs mode: ${pairs.length} pairs → ${outPath}`)
    await buildPairsSheet(pairs, outPath)
    const stat = fs.statSync(outPath)
    console.log(`Wrote ${outPath} (${(stat.size / 1024).toFixed(1)} KB)`)
    return
  }

  const entries = resultFiles.map((f) => ({ name: f, full: path.join(resultsDir, f) }))
  console.log(`Grid mode: ${entries.length} images`)

  if (entries.length <= MAX_PER_SHEET) {
    await buildGridSheet(entries, outPath)
    const stat = fs.statSync(outPath)
    console.log(`Wrote ${outPath} (${(stat.size / 1024).toFixed(1)} KB)`)
    return
  }

  const ext = path.extname(outPath) || '.png'
  const stem = outPath.slice(0, outPath.length - ext.length)
  const chunks = Math.ceil(entries.length / MAX_PER_SHEET)
  for (let i = 0; i < chunks; i++) {
    const slice = entries.slice(i * MAX_PER_SHEET, (i + 1) * MAX_PER_SHEET)
    const chunkPath = `${stem}-${i + 1}${ext}`
    await buildGridSheet(slice, chunkPath)
    const stat = fs.statSync(chunkPath)
    console.log(`Wrote ${chunkPath} (${slice.length} thumbs, ${(stat.size / 1024).toFixed(1)} KB)`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
