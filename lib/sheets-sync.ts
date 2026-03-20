/**
 * lib/sheets-sync.ts — Синхронизация товаров из Google Sheets в БД
 *
 * Читает все листы с товарами, создаёт/обновляет товары и варианты в БД.
 * Каждая строка таблицы = один ProductVariant.
 * «Название модели» содержит все атрибуты — парсим regex.
 */

import { Decimal } from '@prisma/client/runtime/client'
import { prisma } from './prisma'
import { readSheet, getSheetNames } from './google-sheets'

// Листы с товарами
const MAIN_SHEET = 'Товарное наличие вариант 1'
const PRODUCT_SHEETS = [MAIN_SHEET, 'Аксессуары', 'Услуги']
const DEFAULT_QTY = 3 // если «В наличие» пусто

// Column indices for writeback (supplier, date) — per sheet type
// Main sheet: G=price(6), I=supplier(8), J=date(9)
// Accessories/Services: F=price(5), H=supplier(7), I=date(8)
export const WRITEBACK_COLS = {
  [MAIN_SHEET]:  { price: 'G', supplier: 'I', date: 'J' },
  'Аксессуары':  { price: 'F', supplier: 'H', date: 'I' },
  'Услуги':      { price: 'F', supplier: 'H', date: 'I' },
} as Record<string, { price: string; supplier: string; date: string }>

export interface SheetRow {
  brand: string
  category: string
  fullName: string  // «Название модели» — полная строка
  country: string
  price: number
  quantity: number  // из «В наличие» или DEFAULT_QTY
  sheetName: string
  rowIndex: number  // номер строки в таблице (для обратной записи)
}

/**
 * Читает все товарные листы и возвращает массив строк.
 */
