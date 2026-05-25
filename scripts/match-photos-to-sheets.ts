/**
 * Match product photos to Google Sheets rows.
 *
 * Два режима работы:
 *
 * 1) **Offline (xlsx)** — читает скачанный xlsx, пишет обновлённый xlsx + отчёты.
 *      ts-node scripts/match-photos-to-sheets.ts <photos_dir> <input_xlsx> <output_dir> <base_url>
 *
 * 2) **Sheets-direct** — читает строки из Google Sheets через сервисный аккаунт,
 *    пишет URL'ы прямо в колонку Q через batchUpdate API.
 *      ts-node scripts/match-photos-to-sheets.ts <photos_dir> --sheet <output_dir> <base_url> [--write] [--sheet-name=Лист1]
 *
 *      `photos_dir` — это **распакованная папка** с картинками (архив .zip сюда не подставляют,
 *      сначала распаковать, например Apple/Samsung в общий каталог `Фото/`).
 *      Ключ для матчинга и URL: **относительный путь**, сведённый в одно имя:
 *      `Samsung Stock/Galaxy Buds…/pic.png` → `Samsung Stock__Galaxy Buds…__pic.png`
 *      (Samsung часто без `Samsung Stock__` в basename — папки дают бренд).
 *      Дубликат одной и той же плоской строки после flatten → лог, второе пропускается.
 *      Без --write: только отчёты (dry-run). С --write: реально записывает колонку «Фото» (Q по layout).
 *      По умолчанию имя листа берётся из PRODUCT_SHEET_NAME env или 'Лист1'.
 *      --clear-photos: перед матчингом очистить «Фото» у всех данных строк таблицы
 *      (полный переезд на новый сток; иначе URL только дописываются через запятую к старым).
 *
 * Алгоритм:
 *   1. Парсим имя каждого файла в семантические поля (brand, family, size, color, etc.)
 *      — per-brand парсеры (Apple Watch / iPhone / Samsung / Dyson / generic).
 *   2. Для каждой строки берём готовые поля (Бренд / Категория / Цвет / Размер).
 *   3. Группируем строки в Map<key, row[]> где key = "brand|family|size|color".
 *   4. Для каждого фото:
 *        — точный match (все 4 поля) → confidence 100, URL в колонку «Фото».
 *        — частичный / префикс family / только family → ниже порог confidence.
 *        — затем матч по **полному названию строки («Название модели»)** и тексту имени файла
 *          (Dice токены + подстрока), когда имя файла следует имени товара в таблице.
 *        — иначе → нет матча, попадает в orphans.csv.
 *   5. Сохраняем результат через выбранный SheetAdapter + два отчёта (matched.csv, orphans.csv).
 *
 * На выходе в output_dir:
 *   - <name>_with_photos.xlsx (только в offline режиме)
 *   - matched.csv (фото → строки Sheets, с confidence)
 *   - orphans.csv (фото без надёжного матча — для ручного разбора)
 *   - unmatched_rows.csv (строки Sheets, для которых не нашлось фото)
 */
import 'dotenv/config'
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'

import { flattenRelativePhotoPath } from '../lib/photo-flat-name'

