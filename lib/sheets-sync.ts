/**
 * lib/sheets-sync.ts — Синхронизация товаров из Google Sheets в БД
 *
 * Один лист, атрибуты в отдельных колонках (Цвет, Память, Размер, Страна).
 * Каждая строка таблицы = один ProductVariant.
 * Колонки приоритетны, парсинг названия — fallback.
 */

import { Decimal } from '@prisma/client/runtime/client'
import { Sentry } from './sentry'
import log from './logger'
import { prisma } from './prisma'
import { readSheet, getProductSheetNames } from './google-sheets'
import { normalizeCdnPhotoUrl, cleanPhotoUrl } from './cdn-photo-resolve'
import { syncRunStart, syncRunFinish, SyncRunMeta } from './sync-run'
import { decidePriceSync, getFrozenVariantIds } from './price-sync-policy'
import { roundPrice, formatShopTime } from './currency'
import { SYNC_LOCK_KEY } from './sync-lock'
import { resolveSimType, loadSimRules, loadAttrAliases, attributesForExistingVariant, SimRuleData, AttrAliasData } from './sim-rules'
import { isPhone } from './sim-recalc'
import { parsePreorderCell } from './preorder'
import {
  applyMarkupRules as _applyMarkupRules,
  loadRules as _loadRules,
  type MarkupRuleData,
} from './markup-rules'