export async function readAllProducts(): Promise<SheetRow[]> {
  const allSheets = await getSheetNames()
  const rows: SheetRow[] = []

  for (const sheetName of PRODUCT_SHEETS) {
    if (!allSheets.includes(sheetName)) continue

    const data = await readSheet(sheetName)
    const isMain = sheetName === MAIN_SHEET

    // Пропускаем заголовок (строка 1)
    for (let i = 1; i < data.length; i++) {
      const row = data[i]

      let brand: string, category: string, fullName: string, country: string, priceRaw: string, qtyRaw: string

      if (isMain) {
        // Основной лист: B=бренд, D=категория/магазин, E=название, F=страна, G=цена, H=кол-во
        brand    = (row[1] ?? '').trim()
        category = (row[3] ?? '').trim()   // D: Категория/магазин (для сайта)
        fullName = (row[4] ?? '').trim()   // E: Название модели
        country  = (row[5] ?? '').trim()   // F: Страна
        priceRaw = (row[6] ?? '').toString().replace(/\s/g, '').replace(',', '.')  // G: Цена
        qtyRaw   = (row[7] ?? '').toString().trim()  // H: В наличие
      } else {
        // Аксессуары, Услуги: B=бренд, D=название, E=страна, F=цена, G=кол-во
        brand    = (row[1] ?? '').trim()
        category = sheetName               // имя листа = категория для сайта
        fullName = (row[3] ?? '').trim()   // D: Название
        country  = (row[4] ?? '').trim()   // E: Страна
        priceRaw = (row[5] ?? '').toString().replace(/\s/g, '').replace(',', '.')  // F: Цена
        qtyRaw   = (row[6] ?? '').toString().trim()  // G: В наличие
      }

      if (!category) category = sheetName
      if (!fullName || !priceRaw) continue // пропуск пустых строк

      const price = parseFloat(priceRaw)
      if (isNaN(price) || price <= 0) continue

      let quantity = DEFAULT_QTY
      if (qtyRaw !== '') {
        const q = parseInt(qtyRaw, 10)
        if (!isNaN(q)) quantity = q
      }

      rows.push({
        brand,
        category: category || sheetName, // если нет категории — имя листа
        fullName,
        country,
        price,
        quantity,
        sheetName,
        rowIndex: i + 1, // +1 потому что Google Sheets 1-indexed
      })
    }
  }

  return rows
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
export async function syncProductsFromSheets(): Promise<{
  created: number
  updated: number
  disabled: number
  total: number
  errors: string[]
}> {
  // Full reset: clear all products if SHEETS_FULL_RESET=true and no real orders
  if (process.env.SHEETS_FULL_RESET === 'true') {
    const realOrders = await prisma.order.count()
    if (realOrders === 0) {
      console.log('[Sheets Sync] Clearing old products (SHEETS_FULL_RESET=true)...')
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
      console.log('[Sheets Sync] Old products cleared')
    } else {
      console.log(`[Sheets Sync] Skipping cleanup — ${realOrders} real orders exist`)
    }
  }

  let rows: SheetRow[]
  try {
    rows = await readAllProducts()
  } catch (err) {
    console.error(`[Sheets Sync] Failed to read Google Sheets: ${err}`)
    return { created: 0, updated: 0, disabled: 0, total: 0, errors: [`Failed to read sheets: ${err}`] }
  }
  console.log(`[Sheets Sync] Read ${rows.length} rows from Google Sheets`)

  // ── Step 1: Group rows by productName + category ──────────────────────────

  type VariantData = {
    fullName: string
    price: number
    quantity: number
    attrs: Record<string, string>
    rowIndex: number
    sheetName: string
  }
  type GroupedProduct = {
    productName: string
    brand: string
    category: string
    variants: VariantData[]
  }

  const groups = new Map<string, GroupedProduct>()

  for (const row of rows) {
    const productName = extractProductName(row.fullName, row.brand)
    const attrs = parseAttributes(row.fullName, row.brand, row.country)
    if (row.country) attrs['Страна'] = row.country

    const key = `${productName}|${row.category}`

    if (!groups.has(key)) {
      groups.set(key, { productName, brand: row.brand, category: row.category, variants: [] })
    }

    groups.get(key)!.variants.push({
      fullName: row.fullName,
      price: row.price,
      quantity: row.quantity,
      attrs,
      rowIndex: row.rowIndex,
      sheetName: row.sheetName,
    })
  }

  console.log(`[Sheets Sync] Grouped into ${groups.size} products`)

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
  const errors: string[] = []
  const seenVariantIds = new Set<number>()
  const startTime = Date.now()
  let groupIdx = 0

  for (const [key, group] of groups) {
    groupIdx++
    if (groupIdx % 20 === 0) {
      console.log(`[Sheets Sync] Processing product ${groupIdx}/${groups.size}...`)
    }
    if (Date.now() - startTime > 10 * 60 * 1000) {
      console.error(`[Sheets Sync] Timeout after 10 minutes at product ${groupIdx}/${groups.size}`)
      errors.push(`Timeout after 10 minutes at product ${groupIdx}`)
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

      // Aggregate attributes for Product.attributes (chips)
      const aggregated: Record<string, Set<string>> = {}
      for (const v of group.variants) {
        for (const [attrKey, attrVal] of Object.entries(v.attrs)) {
          if (attrKey === 'fullName' || attrKey === 'Страна') continue
          if (!aggregated[attrKey]) aggregated[attrKey] = new Set()
          aggregated[attrKey].add(attrVal)
        }
      }
      const productAttributes: Record<string, string[]> = {}
      for (const [k, vals] of Object.entries(aggregated)) {
        if (vals.size > 1) {
          productAttributes[k] = [...vals].sort()
        }
      }

      const minPrice = Math.min(...group.variants.map(v => v.price))
      const totalQty = group.variants.reduce((s, v) => s + v.quantity, 0)

      const productKey = group.productName + '|' + category.id
      let product = productsByKey.get(productKey)

      if (!product) {
        // Create new product
        const catNum = String(category.id).padStart(2, '0')
        const count = await prisma.product.count({ where: { categoryId: category.id } })
        const productSku = `${catNum}-${String(count + 1).padStart(4, '0')}`

        product = await prisma.product.create({
          data: {
            sku: productSku,
            name: group.productName,
            brand: group.brand || null,
            categoryId: category.id,
            price: new Decimal(minPrice),
            stock: totalQty,
            quantity: totalQty,
            isAvailable: totalQty > 0,
            attributes: productAttributes,
            specs: {},
            photos: [],
          },
        })
        productsByKey.set(productKey, product)
        created++
      } else {
        // Update existing product
        await prisma.product.update({
          where: { id: product.id },
          data: {
            price: new Decimal(minPrice),
            stock: totalQty,
            quantity: totalQty,
            isAvailable: totalQty > 0,
            attributes: productAttributes,
            brand: group.brand || undefined,
          },
        })
        updated++
      }

      // Create/update variants
      for (const v of group.variants) {
        try {
          const existing = variantsByFullName.get(v.fullName)
          if (existing) {
            await prisma.productVariant.update({
              where: { id: existing.id },
              data: {
                productId: product.id,
                price: new Decimal(v.price),
                quantity: v.quantity,
                inStock: v.quantity > 0,
                attributes: { ...v.attrs, fullName: v.fullName },
              },
            })
            seenVariantIds.add(existing.id)
          } else {
            const variantCount = await prisma.productVariant.count({ where: { productId: product.id } })
            const variantSku = `${product.sku}-${String(variantCount + 1).padStart(3, '0')}`

            const newVariant = await prisma.productVariant.create({
              data: {
                productId: product.id,
                sku: variantSku,
                price: new Decimal(v.price),
                quantity: v.quantity,
                inStock: v.quantity > 0,
                attributes: { ...v.attrs, fullName: v.fullName },
                photos: [],
              },
            })
            seenVariantIds.add(newVariant.id)
          }
        } catch (err) {
          const msg = `Row ${v.rowIndex} (${v.sheetName}): ${v.fullName} — ${err}`
          errors.push(msg)
          console.error(`[Sheets Sync] Error row ${v.rowIndex}: ${err}`)
        }
      }
    } catch (err) {
      const msg = `Product "${group.productName}" (${group.category}): ${err}`
      errors.push(msg)
      console.error(`[Sheets Sync] Error product: ${msg}`)
    }
  }

  // ── Step 4: Disable variants not seen in the sheet ────────────────────────

  const allVariantsInDb = await prisma.productVariant.findMany({
    where: { NOT: { id: { in: Array.from(seenVariantIds) } } },
    select: { id: true, productId: true, attributes: true },
  })

  const toDisable = allVariantsInDb.filter(v => {
    const a = v.attributes as Record<string, unknown> | null
    return a && typeof a === 'object' && 'fullName' in a
  })

  let disabled = 0
  if (toDisable.length > 0) {
    await prisma.productVariant.updateMany({
      where: { id: { in: toDisable.map(v => v.id) } },
      data: { quantity: 0, inStock: false },
    })
    disabled = toDisable.length

    const affectedProductIds = [...new Set(toDisable.map(v => v.productId))]
    for (const pid of affectedProductIds) {
      const totalQty = await prisma.productVariant.aggregate({
        where: { productId: pid },
        _sum: { quantity: true },
      })
      await prisma.product.update({
        where: { id: pid },
        data: {
          stock: totalQty._sum.quantity ?? 0,
          quantity: totalQty._sum.quantity ?? 0,
          isAvailable: (totalQty._sum.quantity ?? 0) > 0,
        },
      })
    }
  }

  console.log(`[Sheets Sync] Done: ${created} created, ${updated} updated, ${disabled} disabled, ${errors.length} errors`)
  return { created, updated, disabled, total: rows.length, errors }
}

// Полный список цветов (длинные первыми для жадного матча)
const ALL_COLORS = [
  'Cobalt Violet', 'Sky Blue', 'Rose Gold', 'Space Gray', 'Jet Black',
  'Alpine Green', 'Deep Purple', 'Dark Green', 'Sierra Blue', 'Pur Fog',
  'Space Black',
  'Голубой', 'Черный', 'Белый', 'Серебристый', 'Золотой', 'Синий',
  'Красный', 'Зеленый', 'Оранжевый', 'Фиолетовый', 'Розовый',
  'Jetblack', 'Black', 'White', 'Silver', 'Gold', 'Blue', 'Red', 'Green',
  'Orange', 'Purple', 'Midnight', 'Starlight', 'Pink', 'Yellow', 'Cream',
  'Mint', 'Lavender', 'Coral', 'Graphite', 'Natural', 'Titanium',
  'Desert', 'Navy', 'Denim', 'Gray', 'Teal', 'Bronze',
  'Burgundy', 'Copper', 'Ivory', 'Sage', 'Stone', 'Ultramarine',
]

/**
 * Извлекает базовое имя продукта из полного названия.
 * Оставляет размер экрана для часов (40, 42, 44, 46, 49) если в названии есть Watch.
 *
 * "iPhone 16 512GB Black 2Sim (Китай)"                        → "iPhone 16"
 * "iPhone 16 Plus 128GB Ultramarine (Индия)"                   → "iPhone 16 Plus"
 * "iPhone 16 Pro 128GB Desert (Южная Корея)"                   → "iPhone 16 Pro"
 * "Samsung Galaxy S26 Ultra 16/1TB (SM-S948B) Cobalt Violet"   → "Samsung Galaxy S26 Ultra"
 * "Apple Watch SE 40 Midnight S/M 2024"                        → "Apple Watch SE 40"
 * "Apple Watch S11 46 Jet Black S/M MEUW4"                     → "Apple Watch S11 46"
 */
function extractProductName(fullName: string, brand: string): string {
  const isWatch = /watch/i.test(fullName)
  let name = fullName

  // a) Убрать страну в скобках (русские символы, включая пробелы): (Китай), (Южная Корея)
  name = name.replace(/\s*\([А-Яа-яЁё\s]+\)\s*/g, ' ')

  // b) Убрать артикулы в скобках: (SM-S948B), (MXEA3)
  name = name.replace(/\s*\([A-Z0-9/-]+\)\s*/g, ' ')

  // c) Убрать пустые скобки
  name = name.replace(/\(\s*\)/g, '')

  // d) Убрать память: 128GB, 256GB, 16/1TB, 12/256Gb, 8/128
  name = name.replace(/\s*\d+\/\d+\s*(GB|TB|Gb|gb)?\s*/gi, ' ')
  name = name.replace(/\s*\d+\s*(GB|TB|Gb)\b/gi, ' ')

  // e) Убрать SIM тип: 2Sim, eSim, e-Sim, 1Sim+eSim, Dual SIM, DS
  name = name.replace(/\b(2Sim|eSim|e-Sim|1Sim\+eSim|Dual\s*SIM|DS)\b/gi, '')

  // f) Убрать цвета
  for (const color of ALL_COLORS) {
    name = name.replace(new RegExp(`\\b${color}\\b`, 'gi'), '')
  }

  // g) Убрать ремешки: S/M, M/L
  name = name.replace(/\b[SML]\/[SML]\b/g, '')

  // h) Убрать год: 2024, 2025, 2026
  name = name.replace(/\b20[2-3]\d\b/g, '')

  // i) Убрать GPS/LTE/Wi-Fi/Cellular
  name = name.replace(/\b(GPS|LTE|Wi-Fi|Cellular)\b/gi, '')

  // j) Убрать артикулы-коды: MRP83, MWWF3, MEUW4 (2-4 буквы + 2-4 цифры/буквы)
  name = name.replace(/\b[A-Z]{2,4}[A-Z0-9]{2,4}\b/g, '')

  // k) Убрать SM-xxx: SM-F741B, SM-S948B
  name = name.replace(/\bSM-[A-Z0-9/]+\b/g, '')

  // l) Для часов: вернуть размер экрана если он был удалён артикульным regex
  // (размеры 40-49 не матчатся артикульным regex, но на всякий случай)

  // Убрать эмодзи-флаги и прочие эмодзи
  name = name.replace(/[\u{1F1E0}-\u{1F1FF}]{2}/gu, '')
  name = name.replace(/[\u{1F300}-\u{1FAFF}]/gu, '')

  // m) Убрать лишние пробелы
  name = name.replace(/\s+/g, ' ').trim()

  return name || fullName.slice(0, 60)
}

/**
 * Извлекает атрибуты из полного названия модели.
 */
function parseAttributes(fullName: string, brand: string, country: string): Record<string, string> {
  const attrs: Record<string, string> = {}

  // Память: 256GB, 512GB, 1TB, 16/1TB, 12/256Gb
  const storageMatch = fullName.match(/(\d+\/\d+\s*(?:GB|TB|Gb)?|\d+\s*(?:GB|TB|Gb))/i)
  if (storageMatch) {
    const raw = storageMatch[1]
    if (raw.includes('/')) {
      const parts = raw.replace(/\s*(GB|TB|Gb)/i, '').split('/')
      attrs['RAM'] = parts[0] + ' GB'
      const unit = raw.match(/(GB|TB)/i)?.[1]?.toUpperCase() || 'GB'
      attrs['Память'] = parts[1] + unit
    } else {
      attrs['Память'] = raw.replace(/\s+/g, '').toUpperCase()
    }
  }

  // SIM тип
  const simMatch = fullName.match(/\b(2Sim|eSim|e-Sim|1Sim\+eSim|Dual\s*SIM)\b/i)
  if (simMatch) attrs['SIM'] = simMatch[1]

  // Цвет (длинные первыми)
  for (const color of ALL_COLORS) {
    if (fullName.toLowerCase().includes(color.toLowerCase())) {
      attrs['Цвет'] = color
      break
    }
  }

  // Страна (из колонки таблицы)
  if (country) attrs['Страна'] = country

  // Ремешок: S/M, M/L
  const bandMatch = fullName.match(/\b([SML]\/[SML])\b/)
  if (bandMatch) attrs['Ремешок'] = bandMatch[1]

  // Размер экрана (для часов): 40, 42, 44, 45, 46, 49
  if (/watch/i.test(fullName)) {
    const sizeMatch = fullName.match(/\b(40|42|44|45|46|49)\b/)
    if (sizeMatch) attrs['Размер'] = sizeMatch[1] + 'mm'
  }

  return attrs
}

// ─── Stale price detection ──────────────────────────────────────────────────

export interface StaleItem {
  name: string
  sheetName: string
  lastUpdate: string
}

const SHEETS_DATE_COL: Record<string, { nameCol: number; dateCol: number }> = {
  [MAIN_SHEET]:  { nameCol: 4, dateCol: 9 },   // E=name, J=date
  'Аксессуары':  { nameCol: 3, dateCol: 8 },   // D=name, I=date
  'Услуги':      { nameCol: 3, dateCol: 8 },
}

const SHEETS_PRICE_COL: Record<string, number> = {
  [MAIN_SHEET]: 6,  // G
  'Аксессуары': 5,  // F
  'Услуги': 5,
}

/**
 * Проверяет устаревшие цены (>6 часов без обновления) по колонке «Дата обновления» в Google Sheets.
 */
export async function checkStalePrices(): Promise<StaleItem[]> {
  const SIX_HOURS = 6 * 60 * 60 * 1000
  const now = Date.now()
  const staleItems: StaleItem[] = []

  for (const sheetName of PRODUCT_SHEETS) {
    const cfg = SHEETS_DATE_COL[sheetName]
    const priceCol = SHEETS_PRICE_COL[sheetName]
    if (!cfg) continue

    try {
      const data = await readSheet(sheetName)
      for (let i = 1; i < data.length; i++) {
        const row = data[i]
        const name = (row[cfg.nameCol] ?? '').trim()
        const price = (row[priceCol] ?? '').toString().trim()
        const dateStr = (row[cfg.dateCol] ?? '').toString().trim()

        if (!name || !price) continue

        let isStale = false
        if (!dateStr) {
          isStale = true
        } else {
          // Формат DD.MM.YYYY или DD.MM.YYYY HH:MM
          const parts = dateStr.split('.')
          if (parts.length >= 3) {
            const dayMonthYear = parts[2].split(' ')
            const year = parseInt(dayMonthYear[0], 10)
            const month = parseInt(parts[1], 10) - 1
            const day = parseInt(parts[0], 10)
            let updateDate = new Date(year, month, day)
            if (dayMonthYear[1]) {
              const timeParts = dayMonthYear[1].split(':')
              updateDate.setHours(parseInt(timeParts[0], 10) || 0, parseInt(timeParts[1], 10) || 0)
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
      console.error(`[Stale Prices] Error reading ${sheetName}: ${err}`)
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
