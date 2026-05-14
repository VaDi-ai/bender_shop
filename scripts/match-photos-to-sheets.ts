/**
 * Match product photos to Google Sheets rows.
 *
 * Алгоритм:
 *   1. Парсим имя каждого файла в семантические поля (brand, family, size, color, etc.)
 *      — per-brand парсеры (Apple Watch / iPhone / Samsung / Dyson / generic).
 *   2. Для каждой строки Sheets берём готовые поля (Бренд / Категория / Цвет / Размер).
 *   3. Группируем строки в Map<key, row[]> где key = "brand|family|size|color".
 *   4. Для каждого фото:
 *        — точный match (все 4 поля) → confidence 100, URL в колонку Q.
 *        — partial match (3 из 4) → confidence 75, URL в колонку Q + помечаем для ревью.
 *        — иначе → нет матча, попадает в orphans.csv.
 *   5. Сохраняем обновлённый xlsx + два отчёта (matched.csv, orphans.csv).
 *
 * Использование:
 *   ts-node scripts/match-photos-to-sheets.ts <photos_dir> <input_xlsx> <output_dir> <base_url>
 *
 * Например:
 *   ts-node scripts/match-photos-to-sheets.ts \
 *     ./photos-processed \
 *     ./Товарное_наличие.xlsx \
 *     ./match-output \
 *     https://bendershop.store/photos
 *
 * На выходе в output_dir:
 *   - Товарное_наличие_with_photos.xlsx (с заполненной колонкой Q)
 *   - matched.csv (фото → строки Sheets, с confidence)
 *   - orphans.csv (фото без надёжного матча — для ручного разбора)
 *   - unmatched_rows.csv (строки Sheets, для которых не нашлось фото)
 */
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'

// ── Типы ─────────────────────────────────────────────────────────────────────
interface PhotoMeta {
  filename: string
  brand: string           // нормализованный: 'Apple', 'Samsung', 'Sony', etc.
  family: string          // 'apple watch s11', 'iphone 17 pro max', 'galaxy s25 edge'
  size: string            // '42mm', '46mm', '6.9inch', '' (если не определён)
  color: string           // нормализованный: 'jet black', 'silver', 'titanium natural'
  cellular: boolean | null // null = неизвестно, true/false для Watch
}

interface SheetRow {
  rowIdx: number          // 1-based в xlsx (с заголовком — 2й и далее)
  brand: string
  category: string
  fullName: string
  color: string
  size: string
  family: string          // вычисляется из category + first words of fullName
}

interface MatchResult {
  photo: string
  rows: number[]          // rowIdx'ы которым подходит это фото
  confidence: number      // 0-100
  reason: string
}

// ── Нормализация ─────────────────────────────────────────────────────────────

const BRAND_FROM_FOLDER: Record<string, string> = {
  'Apple Stock': 'Apple',
  'Samsung Stock': 'Samsung',
  'Sony Stock': 'Sony',
  'Oculus Stock': 'Meta',
  'dyson Stock': 'Dyson',
  'Dji': 'DJI',
  'Nintendo': 'Nintendo',
  'GoPro': 'GoPro',
  'Valve Steam Deck': 'Valve',
  'Xbox X': 'Microsoft',
}