/** Как parsePhotoUrls (sheets-sync): вытащить список URL из ячейки для дедупа без зависимости от всего prisma-стека. */
function urlsInCommaPhotoCell(cell: string): string[] {
  const trimmed = (cell ?? '').replace(/^\uFEFF/, '').trim()
  if (!trimmed) return []
  const segments = trimmed.split(/,\s*(?=https?:\/\/|\/[^\s,]+\.(?:webp|png|jpg|jpeg))/i)
  const out: string[] = []
  for (const seg of segments) {
    let p = seg.trim().replace(/^\uFEFF/, '').replace(/^["']+|["']+$/g, '')
    if (!p) continue
    if (/^https?:\/\//i.test(p)) {
      out.push(p)
      continue
    }
    if (p.startsWith('/') && /\.(webp|png|jpg|jpeg)(\?[^\s]*)?$/i.test(p)) out.push(p)
  }
  return out
}

/** Добавить URL без дублей — одна строка не раздувается повторением того же адреса. */
function appendPhotoCellUrl(existingTrimmed: string, url: string): string {
  const cur = urlsInCommaPhotoCell(existingTrimmed)
  if (cur.some(u => u === url)) return existingTrimmed
  return existingTrimmed ? `${existingTrimmed.trimEnd()}, ${url}` : url
}

/** «Galaxy Buds 4» не смешиваем со строками «Buds 4 Pro/FE/+ …» только из-за префикса семейства. */
function galaxyBudsBroadPhotoAgainstSpecificSheet(photoFam: string, sheetFam: string): boolean {
  if (!/\bgalaxy\s+buds\b/.test(photoFam) || !/\bgalaxy\s+buds\b/.test(sheetFam)) return false
  if (!sheetFam.startsWith(photoFam + ' ')) return false
  const remainder = sheetFam.slice(photoFam.length + 1).trimStart()
  if (!remainder) return false
  const ph = photoFam.toLowerCase()
  if (/\bpro\b/i.test(remainder) && !/\bpro\b/.test(ph)) return true
  if (/\bfe\b/i.test(remainder) && !/\bfe\b/.test(ph)) return true
  if (/\blive\b/i.test(remainder) && !/\blive\b/.test(ph)) return true
  if (/\bedge\b/i.test(remainder) && !/\bedge\b/.test(ph)) return true
  if (/\bgalaxy\s+buds\s*\+\b/i.test(sheetFam) && !/\bgalaxy\s+buds\s*\+\b/i.test(ph)) return true
  return false
}

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
  /** Экспорт обработанного стока (подпапка в стейдже) — тот же префикс в имени файла */
  'Apple Stock (Обработка)': 'Apple',
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
  const stem = filename.replace(/\.(png|webp|jpe?g)$/i, '')
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
    const colorMatch = detailNorm.match(/(jet black|space gray|rose gold|titanium natural|midnight|starlight|ultramarine|desert|frost|deep purple|orange|red|green|blue|silver|gold|black|slate|natural|charcoal|pink|yellow|purple|white)/i)
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
  const stem = filename.replace(/\.(png|webp|jpe?g)$/i, '')
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
 * Samsung Galaxy S / S+. Имя часто содержит:
 *   "...__Galaxy S Stock__Galaxy S25__S25 Edge__..."
 * или без «Galaxy S Stock»: "...__Samsung Galaxy S25 Ultra__Phantom Black__...".
 *
 * Если требовать только `Galaxy S Stock`, экспорт без этого сегмента уходит в generic
 * с неверным family → в таблице нет строк Q и на витрине пустые/битые фото.
 */
function parseSamsungGalaxyS(filename: string): PhotoMeta | null {
  const stem = filename.replace(/\.(png|webp|jpe?g)$/i, '')
  const searchable = stem.replace(/_/g, ' ')
  // Только линейка Galaxy S (Fold/A/Buds — другие парсеры / generic)
  if (!/\bGalaxy\s+S\s*\d+/i.test(searchable)) return null

  const fullModel =
    searchable.match(/\bGalaxy\s+S\s*\d+(?:\s+(?:Ultra|Edge|FE|Plus))?\b/i)
  let family =
    fullModel?.[0]!.toLowerCase().replace(/\s+/g, ' ').trim() ?? ''

  // Запасной вариант, если паттерн с модификатором не сработал (редкое имя)
  if (!family) {
    const base = searchable.match(/\bGalaxy\s+S\s*\d+/i)
    if (base) family = `${base[0]!.replace(/\s+/g, ' ').trim()}`.toLowerCase()
  }
  if (!family) return null

  const parts = stem.split('__')

  /** Цвет последних «человеческих» сегментов (CamelCase типа icyBlue режем пробелами) */
  const SAMSUNG_COLOR_HINT =
    /\b(jet\s*black|space\s*gray|space\s*black|rose\s*gold|silver\s*blue|icy\s*blue|phantom\s*black|cream|mint|sand|purple|coffee|brown|bronze|coral|cobalt|\b(light|dark)\s+silver|titanium|graphite|ruby|steel|ocean|snow|mist|pink|taupe|\b(red|orange|lime|yellow|green|grey|gray|silver|gold|natural|copper)\b|\b(red|pink|purple|lime|silver|gold|green|bronze|coral|graphite|white|black)\b\s*(?:titanium)?)\b/i

  let color = ''
  for (let i = parts.length - 1; i >= Math.max(parts.length - 6, 1); i--) {
    let chunk = (parts[i] ?? '').replace(/_/g, ' ')
    if (/^[\s_a-z0-9+.-]*\d+[a-z0-9._+-]{12,}$/i.test(chunk) && /[+.]/.test(chunk)) continue // tech tail
    let ch = chunk
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
    ch = splitGluedColor(ch)

    const modelPieces = family.split(/\s+/)
    for (const tok of modelPieces) {
      if (tok !== 'galaxy' && tok.length > 1) {
        ch = ch.replace(new RegExp(`\\b${tok}\\b`, 'gi'), '')
      }
    }

    const mch = ch.match(SAMSUNG_COLOR_HINT)
    if (mch) {
      color = normColor(mch[0]!.replace(/titanium/gi, ' '))
      color = splitGluedColor(color).replace(/\s+/g, ' ').trim()
      if (color) break
    }
  }

  if (!color) {
    const fromLabel = extractSamsungColorFromMarketingLabel(searchable)
    color = normColor(fromLabel)
  }

  return { filename, brand: 'Samsung', family, size: '', color: normColor(color), cellular: null }
}

/**
 * Маркетинговые имена («Samsung Galaxy Z Fold 7 Jet Black 1.png» без __) и вложение
 * в zip под Samsung Stock__/… Для серии Galaxy S с плоским именем цвет уже подтягивает
 * parseSamsungGalaxyS; здесь главным образом Galaxy Z Fold/Flip.
 */
function parseSamsungGalaxyZFoldFlip(filename: string): PhotoMeta | null {
  const stemRaw = filename.replace(/\.(png|webp|jpe?g)$/i, '')
  const searchable = stemRaw.replace(/__/g, ' ').replace(/\s+/g, ' ').trim()
  if (!/\bGalaxy\s+Z\s+(?:Fold|Flip)/i.test(searchable)) return null

  const syntheticForFamily = searchable
  let family = extractFamily('Samsung', '', syntheticForFamily)
  family = splitGluedColor(family).replace(/\s+/g, ' ').trim()

  const colorRaw = extractSamsungColorFromMarketingLabel(searchable)

  return { filename, brand: 'Samsung', family, size: '', color: normColor(colorRaw), cellular: null }
}

/** HUD/ассеты листинга Samsung (не семейство товара) — игнорируим при выборе family в generic. */
function isSamsungListingNoiseSegment(seg: string): boolean {
  const low = seg.replace(/_/g, ' ').toLowerCase().trim()
  if (!low) return true
  if (/^color\s*selection\b/.test(low)) return true
  if (/^\s*tab\s*$/.test(low)) return true
  if (/\bgallery\s*thumb\b/.test(low)) return true
  if (/^sku[_\s-]/i.test(low)) return true
  if (/^360[_\s-]?view\b/.test(low)) return true
  return false
}

/**
 * Galaxy Buds из дерева вида Stock__Galaxy Buds Stock__Galaxy Buds 4 Pro__…__Color_Selection_….
 * Generic раньше брал последний сегмент → «color selection…» как family → неверный ключ и матч на все цвета.
 */
function parseSamsungGalaxyBuds(filename: string): PhotoMeta | null {
  const stem = filename.replace(/\.(png|webp|jpe?g)$/i, '')
  const searchable = stem.replace(/__/g, ' ').replace(/\s+/g, ' ').trim()
  if (!/\bgalaxy\s+buds\b/i.test(searchable)) return null

  const familyCandidates: RegExp[] = [
    /\bgalaxy\s+buds\s+\d+\s+(?:pro|fe)\b/i,
    /\bgalaxy\s+buds\s+\d+\b/i,
    /\bgalaxy\s+buds\s*\+\b/i,
    /\bgalaxy\s+buds\s+(?:live|edge)\b/i,
    /\bgalaxy\s+buds\s+(?:pro|fe)\b/i,
    /\bgalaxy\s+buds\b/i,
  ]
  let familyRaw = ''
  for (const re of familyCandidates) {
    const m = searchable.match(re)
    if (m?.[0]) {
      familyRaw = m[0]
      break
    }
  }
  const family = familyRaw.toLowerCase().replace(/\s+/g, ' ').trim() || 'galaxy buds'

  const parts = stem.split('__')
  const SAMSUNG_COLOR_HINT =
    /\b(jet\s*black|phantom\s*black|silver\s*blue|sky\s*blue|icy\s*blue|cream|mint|sand|purple|coffee|brown|bronze|coral|cobalt|graphite|ruby|\b(light|dark)\s+silver|ocean|snow|mist|pink|taupe|\b(red|orange|lime|yellow|green|grey|gray|silver|gold|natural|copper)\b|\b(red|pink|purple|lime|silver|gold|green|bronze|coral|graphite|white|black)\b\s*(?:titanium)?)\b/i

  let color = ''
  for (let i = parts.length - 1; i >= Math.max(parts.length - 8, 1); i--) {
    let chunk = (parts[i] ?? '').replace(/_/g, ' ')
    if (isSamsungListingNoiseSegment(chunk)) continue
    if (/[-+]/.test(chunk) && /^[\s_a-z0-9+.-]*\d+[a-z0-9._+-]{8,}$/i.test(chunk.replace(/\s/g, '_'))) continue
    let ch = chunk
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
    ch = splitGluedColor(ch)
    const wordsFam = family.split(/\s+/).filter(w => w.length > 1)
    for (const tok of wordsFam) {
      if (tok !== 'galaxy') {
        ch = ch.replace(new RegExp(`\\b${tok}\\b`, 'gi'), '')
      }
    }
    const mch = ch.match(SAMSUNG_COLOR_HINT)
    if (mch) {
      color = normColor(mch[0]!)
      color = splitGluedColor(color).replace(/\s+/g, ' ').trim()
      if (color) break
    }
  }
  if (!color) {
    color = normColor(extractSamsungColorFromMarketingLabel(searchable))
  }

  return { filename, brand: 'Samsung', family, size: '', color: normColor(color), cellular: null }
}

/** Последнее вхождение цветового маркера (длинную фразу предпочитаем короткой «black»). */
function extractSamsungColorFromMarketingLabel(searchable: string): string {
  const s = searchable.replace(/\s+/g, ' ')
  /** Нестандартные и составные названия палитры Samsung (до одиночных black/gray). */
  const phrasesDesc = [
    'titanium silverblue',
    'titanium whitesilver',
    'titanium pinkgold',
    'titanium black',
    'titanium gray',
    'silver shadow',
    'blue shadow',
    'cobalt violet',
    'sky blue',
    'phantom black',
    'phantom violet',
    'jet black',
    'ice blue',
    'icyblue',
    'silver blue',
    'light gold',
    'rose gold',
    'space gray',
    'product red',
    'midnight ink',
    'deep purple',
  ]
  let best = ''
  let bestLen = 0
  const low = s.toLowerCase()
  for (const ph of phrasesDesc) {
    const idx = low.lastIndexOf(ph)
    if (idx >= 0 && ph.length > bestLen) {
      best = ph
      bestLen = ph.length
    }
  }
  if (!best.length) {
    const mch = low.match(/\b(red|pink|purple|lime|silver|gold|green|bronze|coral|graphite|mint|cream|sand|lavender|navy|violet|white|grey|gray|orange|brown|yellow|natural|taupe|olive)\b(?![a-z])/i)
    if (mch?.[1]) best = String(mch[1])
    else if (/\bblue\b/i.test(low)) best = 'blue'
    else if (/\bblack\b/i.test(low)) best = 'black'
    else return ''
  }
  return splitGluedColor(best).replace(/\s+/g, ' ').trim()
}

/**
 * Dyson parser. Имя:
 *   "dyson Stock__HS05__blue-cooper.png"
 *
 * parts[1]=Model code (HS05, HT01), parts[2]=color tokens
 */
function parseDyson(filename: string): PhotoMeta | null {
  if (!/^dyson Stock/i.test(filename)) return null
  const stem = filename.replace(/\.(png|webp|jpe?g)$/i, '')
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
 *
 * Если первый сегмент — «Apple Stock (Обработка)» и т.п., суффикс убирается для маппинга BRAND_FROM_FOLDER.
 */
function normalizeStockFolderSegment(segment: string): string {
  return segment.replace(/\s*\((Обработка|обработка|processed)\)\s*$/iu, '').trim()
}

function parseGeneric(filename: string): PhotoMeta | null {
  const stem = filename.replace(/\.(png|webp|jpe?g)$/i, '')
  const parts = stem.split('__')
  const folderBrandRaw = parts[0] ?? ''
  const folderBrand = normalizeStockFolderSegment(folderBrandRaw)
  const brand =
    BRAND_FROM_FOLDER[folderBrandRaw] ??
    BRAND_FROM_FOLDER[folderBrand] ??
    folderBrand

  // Найти самый последний "человеческий" сегмент (не шум вида Color_Selection / TAB из листингов Samsung)
  let family = ''
  let familyIdx = -1
  for (let i = parts.length - 1; i >= 1; i--) {
    const p = parts[i] ?? ''
    if (isSamsungListingNoiseSegment(p)) continue
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
  const COMMON_COLORS = /\b(jet ?black|space ?gray|space ?black|rose ?gold|sky ?blue|icy ?blue|light ?gold|titanium natural|midnight|starlight|deep ?purple|ultramarine|desert|frost|haze|mint|lime|orange|PRODUCT ?RED|red|coral|lavender|indigo|forest|slate|ebony|champagne|bronze|silver|gold|black|white|blue|pink|purple|yellow|gray|grey|natural|charcoal|copper|nickel|ceramic|topaz|amber|jasper|prussian|vinca|teal|graphite|sand|olive|navy|cream)\b/i

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
  parseSamsungGalaxyZFoldFlip,
  parseSamsungGalaxyBuds,
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
      if (/\bipad\s+mini\b/i.test(name)) return 'ipad mini'
      const airSz = name.match(/\bipad\s+air\s+(?:m\d+\s+)?(\d{1,2})\b/i)
      if (airSz) return `ipad air ${airSz[1]}`
      if (/\bipad\s+air\b/i.test(name)) return 'ipad air'
      const proSz = name.match(/\bipad\s+pro\s+(?:m\d+\s+)?(\d{1,2})\b/i)
      if (proSz) return `ipad pro ${proSz[1]}`
      if (/\bipad\s+pro\b/i.test(name)) return 'ipad pro'
      const plain = name.match(/\bipad\s+\(?\s*(\d{1,2})\s*(?:\(|a\d+)/i)
      if (plain) return `ipad ${plain[1]}`
      return 'ipad'
    }
  }

  if (brand === 'Samsung') {
    const m = name.match(/galaxy\s+(s\d+(?:\s+(?:edge|ultra|fe|plus))?)/i)
    if (m) return `galaxy ${m[1]!.toLowerCase().replace(/\s+/g, ' ').trim()}`
    // Buds / Z / A — строки таблицы иначе схлопываются в samsung galaxy … и не попадают в ключ buds
    if (/\bgalaxy\s+buds\b/i.test(name)) {
      const b = name.match(/\bgalaxy\s+buds(?:\s+\d+(?:\s+(?:pro|fe))?|\s+(?:live|edge|\+)|\s+[a-z0-9]+\s+(?:pro|fe)?)?\b/i)
      if (b) return b[0]!.toLowerCase().replace(/\s+/g, ' ').trim()
      return 'galaxy buds'
    }
    const zm = name.match(/\bgalaxy\s+z\s+(?:fold|flip)(?:\s*\d+(?:\s+ultra)?)?/i)
    if (zm) return zm[0]!.toLowerCase().replace(/\s+/g, ' ').trim()
    const am = name.match(/\bgalaxy\s+a\s*\d+\b/i)
    if (am) return am[0]!.toLowerCase().replace(/\s+/g, ' ').trim()
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

// ── Сопоставление по тексту названия (fallback под «то же имя что в столбце») ─

/** Сжимаем текст для Dice / подстрок: без акцентов, пунктуация → пробел. */
function compactComparable(s: string): string {
  const t = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t
}

function tokenBag(s: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const raw of compactComparable(s).split(/\s+/)) {
    const tok = raw.trim()
    if (tok.length < 2) continue
    if (/^\d+$/.test(tok)) continue
    m.set(tok, (m.get(tok) ?? 0) + 1)
  }
  return m
}

/** Sørensen–Dice между наборами токенов (0..1). */
function diceComparable(a: string, b: string): number {
  const A = tokenBag(a)
  const B = tokenBag(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const [t, na] of A) {
    const nb = B.get(t)
    if (nb !== undefined) inter += Math.min(na, nb)
  }
  const sumA = [...A.values()].reduce((s, x) => s + x, 0)
  const sumB = [...B.values()].reduce((s, x) => s + x, 0)
  return sumA && sumB ? (2 * inter) / (sumA + sumB) : 0
}

/**
 * Из basename фото: «человеческие» сегменты после префикса стока,
 * без длинных техно-хвостов.
 */
function photoTitleBlob(originalFilename: string): string {
  const stem = originalFilename.replace(/\.(png|webp|jpg|jpeg)$/i, '')
  const parts = normalizeFilename(stem).split('__').map(x => x.trim())
  const rest = parts.slice(1).filter(seg => {
    if (!seg) return false
    if (isSamsungListingNoiseSegment(seg)) return false
    if (/^[\s_a-z0-9+.-]{22,}$/i.test(seg) && /[+.]/.test(seg)) return false
    if (/^[a-f0-9]{16,}$/i.test(seg)) return false
    return true
  })
  return rest.join(' ')
}

function scoreSheetTitleAgainstPhotoBlob(row: SheetRow, blob: string, photo: PhotoMeta): number {
  if (!blob || blob.length < 10) return 0
  const sheetComparable = compactComparable(row.fullName)
  if (!sheetComparable || sheetComparable.length < 6) return 0

  let d = diceComparable(blob, sheetComparable)
  const bCmp = compactComparable(blob)
  const bNoSpace = bCmp.replace(/\s/g, '')
  const sNoSpace = sheetComparable.replace(/\s/g, '')
  if (
    sheetComparable.length >= 12 &&
    (bCmp.includes(sheetComparable) ||
      sheetComparable.includes(bCmp.slice(0, Math.min(80, bCmp.length))) ||
      (bNoSpace.length >= 12 && (bNoSpace.includes(sNoSpace) || sNoSpace.includes(bNoSpace))))
  ) {
    d = Math.max(d, 0.92)
  }

  const rCol = normColor(row.color)
  const pCol = normColor(photo.color)
  if (rCol && pCol && rCol !== pCol) {
    const bc = blob.toLowerCase().replace(/\s/g, '')
    if (!bc.includes(rCol.replace(/\s/g, ''))) d *= 0.62
  }
  return Math.min(d, 1)
}

// ── Matching engine ──────────────────────────────────────────────────────────

/** Composite key для группировки: brand|family|size|color */
function makeKey(brand: string, family: string, size: string, color: string): string {
  return `${brand.toLowerCase()}|${family.toLowerCase()}|${size.toLowerCase()}|${normColor(color)}`
}

function matchPhoto(photo: PhotoMeta, byKey: Map<string, SheetRow[]>, sheetRows: SheetRow[]): MatchResult {
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
      if (galaxyBudsBroadPhotoAgainstSpecificSheet(photoFam, sheetFam)) continue
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

  // 5) По полному тексту «Название модели» × человекочитаемые сегменты имени файла
  const blob = photoTitleBlob(photo.filename)
  if (blob.length >= 10 && sheetRows.length > 0) {
    const scored: { row: SheetRow; score: number }[] = []
    for (const row of sheetRows) {
      if (row.brand.toLowerCase() !== photo.brand.toLowerCase()) continue
      const sc = scoreSheetTitleAgainstPhotoBlob(row, blob, photo)
      if (sc >= 0.63) scored.push({ row, score: sc })
    }
    if (scored.length > 0) {
      scored.sort((a, b) => b.score - a.score)
      const best = scored[0]!.score
      const close = scored.filter(x => x.score >= best - 0.04).slice(0, 20)
      // Один префикс на много строк (например только «Galaxy S25») — не размазываем одну картинку
      if (close.length > 6 && best < 0.88) {
        // пропуск — пусть строка идёт в orphans / ручное сопоставление
      } else if (close.length > 0 && close.length <= 20 && best >= 0.63) {
        let conf: number
        let reason: string
        if (best >= 0.9) {
          conf = 90
          reason = 'sheet title — very high overlap (name-like file)'
        } else if (best >= 0.82) {
          conf = 78
          reason = 'sheet title/token overlap (strong)'
        } else if (best >= 0.72) {
          conf = 73
          reason = 'sheet title/token overlap'
        } else if (best >= 0.66) {
          conf = 68
          reason = 'sheet title/token overlap (medium)'
        } else {
          conf = 64
          reason = 'sheet title/token overlap (weak; use --min-confidence=64 or review)'
        }
        return {
          photo: photo.filename,
          rows: close.map(x => x.row.rowIdx),
          confidence: conf,
          reason,
        }
      }
    }
  }

  return { photo: photo.filename, rows: [], confidence: 0, reason: 'no match' }
}

// ── Адаптер для источника данных (xlsx или Google Sheets) ────────────────────

/**
 * Унифицированный интерфейс над xlsx и Google Sheets API. Обе реализации
 * читают строки → отдают `rows`, копят set-операции на колонке «Фото» (Q),
 * затем сохраняют результат своим способом (xlsx-файл или batchUpdate).
 */
interface SheetAdapter {
  rows: SheetRow[]
  /** 1-based индекс колонки «Фото» (как в xlsx). */
  photoColIdx: number
  /** Получить текущее значение колонки «Фото» для строки (для аккумулирования с запятой). */
  getPhotoCell(rowIdx: number): string
  /** Записать новое значение в колонку «Фото» строки. */
  setPhotoCell(rowIdx: number, value: string): void
  /** Сохранить результат. Возвращает описание того, что сделали. */
  save(): Promise<string>
}

/** Имена колонок, общие для обоих источников. */
const COL_HEADERS = {
  brand: ['Бренд', 'Brand'],
  category: ['Общая категория', 'Категория', 'Category'],
  fullName: ['Название модели', 'Название', 'Model'],
  color: ['Цвет', 'Color'],
  size: ['Размер', 'Size'],
  photo: ['Фото', 'Photo'],
} as const

function colLetter(idx1: number): string {
  // Поддержка только 1..26 (для нашей схемы хватает: max колонка Q = 17)
  if (idx1 < 1 || idx1 > 26) throw new Error(`Unsupported column index: ${idx1}`)
  return String.fromCharCode('A'.charCodeAt(0) + idx1 - 1)
}

// ── Xlsx adapter ─────────────────────────────────────────────────────────────

class XlsxAdapter implements SheetAdapter {
  rows: SheetRow[] = []
  photoColIdx = 0
  private workbook!: ExcelJS.Workbook
  private worksheet!: ExcelJS.Worksheet
  private outputPath: string

  constructor(outputPath: string) {
    this.outputPath = outputPath
  }

  async load(xlsxPath: string): Promise<void> {
    this.workbook = new ExcelJS.Workbook()
    await this.workbook.xlsx.readFile(xlsxPath)
    const ws = this.workbook.getWorksheet('Лист1') ?? this.workbook.worksheets[0]
    if (!ws) throw new Error('No worksheet found in xlsx')
    this.worksheet = ws

    const header = ws.getRow(1)
    const findCol = (names: readonly string[]): number => {
      for (let i = 1; i <= header.cellCount; i++) {
        const v = String(header.getCell(i).value ?? '').trim()
        if (names.some(n => v === n)) return i
      }
      return -1
    }
    const cols = {
      brand: findCol(COL_HEADERS.brand),
      category: findCol(COL_HEADERS.category),
      fullName: findCol(COL_HEADERS.fullName),
      color: findCol(COL_HEADERS.color),
      size: findCol(COL_HEADERS.size),
      photo: findCol(COL_HEADERS.photo),
    }
    for (const [k, v] of Object.entries(cols)) {
      if (v < 0) throw new Error(`Column not found in xlsx: ${k}`)
    }
    this.photoColIdx = cols.photo

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const brand = String(row.getCell(cols.brand).value ?? '').trim()
      const fullName = String(row.getCell(cols.fullName).value ?? '').trim()
      if (!brand || !fullName) continue
      const category = String(row.getCell(cols.category).value ?? '').trim()
      const color = String(row.getCell(cols.color).value ?? '').trim()
      const size = String(row.getCell(cols.size).value ?? '').trim()
      this.rows.push({
        rowIdx: r,
        brand,
        category,
        fullName,
        color,
        size: normSize(size),
        family: extractFamily(brand, category, fullName),
      })
    }
  }

  getPhotoCell(rowIdx: number): string {
    const cell = this.worksheet.getRow(rowIdx).getCell(this.photoColIdx)
    return String(cell.value ?? '').trim()
  }

  setPhotoCell(rowIdx: number, value: string): void {
    const cell = this.worksheet.getRow(rowIdx).getCell(this.photoColIdx)
    cell.value = value
  }

  async save(): Promise<string> {
    await this.workbook.xlsx.writeFile(this.outputPath)
    return this.outputPath
  }
}

// ── Google Sheets adapter ────────────────────────────────────────────────────

/**
 * Читает строки напрямую из Google Sheets через сервисный аккаунт. Запись
 * — батч-апдейтом в колонку Q (один API-вызов на весь diff). В dry-run
 * режиме save() ничего не пишет, только репортит план.
 */
class SheetsAdapter implements SheetAdapter {
  rows: SheetRow[] = []
  photoColIdx = 0
  private sheetName: string
  private dryRun: boolean
  /** Текущее содержимое колонки «Фото» по rowIdx. */
  private currentPhoto = new Map<number, string>()
  /** Diff: значения, которые надо записать обратно. */
  private updates = new Map<number, string>()

  constructor(sheetName: string, dryRun: boolean) {
    this.sheetName = sheetName
    this.dryRun = dryRun
  }

  async load(): Promise<void> {
    // Ленивый require — чтобы offline-режим не требовал GOOGLE_SERVICE_ACCOUNT_KEY.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readSheet } = await import('../lib/google-sheets')

    const raw = await readSheet(this.sheetName)
    if (raw.length === 0) throw new Error(`Sheet '${this.sheetName}' is empty`)

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
      category: findCol(COL_HEADERS.category),
      fullName: findCol(COL_HEADERS.fullName),
      color: findCol(COL_HEADERS.color),
      size: findCol(COL_HEADERS.size),
      photo: findCol(COL_HEADERS.photo),
    }
    for (const [k, v] of Object.entries(cols)) {
      if (v < 0) throw new Error(`Column not found in Sheet '${this.sheetName}': ${k}`)
    }
    // Конвертируем 0-based индекс в 1-based (xlsx-стиль) — чтобы matching-логика не различалась.
    this.photoColIdx = cols.photo + 1

    for (let r = 1; r < raw.length; r++) {
      const row = raw[r] ?? []
      const brand = String(row[cols.brand] ?? '').trim()
      const fullName = String(row[cols.fullName] ?? '').trim()
      if (!brand || !fullName) continue
      const category = String(row[cols.category] ?? '').trim()
      const color = String(row[cols.color] ?? '').trim()
      const size = String(row[cols.size] ?? '').trim()
      const photo = String(row[cols.photo] ?? '').trim()
      // rowIdx — 1-based номер строки в Sheets (как в xlsx: header=1, данные с 2)
      const rowIdx = r + 1
      this.rows.push({
        rowIdx,
        brand,
        category,
        fullName,
        color,
        size: normSize(size),
        family: extractFamily(brand, category, fullName),
      })
      this.currentPhoto.set(rowIdx, photo)
    }
  }

  getPhotoCell(rowIdx: number): string {
    // Если уже было изменение — возвращаем его (для аккумулирования через запятую)
    if (this.updates.has(rowIdx)) return this.updates.get(rowIdx)!
    return this.currentPhoto.get(rowIdx) ?? ''
  }

  setPhotoCell(rowIdx: number, value: string): void {
    this.updates.set(rowIdx, value)
  }

  async save(): Promise<string> {
    if (this.updates.size === 0) return 'no updates'
    if (this.dryRun) {
      return `dry-run: ${this.updates.size} cells would be updated in '${this.sheetName}'`
    }

    const letter = colLetter(this.photoColIdx)
    // Группируем подряд идущие строки в один range, чтобы уменьшить количество ranges.
    const sortedRows = [...this.updates.keys()].sort((a, b) => a - b)
    type RunData = { range: string; values: (string | number)[][] }
    const ranges: RunData[] = []
    let runStart = sortedRows[0]!
    let runValues: string[] = [this.updates.get(runStart)!]
    for (let i = 1; i < sortedRows.length; i++) {
      const r = sortedRows[i]!
      const prev = sortedRows[i - 1]!
      if (r === prev + 1) {
        runValues.push(this.updates.get(r)!)
      } else {
        const end = prev
        ranges.push({
          range: `${letter}${runStart}:${letter}${end}`,
          values: runValues.map(v => [v]),
        })
        runStart = r
        runValues = [this.updates.get(r)!]
      }
    }
    const lastEnd = sortedRows[sortedRows.length - 1]!
    ranges.push({
      range: `${letter}${runStart}:${letter}${lastEnd}`,
      values: runValues.map(v => [v]),
    })

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { batchUpdate } = await import('../lib/google-sheets')
    // Префиксуем именем листа для batchUpdate
    const data = ranges.map(r => ({
      range: `'${this.sheetName}'!${r.range}`,
      values: r.values,
    }))
    await batchUpdate(data)
    return `updated ${this.updates.size} cells in '${this.sheetName}' (${ranges.length} ranges)`
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface CliArgs {
  photosDir: string
  outputDir: string
  baseUrl: string
  mode: 'xlsx' | 'sheets'
  xlsxPath?: string         // только для xlsx mode
  sheetName?: string        // только для sheets mode
  write?: boolean           // sheets mode: реально писать в Sheets
  /** Минимальный confidence для записи URL (по умолчанию 70; 50 = включая family-only). */
  minConfidence: number
  /** Очистить колонку «Фото» у всех строк каталога перед записью совпадений. */
  clearPhotos: boolean
}

function printUsage(): void {
  console.error('Usage:')
  console.error('  Offline (xlsx):')
  console.error('    ts-node scripts/match-photos-to-sheets.ts <photos_dir> <input_xlsx> <output_dir> <base_url>')
  console.error('')
  console.error('  Sheets-direct:')
  console.error('    ts-node scripts/match-photos-to-sheets.ts <photos_dir> --sheet <output_dir> <base_url> [--write] [--clear-photos] [--sheet-name=Лист1]')
  console.error('')
  console.error('  Без --write — dry-run (только отчёты, Sheets не трогаем).')
  console.error('  --clear-photos — перед матчем обнулить «Фото» у всех строк (полное обновление; без флага — новые URL дописываются к старым).')
  console.error('  --min-confidence=70  порог записи (70=по умолчанию; 64 включает слабые title-матчи; 50=family-only).')
  console.error('  PRODUCT_SHEET_NAME env используется как default имя листа.')
}

function parseCommonFlags(argv: string[], start: number): Pick<CliArgs, 'minConfidence' | 'clearPhotos'> {
  let minConfidence = 70
  let clearPhotos = false
  for (let i = start; i < argv.length; i++) {
    const a = argv[i] ?? ''
    if (a === '--clear-photos') clearPhotos = true
    else if (a.startsWith('--min-confidence=')) {
      const n = parseInt(a.split('=', 2)[1] ?? '70', 10)
      if (!Number.isNaN(n) && n >= 0 && n <= 100) minConfidence = n
    }
  }
  return { minConfidence, clearPhotos }
}

function parseArgs(argv: string[]): CliArgs | null {
  if (argv.length < 5) return null
  const photosDir = argv[2]
  const second = argv[3]
  const outputDir = argv[4]
  const baseUrl = argv[5]
  if (!photosDir || !second || !outputDir || !baseUrl) return null

  if (second === '--sheet') {
    let sheetName = process.env.PRODUCT_SHEET_NAME || 'Лист1'
    let write = false
    for (let i = 6; i < argv.length; i++) {
      const a = argv[i] ?? ''
      if (a === '--write') write = true
      else if (a.startsWith('--sheet-name=')) sheetName = a.split('=', 2)[1] ?? sheetName
    }
    const { minConfidence, clearPhotos } = parseCommonFlags(argv, 6)
    return { photosDir, outputDir, baseUrl, mode: 'sheets', sheetName, write, minConfidence, clearPhotos }
  }

  const { minConfidence, clearPhotos } = parseCommonFlags(argv, 6)
  return { photosDir, outputDir, baseUrl, mode: 'xlsx', xlsxPath: second, minConfidence, clearPhotos }
}

/** Рекурсивно собирает плоские ключи для матчинга/URL (= относительный путь через `__`, см. photo-flat-name). */
function collectPhotoFlatKeysRecursive(root: string): string[] {
  const rootAbs = path.resolve(root)
  const byFlat = new Map<string, string>() // flatKey → absolute path (дубликат только логировать)
  const IMG = /\.(png|webp|jpg|jpeg)$/i

  function walk(dir: string): void {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        walk(full)
      } else if (IMG.test(ent.name)) {
        const nativeRel = path.relative(rootAbs, full)
        if (nativeRel.startsWith('..')) continue
        const flat = flattenRelativePhotoPath(nativeRel)
        const prev = byFlat.get(flat)
        if (prev && prev !== full) {
          console.error(`[photos] Duplicate flat key skipped:\n    ${flat}\n    ${prev}\n    ${full}`)
          continue
        }
        byFlat.set(flat, full)
      }
    }
  }

  walk(rootAbs)
  return Array.from(byFlat.keys()).sort((a, b) => a.localeCompare(b))
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args) {
    printUsage()
    process.exit(1)
  }

  if (!fs.existsSync(args.photosDir)) {
    console.error(`Photos dir not found: ${args.photosDir}`)
    process.exit(1)
  }

  // Initialize adapter
  let adapter: SheetAdapter
  if (args.mode === 'xlsx') {
    if (!fs.existsSync(args.xlsxPath!)) {
      console.error(`xlsx not found: ${args.xlsxPath}`)
      process.exit(1)
    }
    fs.mkdirSync(args.outputDir, { recursive: true })
    const outXlsx = path.join(args.outputDir, path.basename(args.xlsxPath!, '.xlsx') + '_with_photos.xlsx')
    const xlsxAdapter = new XlsxAdapter(outXlsx)
    console.log(`Loading ${args.xlsxPath}...`)
    await xlsxAdapter.load(args.xlsxPath!)
    adapter = xlsxAdapter
  } else {
    fs.mkdirSync(args.outputDir, { recursive: true })
    const sheetsAdapter = new SheetsAdapter(args.sheetName!, !args.write)
    console.log(`Reading Google Sheets: '${args.sheetName}'${args.write ? '' : ' (dry-run)'}`)
    if (!args.write) {
      console.log(
        '\n!!! Без --write Google Таблица НЕ обновляется (только CSV в папке отчётов). Колонка «Фото» не меняется до запуска с --write, затем нужен /sync в боте.\n',
      )
    } else {
      console.log('\n>>> Режим записи: после завершения выполните /sync в Telegram-боте.\n')
    }
    await sheetsAdapter.load()
    adapter = sheetsAdapter
  }
  console.log(`Sheet rows: ${adapter.rows.length}`)
  if (args.mode === 'sheets') {
    console.log(`min-confidence: ${args.minConfidence} (--min-confidence= для изменения)`)
  }
  if (args.clearPhotos) {
    for (const row of adapter.rows) adapter.setPhotoCell(row.rowIdx, '')
    console.log(`[clear] Обнулена колонка «Фото» для ${adapter.rows.length} строк (--clear-photos)`)
  }

  // 1. Загрузить и распарсить фото (рекурсивно по подпапкам — стейдж Apple Stock / Samsung Stock / …)
  const photoFiles = collectPhotoFlatKeysRecursive(args.photosDir)
  console.log(`Photos: ${photoFiles.length}`)
  const photos = photoFiles.map(f => parsePhoto(f))

  // 2. Сгруппировать строки по composite key
  const byKey = new Map<string, SheetRow[]>()
  for (const row of adapter.rows) {
    const key = makeKey(row.brand, row.family, row.size, row.color)
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }
  console.log(`Unique keys: ${byKey.size}`)

  // 3. Match каждое фото
  const matches: MatchResult[] = photos.map(p => matchPhoto(p, byKey, adapter.rows))

  // 4. Распределить по статусам и накопить изменения в адаптере
  const matchedRowIds = new Set<number>()
  let writtenCount = 0
  let exactConf = 0
  let midConf = 0
  let prefixConf = 0
  let lowConf = 0
  let titleOverlap = 0
  let none = 0

  for (const m of matches) {
    if (m.confidence === 0) { none++; continue }
    if (/sheet title/i.test(m.reason)) titleOverlap++
    if (m.confidence >= 100) exactConf++
    else if (m.confidence >= 75) midConf++
    else if (m.confidence >= 70) prefixConf++
    else lowConf++

    // Запись от min-confidence (по умолчанию 70; 50 = family-only — проверяйте orphans/reports)
    if (m.confidence >= args.minConfidence) {
      const urlFilename = encodeURIComponent(m.photo)
      const url = `${args.baseUrl.replace(/\/$/, '')}/${urlFilename}`
      for (const rIdx of m.rows) {
        const existing = adapter.getPhotoCell(rIdx)
        // Если в ячейке уже что-то есть — дописываем через запятую; дублей того же URL нет (как после синка).
        const newValue = appendPhotoCellUrl(existing, url)
        adapter.setPhotoCell(rIdx, newValue)
        matchedRowIds.add(rIdx)
        writtenCount++
      }
    }
  }

  // 5. Сохранить через адаптер
  const saveResult = await adapter.save()

  // 6. Отчёты
  const matchedCsv = ['filename,confidence,reason,row_indices,row_names']
  const orphansCsv = ['filename,brand,family,size,color,reason']
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i]!
    const m = matches[i]!
    if (m.confidence >= args.minConfidence) {
      const names = m.rows.slice(0, 3).map(r => adapter.rows.find(row => row.rowIdx === r)?.fullName ?? '?').join(' | ')
      matchedCsv.push(`"${p.filename}",${m.confidence},"${m.reason}","${m.rows.join(';')}","${names}"`)
    } else if (m.confidence > 0) {
      orphansCsv.push(`"${p.filename}","${p.brand}","${p.family}","${p.size}","${p.color}","below threshold (${m.confidence})"`)
    } else {
      orphansCsv.push(`"${p.filename}","${p.brand}","${p.family}","${p.size}","${p.color}","${m.reason}"`)
    }
  }

  // Строки без фото
  const unmatchedRowsCsv = ['row_idx,brand,category,fullName,color,size,family']
  for (const row of adapter.rows) {
    if (!matchedRowIds.has(row.rowIdx)) {
      unmatchedRowsCsv.push(`${row.rowIdx},"${row.brand}","${row.category}","${row.fullName}","${row.color}","${row.size}","${row.family}"`)
    }
  }

  fs.writeFileSync(path.join(args.outputDir, 'matched.csv'), matchedCsv.join('\n'), 'utf-8')
  fs.writeFileSync(path.join(args.outputDir, 'orphans.csv'), orphansCsv.join('\n'), 'utf-8')
  fs.writeFileSync(path.join(args.outputDir, 'unmatched_rows.csv'), unmatchedRowsCsv.join('\n'), 'utf-8')

  // 7. Summary
  console.log('\n=== Match results ===')
  console.log(`  exact (100):                   ${exactConf} photos`)
  console.log(`  strong (≥75 incl. часть title): ${midConf} photos`)
  console.log(`  medium (70–74):               ${prefixConf} photos`)
  console.log(`  weak / title-medium / etc.:   ${lowConf} photos (часть в orphans если < --min-confidence)`)
  console.log(`  где сработало «название ↔ имя файла»: ${titleOverlap} photos (строк reason вроде sheet title)`)
  console.log(`  no match (0):                 ${none} photos`)
  console.log(`\n  URLs written: ${writtenCount} (across ${matchedRowIds.size} of ${adapter.rows.length} rows)`)
  console.log(`  Coverage: ${(100 * matchedRowIds.size / Math.max(1, adapter.rows.length)).toFixed(1)}% of sheet rows`)
  console.log(`\n  Save: ${saveResult}`)
  console.log(`  Reports:`)
  console.log(`    ${path.join(args.outputDir, 'matched.csv')}`)
  console.log(`    ${path.join(args.outputDir, 'orphans.csv')}`)
  console.log(`    ${path.join(args.outputDir, 'unmatched_rows.csv')}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