export function capitalizeAttr(val: string): string {
  if (!val) return val
  const t = val.trim()
  if (!t) return t
  if (/^\d/.test(t)) return t
  if (/^[A-Z]{2,}/.test(t)) return t
  if (/^eSIM|^Wi-Fi|^USB|^iOS|^macOS|^iP/i.test(t)) return t
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * Парсит строку фото из ячейки Google Sheets.
 * Несколько URL через запятую (перед `https://`, `http://` или вторым `/...webp`).
 * Запятая внутри query одного URL (напр. `?size=100,200`) сохраняется.
 */
export function parsePhotoUrls(cell: string): string[] {
  const trimmed = (cell ?? '').replace(/^\uFEFF/, '').trim()
  if (!trimmed) return []
  const segments = trimmed.split(
    /,\s*(?=https?:\/\/|\/[^\s,]+\.(?:webp|png|jpg|jpeg))/i,
  )
  const out: string[] = []
  for (const seg of segments) {
    let p = cleanPhotoUrl(seg.replace(/^["']+|["']+$/g, ''))
    if (!p) continue
    if (/^https?:\/\//i.test(p)) {
      out.push(p)
      continue
    }
    if (p.startsWith('/') && /\.(webp|png|jpg|jpeg)(\?[^\s]*)?$/i.test(p)) {
      out.push(p)
    }
  }
  return out
}

/**
 * `/no-photo.webp` и т.п. нельзя хранить в каталоге: при ошибке CDN фронт и так ставит заглушку,
 * а в БД длинный список одинаковых битых URL раздувает карусель («много точек — везде Бендер»).
 */
export function filterPlaceholderPhotoUrls(urls: string[]): string[] {
  const bad = (u: string): boolean => {
    const t = String(u ?? '').trim()
    if (!t) return true
    if (/\/no-photo\.(webp|png)(\?|#|$)/i.test(t)) return true
    try {
      if (/^https?:\/\//i.test(t)) {
        const pathname = new URL(t).pathname
        if (/\/no-photo\.(webp|png)$/i.test(pathname)) return true
      }
    } catch {
      /* невалидный URL всё же не считаем плейсхолдером — пусть parse отфильтрует или упадёт в sync */
    }
    return false
  }
  return urls.filter(u => !bad(u))
}

/** Парсинг ячейки «Фото» для записи в БД (без заглушек сайта). */
export function sanitizeSyncedPhotoUrls(cell: string): string[] {
  return filterPlaceholderPhotoUrls(parsePhotoUrls(cell).map(normalizeCdnPhotoUrl))
}

/** Уникальные URL фото по всем вариантам (порядок: как в таблице, без дублей). */
const MAX_MERGED_PRODUCT_PHOTOS = 12

export function mergeVariantPhotoUrls(variants: { photoUrls: string[] }[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of variants) {
    for (const raw of filterPlaceholderPhotoUrls(v.photoUrls)) {
      const u = String(raw ?? '').trim()
      if (!u || seen.has(u)) continue
      seen.add(u)
      out.push(u)
      if (out.length >= MAX_MERGED_PRODUCT_PHOTOS) return out
    }
  }
  return out
}

// Пустая/нечисловая ячейка наличия = 0 (нет в наличии). Значение DEFAULT_STOCK_QTY
// применяется к пустой ячейке ТОЛЬКО как явный опт-ин для сидинга пустого каталога
// (SHEETS_SEED_EMPTY_STOCK=true). В обычном синке пустая ячейка всегда = 0, даже если
// DEFAULT_STOCK_QTY задан в окружении.
const DEFAULT_QTY = parseInt(process.env.DEFAULT_STOCK_QTY || '3', 10)
const SEED_EMPTY_STOCK = process.env.SHEETS_SEED_EMPTY_STOCK === 'true'

const MARKUP_RULES_ENABLED = process.env.MARKUP_RULES_ENABLED === 'true'

// Column letters for writeback (supplier, date, description, specs)
// Updated for new sheet layout: L=Закупочная, M=Рекомендованная, O=Поставщик, P=Дата, Q=Фото
export const WRITEBACK_COLS = {
  description: 'J',   // не изменилось
  specs: 'K',         // не изменилось
  costPrice: 'L',     // Закупочная цена (НОВАЯ колонка)
  price: 'M',         // Рекомендованная стоимость (была L, сдвинулась на M)
  supplier: 'O',      // Лучший поставщик (был N, сдвинулся на O)
  date: 'P',          // Дата обновления (был O, сдвинулся на P)
  photo: 'Q',         // Фото (НОВАЯ колонка)
}

// ─── Dynamic column mapping from header row ──────────────────────────────────

// Заголовки, которые матчатся ТОЛЬКО точным совпадением. Подстрочный матчинг здесь
// неприменим: «Модель» ⊂ «Название модели», «Категория» ⊂ «Общая категория», —
// includes() выбрал бы соседнюю колонку в зависимости от порядка шапки.
const EXACT_HEADERS: Record<string, string[]> = {
  line:  ['Категория'],   // C — линейка: iPhone / MacBook / Фитнес-часы
  model: ['Модель'],      // D — модель: iPhone 17 Pro Max / Watch SE
}

// Опциональные колонки-оверрайды (§10 «умный дефолт + ручной override»). Читаются ТОЛЬКО
// по заголовку — БЕЗ позиционного fallback: сегодня их в листе нет, владелец заведёт их
// справа (R+), чтобы не сдвинуть колонки цен/наличия и writeback рекомендованной цены.
// Заголовок отсутствует → ключ не ставим, поле товара НЕ трогаем (работает авто-логика).
//   • «Бейдж»  → Product.badge     (Хит / Советуем / Новинка; перебивает авто-бейдж)
//   • «В хиты» → Product.isFeatured (да/1/✓ → принудительно в блок «Хиты»)
// Бот позже пишет в те же поля БД — фронт/бэкенд не меняются.
//   • «Предзаказ» → Product.isPreorder / ProductVariant.isPreorder: товар виден
//     на витрине при нулевом остатке. Условия предоплаты в лист НЕ ездят —
//     это денежная политика, она живёт в БД и правится в админке.
const OPTIONAL_HEADERS: Record<string, string[]> = {
  badge:    ['Бейдж', 'Badge'],
  hit:      ['В хиты', 'Hit'],
  preorder: ['Предзаказ', 'Preorder'],
}

const EXPECTED_HEADERS: Record<string, string[]> = {
  brand:       ['Бренд', 'Brand'],
  // «Общая категория» из живой таблицы удалена; колонка остаётся в списке ради
  // старых листов. Если её нет — category берётся из line (см. mapHeaders).
  category:    ['Общая категория', 'Category'],
  fullName:    ['Название модели', 'Название', 'Model'],
  color:       ['Цвет', 'Color'],
  memory:      ['Память', 'Memory', 'RAM/Storage'],
  size:        ['Размер', 'Size', 'Экран'],
  country:     ['Страна', 'Country'],
  description: ['Описание', 'Description'],
  specs:       ['Характеристики', 'Specs'],
  costPrice:   ['Закупочная цена', 'Закупка', 'Cost Price'],
  price:       ['Рекомендованная стоимость', 'Рекомендованная', 'Price', 'Retail'],
  // Стемы (матчинг по нормализованному вхождению): 'налич' ловит «В наличии»/«Наличие»,
  // 'остаток' — «Остаток». Без стемов includes('В наличие') промахивался мимо «В наличии».
  quantity:    ['налич', 'остаток', 'кол-во', 'количество', 'qty', 'stock'],
  supplier:    ['Лучший поставщик', 'Supplier'],
  updateDate:  ['Дата обновления', 'Updated'],
  photo:       ['Фото', 'Photo', 'Image'],
  sortOrder:   ['Порядок', 'Order', 'Sort'],
}

// Fallback indices matching the new sheet layout
const FALLBACK_INDICES: Record<string, number> = {
  brand: 1, line: 2, model: 3, category: 2, fullName: 4, color: 5, memory: 6, size: 7,
  country: 8, description: 9, specs: 10, costPrice: 11, price: 12,
  quantity: 13, supplier: 14, updateDate: 15, photo: 16,
  // -1 = колонки нет. Порядок тогда деградирует в порядок строк листа (см. parseSheetRows),
  // а не притворяется, что нашёл её на позиции 0.
  sortOrder: -1,
}

export type ColumnMap = Record<string, number>

/**
 * Колонка «выглядит порядковой»: есть значения и все непустые — целые числа.
 * Нужна только для подстраховки, когда «Порядок» записан, а заголовок не проставлен.
 */
function looksNumericColumn(dataRows: any[][], idx: number): boolean {
  let seen = 0
  for (const row of dataRows) {
    const v = (row?.[idx] ?? '').toString().trim()
    if (v === '') continue
    if (!/^\d+$/.test(v)) return false
    seen++
  }
  return seen > 0
}

export function mapHeaders(headerRow: any[], dataRows: any[][] = []): ColumnMap {
  const headers: ColumnMap = {}
  const headerStrings = headerRow.map(h => (h ?? '').toString().trim())
  const usedFallback: string[] = []

  for (const [key, variants] of Object.entries(EXPECTED_HEADERS)) {
    const idx = headerStrings.findIndex(h =>
      variants.some(v => h.toLowerCase().includes(v.toLowerCase()))
    )
    if (idx >= 0) {
      headers[key] = idx
    } else {
      headers[key] = FALLBACK_INDICES[key]!
      usedFallback.push(key)
    }
  }

  // Точный матчинг для line/model — includes() их не различает (см. EXACT_HEADERS).
  for (const [key, variants] of Object.entries(EXACT_HEADERS)) {
    const idx = headerStrings.findIndex(h =>
      variants.some(v => h.toLowerCase() === v.toLowerCase())
    )
    if (idx >= 0) {
      headers[key] = idx
    } else {
      headers[key] = FALLBACK_INDICES[key]!
      usedFallback.push(key)
    }
  }

  // Опциональные оверрайд-колонки: ставим ключ ТОЛЬКО если заголовок реально есть.
  // Нет заголовка → ключ отсутствует, col() вернёт '' и поле товара не переопределяется.
  for (const [key, variants] of Object.entries(OPTIONAL_HEADERS)) {
    const idx = headerStrings.findIndex(h =>
      variants.some(v => h.toLowerCase().includes(v.toLowerCase()))
    )
    if (idx >= 0) headers[key] = idx
  }

  // «Общая категория» в живой таблице отсутствует, а её includes-матчинг молча
  // проваливался в позиционный fallback (idx 3 = «Модель»), из-за чего site-category
  // становилась моделью. Нет отдельной общей категории → категория сайта = линейка.
  if (usedFallback.includes('category')) {
    headers.category = headers.line!
  }

  if (usedFallback.includes('line') || usedFallback.includes('model')) {
    log.warn('[sync] line/model column resolved via positional fallback', { headers: headerStrings })
  }

  // «Порядок» — новая колонка. Если владелец её ещё не завёл, страхуемся: колонка idx 0
  // считается порядком, только когда она сплошь числовая (значения записаны, заголовок нет).
  if (usedFallback.includes('sortOrder')) {
    if (looksNumericColumn(dataRows, 0)) {
      headers.sortOrder = 0
      log.warn('[sync] «Порядок» header missing, using numeric column A by position', { headers: headerStrings })
    } else {
      log.warn('[sync] «Порядок» column not found — model order degrades to sheet row order', { headers: headerStrings })
    }
  }

  // Само-диагностика: наличие по позиционному fallback — частый источник «нули не гасятся»
  // (лишняя колонка сдвигает idx 13). Явно шумим в логи, чтобы это было видно.
  if (usedFallback.includes('quantity')) {
    log.warn('[sync] quantity column resolved via positional fallback', { headers: headerStrings })
  }

  // Validate required columns
  if (headers.fullName === undefined || headers.fullName < 0) {
    throw new Error(`Required column "fullName" not found. Headers: ${headerStrings.join(', ')}`)
  }
  if (headers.price === undefined || headers.price < 0) {
    throw new Error(`Required column "price" not found. Headers: ${headerStrings.join(', ')}`)
  }

  log.debug('Column mapping', { columns: headers })
  return headers
}

function col(row: any[], idx: number | undefined): string {
  if (idx === undefined) return ''
  return (row[idx] ?? '').toString().trim()
}

export interface SheetRow {
  brand: string
  category: string           // категория сайта (= линейка, пока нет «Общей категории»)
  line: string               // «Категория» (C) — линейка: iPhone / MacBook / Galaxy S
  model: string              // «Модель» (D) — модель: iPhone 17 Pro Max / Watch SE
  sortOrder: number          // «Порядок» (A), 1 = верх/новее; 0 = не задан → в конец
  fullName: string           // «Название модели»
  color: string              // из колонки F
  memory: string             // из колонки G
  size: string               // из колонки H
  country: string            // из колонки I
  description: string        // из колонки J (бот заполняет)
  specs: string              // из колонки K (бот заполняет)
  costPrice: number | null   // Закупочная цена (L), null если пусто
  price: number              // Рекомендованная стоимость (M)
  quantity: number
  supplier: string           // Лучший поставщик (O)
  photo: string              // URL фото (Q), пусто если нет
  // §10 override (опц., R+). Пусто, если колонки/ячейки нет.
  badge: string              // «Бейдж» → ручной бейдж (Хит/Советуем/Новинка)
  hit: boolean               // «В хиты» → принудительно в блок «Хиты»
  badgeColPresent: boolean   // был ли заголовок «Бейдж» в листе (иначе поле не трогаем)
  hitColPresent: boolean     // был ли заголовок «В хиты» в листе
  preorder: boolean          // «Предзаказ» → показывать при нулевом остатке
  preorderColPresent: boolean // нет заголовка → флаг не трогаем совсем
  sheetName: string
  rowIndex: number
}

/**
 * Парсит один лист таблицы (с собственной строкой заголовков) в массив строк.
 * Структура листов одинаковая, но маппинг колонок вычисляется для каждого листа
 * отдельно — это устойчиво к мелким перестановкам колонок между листами.
 */
export function parseSheetRows(sheetName: string, data: string[][]): SheetRow[] {
  const rows: SheetRow[] = []
  if (data.length === 0) return rows

  const COL = mapHeaders(data[0]!, data.slice(1))
  let emptyQtyCount = 0
  let missingOrderCount = 0

  for (let i = 1; i < data.length; i++) {
    const row = data[i]!

    const fullName    = col(row, COL.fullName)
    const priceRaw    = col(row, COL.price).replace(/\s/g, '').replace(',', '.')

    if (!fullName || !priceRaw) continue

    const price = parseFloat(priceRaw)
    if (isNaN(price) || price <= 0) continue

    // Пустая/нечисловая ячейка наличия = 0 (нет в наличии). '0'→0, '5'→5, 'нет'/'-'→0.
    // Опт-ин сидинга (SHEETS_SEED_EMPTY_STOCK) применяет DEFAULT_QTY только к пустой ячейке.
    const qtyRaw = col(row, COL.quantity)
    let quantity = 0
    if (qtyRaw !== '') {
      const q = parseInt(qtyRaw, 10)
      if (!isNaN(q)) quantity = q
      else emptyQtyCount++
    } else {
      if (SEED_EMPTY_STOCK) quantity = DEFAULT_QTY
      emptyQtyCount++
    }

    // Закупочная цена (может быть пустой)
    const costRaw = col(row, COL.costPrice).replace(/\s/g, '').replace(',', '.')
    let costPrice: number | null = null
    if (costRaw !== '') {
      const c = parseFloat(costRaw)
      if (!isNaN(c) && c > 0) costPrice = c
    }

    // «Порядок»: 1 = верх/новее. Пусто или колонки нет → 0, что означает «в конец»
    // (сортировка ставит нули последними, сохраняя порядок строк листа).
    const orderRaw = col(row, COL.sortOrder)
    let sortOrder = 0
    if (orderRaw !== '') {
      const o = parseInt(orderRaw, 10)
      if (!isNaN(o) && o > 0) sortOrder = o
      else missingOrderCount++
    } else {
      missingOrderCount++
    }

    const line = col(row, COL.line)

    // §10 override: читаем, только когда заголовок присутствует в этом листе.
    const badge = col(row, COL.badge)
    const hitRaw = col(row, COL.hit)
    const hit = /^(да|yes|y|1|true|✓|\+|x|х)$/i.test(hitRaw)

    rows.push({
      brand:       col(row, COL.brand),
      category:    col(row, COL.category) || 'Другое',
      line:        line || 'Другое',
      model:       col(row, COL.model),
      sortOrder,
      fullName,
      color:       col(row, COL.color),
      memory:      col(row, COL.memory),
      size:        col(row, COL.size),
      country:     col(row, COL.country),
      description: col(row, COL.description),
      specs:       col(row, COL.specs),
      costPrice,
      price,
      quantity,
      supplier:    col(row, COL.supplier),
      photo:       col(row, COL.photo),
      badge,
      hit,
      badgeColPresent: COL.badge !== undefined,
      hitColPresent:   COL.hit !== undefined,
      preorder:           parsePreorderCell(col(row, COL.preorder)),
      preorderColPresent: COL.preorder !== undefined,
      sheetName,
      rowIndex: i + 1,
    })
  }

  if (missingOrderCount > 0) {
    log.info('[sync] rows with empty/non-numeric «Порядок» sorted last', {
      sheetName,
      count: missingOrderCount,
    })
  }

  if (emptyQtyCount > 0) {
    log.info('[sync] rows with empty/non-numeric quantity treated as 0', {
      sheetName,
      count: emptyQtyCount,
      seeding: SEED_EMPTY_STOCK,
    })
  }

  return rows
}

export interface ReadAllProductsResult {
  rows: SheetRow[]
  /** Листов прочитано успешно (включая пустые) */
  sheetsRead: number
  /** Листов, чьё чтение упало (Google API/парсинг) — их строки отсутствуют в rows */
  sheetsFailed: number
}

/**
 * Читает все листы таблицы (кроме служебных, напр. «не использовать») и
 * возвращает объединённый массив строк. Полистовой парсинг: каждый лист
 * читается отдельно со своими заголовками; ошибка одного листа не роняет sync,
 * но СЧИТАЕТСЯ: по sheetsFailed синк отличает «лист реально пуст» от «чтение
 * упало» и не гасит каталог по неполному набору (прайм-директива Step 4).
 * Упали ВСЕ листы → throw: прогон завершается ошибкой, не пустым каталогом.
 */
export async function readAllProducts(): Promise<ReadAllProductsResult> {
  const sheetNames = await getProductSheetNames()
  if (sheetNames.length === 0) return { rows: [], sheetsRead: 0, sheetsFailed: 0 }

  const allRows: SheetRow[] = []
  let sheetsRead = 0
  let sheetsFailed = 0

  for (const sheetName of sheetNames) {
    try {
      const data = await readSheet(sheetName)
      sheetsRead++
      if (data.length === 0) continue
      const rows = parseSheetRows(sheetName, data)
      log.debug('Sheets sync sheet parsed', { sheetName, rows: rows.length })
      allRows.push(...rows)
    } catch (err) {
      // Один проблемный лист не должен ломать весь товарный учёт
      sheetsFailed++
      Sentry.captureException(err, { tags: { operation: 'sheets-sync-read', sheetName } })
      log.error('Sheets sync failed to read sheet', {
        sheetName,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (sheetsRead === 0 && sheetsFailed > 0) {
    throw new Error(`Не прочитан ни один лист (${sheetsFailed} с ошибками) — синк прерван, каталог не тронут`)
  }

  return { rows: allRows, sheetsRead, sheetsFailed }
}

/**
 * Причина пропуска Step 4 (гашение «не увиденных» вариантов), либо null —
 * гасить можно. Чистая функция: прайм-директива «не гасить каталог по
 * неполному прогону» тестируется без БД и Google API.
 */
export function disableStepSkipReason(i: {
  /** Основной цикл прерван (стоп-кнопка или таймаут) */
  interrupted: boolean
  /** Сколько строк прочитано со всех листов */
  rowsCount: number
  /** Сколько листов упало при чтении */
  sheetsFailed: number
}): string | null {
  if (i.interrupted) return 'прогон прерван (стоп/таймаут)'
  if (i.rowsCount === 0) return 'чтение листов пустое'
  if (i.sheetsFailed > 0) return `не прочитано листов: ${i.sheetsFailed}`
  return null
}

/**
 * Синхронизирует товары из Google Sheets в БД.
 *
 * Логика:
 * - Строки группируются по extractProductName + category → один Product
 * - Каждая строка таблицы = один ProductVariant под этим Product
 * - Product.attributes = агрегированные уникальные значения из всех вариантов (для chips)
 * - Product.price = минимальная цена среди вариантов
 */
/**
 * Агрегат Product.attributes (чипы карточки и пикер модалки витрины) из
 * ФИНАЛЬНЫХ атрибутов вариантов — тех, что реально лягут в БД. Строить его из
 * сырого разбора листа нельзя: у существующих вариантов SIM держится границей
 * PR-A, и после смены словаря агрегат разъезжался с вариантами (все SIM-кнопки
 * в модалке серые). Ключ показывается, если значений больше одного или он из
 * ALWAYS_SHOW; «Страна» и служебные ключи в чипы не попадают.
 */
export function aggregateProductAttributes(variantAttrs: Array<Record<string, unknown>>): Record<string, string[]> {
  const aggregated: Record<string, Set<string>> = {}
  for (const attrs of variantAttrs) {
    for (const [attrKey, attrVal] of Object.entries(attrs)) {
      if (attrKey === 'fullName' || attrKey === 'Страна' || attrKey === 'attrOverrides') continue
      if (typeof attrVal !== 'string') continue
      if (!aggregated[attrKey]) aggregated[attrKey] = new Set()
      aggregated[attrKey].add(attrVal)
    }
  }
  const productAttributes: Record<string, string[]> = {}
  const ALWAYS_SHOW = ['Память', 'RAM', 'Экран', 'Размер', 'Чип', 'SIM', 'Связь']
  for (const [k, vals] of Object.entries(aggregated)) {
    if (vals.size > 1 || ALWAYS_SHOW.includes(k)) {
      productAttributes[k] = [...vals].sort()
    }
  }
  // Убрать дубль Экран/Размер
  if (productAttributes['Экран'] && productAttributes['Размер']) {
    if (productAttributes['Экран'].join(',') === productAttributes['Размер'].join(',')) {
      delete productAttributes['Размер']
    }
  }
  return productAttributes
}

/**
 * Схлопнуть группы строк, которые дальше по конвейеру лягут в ОДИН Product.
 *
 * Ключ группировки включает «Модель», а Product апсертится по
 * productName|categoryId. Когда «Модель» держит вариантную ось одного товара
 * (MacBook Air 13/15 → один productName, одна категория), получаются две
 * группы на один Product: каждая пересчитывает attributes/price/stock только
 * из СВОИХ строк, и последняя затирает первую — 13"-конфиги пропадают из
 * чипов, Product.price становится ценой недостижимого минимума.
 *
 * Товары «под категорией и под общей категорией» (исходный интент model в
 * ключе) здесь не склеиваются: у них разные категории, а ключ слияния —
 * имя+категория, тот же, что у апсерта Product.
 *
 * Поля мержатся по тем же правилам, что и строки внутри одной группы:
 * variants — конкатенация; sortOrder — минимальный ненулевой; badge/
 * description/specs/brand/line — первый непустой; hit и *ColPresent — «или».
 */
export function mergeGroupsByProductKey<G extends {
  productName: string
  brand: string
  category: string
  line: string
  sortOrder: number
  sheetDescription: string
  sheetSpecs: Record<string, string>
  badge: string
  hit: boolean
  badgeColPresent: boolean
  hitColPresent: boolean
  preorder: boolean
  preorderColPresent: boolean
  variants: unknown[]
}>(groups: Map<string, G>): Map<string, G> {
  const merged = new Map<string, G>()
  for (const g of groups.values()) {
    const key = `${g.productName}|${g.category}`
    const acc = merged.get(key)
    if (!acc) {
      merged.set(key, g)
      continue
    }
    acc.variants.push(...g.variants)
    if (g.sortOrder > 0 && (acc.sortOrder === 0 || g.sortOrder < acc.sortOrder)) acc.sortOrder = g.sortOrder
    if (!acc.badge && g.badge) acc.badge = g.badge
    if (g.hit) acc.hit = true
    acc.badgeColPresent = acc.badgeColPresent || g.badgeColPresent
    acc.hitColPresent = acc.hitColPresent || g.hitColPresent
    if (g.preorder) acc.preorder = true
    acc.preorderColPresent = acc.preorderColPresent || g.preorderColPresent
    if (!acc.sheetDescription && g.sheetDescription) acc.sheetDescription = g.sheetDescription
    if (Object.keys(acc.sheetSpecs).length === 0 && Object.keys(g.sheetSpecs).length > 0) acc.sheetSpecs = g.sheetSpecs
    if (!acc.brand && g.brand) acc.brand = g.brand
    if (!acc.line && g.line) acc.line = g.line
  }
  return merged
}

export async function syncProductsFromSheets(
  shouldAbort?: () => boolean,
  meta?: SyncRunMeta,
): Promise<{
  created: number
  updated: number
  disabled: number
  total: number
  errors: string[]
  /** id товаров, созданных ЭТИМ прогоном — источник для автообогащения новых. */
  createdProductIds: number[]
}> {
  // Prevent concurrent syncs via PostgreSQL advisory lock (тот же ключ берут
  // массовые записи из админки — lib/sync-lock.ts)
  const lockAcquired = await prisma.$queryRaw<[{pg_try_advisory_lock: boolean}]>`SELECT pg_try_advisory_lock(${SYNC_LOCK_KEY}) as "pg_try_advisory_lock"`
  if (!lockAcquired[0]?.pg_try_advisory_lock) {
    log.warn('Sheets sync already running, skipping')
    // Пропуск из-за конкурентного прогона — не прогон, в журнал не пишем
    return { created: 0, updated: 0, disabled: 0, total: 0, errors: ['Sync already in progress'], createdProductIds: [] }
  }

  // Журнал прогона (ADMIN-DESIGN §3.3). null при недоступной записи — синк идёт дальше.
  const syncRunId = await syncRunStart(meta)

  try {
  // Full reset: clear all products if SHEETS_FULL_RESET=true and no real orders
  if (process.env.SHEETS_FULL_RESET === 'true') {
    const realOrders = await prisma.order.count()
    if (realOrders === 0) {
      log.info('Sheets sync clearing old products (full reset)')
      await prisma.$transaction([
        prisma.stockMovement.deleteMany(),
        prisma.promotionPrice.deleteMany(),
        prisma.promotion.deleteMany(),
        prisma.orderItem.deleteMany(),
        prisma.order.deleteMany(),
        prisma.reservation.deleteMany(),
        prisma.supplierPrice.deleteMany(),
        prisma.priceChange.deleteMany(),
        prisma.productVariant.deleteMany(),
        prisma.product.deleteMany(),
      ])
      log.info('Sheets sync old products cleared')
    } else {
      log.info('Sheets sync skipping cleanup', { realOrders })
    }
  }

  let rows: SheetRow[]
  let sheetsFailed = 0
  try {
    const read = await readAllProducts()
    rows = read.rows
    sheetsFailed = read.sheetsFailed
  } catch (err) {
    Sentry.captureException(err, { tags: { operation: 'sheets-sync' } })
    log.error('Sheets sync read failed', { error: err instanceof Error ? err.message : String(err) })
    await syncRunFinish(syncRunId, { ok: false, errors: [`Failed to read sheets: ${err}`] })
    return { created: 0, updated: 0, disabled: 0, total: 0, errors: [`Failed to read sheets: ${err}`], createdProductIds: [] }
  }
  log.info('Sheets sync rows read', { count: rows.length, sheetsFailed })

  // ── Step 1: Group rows by productName + category ──────────────────────────

  type VariantData = {
    fullName: string
    costPrice: number | null
    price: number
    quantity: number
    attrs: Record<string, string>
    rowIndex: number
    sheetName: string
    photoUrls: string[]
    preorder: boolean
    preorderColPresent: boolean
  }
  type GroupedProduct = {
    productName: string
    brand: string
    category: string
    line: string
    sortOrder: number
    sheetDescription: string
    sheetSpecs: Record<string, string>
    // §10 override — агрегируется по строкам модели
    badge: string            // первый непустой «Бейдж» среди строк
    hit: boolean             // хоть одна строка помечена «В хиты»
    badgeColPresent: boolean // колонка «Бейдж» есть в листе → badge применяется (в т.ч. очистка)
    hitColPresent: boolean   // колонка «В хиты» есть в листе → isFeatured применяется
    preorder: boolean            // хоть одна строка модели помечена предзаказом
    preorderColPresent: boolean  // колонка «Предзаказ» есть в листе → флаг применяется
    variants: VariantData[]
  }

  const groups = new Map<string, GroupedProduct>()

  for (const row of rows) {
    const productName = extractProductName(row.fullName, row.brand)
    const attrs = getAttributes(row)

    // Ключ группировки (Phase 2): бренд + линейка + модель + имя товара.
    // Раньше было productName|category — категория тогда была общей («Телефоны»),
    // и один товар, заведённый и под категорией, и под общей категорией, давал два
    // Product'а. Явная колонка «Модель» схлопывает это структурно; когда она пуста,
    // ключом остаётся productName, то есть поведение прежнее.
    const key = `${row.brand}|${row.line}|${row.model}|${productName}`

    if (!groups.has(key)) {
      // Parse specs string "key: val\nkey2: val2" → object
      let sheetSpecs: Record<string, string> = {}
      if (row.specs) {
        for (const line of row.specs.split('\n')) {
          const [k, ...rest] = line.split(':')
          if (k && rest.length) sheetSpecs[k.trim()] = rest.join(':').trim()
        }
      }
      groups.set(key, {
        productName, brand: row.brand, category: row.category,
        line: row.line, sortOrder: row.sortOrder,
        sheetDescription: row.description,
        sheetSpecs: Object.keys(sheetSpecs).length > 0 ? sheetSpecs : {},
        badge: row.badge, hit: row.hit,
        badgeColPresent: row.badgeColPresent, hitColPresent: row.hitColPresent,
        preorder: row.preorder, preorderColPresent: row.preorderColPresent,
        variants: [],
      })
    }

    // Порядок группы = минимальный ненулевой среди её строк (0 = не задан → в конец).
    const g = groups.get(key)!
    if (row.sortOrder > 0 && (g.sortOrder === 0 || row.sortOrder < g.sortOrder)) {
      g.sortOrder = row.sortOrder
    }

    // §10 override по строкам модели: бейдж — первый непустой; хит — хоть одна строка.
    if (!g.badge && row.badge) g.badge = row.badge
    if (row.hit) g.hit = true
    g.badgeColPresent = g.badgeColPresent || row.badgeColPresent
    g.hitColPresent = g.hitColPresent || row.hitColPresent
    // Предзаказ: хоть одна строка модели помечена → карточка предзаказная
    if (row.preorder) g.preorder = true
    g.preorderColPresent = g.preorderColPresent || row.preorderColPresent

    groups.get(key)!.variants.push({
      fullName: row.fullName,
      costPrice: row.costPrice,
      price: row.price,
      quantity: row.quantity,
      attrs,
      rowIndex: row.rowIndex,
      sheetName: row.sheetName,
      photoUrls: sanitizeSyncedPhotoUrls(row.photo),
      preorder: row.preorder,
      preorderColPresent: row.preorderColPresent,
    })
  }

  // Группы, делящие один productName|category (например «Модель» = MacBook Air 13
  // и MacBook Air 15 при одном имени товара), апсертились бы в один Product по
  // очереди, и последняя затирала бы attributes/price/stock первой. Схлопываем
  // их до апсерта — агрегат/цена/остаток считаются по объединению вариантов.
  const mergedGroups = mergeGroupsByProductKey(groups)
  if (mergedGroups.size !== groups.size) {
    log.info('Sheets sync merged split groups', { before: groups.size, after: mergedGroups.size })
  }

  log.info('Sheets sync grouped', { productCount: mergedGroups.size })

  // ── Step 2: Preload existing data ─────────────────────────────────────────

  const existingVariants = await prisma.productVariant.findMany({ include: { product: true } })
  const variantsByFullName = new Map<string, typeof existingVariants[0]>()
  for (const v of existingVariants) {
    const a = v.attributes as Record<string, unknown> | null
    if (a && typeof a.fullName === 'string') {
      variantsByFullName.set(a.fullName, v)
    }
  }

  const categoriesMap = new Map<string, { id: number; name: string }>()
  for (const c of await prisma.category.findMany()) categoriesMap.set(c.name, c)

  const productsByKey = new Map<string, any>()
  for (const p of await prisma.product.findMany()) productsByKey.set(p.name + '|' + p.categoryId, p)

  // ── Step 3: Create/update products and variants ───────────────────────────

  let created = 0
  let updated = 0
  const createdProductIds: number[] = []
  const errors: string[] = []
  const seenVariantIds = new Set<number>()
  const startTime = Date.now()
  let groupIdx = 0
  // Прерван ли основной цикл (стоп-кнопка/таймаут): по неполному прогону
  // гасить «не увиденное» нельзя — seenVariantIds заполнен частично
  let interrupted = false
  if (sheetsFailed > 0) {
    errors.push(`Не прочитано листов: ${sheetsFailed} — их строки в этом прогоне отсутствуют, гашение пропущено`)
  }

  // Кеш правил наценки на время одной синхронизации
  let cachedRules: MarkupRuleData[] | null = null
  if (MARKUP_RULES_ENABLED) {
    try {
      cachedRules = await _loadRules('site')
    } catch (err) {
      log.warn('Failed to preload markup rules', { error: err instanceof Error ? err.message : String(err) })
      cachedRules = []
    }
  }
  const cachedApplyRules = (cost: number): number => _applyMarkupRules(cost, cachedRules ?? [])

  // Очередь обратной записи пересчитанных рекомендованных цен в Google Sheets.
  // sheetName обязателен: строки приходят с разных листов (полистовой учёт).
  // price → M; supplier/updatedAt (O/P) — только у строк, где они заданы
  const sheetWritebacks: Array<{ sheetName: string; rowIndex: number; price: number; supplier?: string; updatedAt?: string }> = []

  // Этап 2: словарь SIM — один раз на прогон (unknown копится для очереди обучения)
  await reloadSimDictionary()

  // PR-7: варианты applied-батчей с непроехавшим writeback — цену не трогаем
  const frozenVariantIds = await getFrozenVariantIds(prisma)
  if (frozenVariantIds.size > 0) {
    log.warn('Sheets sync: цены заморожены до повторного writeback батча', { variants: frozenVariantIds.size })
    errors.push(`Заморожены цены ${frozenVariantIds.size} вариантов: у применённого батча не проехал writeback в лист — повторите запись из админки`)
  }

  for (const [key, group] of mergedGroups) {
    if (shouldAbort?.()) {
      log.info('Sheets sync aborted by user')
      interrupted = true
      break
    }
    groupIdx++
    if (groupIdx % 20 === 0) {
      log.debug('Sheets sync progress', { current: groupIdx, total: mergedGroups.size })
    }
    if (Date.now() - startTime > 10 * 60 * 1000) {
      log.error('Sheets sync timeout', { current: groupIdx, total: mergedGroups.size })
      errors.push(`Timeout after 10 minutes at product ${groupIdx}`)
      interrupted = true
      break
    }

    try {
      // Ensure category exists
      let category = categoriesMap.get(group.category)
      if (!category) {
        category = await prisma.category.upsert({
          where: { name: group.category },
          create: { name: group.category },
          update: {},
        })
        categoriesMap.set(group.category, category)
      }

      // Финальные атрибуты вариантов — ровно то, что ляжет в БД: у существующего
      // варианта SIM сохраняет смысл (граница PR-A, attributesForExistingVariant),
      // у нового — свежий разбор. Считаем ОДИН раз: и агрегат, и апсерты вариантов
      // ниже используют это же значение — агрегат физически не может разойтись
      // с вариантами (баг «серые SIM-кнопки» после смены словаря).
      const finalAttrsByFullName = new Map<string, Record<string, string>>()
      for (const v of group.variants) {
        const existing = variantsByFullName.get(v.fullName)
        finalAttrsByFullName.set(v.fullName, existing
          ? attributesForExistingVariant(v.attrs, existing.attributes, simCtx.aliases)
          : v.attrs)
      }

      // Aggregate attributes for Product.attributes (chips)
      const productAttributes = aggregateProductAttributes(
        group.variants.map(v => finalAttrsByFullName.get(v.fullName)!))

      // Product.price — витринное «от…» без вариантов; округление вверх до 100
      // здесь тоже обязательно (варианты округляются в buildPrismaOp ниже —
      // иначе продуктовая цена отставала бы от округлённого минимума)
      const minPrice = roundPrice(Math.min(...group.variants.map(v => v.price)))
      const totalQty = group.variants.reduce((s, v) => s + v.quantity, 0)

      const productKey = group.productName + '|' + category.id
      let product = productsByKey.get(productKey)

      if (!product) {
        // Create new product
        const catNum = String(category.id).padStart(2, '0')
        const productSku = `${catNum}-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(-3)}`

        product = await prisma.product.create({
          data: {
            sku: productSku,
            name: group.productName,
            brand: group.brand || null,
            categoryId: category.id,
            line: group.line || null,
            sortOrder: group.sortOrder,
            price: new Decimal(minPrice),
            stock: totalQty,
            quantity: totalQty,
            // ЯДРО ПРЕДЗАКАЗА: обычный товар с нулём прячется, помеченный —
            // остаётся видимым. Остаток при этом честный (0), врать про склад
            // нельзя: на нём висят списание, агрегат атрибутов и цены.
            isAvailable: totalQty > 0 || group.preorder,
            attributes: productAttributes,
            description: group.sheetDescription || null,
            ...(group.preorderColPresent ? { isPreorder: group.preorder } : {}),
            specs: Object.keys(group.sheetSpecs).length > 0 ? group.sheetSpecs : {},
            photos: [],
            // §10 override: применяем, только когда колонка есть в листе (иначе default)
            ...(group.badgeColPresent ? { badge: group.badge || null } : {}),
            ...(group.hitColPresent ? { isFeatured: group.hit } : {}),
          },
        })
        productsByKey.set(productKey, product)
        createdProductIds.push(product.id)
        created++
      } else {
        // Update existing product
        // Колонки «Предзаказ» в листе нет → флаг не трогаем и видимость считаем
        // по тому, что уже стоит в БД (иначе синк погасил бы предзаказ, который
        // владелец включил в админке).
        const existingIsPreorder = (product as { isPreorder?: boolean }).isPreorder === true
        const updateData: Record<string, any> = {
          price: new Decimal(minPrice),
          stock: totalQty,
          quantity: totalQty,
          // См. комментарий в create: предзаказ живёт при нулевом остатке.
          // Флаг берём из свежей строки листа, если колонка есть; нет колонки —
          // не трогаем и опираемся на то, что уже стоит в БД.
          isAvailable: totalQty > 0 || (group.preorderColPresent ? group.preorder : existingIsPreorder),
          attributes: productAttributes,
          brand: group.brand || undefined,
          line: group.line || null,
          sortOrder: group.sortOrder,
        }
        // Apply sheet description/specs only if product doesn't have them yet
        if (group.sheetDescription && !product.description) {
          updateData.description = group.sheetDescription
        }
        const hasSpecs = product.specs && typeof product.specs === 'object' && Object.keys(product.specs as object).length > 0
        if (Object.keys(group.sheetSpecs).length > 0 && !hasSpecs) {
          updateData.specs = group.sheetSpecs
        }
        // §10 override: колонка в листе есть → значение ячейки правит поле (пусто = авто/сброс);
        // колонки нет → поле не трогаем (сохраняем то, что мог проставить бот/админка).
        if (group.badgeColPresent) updateData.badge = group.badge || null
        if (group.hitColPresent) updateData.isFeatured = group.hit
        if (group.preorderColPresent) updateData.isPreorder = group.preorder
        await prisma.product.update({
          where: { id: product.id },
          data: updateData,
        })
        updated++
      }

      // ── Photo inheritance by color ────────────────────────────────────────
      // Все варианты одного цвета должны иметь одинаковые фото.
      // Если в разных строках одного цвета указаны разные фото — берём первое непустое.
      const photosByColor = new Map<string, string[]>()
      for (const v of group.variants) {
        const color = (v.attrs['Цвет'] || '').toLowerCase()
        if (!color) continue
        if (v.photoUrls.length > 0 && !photosByColor.has(color)) {
          photosByColor.set(color, v.photoUrls)
        }
      }
      for (const v of group.variants) {
        const color = (v.attrs['Цвет'] || '').toLowerCase()
        if (color && v.photoUrls.length === 0) {
          const inherited = photosByColor.get(color)
          if (inherited) v.photoUrls = inherited
        }
      }

      // Create/update variants (batched in transactions with sequential fallback)
      type VariantOp = { variant: typeof group.variants[0]; existing: typeof existingVariants[0] | undefined }
      const variantOps: VariantOp[] = group.variants.map(v => ({
        variant: v,
        existing: variantsByFullName.get(v.fullName),
      }))

      function buildPrismaOp(entry: VariantOp) {
        const v = entry.variant
        if (entry.existing) {
          const updateData: Record<string, any> = {
            productId: product.id,
            quantity: v.quantity,
            // Остаток и inStock остаются честными и у предзаказа: видимость
            // даёт отдельный флаг, а не подделанный склад.
            inStock: v.quantity > 0,
            ...(v.preorderColPresent ? { isPreorder: v.preorder } : {}),
            // PR-A: у СУЩЕСТВУЮЩЕГО варианта SIM сохраняет смысл — канонизируем
            // только метку. Словарное значение применит PR-B по кнопке владельца.
            // Значение уже посчитано выше (finalAttrsByFullName) — то же, что в агрегате.
            attributes: { ...finalAttrsByFullName.get(v.fullName)!, fullName: v.fullName },
          }

          // Фото всегда зеркало таблицы: пустая ячейка / нераспознанный URL → сбросить в каталоге
          updateData.photos = v.photoUrls.length > 0 ? v.photoUrls : []
          updateData.photoUrls = v.photoUrls.length > 0 ? v.photoUrls : []

          if (MARKUP_RULES_ENABLED) {
            const sheetCost = v.costPrice
            const lastKnown = entry.existing.lastSyncedCostPrice !== null
              ? Number(entry.existing.lastSyncedCostPrice)
              : null
            const dbPrice = Number(entry.existing.price)
            const sheetPrice = v.price

            // PR-7: выбор действия вынесен в чистую decidePriceSync (тестируется
            // без Google API); frozen — applied-батч с непроехавшим writeback.
            const action = decidePriceSync({
              sheetCost, lastSyncedCost: lastKnown, dbPrice, sheetPrice,
              frozen: frozenVariantIds.has(entry.existing.id),
            })

            if (action === 'freeze') {
              // Цену/закупку не трогаем: часовой синк не должен откатывать
              // применённый батч, пока запись в лист не проехала (усиление №2)
              delete updateData.price
            } else if (action === 'recalc_from_cost') {
              // Закупочная изменилась → пересчитать рекомендованную по правилам.
              // Кто/когда: цена изменилась сейчас → P; поставщика синк не знает,
              // O переписываем из БД (последний победитель), если он там есть.
              const newPrice = cachedApplyRules(sheetCost!)
              updateData.costPrice = new Decimal(sheetCost!)
              updateData.lastSyncedCostPrice = new Decimal(sheetCost!)
              updateData.price = new Decimal(newPrice)
              updateData.priceUpdatedAt = new Date()
              sheetWritebacks.push({
                sheetName: v.sheetName, rowIndex: v.rowIndex, price: newPrice,
                updatedAt: formatShopTime(new Date()),
                ...(entry.existing.bestSupplierName ? { supplier: entry.existing.bestSupplierName } : {}),
              })
            } else if (action === 'respect_sheet_price') {
              // Рекомендованная изменилась вручную → уважать, но округлить
              // вверх до 100 (решение владельца: округление везде). Отличие
              // пишем и в лист — иначе следующий синк увидит расхождение
              // dbPrice ≠ sheetPrice и цена осциллировала бы.
              const rounded = roundPrice(sheetPrice)
              updateData.price = new Decimal(rounded)
              if (rounded !== sheetPrice) {
                sheetWritebacks.push({ sheetName: v.sheetName, rowIndex: v.rowIndex, price: rounded })
              }
            } else {
              // Ничего не изменилось — зеркало таблицы с тем же округлением
              const rounded = roundPrice(v.price)
              updateData.price = new Decimal(rounded)
              if (rounded !== v.price) {
                sheetWritebacks.push({ sheetName: v.sheetName, rowIndex: v.rowIndex, price: rounded })
              }
            }

            // Первичная фиксация costPrice, если в БД ещё нет снимка
            if (action !== 'freeze' && sheetCost !== null && sheetCost > 0 && lastKnown === null) {
              updateData.costPrice = new Decimal(sheetCost)
              updateData.lastSyncedCostPrice = new Decimal(sheetCost)
            }
          } else {
            // Feature-флаг выключен — цена из таблицы, но округление действует
            // всегда: хвосты «…90» и сырые цены подтягиваются до сотни, и лист
            // получает округлённое (иначе БД ≠ лист навсегда)
            const rounded = roundPrice(v.price)
            updateData.price = new Decimal(rounded)
            if (rounded !== v.price) {
              sheetWritebacks.push({ sheetName: v.sheetName, rowIndex: v.rowIndex, price: rounded })
            }
          }

          return prisma.productVariant.update({
            where: { id: entry.existing.id },
            data: updateData,
          })
        }
        const variantSku = `${product.sku}-${Date.now().toString(36).slice(-3)}${Math.random().toString(36).slice(-2)}`
        // Новый вариант: розница из листа тоже округляется вверх до 100,
        // отличие уезжает обратно в лист тем же writeback-механизмом
        const createRounded = roundPrice(v.price)
        if (createRounded !== v.price) {
          sheetWritebacks.push({ sheetName: v.sheetName, rowIndex: v.rowIndex, price: createRounded })
        }
        return prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: variantSku,
            price: new Decimal(createRounded),
            quantity: v.quantity,
            inStock: v.quantity > 0,
            ...(v.preorderColPresent ? { isPreorder: v.preorder } : {}),
            attributes: { ...finalAttrsByFullName.get(v.fullName)!, fullName: v.fullName },
            photos: v.photoUrls.length > 0 ? v.photoUrls : [],
            photoUrls: v.photoUrls.length > 0 ? v.photoUrls : [],
            costPrice: v.costPrice !== null ? new Decimal(v.costPrice) : null,
            lastSyncedCostPrice: v.costPrice !== null ? new Decimal(v.costPrice) : null,
          },
        })
      }

      const BATCH_SIZE = 10
      for (let i = 0; i < variantOps.length; i += BATCH_SIZE) {
        const batch = variantOps.slice(i, i + BATCH_SIZE)
        try {
          const results = await prisma.$transaction(batch.map(buildPrismaOp))
          for (let j = 0; j < batch.length; j++) {
            seenVariantIds.add(batch[j]!.existing?.id ?? (results[j] as { id: number }).id)
          }
        } catch (batchErr) {
          log.warn('Sync batch upsert failed, falling back to sequential', { error: batchErr instanceof Error ? batchErr.message : String(batchErr) })
          for (const entry of batch) {
            try {
              const result = await buildPrismaOp(entry)
              seenVariantIds.add(entry.existing?.id ?? (result as { id: number }).id)
            } catch (err) {
              const msg = `Row ${entry.variant.rowIndex} (${entry.variant.sheetName}): ${entry.variant.fullName} — ${err}`
              errors.push(msg)
              log.error('Sheets sync row error', { rowIndex: entry.variant.rowIndex, error: String(err) })
            }
          }
        }
      }

      // Карусель в магазине: на уровне Product храним объединение URL со всех вариантов
      // (в таблице фото часто только у строк вариантов; раньше в Product попадало одно preview).
      // coverPhoto здесь НЕ трогаем: это ручная обложка из админки, она переживает синк.
      const mergedPhotos = mergeVariantPhotoUrls(group.variants)
      try {
        await prisma.product.update({
          where: { id: product.id },
          data:
            mergedPhotos.length > 0
              ? { photos: mergedPhotos, photoUrl: mergedPhotos[0]! }
              : { photos: [], photoUrl: null },
        })
      } catch (carouselErr) {
        log.warn('Sheets sync product carousel update failed', {
          productId: product.id,
          error: String(carouselErr),
        })
      }
    } catch (err) {
      const msg = `Product "${group.productName}" (${group.category}): ${err}`
      errors.push(msg)
      log.error('Sheets sync product error', { product: group.productName, error: String(err) })
    }
  }

  // ── Writeback recalculated/rounded prices to Google Sheets ────────────
  // Без гейта MARKUP_RULES_ENABLED: округление до 100 действует всегда, и его
  // результат обязан уехать в лист — иначе БД и лист разъезжаются навсегда.
  // recalc-строки попадают сюда по-прежнему только при включённом флаге.
  if (sheetWritebacks.length > 0) {
    try {
      const { batchUpdate: batchUpdateSheets } = await import('./google-sheets')
      const updates = sheetWritebacks.flatMap(wb => {
        const rows: Array<{ range: string; values: (string | number)[][] }> = [{
          range: "'" + wb.sheetName + "'!" + WRITEBACK_COLS.price + wb.rowIndex,
          values: [[wb.price]],
        }]
        if (wb.supplier !== undefined) {
          rows.push({ range: "'" + wb.sheetName + "'!" + WRITEBACK_COLS.supplier + wb.rowIndex, values: [[wb.supplier]] })
        }
        if (wb.updatedAt !== undefined) {
          rows.push({ range: "'" + wb.sheetName + "'!" + WRITEBACK_COLS.date + wb.rowIndex, values: [[wb.updatedAt]] })
        }
        return rows
      })
      await batchUpdateSheets(updates)
      log.info('Sheets sync wrote back recalculated prices', { count: updates.length })
    } catch (err) {
      log.error('Sheets sync writeback error', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── Step 4: Disable variants not seen in the sheet ────────────────────────
  // ПРАЙМ-ДИРЕКТИВА: гасим «не увиденное» только по ПОЛНОМУ прогону. Пустое
  // чтение, упавшие листы, стоп-кнопка или таймаут → seenVariantIds неполон,
  // и updateMany погасил бы живой каталог из-за транзиентного сбоя Google.
  const step4Reason = disableStepSkipReason({
    interrupted: interrupted || Boolean(shouldAbort?.()),
    rowsCount: rows.length,
    sheetsFailed,
  })

  let disabled = 0
  if (step4Reason) {
    log.warn('Sheets sync Step 4 skipped', { reason: step4Reason, seen: seenVariantIds.size })
    errors.push(`Гашение вариантов пропущено: ${step4Reason}`)
  } else {
  const allVariantsInDb = await prisma.productVariant.findMany({
    where: { NOT: { id: { in: Array.from(seenVariantIds) } } },
    select: { id: true, productId: true, attributes: true },
  })

  const toDisable = allVariantsInDb.filter(v => {
    const a = v.attributes as Record<string, unknown> | null
    return a && typeof a === 'object' && 'fullName' in a
  })

  if (toDisable.length > 0) {
    await prisma.productVariant.updateMany({
      where: { id: { in: toDisable.map(v => v.id) } },
      data: { quantity: 0, inStock: false },
    })
    disabled = toDisable.length

    const affectedProductIds = [...new Set(toDisable.map(v => v.productId))]

    // Batch: one groupBy instead of N aggregate queries
    const stockSums = await prisma.productVariant.groupBy({
      by: ['productId'],
      where: { productId: { in: affectedProductIds } },
      _sum: { quantity: true },
    })
    const stockMap = new Map(stockSums.map(s => [s.productId, s._sum.quantity || 0]))

    const updates = affectedProductIds.map(pid => {
      const stock = stockMap.get(pid) || 0
      return prisma.product.update({
        where: { id: pid },
        data: { stock, quantity: stock, isAvailable: stock > 0 },
      })
    })
    for (let i = 0; i < updates.length; i += 10) {
      await prisma.$transaction(updates.slice(i, i + 10))
    }
  }
  }

  // ── Step 5: Гашение осиротевших продуктов ─────────────────────────────────
  // Смена «Категории» в листе создаёт новый Product (ключ имя|категория), а
  // варианты ре-парентятся на него по fullName. Старый Product остаётся
  // isAvailable=true с «нарисованным» stock и нулём вариантов — так копились
  // латентные дубли (бэклог «178»). Гасим мягко (не удаляем: возможные
  // FK-ссылки и точка восстановления остаются). Прерванный прогон не гасит —
  // upsert мог не дойти до групп, чьи варианты переехали бы обратно.
  if (!shouldAbort?.() && !interrupted) {
    const orphaned = await prisma.product.updateMany({
      where: { isAvailable: true, variants: { none: {} } },
      data: { isAvailable: false, stock: 0, quantity: 0 },
    })
    if (orphaned.count > 0) {
      log.info('Sheets sync disabled orphaned products', { count: orphaned.count })
    }
  }

  log.info('Sheets sync done', { created, updated, disabled, errors: errors.length })

  // Audit: check products without key attributes
  try {
    const audit = await prisma.product.findMany({
      where: { isAvailable: true },
      select: { id: true, name: true, attributes: true, category: { select: { name: true } } },
    })
    const EXPECTED_ATTRS: Record<string, string[]> = {
      'Телефоны': ['Память', 'Цвет'],
      'Планшеты': ['Память', 'Цвет', 'Связь'],
      'Ноутбуки': ['Память', 'Цвет'],
      'Desktop': ['Память'],
      'Часы': ['Размер'],
      'Аудио': ['Цвет'],
      'Телевизоры': ['Диагональ'],
    }
    const issues: string[] = []
    for (const p of audit) {
      const cat = p.category?.name || ''
      const expected = EXPECTED_ATTRS[cat]
      if (!expected) continue
      const attrs = (p.attributes as Record<string, string[]>) || {}
      for (const key of expected) {
        if (!attrs[key] || attrs[key].length === 0) {
          issues.push(`${p.name} (${cat}) — нет атрибута "${key}"`)
        }
      }
    }
    if (issues.length > 0) {
      log.warn('Audit: products missing expected attributes', { count: issues.length, sample: issues.slice(0, 10) })
    }
  } catch { /* audit is non-critical */ }

  if (simCtx.unknown.size > 0) {
    const top = [...simCtx.unknown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    errors.push(`SIM не определён: ${top.map(([c, n]) => `${c} (${n})`).join(', ')} — задайте правило в админке (Товары → SIM по словарю)`)
  }

  // Прерванный прогон (кнопка «стоп» в боте) — не успех: счётчики частичные
  const aborted = shouldAbort ? shouldAbort() : false

  // Открытые вкладки витрины поллят /api/cache-version раз в 30 с и без бампа
  // не узнают о свежих ценах/остатках до перезахода. Правки из админки бампают
  // сами (touchStorefrontCache внутри), синк до сих пор — нет. Бамп только
  // после непрерванного прогона, тронувшего каталог; сама функция не бросает.
  if (!aborted && created + updated + disabled > 0) {
    const { touchStorefrontCache } = await import('./storefront-admin')
    await touchStorefrontCache('sheet_sync')
  }

  await syncRunFinish(syncRunId, {
    ok: !aborted && errors.length === 0,
    rowsRead: rows.length,
    created,
    updated,
    disabled,
    writebacks: sheetWritebacks.length,
    errors: aborted ? [...errors, 'Прерван вручную — счётчики частичные'] : errors,
  })

  // Автообогащение новых карточек. Намеренно БЕЗ await: результат синка уже
  // посчитан, лок снимется в finally сразу, а обогащение (десятки секунд на
  // платных запросах) поедет отдельно. Тумблер, потолок и все проверки —
  // внутри enrichAfterSync; наружу оно не бросает, так что успешный прогон
  // остаётся успешным при любой поломке обогащения.
  void import('./enrich-after-sync')
    .then(m => m.enrichAfterSync(createdProductIds, { aborted, errors }))
    .catch(e => log.error('Enrich after sync hook failed', { error: e instanceof Error ? e.message : String(e) }))

  return { created, updated, disabled, total: rows.length, errors, createdProductIds }
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${SYNC_LOCK_KEY})`
  }
}

// ─── Chip dictionary (long first for greedy match) ──────────────────────────
//
// Чип — структурированный атрибут, а не часть названия модели. Канон устроен
// как COLORS_LONG/COLORS_SHORT: сначала длинные («M4 Pro»), иначе «M4 Pro»
// усечётся до «M4» и два разных чипа сольются в один.
//
// ВАЖНО: у Mac чип входит в ИМЯ товара («Macbook Air M5», «Imac M4»), и оттуда
// его вырезать нельзя — это идентичность модели. Здесь мы только ДОСТАЁМ чип в
// атрибут; extractProductName не трогается (см. тесты «имена не поехали»).

export const CHIPS_LONG = [
  'M5 Ultra', 'M5 Max', 'M5 Pro',
  'M4 Ultra', 'M4 Max', 'M4 Pro',
  'M3 Ultra', 'M3 Max', 'M3 Pro',
  'M2 Ultra', 'M2 Max', 'M2 Pro',
  'M1 Ultra', 'M1 Max', 'M1 Pro',
  'A19 Pro', 'A18 Pro', 'A17 Pro',
]
export const CHIPS_SHORT = [
  'M5', 'M4', 'M3', 'M2', 'M1',
  'A19', 'A18', 'A17', 'A16', 'A15', 'A14', 'A13',
]

/**
 * Гейт: у кого вообще бывает Apple-чип. Только Apple-линейки — иначе токены
 * «M4»/«M5» из чужих названий («Poco M4», «Poco M5» — телефоны Xiaomi) дали бы
 * фантомный атрибут «Чип». Бренд из листа главнее, но пустой бренд не должен
 * ронять разбор — поэтому дополнительно узнаём линейку по названию.
 */
export function isAppleChipLine(brand: string, fullName: string): boolean {
  const isAppleBrand = /^apple$/i.test(String(brand ?? '').trim())
  const isAppleLine = /\b(iPad|MacBook|iMac|Mac\s*(mini|Studio))\b/i.test(String(fullName ?? ''))
  return isAppleBrand || isAppleLine
}

/**
 * Достаёт канонический чип из названия. Скобки не мешают («iPad 11 (A16) …»),
 * регистр не важен. Границы слова обязательны: «XM5» (Sony WH-1000XM5) чипом
 * не считается, «S26»/«42mm» тоже.
 *
 * Чистая функция без гейта по бренду — гейт применяется на вызове
 * (см. isAppleChipLine в parseAttributes).
 */
export function extractChip(fullName: string): string | null {
  const s = String(fullName ?? '').replace(/[()]/g, ' ')
  for (const c of CHIPS_LONG) {
    if (new RegExp(`\\b${c.replace(/\s+/g, '\\s+')}\\b`, 'i').test(s)) return c
  }
  for (const c of CHIPS_SHORT) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(s)) return c
  }
  return null
}

// ─── Color dictionary (long first for greedy match) ─────────────────────────

const COLORS_LONG = [
  // Samsung Titanium compounds
  'Titanium Silverblue', 'Titanium Whitesilver', 'Titanium Pinkgold',
  'Titanium Black', 'Titanium Gray',
  // Standard compounds
  'Cobalt Violet', 'Cobalt Blue', 'Sky Blue', 'Rose Gold', 'Space Gray', 'Space Black',
  'Jet Black', 'Alpine Green', 'Deep Purple', 'Dark Green', 'Sierra Blue',
  'Purple Fog', 'Pur Fog', 'Anchor Blue', 'Prussian Blue', 'Vinca Blue', 'Icy Blue',
  'Ice Blue', 'Ceramic White', 'Ceramic Pink', 'Ceramic Patina',
  'Phantom Black', 'Phantom White', 'Cream Gold', 'White Gold',
  'Lunar Silver', 'Mars Orange', 'Almond Green', 'Rock Gray',
  // Dyson slash-colors & compounds
  'Nickel/Copper', 'Nickel/Fuchsia', 'Blue/Copper', 'Black/Teal',
  'White/Silver', 'Black/Nickel', 'Gold/Gold',
  'Midnight Blue/Copper', 'Red Velvet Gold', 'Vinca Blue/Topaz',
  'MatBlack/Copp', 'Yell/Nick', 'Yellow/Nickel',
  // Dyson named colors
  'Amber Silk', 'Jasper Plum', 'Red Velvet', 'Nickel Cooper',
  // DualSense / Console compounds
  'Chrome Teal', 'Chrome Indigo', 'Chrome Pearl',
  'Sterling Silver', 'Volcanic Red',
  // MacBook NEO
  'Blush', 'Citrus', 'Indigo',
  // Ghost special edition
  'GHOST OF YOTEI',
  // Google Pixel / OnePlus / Garmin compounds
  'Jade Cyan', 'Arctic Dawn', 'Arctic Purple', 'Storm Grey',
  'Astral Trail', 'Nebula Noir', 'Sand Storm', 'Ultra Violet',
]
const COLORS_SHORT = [
  'Jetblack', 'Iceblue', 'Icyblue', 'Pinkgold', 'Silverblue', 'Whitesilver',
  'Black', 'White', 'Silver', 'Gold', 'Blue', 'Red', 'Green',
  'Orange', 'Purple', 'Midnight', 'Starlight', 'Pink', 'Yellow', 'Cream',
  'Mint', 'Lavender', 'Coral', 'Graphite', 'Natural', 'Titanium',
  'Desert', 'Navy', 'Denim', 'Gray', 'Grey', 'Teal', 'Bronze', 'Shadow',
  'Burgundy', 'Copper', 'Ivory', 'Sage', 'Stone', 'Ultramarine',
  'Charcoal', 'Fuchsia', 'Obsidian', 'Porcelain', 'Hazel', 'Peony',
  'Wintergreen', 'Bay', 'Nickel', 'Topaz', 'Neon', 'Turquoise',
  'Camouflage', 'Cobalt', 'Chrome', 'Sterling', 'Volcanic', 'Pop',
  // Additional colors (Beats, Pixel, Garmin, OnePlus, Dyson, etc.)
  'Sand', 'Brown', 'Squad', 'Frost', 'Jade', 'Rose', 'Aqua', 'Mist',
  'Berry', 'Dawn', 'Eclipse', 'Iris', 'Moonstone', 'Lemongrass',
  'Breeze', 'Cosmic', 'Arctic', 'Storm', 'Violet', 'Terracotta', 'Beige',
  'Lunar', 'Lilac', 'Jasper', 'Spark', 'Slate', 'Vinca',
  'Metallic', 'Matte', 'Satin', 'Silk', 'Infinite', 'Ocean', 'Noir',
  'Starlit', 'Brawn', 'Cinema',
]
// Cyrillic colors — \b doesn't work with Cyrillic, handled separately
const CYRILLIC_COLORS = [
  'Голубой', 'Черный', 'Чёрный', 'Белый', 'Серебристый', 'Золотой', 'Синий',
  'Красный', 'Зеленый', 'Зелёный', 'Оранжевый', 'Фиолетовый', 'Розовый',
  'Серый', 'Бежевый', 'Горчичный',
]
const ALL_COLORS = [...COLORS_LONG, ...COLORS_SHORT, ...CYRILLIC_COLORS]

// ─── Dyson completions (part of product name vs attribute) ──────────────────
const DYSON_COMPLETIONS = [
  'Complete Long', 'Complete', 'Detect Absolute', 'Absolute', 'Animal',
]

// ─── Photo/Video kit types ──────────────────────────────────────────────────
const CAMERA_KITS = ['Body', 'Kit', 'Fly More Combo']

/**
 * Собирает атрибуты: колонки таблицы (приоритет) + парсинг названия (fallback).
 * Экспорт — для тестов гейта «SIM только телефонам».
 */
export function getAttributes(row: SheetRow): Record<string, string> {
  const attrs: Record<string, string> = {}

  // 1. Из колонок (приоритет)
  if (row.color) {
    let colorVal = row.color
    // Яндекс — цвет может содержать описание: "65Вт с голосовым помощником Алиса Black"
    if (colorVal.length > 20) {
      const words = colorVal.split(/\s+/)
      const lastWord = words[words.length - 1]
      const KNOWN_COLORS = ['Black','White','Grey','Beige','Red','Blue','Green','Turquose','Turquoise','Violet','Orange','Pink','Brown','Yellow','Silver','Gold']
      if (lastWord && KNOWN_COLORS.some(c => c.toLowerCase() === lastWord.toLowerCase())) {
        colorVal = lastWord!
      }
    }
    attrs['Цвет'] = capitalizeAttr(colorVal)
  }
  if (row.memory) {
    const memStr = row.memory.toString().trim()
    // Формат "X/Y" или "X/YGB" — X=RAM, Y=Storage
    const slashMatch = memStr.match(/^(\d+)\s*(GB|gb)?\s*\/\s*(\d+)\s*(GB|TB|gb|tb)?$/i)
    if (slashMatch) {
      const ram = slashMatch[1]!
      const storage = slashMatch[3]!
      const unit = (slashMatch[4] ?? 'GB').toUpperCase()
      if (!attrs['RAM']) attrs['RAM'] = ram + 'GB'
      const storageNum = parseInt(storage, 10)
      attrs['Память'] = unit === 'TB' ? storage + 'TB' : (storageNum >= 1024 ? Math.round(storageNum / 1024) + 'TB' : storage + unit)
    } else {
      attrs['Память'] = memStr
    }
  }
  // Для ноутбуков и десктопов размер = экран, не дублировать
  const isLaptop = row.category === 'Ноутбуки' || /macbook/i.test(row.fullName)
  const isDesktop = row.category === 'Desktop' || /imac/i.test(row.fullName)
  if ((isLaptop || isDesktop) && row.size) {
    attrs['Экран'] = row.size
  } else if (row.size) {
    attrs['Размер'] = row.size
  }
  if (row.country) attrs['Страна'] = row.country

  // 2. Fallback: парсинг из названия (если колонка пуста)
  const parsed = parseAttributes(row.fullName, row.brand, row.country, row.category)
  for (const key of ['Цвет', 'Память', 'RAM', 'Размер', 'SIM', 'Связь', 'Чип', 'Ремешок', 'Комплектация', 'Экран', 'Серия', 'Диагональ', 'Разъём', 'Touch ID', 'Дисплей', 'Ревизия', 'Умный дом', 'AI', 'Материал', 'Состояние', 'Линзы', 'Крепление', 'Шумоподавление'] as const) {
    if (!attrs[key] && parsed[key]) {
      const textAttrs = ['Цвет', 'Комплектация', 'Материал', 'Состояние', 'Ремешок', 'Линзы']
      attrs[key] = textAttrs.includes(key) ? capitalizeAttr(parsed[key]) : parsed[key]
    }
  }

  // 3. Smart defaults from product name

  // Планшеты — Связь из названия (Wi-Fi / LTE / Cellular)
  const isTablet = row.category === 'Планшеты' || /pad|tablet/i.test(row.fullName)
  if (isTablet && !attrs['Связь']) {
    if (/\bLTE\b|\bCellular\b|\b5G\b/i.test(row.fullName)) {
      attrs['Связь'] = 'LTE'
    } else if (/\bWi-?Fi\b/i.test(row.fullName)) {
      attrs['Связь'] = 'Wi-Fi'
    }
  }

  // Часы — размер из названия (47mm, 42mm и т.д.)
  const isWatch = row.category === 'Часы'
  if (isWatch && !attrs['Размер']) {
    const sizeMatch = row.fullName.match(/\b(\d{2})\s*mm\b/i)
    if (sizeMatch) {
      attrs['Размер'] = sizeMatch[1] + 'mm'
    }
  }

  // Цвет — извлечь из названия если нет из колонки
  if (!attrs['Цвет']) {
    const colorPattern = /\b(Black|White|Silver|Gray|Grey|Blue|Green|Red|Pink|Purple|Gold|Orange|Yellow|Midnight|Starlight|Obsidian|Porcelain|Titanium|Cream|Brown|Navy|Sand|Teal|Mint|Graphite|Beige|Jade|Cyan|Lavender|Sage|Frost|Indigo)\b/i
    const colorMatch = row.fullName.match(colorPattern)
    if (colorMatch) {
      attrs['Цвет'] = capitalizeAttr(colorMatch[1]!)
    }
  }

  // Хардкод «iPhone без SIM → eSIM» убран (Этап 2): resolveSimType намеренно
  // возвращает null для неизвестной страны, и угадывание eSIM ломало бы это
  // (напр. «Гонконг/США» — HK это 2 SIM). Нет правила → SIM не ставим,
  // страна уходит в очередь обучения.

  return attrs
}

// Words that start with M but are real product words, not Apple article codes
const M_KEEP_WORDS = new Set([
  'MacBook', 'Magic', 'MagSafe', 'Max', 'Mini', 'Midnight', 'Mint', 'Marshall',
  'Meta', 'Monitor', 'Motif', 'Major', 'Middleton', 'Minor', 'Mark', 'MediaTek',
  'Medicube', 'MiniLED', 'Milanese', 'Mars', 'Mavic', 'More', 'Music',
  // uppercase variants (before Title Case)
  'MAGIC', 'MAX', 'MINI',
])

/**
 * Извлекает базовое имя продукта из полного названия.
 */
/**
 * Убирает ВИСЯЩИЕ закрывающие скобки — те, у которых нет открывающей.
 *
 * Зачем: в листе встречается опечатка «… Wi-Fi 2026) M4» (потеряна открывающая
 * скобка у года). Разбор снимал год, а «)» оставалась в имени товара — так
 * родились товары-призраки «Ipad Air 11 )» и «Ipad Air 13 )», которые лист
 * кормит как отдельные позиции. Чиним на входе, а не руками в листе:
 * переименование строк в таблице плодит новых сирот.
 *
 * Парные скобки не трогаем — легальные имена вроде «Whoop 5.0 ONE (подписка
 * 199€/год)» и «Картридж … (20 sheets)» обязаны остаться как есть.
 */
export function dropUnmatchedParens(s: string): string {
  let depth = 0
  let out = ''
  for (const ch of String(s ?? '')) {
    if (ch === '(') { depth++; out += ch; continue }
    if (ch === ')') {
      if (depth > 0) { depth--; out += ch }   // парная — сохраняем
      continue                                 // висящая — выбрасываем
    }
    out += ch
  }
  return out
}

export function extractProductName(fullName: string, brand: string): string {
  let name = fullName

  // ─── Step 0: Normalize ───
  // Висящая «)» — раньше доезжала до имени товара и плодила призраков
  name = dropUnmatchedParens(name)
  name = name.replace(/\bSeries\s+(\d+)\b/gi, 'S$1')  // "Series 11" → "S11"

  // ─── Step 1: Remove country in brackets (Russian) ───
  name = name.replace(/\s*\([А-Яа-яЁё/\s]+\)\s*/g, ' ')

  // ─── Step 2: Remove article codes in brackets ───
  const isDJI = /\bDJI\b/i.test(name)
  if (isDJI) {
    name = name.replace(/\s*\(RC\s*\d*\)\s*/g, ' ')
  }
  name = name.replace(/\(\d+CPU\/\d+GPU\/[^)]+\)/g, '')  // (10CPU/10GPU/32GB/512GB)
  name = name.replace(/\s*\(SM-[A-Z0-9/]+\)\s*/g, ' ')   // (SM-S948B)
  name = name.replace(/\s*\([A-Z0-9/-]+\)\s*/g, ' ')      // other codes in brackets
  name = name.replace(/\bSM-[A-Z0-9/]+\b/gi, '')          // SM-F741B without brackets
  name = name.replace(/\(\s*\)/g, '')                       // empty ()

  // ─── Step 3: Detect product type ───
  const isWatch = /\b(apple\s+)?watch\b/i.test(name)
  const isGarmin = /\bGarmin\b/i.test(name)
  const isMac = /\b(Mac\s*(mini|Studio)|iMac)\b/i.test(name)
  const isMacBook = /MacBook/i.test(name)
  const isiPad = /iPad/i.test(name)
  const isDyson = /\bDyson\b/i.test(name)
  const isTV = /\b(QE\d|QN\d|UE\d|OLED|QLED|QNED|NANO\d|The Frame|Neo QLED)/i.test(name) || /\bHisense\b/i.test(name)
  const isCamera = /\b(Canon|Sony|Nikon|DJI|GoPro)\b/i.test(name)
  const isSonyAudio = /\bSony\b/i.test(name) && /\b(WH-|WF-|XM)\b/.test(name)
  const isConsole = /\b(DualSense|PlayStation|Xbox|Nintendo|Switch|Steam\s*Deck|Oculus|Quest)\b/i.test(name)
  const isRayBan = /\bRay-?Ban\b/i.test(name)
  const isOakley = /\bOakley\b/i.test(name)
  const isYandex = /(Яндекс|Yandex|\bYNDX\b)/i.test(name)
  const isiMac = /\biMac\b/i.test(name)

  // ─── Step 4: Remove CPU config (Mac) ───
  name = name.replace(/\b\d+c\/\d+c\b/g, '')

  // ─── Step 5: Remove memory (but NOT for Dyson/TV/Camera/consoles without GB/TB) ───
  if (!isDyson) {
    name = name.replace(/\b\d+\/\d+\s*(GB|TB|Gb|gb)?\b/gi, '')  // 12/256Gb
    name = name.replace(/\b\d+\s*(GB|TB)\b/gi, '')                // 256GB, 1TB
  }

  // ─── Step 5b: Remove bare storage numbers for iPad, Apple TV, iMac, Pixel ───
  if (isiPad || /\bApple\s*TV\b/i.test(name) || /\bPixel\b/i.test(name)) {
    name = name.replace(/\b(64|128|256|512|1024)\b/g, '')
  }
  if (isiMac) {
    name = name.replace(/\b24\b/g, '')  // iMac 24" screen size
  }
  // Normalize XL casing (Xl → XL) — Pixel XL is a separate model, keep it
  name = name.replace(/\bXl\b/g, 'XL')

  // ─── Step 6: Remove SIM and 5G ───
  name = name.replace(/\b(2Sim|eSim|e-Sim|1Sim\+eSim|Dual\s*SIM|DS)\b/gi, '')
  name = name.replace(/\b5G\b/gi, '')

  // ─── Step 7: Remove colors ───
  if (isDyson || isGarmin) {
    name = name.replace(/\b\w+\/\w+\b/g, '')  // Nickel/Copper, Berry/lilac
  }
  for (const c of COLORS_LONG) name = name.replace(new RegExp(c.replace('/', '\\/'), 'gi'), '')
  for (const c of COLORS_SHORT) name = name.replace(new RegExp(`\\b${c}\\b`, 'gi'), '')
  for (const c of CYRILLIC_COLORS) name = name.replace(new RegExp(c, 'gi'), '')

  // ─── Step 8: Watch-specific cleanup (Apple Watch) ───
  if (isWatch && !isGarmin) {
    name = name.replace(/\b(40|42|44|45|46|49)\s*(mm|MM)?\b/g, '')
    name = name.replace(/\b(Al|Ti|Aluminum|Titanium)\b/gi, '')
    name = name.replace(/\b(SB|LB|TL)\b/g, '')
    name = name.replace(/\bSport\s*Band\b/gi, '')
    name = name.replace(/\bOcean\s*Band\b/gi, '')
    name = name.replace(/\bAlpine\s*Loop\b/gi, '')
    name = name.replace(/\bAlp\s*Lp\b/gi, '')
    name = name.replace(/\bMilanese\s*Loop?\b/gi, '')
    name = name.replace(/\bMilanese\b/gi, '')
    name = name.replace(/\bCharcoal\s*Loop\b/gi, '')
    name = name.replace(/\bTrail\s*Loop\b/gi, '')
    name = name.replace(/\bLink\s*Bracelet\b/gi, '')
    name = name.replace(/\bInk\s*SL\b/gi, '')
    name = name.replace(/\bDenim\b/gi, '')
    name = name.replace(/\b[SML]\/[SML]\b/g, '')
    name = name.replace(/\b(GPS|LTE|Cellular)\b/gi, '')
    name = name.replace(/\bLoop\b/gi, '')
    name = name.replace(/\bBand\b/gi, '')
  }

  // ─── Step 8b: Garmin — remove bands, materials, article codes ───
  if (isGarmin) {
    name = name.replace(/\b\d{2}\s*mm\b/gi, '')
    name = name.replace(/\b\d{3}-\d{5}-\d{2}\b/g, '')  // 010-03024-01
    // Remove everything from "With/Includes" onwards
    name = name.replace(/\b(With|Includes)\b.*/gi, '')
    // Remove band/case/material descriptors
    name = name.replace(/\b(Silicone|Nylon|Leather|Comfortfit)\s*(Band)?\b/gi, '')
    name = name.replace(/\bBand\b/gi, '')
    name = name.replace(/\bBEZEL\b/gi, '')
    name = name.replace(/\bCaseback\b/gi, '')
    name = name.replace(/\bCarbon\s*(DLC|Edition)?\b/gi, '')
    name = name.replace(/\bDamascus\s*STEEL\s*Edition\b/gi, '')
    name = name.replace(/\bApplied\s*Ballistics\b/gi, '')
    // Remove slash-prefixed colors
    name = name.replace(/\/\w+/g, '')
    // Remove size suffixes
    name = name.replace(/\b-?(XS|XL)\b/gi, '')
    // Remove Garmin-specific descriptor words
    name = name.replace(/\b(Pebble|Whitestone|Bone|Cloud|Raspberry|French|Soft|Amp|Translucent)\b/gi, '')
  }

  // ─── Step 9: iPad-specific cleanup ───
  if (isiPad) {
    name = name.replace(/\bWi-Fi\s*\+?\s*Cellular\b/gi, '')
    name = name.replace(/\bWi-?Fi\b/gi, '')
    name = name.replace(/\bWIFI\b/gi, '')
    name = name.replace(/\bLTE\b/gi, '')
    name = name.replace(/\b(A\d+|M\d+)\b/g, '')
  }

  // ─── Step 10: MacBook — remove screen size, article remnants ───
  if (isMacBook) {
    name = name.replace(/\b(13|14|15|16)\b/g, '')
    name = name.replace(/\bMHF\s*D\d\b/gi, '')  // MacBook NEO article codes
  }

  // ─── Step 10b: Dyson — map article codes to model names, remove accessories ───
  if (isDyson) {
    name = name.replace(/\b(HS|HD|HT|SV|PH|RB|HU)\d{2,3}[A-Z]?\b/g, (match) => {
      if (/^HD0[3-8]$/.test(match) || /^HD1[5-8]$/.test(match)) return 'Supersonic'
      if (/^HS0[5-9]$/.test(match)) return 'Airwrap'
      if (/^HT01$/.test(match)) return 'Airstrait'
      if (/^PH05$/.test(match)) return 'Purifier Humidify'
      return ''
    })

    for (const comp of DYSON_COMPLETIONS) {
      name = name.replace(new RegExp(`\\b${comp}\\b`, 'gi'), '')
    }

    name = name.replace(/без кейса/gi, '')
    name = name.replace(/с кейсом/gi, '')
    name = name.replace(/диффузор/gi, '')
    name = name.replace(/\bCoanda\s*2x\b/gi, '')
    name = name.replace(/\bCeramic\b/gi, '')
    name = name.replace(/\bLite\b/gi, '')
    name = name.replace(/\b(Supersonic|Airwrap|Airstrait)\s+\1\b/gi, '$1')
  }

  // ─── Step 10c: TV — remove diagonal, regional suffixes, dedup model codes ───
  if (isTV) {
    name = name.replace(/\b\d{2}["″"]\s*/g, '')
    name = name.replace(/\b\d{2}\s*["″"]\s*/g, '')
    // Samsung: inline regional suffixes (F...UXRU, F...EXRU, CBUXRU)
    name = name.replace(/F[A-Z0-9]{0,3}UXRU/gi, '')
    name = name.replace(/F[A-Z0-9]{0,3}EXRU/gi, '')
    name = name.replace(/CBUXRU/gi, '')
    // LG: RLA suffix
    name = name.replace(/RLA\b/g, '')
    // General regional
    name = name.replace(/\b[A-Z]{2,5}RU\b/g, '')
    name = name.replace(/\bARUG\b/g, '')
    // LG/Hisense: remove ". duplicate" pattern
    name = name.replace(/\.\s+.*$/, '')
    // Hisense: dedup repeated model sequences ("100E7Q PRO 100E7Q PRO" → "100E7Q PRO")
    name = name.replace(/(.{4,}?)\s+\1(?=\s|$)/g, '$1')
  }

  // ─── Step 10d: Camera — remove kit/body ───
  if (isCamera) {
    for (const kit of CAMERA_KITS) {
      name = name.replace(new RegExp(`\\b${kit}\\b`, 'gi'), '')
    }
  }

  // ─── Step 10e: Console-specific cleanup ───
  if (isConsole) {
    name = name.replace(/\bGHOST\s+OF\s+YOTEI\b/gi, '')
    name = name.replace(/\bAstro\s*Bot\b/gi, '')
    name = name.replace(/\d+\s*ревизия/gi, '')
  }

  // ─── Step 10f: Ray-Ban — remove lens/frame descriptions after RW model ───
  if (isRayBan) {
    // Keep everything up to and including RW model number, remove the rest
    name = name.replace(/(\bRW\d{4})\b.*/g, '$1')
    // Fallback: remove codes if no RW pattern
    name = name.replace(/\b\d{3}\/[A-Z0-9]+\b/g, '')
    name = name.replace(/\b\d{3}[A-Z][A-Z0-9]{3,5}\b/g, '')
    name = name.replace(/\b\d{3}-\d{2}\b/g, '')
    name = name.replace(/\bSize\s*[SML]\s*\(\d+\)/gi, '')
    name = name.replace(/\bSize\s*[SML]\b/gi, '')
    name = name.replace(/\bC\s+\d{3}/g, '')
    // Remove lens descriptions
    name = name.replace(/\b(Matte|Shiny|Clear|Polar|Gradient|Lenses|Transitions)\b/gi, '')
    name = name.replace(/распакованы/gi, '')
  }

  // ─── Step 10g: Yandex — remove descriptions from name ───
  if (isYandex) {
    name = name.replace(/с голосовым помощником Алиса/gi, '')
    name = name.replace(/с Алисой/gi, '')
    name = name.replace(/на YaGPT/gi, '')
    name = name.replace(/\bZigbee?\b/gi, '')
    name = name.replace(/\bYNDX-\d+\b/g, '')
  }

  // ─── Step 10h: Sony Audio — normalize model spacing ───
  if (isSonyAudio) {
    name = name.replace(/\b(WF|WH)-(\d+)\s+(XM\d+)/g, '$1-$2$3')
  }

  // ─── Step 10i: DJI — remove combo descriptions ───
  if (isDJI) {
    name = name.replace(/\b(Motion|Premium|Creator|Adventure)\s*Combo\b/gi, '')
    name = name.replace(/Базовая Версия/gi, '')
    name = name.replace(/базовая версия/gi, '')
    // Remove parenthetical content (including unclosed)
    name = name.replace(/\([^)]*\)/g, '')
    name = name.replace(/\([^)]*$/g, '')
  }

  // ─── Step 10j: Oakley — truncate after frame model name ───
  if (isOakley) {
    name = name.replace(/\b(HSTN|Vanguard)\b.*/gi, (_, model) => model)
  }

  // ─── Step 10k: OnePlus — remove article codes and trailing single chars ───
  name = name.replace(/\bCPH\d{4}\b/g, '')

  // ─── Step 10l: Studio/Pro Display — remove glass type, mount, screen size ───
  if (/\b(Studio|Pro)\s*Display\b/i.test(name)) {
    name = name.replace(/\b(Standard|Nano)\s*Glass\b/gi, '')
    name = name.replace(/\bTilt\s*Stand\b/gi, '')
    name = name.replace(/\bVESA\s*Mount\s*Adapter\b/gi, '')
    name = name.replace(/\b32\b/g, '')
  }

  // ─── Step 11: Accessories/Комплектация — remove from name ───
  // NOTE: No \b around Cyrillic — \b doesn't work with Cyrillic in JS
  name = name.replace(/без кейса/gi, '')
  name = name.replace(/с кейсом/gi, '')
  name = name.replace(/диффузор/gi, '')
  name = name.replace(/\bCoanda\s*2x\b/gi, '')
  name = name.replace(/\+?\s*Touch\s*ID\b/gi, '')
  name = name.replace(/кейс MagSafe/gi, '')
  name = name.replace(/мятая коробка/gi, '')
  name = name.replace(/распакованы/gi, '')
  name = name.replace(/с шумоподавлением/gi, '')
  name = name.replace(/без зарядки/gi, '')
  name = name.replace(/\bGift\s*Edition\b/gi, '')

  // ─── Step 12: Remove display types ───
  name = name.replace(/\bNano\s*[-]?\s*[Tt]exture(\s*Display)?\b/gi, '')
  name = name.replace(/\bStanda?r?[dt]\s*Display\b/gi, '')
  name = name.replace(/\bNano\b(?=\s*$|\s+[^A-Za-z])/gi, '')  // orphaned "Nano"

  // ─── Step 13: Remove year ───
  name = name.replace(/\s*\(20[2-3]\d\)\s*/g, ' ')
  name = name.replace(/\b20[2-3]\d\b/g, '')

  // ─── Step 14: Remove article codes ───
  // Apple Z-артикулы
  name = name.replace(/\bZ1[A-Z]{1,3}[A-Z0-9]{3,7}\b/g, '')

  // Apple M-артикулы (with safelist)
  if (!isSonyAudio) {
    name = name.replace(/\b(M[A-Z][A-Z0-9]{1,5})\b/g, (match) => M_KEEP_WORDS.has(match) ? match : '')
    name = name.replace(/\b[A-Z]\d[A-Z]{2}\b/g, '')  // Apple: U3LW, T3LW
  }

  // YNDX-артикулы (Яндекс)
  name = name.replace(/\bYNDX-\d+\b/g, '')

  // OnePlus CPH codes (backup)
  name = name.replace(/\bCPH\d{4}\b/g, '')

  // TV/Xiaomi regional suffixes (not already handled)
  if (!isTV) {
    name = name.replace(/\b[A-Z]{2,5}RU\b/g, '')
    name = name.replace(/\bARUG\b/g, '')
  }

  // ─── Step 15: RAM numbers after Max/Pro/Ultra ───
  name = name.replace(/\b(Max|Pro|Ultra)\s+(16|24|32|48|64|96|128)\b/g, '$1')

  // ─── Step 16: Remove USB-C, Lightning, misc ───
  name = name.replace(/\bUSB-C\b/gi, '')
  name = name.replace(/\bLightning\b/gi, '')

  // ─── Step 17: Remove strap sizes & misc ───
  if (!isWatch || isGarmin) {
    name = name.replace(/\b[SML]\/[SML]\b/g, '')
  }
  name = name.replace(/\b[SML]\b(?![\w])/g, '')
  name = name.replace(/\bmm\b/gi, '')

  // ─── Step 18: Remove emoji ───
  name = name.replace(/[\u{1F1E0}-\u{1F1FF}]{2}/gu, '')
  name = name.replace(/[\u{1F300}-\u{1FAFF}]/gu, '')

  // ─── Step 19: Final cleanup ───
  name = name.replace(/\(\s*\/?\s*\)/g, '')           // empty () or (/)
  name = name.replace(/\s*\/\s*(?=\s|$)/g, '')        // trailing /
  name = name.replace(/\s*\/\s*(?=Touch)/g, ' ')      // /Touch ID → Touch ID
  name = name.replace(/[\s,.\-]+$/, '')                // trailing punctuation
  name = name.replace(/\s+/g, ' ').trim()

  // ─── Step 20: Deduplicate consecutive tokens ───
  const tokens = name.split(' ')
  const deduped: string[] = []
  for (const t of tokens) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== t) {
      deduped.push(t)
    }
  }
  name = deduped.join(' ')

  // ─── Step 21: Title Case ───
  name = name.split(' ').map(word => {
    if (!word) return ''
    // Не трогать аббревиатуры полностью заглавными (JBL, DJI, LTE, USB, OLED)
    if (word === word.toUpperCase() && word.length <= 5) return word
    // Не трогать слова с цифрами (M4, S26, XM5)
    if (/\d/.test(word)) return word
    // Capitalize
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  }).join(' ')

  return name || fullName.slice(0, 60)
}

/**
 * Словарь SIM на прогон синка: грузится один раз в syncProductsFromSheets,
 * unknown копит страны без правила → очередь обучения в админке.
 */
export const simCtx: { rules: SimRuleData[]; aliases: AttrAliasData[]; unknown: Map<string, number> } = {
  rules: [], aliases: [], unknown: new Map(),
}

export async function reloadSimDictionary(): Promise<void> {
  simCtx.rules = await loadSimRules()
  simCtx.aliases = await loadAttrAliases('SIM')
  simCtx.unknown = new Map()
}

/**
 * Извлекает атрибуты из полного названия модели.
 * category — категория строки листа: по ней (и имени) решаем «телефон ли это»
 * для проставления SIM — той же isPhone, что у пересчёта и очереди обучения.
 */
function parseAttributes(fullName: string, brand: string, country: string, category: string): Record<string, string> {
  const attrs: Record<string, string> = {}

  const normalized = fullName.replace(/\bSeries\s+(\d+)\b/gi, 'S$1')

  const isWatch = /\b(apple\s+)?watch\b/i.test(normalized)
  const isGarmin = /\bGarmin\b/i.test(normalized)
  const isMac = /\b(Mac\s*(mini|Studio)|iMac)\b/i.test(normalized)
  const isMacBook = /MacBook/i.test(normalized)
  const isiPad = /iPad/i.test(normalized)
  const isDyson = /\bDyson\b/i.test(normalized)
  const isTV = /\b(QN\d+|OLED|QLED|The Frame|Neo QLED)\b/i.test(normalized)
  const isCamera = /\b(Canon|Sony|Nikon|DJI|GoPro)\b/i.test(normalized)

  // ─── CPU chip config (Mac Desktop): 10c/10c, 14c/20c ───
  // Конфигурация ядер исторически живёт в том же ключе «Чип» и имеет приоритет:
  // менять её задним числом нельзя — это существующие значения на 94 вариантах.
  const chipConfig = normalized.match(/\b(\d+c\/\d+c)\b/)
  if (chipConfig) attrs['Чип'] = chipConfig[1]!

  // ─── Чип как структурированный атрибут: A16, M4 Pro, M5 Max ───
  // Канон длинных вариантов первым (как COLORS_LONG): иначе «M4 Pro» усечётся
  // до «M4». Ставим ТОЛЬКО если ключ ещё пуст — конфигурация ядер выше главнее.
  //
  // ГЕЙТ ПО БРЕНДУ: только Apple-линейки, где чип реально существует. Токены
  // «M4»/«M5» встречаются в чужих названиях телефонов («Poco M4», «Poco M5»),
  // и без гейта они получили бы фантомный Чип.
  if (!attrs['Чип'] && isAppleChipLine(brand, normalized)) {
    const chip = extractChip(normalized)
    if (chip) attrs['Чип'] = chip
  }

  // ─── Memory / Storage ───
  if (isMac || isMacBook) {
    const memMatches = normalized.match(/\b(\d+)\s*(GB|TB)\b/gi)
    if (memMatches && memMatches.length >= 2) {
      attrs['RAM'] = memMatches[0]!.replace(/\s+/g, '').toUpperCase()
      attrs['Память'] = memMatches[1]!.replace(/\s+/g, '').toUpperCase()
    } else if (memMatches && memMatches.length === 1) {
      attrs['Память'] = memMatches[0]!.replace(/\s+/g, '').toUpperCase()
    }
    if (isMacBook) {
      const screenMatch = normalized.match(/\b(13|14|15|16)\b/)
      if (screenMatch) attrs['Экран'] = screenMatch[1]! + '"'
    }
  } else if (!isDyson && !isTV) {
    // Samsung/Huawei/Honor: 12/256Gb, 16/1TB
    const slashMem = normalized.match(/\b(\d+)\/(\d+)\s*(GB|TB|Gb|gb)?\b/i)
    if (slashMem) {
      attrs['RAM'] = slashMem[1]! + 'GB'
      const unit = (slashMem[3] ?? 'GB').toUpperCase()
      attrs['Память'] = slashMem[2]! + unit
    } else {
      // iPhone/iPad/Pixel/Xbox/Steam Deck: 256GB, 1TB
      const storageSingle = normalized.match(/\b(\d+\s*(?:GB|TB))\b/i)
      if (storageSingle) {
        attrs['Память'] = storageSingle[1]!.replace(/\s+/g, '').toUpperCase()
      }
    }
  }

  // ─── SIM: обучаемый словарь (Этап 2). Хардкод «Китай/Гонконг → 2 SIM, иначе
  // eSIM» заменён на resolveSimType: явная метка → модельный оверрайд (Air) →
  // страна+поколение. Нет правила → атрибут не ставим, страна попадёт в очередь
  // обучения (не угадываем). Аксессуары SIM не получают.
  //
  // Гейт «телефон»: SIM ставится только строкам, которые пересчёт (sim-recalc)
  // считает телефоном — та же isPhone. Иначе Apple-страновое правило дотягивалось
  // до наушников/часов/макбуков (бренд Apple + страна) и рисовало фантомный SIM.
  const rowIsPhone = isPhone({
    id: 0,
    attributes: { fullName },
    product: { name: fullName, brand: brand || null, category: { name: category } },
  })
  if (rowIsPhone) {
    const explicitSim = normalized.match(/\b(2Sim|2\s*SIM|eSim|e-Sim|1Sim\+eSim|SIM\s*\+\s*eSIM|Dual\s*SIM)\b/i)?.[1]
    const simResolved = resolveSimType(
      { explicit: explicitSim, country, brand, names: [fullName, normalized] },
      simCtx.rules,
      simCtx.aliases,
    )
    if (simResolved.simType) {
      attrs['SIM'] = simResolved.simType
    } else if (simResolved.reason === 'unknown' && /iphone/i.test(normalized)) {
      // Копим ключи для очереди «не узнал» — показываем владельцу в админке.
      // Ключ со связкой «бренд · страна»: страновые правила принадлежат Apple,
      // и андроид требует своего правила, а не чужого странового.
      const key = simResolved.missingBrand && simResolved.missingBrand.toLowerCase() !== 'apple'
        ? `${simResolved.missingBrand} · ${simResolved.missingKey!}`
        : simResolved.missingKey!
      simCtx.unknown.set(key, (simCtx.unknown.get(key) ?? 0) + 1)
    }
  }

  // ─── Connectivity (iPad) ───
  if (isiPad) {
    if (/Wi-Fi\s*\+\s*Cellular/i.test(normalized)) attrs['Связь'] = 'Wi-Fi + Cellular'
    else if (/\bLTE\b/i.test(normalized)) attrs['Связь'] = 'LTE'
    else if (/\bWi-Fi\b/i.test(normalized)) attrs['Связь'] = 'Wi-Fi'
  }

  // ─── Apple Watch: screen size + band ───
  if (isWatch && !isGarmin) {
    const watchSize = normalized.match(/\b(40|42|44|45|46|49)\s*(mm|MM)?\b/)
    if (watchSize) attrs['Размер'] = watchSize[1] + 'mm'
    const bandSize = normalized.match(/\b([SML]\/[SML])\b/)
    if (bandSize) attrs['Ремешок'] = bandSize[1]!
  }

  // ─── Garmin: size in mm ───
  if (isGarmin) {
    const garminSize = normalized.match(/\b(\d{2})\s*mm\b/i)
    if (garminSize) attrs['Размер'] = garminSize[1] + 'mm'
  }

  // ─── TV: diagonal ───
  if (isTV) {
    const diagMatch = normalized.match(/\b(\d{2})["″"]\s*/)
    if (diagMatch) attrs['Диагональ'] = diagMatch[1] + '"'
  }

  // ─── Dyson: completion + accessories ───
  if (isDyson) {
    for (const comp of DYSON_COMPLETIONS) {
      if (new RegExp(`\\b${comp}\\b`, 'i').test(normalized)) {
        attrs['Серия'] = comp
        break
      }
    }
    if (/без кейса/i.test(normalized)) attrs['Комплектация'] = 'Без кейса'
    else if (/с кейсом/i.test(normalized)) attrs['Комплектация'] = 'С кейсом'
    else if (/диффузор/i.test(normalized)) attrs['Комплектация'] = 'Диффузор'
    if (/Coanda\s*2x/i.test(normalized)) attrs['Серия'] = 'Coanda 2x'
    if (/\bLite\b/i.test(normalized)) attrs['Серия'] = 'Lite'
  }

  // ─── Camera: kit type ───
  if (isCamera) {
    // DJI (RC 2) etc.
    const rcMatch = normalized.match(/\(RC\s*(\d*)\)/)
    if (rcMatch) {
      attrs['Комплектация'] = 'RC' + (rcMatch[1] ? ' ' + rcMatch[1] : '')
    } else {
      for (const kit of CAMERA_KITS) {
        if (new RegExp(`\\b${kit}\\b`, 'i').test(normalized)) {
          attrs['Комплектация'] = kit
          break
        }
      }
    }
  }

  // ─── Color ───
  // Dyson compound colors: Nickel/Copper, Blue/Copper
  if (isDyson) {
    const dysonColor = normalized.match(/\b(\w+\/\w+)\b/)
    if (dysonColor) {
      attrs['Цвет'] = dysonColor[1]!
    }
  }
  if (!attrs['Цвет']) {
    const lowerName = normalized.toLowerCase()
    for (const color of ALL_COLORS) {
      if (lowerName.includes(color.toLowerCase())) {
        attrs['Цвет'] = color
        break
      }
    }
  }

  // ─── Connector ───
  if (/USB-C/i.test(normalized)) attrs['Разъём'] = 'USB-C'
  else if (/\bLightning\b/i.test(normalized)) attrs['Разъём'] = 'Lightning'

  // ─── Console: PS5 revision ───
  const revMatch = normalized.match(/(\d+)\s*ревизия/i)
  if (revMatch) attrs['Ревизия'] = revMatch[1]!

  // ─── Accessories / Комплектация ───
  if (/без кейса/i.test(normalized)) attrs['Комплектация'] = 'Без кейса'
  else if (/с кейсом/i.test(normalized)) attrs['Комплектация'] = 'С кейсом'
  else if (/диффузор/i.test(normalized)) attrs['Комплектация'] = 'Диффузор'
  else if (/кейс MagSafe/i.test(normalized)) attrs['Комплектация'] = 'Кейс MagSafe'
  else if (/\bGift\s*Edition\b/i.test(normalized)) attrs['Комплектация'] = 'Gift Edition'
  else if (/без зарядки/i.test(normalized)) attrs['Комплектация'] = 'Без зарядки'
  if (/\+?\s*Touch\s*ID/i.test(normalized)) attrs['Touch ID'] = 'Да'
  if (/Nano\s*Texture/i.test(normalized)) attrs['Дисплей'] = 'Nano Texture'
  else if (/\bStanda?r?[dt]\s*Display\b/i.test(normalized)) attrs['Дисплей'] = 'Standard'
  if (/Coanda\s*2x/i.test(normalized)) attrs['Серия'] = 'Coanda 2x'

  // ─── Condition notes ───
  if (/мятая коробка/i.test(normalized)) attrs['Состояние'] = 'Мятая коробка'
  else if (/распакованы/i.test(normalized)) attrs['Состояние'] = 'Распакован'

  // ─── 5G ───
  if (/\b5G\b/i.test(normalized)) attrs['Связь'] = '5G'

  // ─── Apple Watch: material + band type + GPS/LTE ───
  if (isWatch && !isGarmin) {
    if (/\b(Titanium|Ti)\b/i.test(normalized)) attrs['Материал'] = 'Titanium'
    else if (/\b(Aluminum|Al)\b/i.test(normalized)) attrs['Материал'] = 'Aluminum'

    // Band type
    const bandTypes: [RegExp, string][] = [
      [/\bSport\s*Band\b/i, 'Sport Band'],
      [/\bOcean\s*Band\b/i, 'Ocean Band'],
      [/\bAlpine\s*Loop\b/i, 'Alpine Loop'],
      [/\bTrail\s*Loop\b/i, 'Trail Loop'],
      [/\bMilanese\s*Loop?\b/i, 'Milanese Loop'],
      [/\bLink\s*Bracelet\b/i, 'Link Bracelet'],
      [/\bCharcoal\s*Loop\b/i, 'Charcoal Loop'],
      [/\bBraided\s*Solo\s*Loop\b/i, 'Braided Solo Loop'],
    ]
    for (const [re, label] of bandTypes) {
      if (re.test(normalized)) { attrs['Ремешок'] = label; break }
    }

    if (/\bCellular\b/i.test(normalized) || /\bLTE\b/i.test(normalized)) attrs['Связь'] = 'Cellular'
    else if (/\bGPS\b/i.test(normalized)) attrs['Связь'] = 'GPS'
  }

  // ─── Garmin: band material + size ───
  if (isGarmin) {
    if (/\b-?(XS)\b/i.test(normalized)) attrs['Размер'] = 'XS'
    else if (/\b-?(XL)\b/i.test(normalized)) attrs['Размер'] = 'XL'

    if (/\bSilicone\b/i.test(normalized)) attrs['Ремешок'] = 'Silicone'
    else if (/\bNylon\b/i.test(normalized)) attrs['Ремешок'] = 'Nylon'
    else if (/\bLeather\b/i.test(normalized)) attrs['Ремешок'] = 'Leather'

    if (/\bCarbon\s*DLC\b/i.test(normalized)) attrs['Материал'] = 'Carbon DLC'
    else if (/\bDamascus\s*STEEL/i.test(normalized)) attrs['Материал'] = 'Damascus Steel'
  }

  // ─── iMac: screen size ───
  if (/\biMac\b/i.test(normalized)) {
    if (/\b24\b/.test(normalized)) attrs['Экран'] = '24"'
  }

  // ─── Bare storage for iPad/Pixel/Apple TV (fallback when no GB suffix) ───
  if (!attrs['Память'] && (isiPad || /\bPixel\b/i.test(normalized) || /\bApple\s*TV\b/i.test(normalized))) {
    const bareStorage = normalized.match(/\b(64|128|256|512|1024)\b/)
    if (bareStorage) attrs['Память'] = bareStorage[1] + 'GB'
  }

  // ─── RAM after Max/Pro/Ultra ───
  if (!attrs['RAM'] && (isMac || isMacBook)) {
    const ramMatch = normalized.match(/\b(?:Max|Pro|Ultra)\s+(16|24|32|48|64|96|128)\b/)
    if (ramMatch) attrs['RAM'] = ramMatch[1] + 'GB'
  }

  // ─── DJI: combo type ───
  if (/\bDJI\b/i.test(normalized)) {
    const comboMatch = normalized.match(/\b(Motion|Premium|Creator|Adventure)\s*Combo\b/i)
    if (comboMatch) attrs['Комплектация'] = comboMatch[1] + ' Combo'
    else if (/Базовая Версия/i.test(normalized) || /базовая версия/i.test(normalized)) attrs['Комплектация'] = 'Базовая'
  }

  // ─── Ray-Ban / Oakley: lens attributes ───
  if (/\bRay-?Ban\b/i.test(normalized) || /\bOakley\b/i.test(normalized)) {
    const lensProps: string[] = []
    if (/\bMatte\b/i.test(normalized)) lensProps.push('Matte')
    else if (/\bShiny\b/i.test(normalized)) lensProps.push('Shiny')
    if (/\bPolar/i.test(normalized)) lensProps.push('Polarized')
    if (/\bTransitions\b/i.test(normalized)) lensProps.push('Transitions')
    if (/\bPrizm\b/i.test(normalized)) lensProps.push('Prizm')
    if (/\bClear\b/i.test(normalized) && !lensProps.includes('Transitions')) lensProps.push('Clear')
    if (lensProps.length) attrs['Линзы'] = lensProps.join(' ')
  }

  // ─── Studio/Pro Display: glass + mount ───
  if (/\b(Studio|Pro)\s*Display\b/i.test(normalized)) {
    if (/\bNano\s*Glass\b/i.test(normalized)) attrs['Дисплей'] = 'Nano Glass'
    else if (/\bStandard\s*Glass\b/i.test(normalized)) attrs['Дисплей'] = 'Standard Glass'
    if (/\bTilt\s*Stand\b/i.test(normalized)) attrs['Крепление'] = 'Tilt Stand'
    else if (/\bVESA/i.test(normalized)) attrs['Крепление'] = 'VESA Mount'
  }

  // ─── Noise cancellation ───
  if (/с шумоподавлением/i.test(normalized)) attrs['Шумоподавление'] = 'Да'

  // ─── iPad: WIFI ───
  if (/iPad/i.test(normalized)) {
    if (/WIFI|Wi-?Fi/i.test(normalized) && !/Cellular/i.test(normalized)) {
      if (!attrs['Связь']) attrs['Связь'] = 'Wi-Fi'
    }
  }

  // ─── Yandex: smart home / AI attrs ───
  if (/Zigbee/i.test(normalized)) attrs['Умный дом'] = 'Zigbee'
  if (/YaGPT/i.test(normalized)) attrs['AI'] = 'YaGPT'

  // ─── Country (from sheet column) ───
  if (country) attrs['Страна'] = country

  return attrs
}

// ─── Stale price detection ──────────────────────────────────────────────────

export interface StaleItem {
  name: string
  sheetName: string
  lastUpdate: string
}

/**
 * Проверяет устаревшие цены (>6 часов без обновления) по колонке «Дата обновления» в Google Sheets.
 */
export async function checkStalePrices(): Promise<StaleItem[]> {
  const SIX_HOURS = 6 * 60 * 60 * 1000
  const now = Date.now()
  const staleItems: StaleItem[] = []

  const sheetNames = await getProductSheetNames()
  if (sheetNames.length === 0) return staleItems

  for (const sheetName of sheetNames) {
    try {
      const data = await readSheet(sheetName)
      if (data.length === 0) continue

      const COL = mapHeaders(data[0]!)
      for (let i = 1; i < data.length; i++) {
        const row = data[i]!
        const name = col(row, COL.fullName)
        const price = col(row, COL.price)
        const dateStr = col(row, COL.updateDate)

        if (!name || !price) continue
        // Пропускаем категории не зависящие от курса
        const category = col(row, COL.category)
        if (category === 'Услуги' || category === 'Аксессуары') continue

        let isStale = false
        if (!dateStr) {
          isStale = true
        } else {
          // Формат DD.MM.YYYY или DD.MM.YYYY HH:MM
          const parts = dateStr.split('.')
          if (parts.length >= 3) {
            const dayMonthYear = parts[2]!.split(' ')
            const year = parseInt(dayMonthYear[0]!, 10)
            const month = parseInt(parts[1]!, 10) - 1
            const day = parseInt(parts[0]!, 10)
            let updateDate = new Date(year, month, day)
            if (dayMonthYear[1]) {
              const timeParts = dayMonthYear[1]!.split(':')
              updateDate.setHours(parseInt(timeParts[0] ?? '', 10) || 0, parseInt(timeParts[1] ?? '', 10) || 0)
            }
            isStale = (now - updateDate.getTime()) > SIX_HOURS
          } else {
            isStale = true
          }
        }

        if (isStale) {
          staleItems.push({ name, sheetName, lastUpdate: dateStr || 'никогда' })
        }
      }
    } catch (err) {
      log.error('Stale prices check failed', { sheetName, error: String(err) })
    }
  }

  return staleItems
}

/**
 * Готовит текст для копирования поставщикам — список позиций с устаревшими ценами.
 */
export function formatStaleSupplierMessage(items: StaleItem[]): string {
  const names = items.map(item =>
    item.name.replace(/\s*\([A-Z0-9/]+\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
  )
  // Дедуплицировать
  const unique = [...new Set(names)]
  return `Коллеги, добрый день, подскажите, пожалуйста, актуальные цены на данные позиции:\n\n${unique.join('\n')}`
}