/** Нормализует цвет: 'Jet Black', 'jetblack', 'jet-black' → 'jet black' */
function normColor(s: string): string {
  return s
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Раскладывает слитные цвета: 'jetblack' → 'jet black', 'spacegray' → 'space gray', etc. */
function splitGluedColor(s: string): string {
  return s
    .replace(/jetblack/gi, 'jet black')
    .replace(/spacegray/gi, 'space gray')
    .replace(/spaceblack/gi, 'space black')
    .replace(/rosegold/gi, 'rose gold')
    .replace(/lightgold/gi, 'light gold')
    .replace(/skyblue/gi, 'sky blue')
    .replace(/icyblue/gi, 'icy blue')
    .replace(/starlight/gi, 'starlight')
    .replace(/midnight/gi, 'midnight')
    .replace(/titaniumnatural/gi, 'titanium natural')
}

/** Нормализует размер: '42', '42mm', '42 mm' → '42mm' */
function normSize(s: string): string {
  const m = s.match(/(\d+(?:\.\d+)?)\s*mm/i)
  if (m) return `${m[1]}mm`
  const inch = s.match(/(\d+(?:\.\d+)?)\s*(?:inch|"|')/i)
  if (inch) return `${inch[1]}inch`
  return s.trim().toLowerCase()
}

// ── Парсеры имён файлов ──────────────────────────────────────────────────────

/**
 * Нормализует имя файла: подчёркивания в "человеческих" сегментах превращает в
 * пробелы. Это нужно потому что Windows / file uploaders часто заменяют пробелы
 * на `_`. Но мы оставляем `_` в технических сегментах (содержат `-` или `+` —
 * признак машинного имени типа `watch-case-42-aluminum-silver-nc`).
 */
function normalizeFilename(filename: string): string {
  const parts = filename.split('__')
  return parts.map(p => {
    // Если сегмент содержит дефис или плюс — это machine ID, оставляем как есть
    if (/[-+]/.test(p)) return p
    // Иначе — заменяем _ на пробел
    return p.replace(/_/g, ' ')
  }).join('__')
}

/**
 * Apple Watch parser. Имя:
 *   "Apple Stock__Apple Watch Stock__S11__MGHY4_VW_34FR+watch-case-42-titanium-natural-cell-s11_..."
 *
 * Извлекаем: family = 'apple watch s11', size = '42mm',
 * color = 'titanium natural', cellular = true (по 'cell' vs 'nc')
 */
function parseAppleWatch(filename: string): PhotoMeta | null {
  if (!/Apple Watch/i.test(filename)) return null
  const stem = filename.replace(/\.png$/i, '')
  const parts = stem.split('__')
  // parts[2] = серия (S11, SE3, Ultra 3, ...)
  const seriesRaw = parts[2] ?? ''
  const detail = parts[3] ?? ''

  // case-{size}-{material}-{color1}-{color2?}-{cell|nc}-{series}
  const caseMatch = detail.match(/case-(\d+)-(aluminum|titanium|stainless)-([a-z]+(?:-[a-z]+)?)-(cell|nc)/i)

  let size = ''
  let color = ''
  let cellular: boolean | null = null

  if (caseMatch) {
    size = `${caseMatch[1]}mm`
    color = splitGluedColor(caseMatch[3]!.replace(/-/g, ' '))
    cellular = caseMatch[4]!.toLowerCase() === 'cell'
  } else {
    // fallback: имена типа "S11 Gold Titanium" или "Ultra 3 Black AL Black"
    const detailNorm = splitGluedColor(detail.toLowerCase())
    // Колоры частые: gold, silver, black, blue, midnight, starlight, jet black, etc.
    const colorMatch = detailNorm.match(/(jet black|space gray|rose gold|titanium natural|midnight|starlight|silver|gold|black|blue|natural|slate|charcoal)/i)
    if (colorMatch) color = normColor(colorMatch[1]!)
  }

  // family
  const seriesNorm = seriesRaw
    .toLowerCase()
    .replace(/^series\s*/, 's')
    .replace(/\s+/g, ' ')
    .trim()
  const family = `apple watch ${seriesNorm}`.trim()

  return { filename, brand: 'Apple', family, size, color, cellular }
}

/**
 * iPhone parser. Имя:
 *   "Apple Stock__iPhone Stock__iPhone 17 Stock__iPhone 17 Pro Max__17 Pro Max Silver__iphone-17-pro-finish-select-202509-6-9inch-silver_AV3"
 *
 * parts[3] = модель (iPhone 17 Pro Max), parts[4] = вариант с цветом (17 Pro Max Silver)
 */
function parseIphone(filename: string): PhotoMeta | null {
  if (!/iPhone/i.test(filename) || /Чехол|Case|TechWoven/i.test(filename)) return null
  const stem = filename.replace(/\.png$/i, '')
  const parts = stem.split('__')
  if (parts.length < 4) return null

  const modelRaw = parts[3] ?? ''  // 'iPhone 17 Pro Max', 'iPhone 17 Air'
  const variantRaw = parts[4] ?? ''  // '17 Pro Max Silver', 'iPhone Air Black'
  const techDetail = parts[5] ?? ''

  // family normalize
  let family = modelRaw.toLowerCase().replace(/iphone\s*/i, '').trim()
  family = `iphone ${family}`.replace(/\s+/g, ' ').trim()

  // size: ищем Xinch / X.Y inch в техническом детале
  let size = ''
  const sizeMatch = techDetail.match(/(\d+(?:-\d+)?)inch/i)
  if (sizeMatch) {
    // 6-9inch → 6.9inch
    size = sizeMatch[1]!.replace(/-/, '.') + 'inch'
  }

  // color: пытаемся вытащить из variantRaw (обычно последнее слово/фраза после модели)
  let color = ''
  const variantNorm = splitGluedColor(variantRaw.toLowerCase())
  // удалим model-tokens
  const tail = variantNorm
    .replace(/iphone\s*/g, '')
    .replace(/^\d+\s+/, '')      // "17 "
    .replace(/^(pro\s+max|pro|air|plus|mini)\s*/g, '')
    .trim()
  if (tail) color = normColor(tail)

  return { filename, brand: 'Apple', family, size, color, cellular: null }
}

/**
 * Samsung Galaxy S parser. Имя:
 *   "Samsung Stock__Galaxy S Stock__Galaxy S25__S25 Edge__S25 Edge Titanium icyBlue__noise..."
 *
 * parts[2]=Galaxy S25, parts[3]=Variant (S25 Edge / S25 Ultra), parts[4]=Variant + Color
 */
function parseSamsungGalaxyS(filename: string): PhotoMeta | null {
  if (!/Galaxy S Stock/i.test(filename)) return null
  const stem = filename.replace(/\.png$/i, '')
  const parts = stem.split('__')
  if (parts.length < 4) return null

  const variantRaw = parts[3] ?? ''   // 'S25 Edge', 'S25 Ultra'
  const colorRaw = parts[4] ?? ''     // 'S25 Edge Titanium icyBlue'

  // family
  const family = `galaxy ${variantRaw.toLowerCase().replace(/\s+/g, ' ').trim()}`

  // color: убираем variantRaw из colorRaw, нормализуем
  let color = colorRaw.toLowerCase()
  for (const tok of variantRaw.toLowerCase().split(/\s+/)) {
    color = color.replace(new RegExp(`\\b${tok}\\b`, 'g'), '')
  }
  color = splitGluedColor(color).replace(/titanium/gi, '').replace(/\s+/g, ' ').trim()
  color = normColor(color)

  return { filename, brand: 'Samsung', family, size: '', color, cellular: null }
}

/**
 * Dyson parser. Имя:
 *   "dyson Stock__HS05__blue-cooper.png"
 *
 * parts[1]=Model code (HS05, HT01), parts[2]=color tokens
 */
function parseDyson(filename: string): PhotoMeta | null {
  if (!/^dyson Stock/i.test(filename)) return null
  const stem = filename.replace(/\.png$/i, '')
  const parts = stem.split('__')
  const modelCode = (parts[1] ?? '').toUpperCase()
  const colorRaw = parts[2] ?? ''

  const family = `dyson ${modelCode}`.toLowerCase()
  const color = normColor(colorRaw)

  return { filename, brand: 'Dyson', family, size: '', color, cellular: null }
}

/**
 * Generic fallback. Берём самый специфичный (=самый длинный по уровню вложенности)
 * "человеческий" сегмент как family, исключая технические концовки.
 *
 * Apple Stock__iPad Stock__iPad Air__iPad Air 11__... → family = "ipad air 11"
 * Samsung Stock__Galaxy Buds Stock__Galaxy Buds 4 Pro__... → "galaxy buds 4 pro"
 * dyson Stock__HT01__blue-cooper.png → family "ht01" (parts[1] для коротких имён)
 *
 * Цвет пытаемся извлечь по common-pattern из последних сегментов и из tech-detail
 * (типа "...starlight.png" или "...silver-256gb.png"). Если не находим — пусто,
 * матчинг будет идти через prefix без цвета.
 */
function parseGeneric(filename: string): PhotoMeta | null {
  const stem = filename.replace(/\.png$/i, '')
  const parts = stem.split('__')
  const folderBrand = parts[0] ?? ''
  const brand = BRAND_FROM_FOLDER[folderBrand] ?? folderBrand

  // Найти самый последний "человеческий" сегмент
  let family = ''
  let familyIdx = -1
  for (let i = parts.length - 1; i >= 1; i--) {
    const p = parts[i] ?? ''
    if (/[-+]/.test(p)) continue                   // технический ID
    if (/^[a-f0-9]{16,}/i.test(p)) continue        // хеш
    if (p.length > 40 && /\d.*[a-z]|[a-z].*\d/i.test(p)) continue  // длинный machineID
    family = p.toLowerCase().replace(/\s+/g, ' ').trim()
    familyIdx = i
    break
  }
  family = family.replace(/\s+stock$/i, '').trim()

  // Попытка извлечь цвет:
  // 1) tech-detail типа "...gallery-202405-11inch-starlight" — берём последний токен после дефиса
  // 2) parts[2] часто содержит цвет в конце: "S25 Edge Titanium icyBlue" → "icyBlue"
  // 3) parts[1] для коротких имён типа "blue-cooper" (Dyson)
  let color = ''
  const COMMON_COLORS = /\b(jet ?black|space ?gray|space ?black|rose ?gold|sky ?blue|icy ?blue|light ?gold|titanium natural|midnight|starlight|silver|gold|black|white|blue|red|green|pink|purple|orange|yellow|gray|grey|natural|slate|charcoal|copper|bronze|nickel|ceramic|topaz|amber|jasper|prussian|vinca|teal|graphite|sand|olive|navy|cream)\b/i

  // Source 1: последняя часть стема после всех __ (tech-detail)
  const lastPart = parts[parts.length - 1] ?? ''
  const techMatch = lastPart.match(COMMON_COLORS)
  if (techMatch) color = splitGluedColor(techMatch[0]!.toLowerCase())

  // Source 2: parts после family — иногда это вариант с цветом
  if (!color && familyIdx > 0 && familyIdx + 1 < parts.length - 1) {
    const variant = parts[familyIdx + 1] ?? ''
    const variantMatch = splitGluedColor(variant.toLowerCase()).match(COMMON_COLORS)
    if (variantMatch) color = variantMatch[0]!
  }

  // Source 3: для очень коротких структур (Dyson) — parts[2] это уже цвет
  if (!color && parts.length === 3) {
    const colorPart = (parts[2] ?? '').replace(/-/g, ' ').toLowerCase()
    const m = colorPart.match(COMMON_COLORS)
    if (m) color = m[0]!
    else if (colorPart) color = normColor(colorPart)
  }

  return { filename, brand, family, size: '', color: normColor(color), cellular: null }
}

const PARSERS: Array<(f: string) => PhotoMeta | null> = [
  parseAppleWatch,
  parseIphone,
  parseSamsungGalaxyS,
  parseDyson,
  parseGeneric,
]

function parsePhoto(filename: string): PhotoMeta {
  const normalized = normalizeFilename(filename)
  for (const parser of PARSERS) {
    const result = parser(normalized)
    if (result) {
      // возвращаем оригинальный filename для URL, но с распарсенными полями
      return { ...result, filename }
    }
  }
  // unreachable — generic всегда возвращает что-то
  throw new Error(`No parser matched ${filename}`)
}

// ── Парсер строк Sheets ──────────────────────────────────────────────────────

/**
 * Извлекает family из строки Sheets.
 * Apple Watch: "Apple Watch S11 42 Jet Black ..." → "apple watch s11"
 * iPhone: "iPhone 17 Pro Max 256GB ..." → "iphone 17 pro max"
 * Galaxy S: "Galaxy S25 Edge ..." → "galaxy s25 edge"
 * Dyson: "Dyson HS05 Airwrap ..." → "dyson hs05"
 */
function extractFamily(brand: string, category: string, fullName: string): string {
  let name = fullName
    .toLowerCase()
    .replace(/\bseries\s+(\d+)\b/gi, 's$1')

  if (brand === 'Apple') {
    if (/apple watch/i.test(name)) {
      const m = name.match(/apple watch\s+(s\d+|se\s*\d*|ultra\s*\d*)/i)
      if (m) return `apple watch ${m[1]!.replace(/\s+/g, ' ').trim()}`
      return 'apple watch'
    }
    if (/iphone/i.test(name)) {
      // iPhone 17 Pro Max / iPhone Air / iPhone 16e
      const m = name.match(/iphone\s+(\d+\s*(?:e|pro\s*max|pro|plus|mini|air)?|air)/i)
      if (m) return `iphone ${m[1]!.trim()}`.replace(/\s+/g, ' ').trim()
    }
    if (/macbook/i.test(name)) {
      const m = name.match(/macbook\s+(air|pro|neo)/i)
      if (m) return `macbook ${m[1]!.toLowerCase()}`
    }
    if (/ipad/i.test(name)) {
      const m = name.match(/ipad\s+(air|pro|mini)?/i)
      return m && m[1] ? `ipad ${m[1].toLowerCase()}` : 'ipad'
    }
  }

  if (brand === 'Samsung') {
    const m = name.match(/galaxy\s+(s\d+(?:\s+(?:edge|ultra|fe|plus))?)/i)
    if (m) return `galaxy ${m[1]!.toLowerCase().replace(/\s+/g, ' ').trim()}`
  }

  if (brand === 'Dyson') {
    const m = name.match(/(hs\d+|ht\d+|sv\d+|v\d+)/i)
    if (m) return `dyson ${m[1]!.toLowerCase()}`
  }

  // Fallback: brand + первые 2-3 слова. Если первое слово имени уже совпадает
  // с брендом (Samsung Galaxy / Dyson HD17 / GoPro Hero) — не дублируем.
  const words = name.split(/\s+/).filter(w => w.length > 0).slice(0, 3)
  const lowerBrand = brand.toLowerCase()
  if (words[0] && words[0].toLowerCase() === lowerBrand) {
    return words.join(' ')
  }
  return `${lowerBrand} ${words.join(' ')}`.trim()
}

// ── Matching engine ──────────────────────────────────────────────────────────

/** Composite key для группировки: brand|family|size|color */
function makeKey(brand: string, family: string, size: string, color: string): string {
  return `${brand.toLowerCase()}|${family.toLowerCase()}|${size.toLowerCase()}|${normColor(color)}`
}

function matchPhoto(photo: PhotoMeta, byKey: Map<string, SheetRow[]>): MatchResult {
  // 1) Точный match (4 поля)
  const exactKey = makeKey(photo.brand, photo.family, photo.size, photo.color)
  const exact = byKey.get(exactKey)
  if (exact && exact.length > 0) {
    return {
      photo: photo.filename,
      rows: exact.map(r => r.rowIdx),
      confidence: 100,
      reason: 'exact (brand+family+size+color)',
    }
  }

  // 2) Match без size (для брендов где размер не извлёк)
  if (!photo.size) {
    const noSize = makeKey(photo.brand, photo.family, '', photo.color)
    const noSizeMatches = byKey.get(noSize)
    if (noSizeMatches && noSizeMatches.length > 0) {
      return {
        photo: photo.filename,
        rows: noSizeMatches.map(r => r.rowIdx),
        confidence: 85,
        reason: 'match without size',
      }
    }
  }

  // 3) Partial: family + color, любой size — суммируем все matching rows
  if (photo.family && photo.color) {
    const partial: SheetRow[] = []
    for (const [key, rows] of byKey.entries()) {
      const [b, f, , c] = key.split('|')
      if (b === photo.brand.toLowerCase() && f === photo.family.toLowerCase() && c === normColor(photo.color)) {
        partial.push(...rows)
      }
    }
    if (partial.length > 0) {
      return {
        photo: photo.filename,
        rows: partial.map(r => r.rowIdx),
        confidence: 75,
        reason: 'family+color (no size match)',
      }
    }
  }

  // 3.5) Prefix family match: photo.family и sheet.family отличаются глубиной
  //      ("galaxy buds 4 pro" vs "galaxy buds 4", "ipad air 11" vs "ipad air").
  //      Если один начинается с другого — считаем это family-уровневым match.
  //      + цвет: если совпал — conf 70, иначе 45.
  if (photo.family) {
    const photoFam = photo.family.toLowerCase()
    const photoColor = normColor(photo.color)
    const prefixWithColor: SheetRow[] = []
    const prefixOnly: SheetRow[] = []
    for (const [key, rows] of byKey.entries()) {
      const [b, f, , c] = key.split('|')
      if (b !== photo.brand.toLowerCase()) continue
      const sheetFam = f ?? ''
      // одно семейство — префикс другого, минимум 2 общих слова
      const matches = (
        sheetFam.startsWith(photoFam + ' ') ||
        photoFam.startsWith(sheetFam + ' ') ||
        sheetFam === photoFam
      ) && (sheetFam.split(' ').length >= 2 || photoFam.split(' ').length >= 2)
      if (!matches) continue
      if (photoColor && c === photoColor) prefixWithColor.push(...rows)
      else prefixOnly.push(...rows)
    }
    if (prefixWithColor.length > 0) {
      return {
        photo: photo.filename,
        rows: prefixWithColor.map(r => r.rowIdx),
        confidence: 70,
        reason: 'family prefix match + color',
      }
    }
    if (prefixOnly.length > 0) {
      return {
        photo: photo.filename,
        rows: prefixOnly.map(r => r.rowIdx),
        confidence: 45,
        reason: 'family prefix match (no color)',
      }
    }
  }

  // 4) Fallback: только family — фото "относится к этому семейству, цвет не совпал"
  if (photo.family) {
    const familyOnly: SheetRow[] = []
    for (const [key, rows] of byKey.entries()) {
      const [b, f] = key.split('|')
      if (b === photo.brand.toLowerCase() && f === photo.family.toLowerCase()) {
        familyOnly.push(...rows)
      }
    }
    if (familyOnly.length > 0) {
      return {
        photo: photo.filename,
        rows: familyOnly.map(r => r.rowIdx),
        confidence: 50,
        reason: 'family only (color/size missed)',
      }
    }
  }

  return { photo: photo.filename, rows: [], confidence: 0, reason: 'no match' }
}

// ── Загрузка xlsx ────────────────────────────────────────────────────────────

async function loadSheet(xlsxPath: string): Promise<{
  workbook: ExcelJS.Workbook
  worksheet: ExcelJS.Worksheet
  rows: SheetRow[]
  cols: { name: string; idx: number }[]
}> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsxPath)
  const ws = wb.getWorksheet('Лист1') ?? wb.worksheets[0]
  if (!ws) throw new Error('No worksheet found in xlsx')

  // header row = 1
  const header = ws.getRow(1)
  const findCol = (...names: string[]): number => {
    for (let i = 1; i <= header.cellCount; i++) {
      const v = String(header.getCell(i).value ?? '').trim()
      if (names.some(n => v === n)) return i
    }
    return -1
  }
  const cols = {
    brand: findCol('Бренд', 'Brand'),
    category: findCol('Категория', 'Category'),
    fullName: findCol('Название модели', 'Название', 'Model'),
    color: findCol('Цвет', 'Color'),
    size: findCol('Размер', 'Size'),
    photo: findCol('Фото', 'Photo'),
  }
  for (const [k, v] of Object.entries(cols)) {
    if (v < 0) throw new Error(`Column not found: ${k}`)
  }

  const rows: SheetRow[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const brand = String(row.getCell(cols.brand).value ?? '').trim()
    const fullName = String(row.getCell(cols.fullName).value ?? '').trim()
    if (!brand || !fullName) continue
    const category = String(row.getCell(cols.category).value ?? '').trim()
    const color = String(row.getCell(cols.color).value ?? '').trim()
    const size = String(row.getCell(cols.size).value ?? '').trim()
    rows.push({
      rowIdx: r,
      brand,
      category,
      fullName,
      color,
      size: normSize(size),
      family: extractFamily(brand, category, fullName),
    })
  }

  return {
    workbook: wb,
    worksheet: ws,
    rows,
    cols: [
      { name: 'photo', idx: cols.photo },
    ],
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const photosDir = process.argv[2]
  const xlsxPath = process.argv[3]
  const outputDir = process.argv[4]
  const baseUrl = process.argv[5]

  if (!photosDir || !xlsxPath || !outputDir || !baseUrl) {
    console.error('Usage: ts-node scripts/match-photos-to-sheets.ts <photos_dir> <input_xlsx> <output_dir> <base_url>')
    console.error('Example:')
    console.error('  ts-node scripts/match-photos-to-sheets.ts ./photos ./prices.xlsx ./out https://bendershop.store/photos')
    process.exit(1)
  }

  if (!fs.existsSync(photosDir)) {
    console.error(`Photos dir not found: ${photosDir}`)
    process.exit(1)
  }
  if (!fs.existsSync(xlsxPath)) {
    console.error(`xlsx not found: ${xlsxPath}`)
    process.exit(1)
  }
  fs.mkdirSync(outputDir, { recursive: true })

  // 1. Загрузить и распарсить фото
  const photoFiles = fs.readdirSync(photosDir).filter(f => /\.(png|webp|jpg|jpeg)$/i.test(f))
  console.log(`Photos: ${photoFiles.length}`)
  const photos = photoFiles.map(f => parsePhoto(f))

  // 2. Загрузить и распарсить Sheets
  console.log(`Loading ${xlsxPath}...`)
  const { workbook, worksheet, rows, cols } = await loadSheet(xlsxPath)
  console.log(`Sheet rows: ${rows.length}`)

  // 3. Сгруппировать строки по composite key
  const byKey = new Map<string, SheetRow[]>()
  for (const row of rows) {
    const key = makeKey(row.brand, row.family, row.size, row.color)
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }
  console.log(`Unique keys in sheet: ${byKey.size}`)

  // 4. Match каждое фото
  const matches: MatchResult[] = photos.map(p => matchPhoto(p, byKey))

  // 5. Распределить по статусам
  const matchedRowIds = new Set<number>()
  const photoCol = cols.find(c => c.name === 'photo')!.idx
  let writtenCount = 0
  let exactConf = 0, midConf = 0, prefixConf = 0, lowConf = 0, none = 0

  for (const m of matches) {
    if (m.confidence === 0) { none++; continue }
    if (m.confidence >= 100) exactConf++
    else if (m.confidence >= 75) midConf++
    else if (m.confidence >= 70) prefixConf++
    else lowConf++

    // Высокая+средняя+prefix-with-color уверенность пишет URL в xlsx
    if (m.confidence >= 70) {
      const url = `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(m.photo).replace(/\.png$/i, '.webp')}`
      for (const rIdx of m.rows) {
        const cell = worksheet.getRow(rIdx).getCell(photoCol)
        const existing = String(cell.value ?? '').trim()
        // если в ячейке уже что-то есть — добавляем через запятую (поддерживается parsePhotoUrls)
        cell.value = existing ? `${existing}, ${url}` : url
        matchedRowIds.add(rIdx)
        writtenCount++
      }
    }
  }

  // 6. Сохранить xlsx
  const outXlsx = path.join(outputDir, path.basename(xlsxPath, '.xlsx') + '_with_photos.xlsx')
  await workbook.xlsx.writeFile(outXlsx)

  // 7. Отчёты
  const matchedCsv = ['filename,confidence,reason,row_indices,row_names']
  const orphansCsv = ['filename,brand,family,size,color,reason']
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i]!
    const m = matches[i]!
    if (m.confidence >= 70) {
      const names = m.rows.slice(0, 3).map(r => rows.find(row => row.rowIdx === r)?.fullName ?? '?').join(' | ')
      matchedCsv.push(`"${p.filename}",${m.confidence},"${m.reason}","${m.rows.join(';')}","${names}"`)
    } else {
      orphansCsv.push(`"${p.filename}","${p.brand}","${p.family}","${p.size}","${p.color}","${m.reason}"`)
    }
  }

  // Строки Sheets без фото
  const unmatchedRowsCsv = ['row_idx,brand,category,fullName,color,size,family']
  for (const row of rows) {
    if (!matchedRowIds.has(row.rowIdx)) {
      unmatchedRowsCsv.push(`${row.rowIdx},"${row.brand}","${row.category}","${row.fullName}","${row.color}","${row.size}","${row.family}"`)
    }
  }

  fs.writeFileSync(path.join(outputDir, 'matched.csv'), matchedCsv.join('\n'), 'utf-8')
  fs.writeFileSync(path.join(outputDir, 'orphans.csv'), orphansCsv.join('\n'), 'utf-8')
  fs.writeFileSync(path.join(outputDir, 'unmatched_rows.csv'), unmatchedRowsCsv.join('\n'), 'utf-8')

  // 8. Summary
  console.log('\n=== Match results ===')
  console.log(`  exact (conf 100):           ${exactConf} photos`)
  console.log(`  no-size / family+color (75-85): ${midConf} photos`)
  console.log(`  prefix family + color (70): ${prefixConf} photos`)
  console.log(`  family only (50, NOT written): ${lowConf} photos`)
  console.log(`  no match:                   ${none} photos`)
  console.log(`\n  URLs written: ${writtenCount} (across ${matchedRowIds.size} of ${rows.length} rows)`)
  console.log(`  Coverage: ${(100 * matchedRowIds.size / rows.length).toFixed(1)}% of sheet rows`)
  console.log(`\n  Output:`)
  console.log(`    ${outXlsx}`)
  console.log(`    ${path.join(outputDir, 'matched.csv')}`)
  console.log(`    ${path.join(outputDir, 'orphans.csv')}`)
  console.log(`    ${path.join(outputDir, 'unmatched_rows.csv')}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
