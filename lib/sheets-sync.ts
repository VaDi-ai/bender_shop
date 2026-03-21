/**
 * lib/sheets-sync.ts — Синхронизация товаров из Google Sheets в БД
 *
 * Один лист, атрибуты в отдельных колонках (Цвет, Память, Размер, Страна).
 * Каждая строка таблицы = один ProductVariant.
 * Колонки приоритетны, парсинг названия — fallback.
 */

import { Decimal } from '@prisma/client/runtime/client'
import { prisma } from './prisma'
import { readSheet, getSheetNames } from './google-sheets'

const DEFAULT_QTY = parseInt(process.env.DEFAULT_STOCK_QTY || '3', 10) // если «В наличие» пусто

// Column letters for writeback (supplier, date)
export const WRITEBACK_COLS = {
  price: 'J',      // Рекомендованная стоимость
  supplier: 'L',   // Лучший поставщик
  date: 'M',       // Дата обновления
}

export interface SheetRow {
  brand: string
  category: string   // «Общая категория» (для сайта)
  fullName: string   // «Название модели»
  color: string      // из колонки F
  memory: string     // из колонки G
  size: string       // из колонки H
  country: string
  price: number
  quantity: number
  sheetName: string
  rowIndex: number
}

/**
 * Читает первый лист таблицы и возвращает массив строк.
 */
export async function readAllProducts(): Promise<SheetRow[]> {
  const allSheets = await getSheetNames()
  const sheetName = allSheets[0] // Первый лист
  if (!sheetName) return []

  const data = await readSheet(sheetName)
  const rows: SheetRow[] = []

  for (let i = 1; i < data.length; i++) {
    const row = data[i]

    const brand    = (row[1] ?? '').toString().trim()       // B: Бренд
    const category = (row[3] ?? '').toString().trim()       // D: Общая категория (для сайта)
    const fullName = (row[4] ?? '').toString().trim()       // E: Название модели
    const color    = (row[5] ?? '').toString().trim()       // F: Цвет
    const memory   = (row[6] ?? '').toString().trim()       // G: Память
    const size     = (row[7] ?? '').toString().trim()       // H: Размер
    const country  = (row[8] ?? '').toString().trim()       // I: Страна
    const priceRaw = (row[9] ?? '').toString().replace(/\s/g, '').replace(',', '.')  // J: Цена
    const qtyRaw   = (row[10] ?? '').toString().trim()      // K: В наличие

    if (!fullName || !priceRaw) continue

    const price = parseFloat(priceRaw)
    if (isNaN(price) || price <= 0) continue

    let quantity = DEFAULT_QTY
    if (qtyRaw !== '') {
      const q = parseInt(qtyRaw, 10)
      if (!isNaN(q)) quantity = q
    }

    rows.push({
      brand,
      category: category || 'Другое',
      fullName,
      color,
      memory,
      size,
      country,
      price,
      quantity,
      sheetName,
      rowIndex: i + 1,
    })
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
export async function syncProductsFromSheets(shouldAbort?: () => boolean): Promise<{
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
    const attrs = getAttributes(row)

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
    if (shouldAbort?.()) {
      console.log('[Sheets Sync] Aborted by user')
      break
    }
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
        const productSku = `${catNum}-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(-3)}`

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
            const variantSku = `${product.sku}-${Date.now().toString(36).slice(-3)}${Math.random().toString(36).slice(-2)}`

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

// ─── Color dictionary (long first for greedy match) ─────────────────────────

const COLORS_LONG = [
  // Samsung Titanium compounds
  'Titanium Silverblue', 'Titanium Whitesilver', 'Titanium Pinkgold',
  'Titanium Black', 'Titanium Gray',
  // Standard compounds
  'Cobalt Violet', 'Cobalt Blue', 'Sky Blue', 'Rose Gold', 'Space Gray', 'Space Black',
  'Jet Black', 'Alpine Green', 'Deep Purple', 'Dark Green', 'Sierra Blue',
  'Pur Fog', 'Anchor Blue', 'Prussian Blue', 'Vinca Blue', 'Icy Blue',
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
]
const COLORS_SHORT = [
  'Jetblack', 'Iceblue', 'Icyblue', 'Pinkgold', 'Silverblue', 'Whitesilver',
  'Black', 'White', 'Silver', 'Gold', 'Blue', 'Red', 'Green',
  'Orange', 'Purple', 'Midnight', 'Starlight', 'Pink', 'Yellow', 'Cream',
  'Mint', 'Lavender', 'Coral', 'Graphite', 'Natural', 'Titanium',
  'Desert', 'Navy', 'Denim', 'Gray', 'Teal', 'Bronze', 'Shadow',
  'Burgundy', 'Copper', 'Ivory', 'Sage', 'Stone', 'Ultramarine',
  'Charcoal', 'Fuchsia', 'Obsidian', 'Porcelain', 'Hazel', 'Peony',
  'Wintergreen', 'Bay', 'Nickel', 'Topaz', 'Neon', 'Turquoise',
  'Camouflage', 'Cobalt', 'Chrome', 'Sterling', 'Volcanic', 'Pop',
]
// Cyrillic colors — \b doesn't work with Cyrillic, handled separately
const CYRILLIC_COLORS = [
  'Голубой', 'Черный', 'Чёрный', 'Белый', 'Серебристый', 'Золотой', 'Синий',
  'Красный', 'Зеленый', 'Зелёный', 'Оранжевый', 'Фиолетовый', 'Розовый',
  'Серый',
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
 */
function getAttributes(row: SheetRow): Record<string, string> {
  const attrs: Record<string, string> = {}

  // 1. Из колонок (приоритет)
  if (row.color) attrs['Цвет'] = row.color
  if (row.memory) attrs['Память'] = row.memory
  if (row.size) attrs['Размер'] = row.size
  if (row.country) attrs['Страна'] = row.country

  // 2. Fallback: парсинг из названия (если колонка пуста)
  const parsed = parseAttributes(row.fullName, row.brand, row.country)
  for (const key of ['Цвет', 'Память', 'RAM', 'Размер', 'SIM', 'Связь', 'Чип', 'Ремешок', 'Комплектация', 'Экран', 'Серия', 'Диагональ', 'Разъём', 'Touch ID', 'Дисплей', 'Ревизия'] as const) {
    if (!attrs[key] && parsed[key]) attrs[key] = parsed[key]
  }

  return attrs
}

/**
 * Извлекает базовое имя продукта из полного названия.
 */
function extractProductName(fullName: string, brand: string): string {
  let name = fullName

  // ─── Step 0: Normalize ───
  name = name.replace(/\bSeries\s+(\d+)\b/gi, 'S$1')  // "Series 11" → "S11"

  // ─── Step 1: Remove country in brackets (Russian) ───
  name = name.replace(/\s*\([А-Яа-яЁё/\s]+\)\s*/g, ' ')

  // ─── Step 2: Remove article codes in brackets ───
  // Keep (RC 2) for DJI — handled in parseAttributes
  const isDJI = /\bDJI\b/i.test(name)
  if (isDJI) {
    // Extract and remove (RC 2) etc. — goes to Комплектация attr
    name = name.replace(/\s*\(RC\s*\d*\)\s*/g, ' ')
  }
  name = name.replace(/\s*\([A-Z0-9/-]+\)\s*/g, ' ')  // (SM-S948B)
  name = name.replace(/\bSM-[A-Z0-9/]+\b/gi, '')       // SM-F741B
  name = name.replace(/\(\s*\)/g, '')                    // empty ()

  // ─── Step 3: Detect product type ───
  const isWatch = /\b(apple\s+)?watch\b/i.test(name)
  const isGarmin = /\bGarmin\b/i.test(name)
  const isMac = /\b(Mac\s*(mini|Studio)|iMac)\b/i.test(name)
  const isMacBook = /MacBook/i.test(name)
  const isiPad = /iPad/i.test(name)
  const isDyson = /\bDyson\b/i.test(name)
  const isTV = /\b(QN\d+|OLED|QLED|The Frame|Neo QLED)\b/i.test(name)
  const isCamera = /\b(Canon|Sony|Nikon|DJI|GoPro)\b/i.test(name)
  const isSonyAudio = /\bSony\b/i.test(name) && /\b(WH-|WF-|XM)\b/.test(name)
  const isConsole = /\b(DualSense|PlayStation|Xbox|Nintendo|Switch|Steam\s*Deck|Oculus|Quest)\b/i.test(name)

  // ─── Step 4: Remove CPU config (Mac) ───
  name = name.replace(/\b\d+c\/\d+c\b/g, '')

  // ─── Step 5: Remove memory (but NOT for Dyson/TV/Camera/consoles without GB/TB) ───
  if (!isDyson) {
    name = name.replace(/\b\d+\/\d+\s*(GB|TB|Gb|gb)?\b/gi, '')  // 12/256Gb
    name = name.replace(/\b\d+\s*(GB|TB)\b/gi, '')                // 256GB, 1TB
  }

  // ─── Step 6: Remove SIM and 5G ───
  name = name.replace(/\b(2Sim|eSim|e-Sim|1Sim\+eSim|Dual\s*SIM|DS)\b/gi, '')
  name = name.replace(/\b5G\b/gi, '')

  // ─── Step 7: Remove colors ───
  // Dyson slash-colors (Nickel/Copper, Blue/Copper) — remove whole compound
  if (isDyson) {
    name = name.replace(/\b\w+\/\w+\b/g, '')  // Nickel/Copper, Blue/Copper
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
  }

  // ─── Step 8b: Garmin — remove size in mm, keep Solar/Sapphire in name ───
  if (isGarmin) {
    name = name.replace(/\b\d{2}mm\b/gi, '')
    name = name.replace(/\b\d{2}\s*mm\b/gi, '')
  }

  // ─── Step 9: iPad-specific cleanup ───
  if (isiPad) {
    name = name.replace(/\bWi-Fi\s*\+?\s*Cellular\b/gi, '')
    name = name.replace(/\bWi-?Fi\b/gi, '')
    name = name.replace(/\bWIFI\b/gi, '')
    name = name.replace(/\bLTE\b/gi, '')
    name = name.replace(/\b(A\d+|M\d+)\b/g, '')
  }

  // ─── Step 10: MacBook — remove screen size ───
  if (isMacBook) {
    name = name.replace(/\b(13|14|15|16)\b/g, '')
  }

  // ─── Step 10b: Dyson — map article codes to model names, remove accessories ───
  if (isDyson) {
    // Map article codes → readable model names
    name = name.replace(/\bHD0[3-8]\b/g, 'Supersonic')
    name = name.replace(/\bHD1[5-8]\b/g, 'Supersonic')
    name = name.replace(/\bHS0[5-7]\b/g, 'Airwrap')
    name = name.replace(/\bHS0[8-9]\b/g, 'Airwrap')
    name = name.replace(/\bHT01\b/g, 'Airstrait')
    name = name.replace(/\bPH05\b/g, 'Purifier Humidify')
    name = name.replace(/\bSV4[0-9][A-Z]?\b/g, '')  // V12/V15 — model already in name
    name = name.replace(/\bSV5[0-9][A-Z]?\b/g, '')  // V16
    name = name.replace(/\bRB0[0-9]\b/g, '')         // 360 Robot — already in name
    name = name.replace(/\bHU0[0-9]\b/g, '')         // hand dryer

    // Remove completions → attributes
    for (const comp of DYSON_COMPLETIONS) {
      name = name.replace(new RegExp(`\\b${comp}\\b`, 'gi'), '')
    }

    // Remove accessories from name → go to attributes
    name = name.replace(/\bбез кейса\b/gi, '')
    name = name.replace(/\bс кейсом\b/gi, '')
    name = name.replace(/\bдиффузор\b/gi, '')
    name = name.replace(/\bCoanda\s*2x\b/gi, '')

    // Remove Dyson-specific colors from name (already in COLORS arrays, but double-ensure)
    name = name.replace(/\bCeramic\b/gi, '')
    name = name.replace(/\bLite\b/gi, '')

    // Deduplicate "Supersonic Supersonic" etc.
    name = name.replace(/\b(Supersonic|Airwrap|Airstrait)\s+\1\b/gi, '$1')
  }

  // ─── Step 10c: TV — remove diagonal ───
  if (isTV) {
    name = name.replace(/\b\d{2}["″"]\s*/g, '')    // 55", 65"
    name = name.replace(/\b\d{2}\s*["″"]\s*/g, '')
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
    name = name.replace(/\b\d+\s*ревизия\b/gi, '')
  }

  // ─── Step 10f: Accessories/Комплектация — remove from name ───
  name = name.replace(/\bбез кейса\b/gi, '')
  name = name.replace(/\bс кейсом\b/gi, '')
  name = name.replace(/\bдиффузор\b/gi, '')
  name = name.replace(/\bCoanda\s*2x\b/gi, '')
  name = name.replace(/\+?\s*Touch\s*ID\b/gi, '')
  name = name.replace(/\bNano\s*Texture\s*Display\b/gi, '')

  // ─── Step 11: Remove year ───
  name = name.replace(/\s*\(20[2-3]\d\)\s*/g, ' ')
  name = name.replace(/\b20[2-3]\d\b/g, '')

  // ─── Step 12: Remove Apple article codes (but not Sony WH-/WF- model names) ───
  if (!isSonyAudio) {
    name = name.replace(/\bM[A-Z0-9]{3,5}\b/g, '')    // Apple: MWWF3, MEH94, MX5R3
    name = name.replace(/\b[A-Z]\d[A-Z]{2}\b/g, '')    // Apple: U3LW, T3LW
  }
  // Apple Z-артикулы: Z1EH000V5, Z1CY0019Z, Z1FD0000N
  name = name.replace(/\bZ1[A-Z]{2}[A-Z0-9]{3,6}\b/g, '')

  // ─── Step 12b: RAM numbers without GB after Max/Pro/Ultra (48, 64, 96) ───
  name = name.replace(/\b(Max|Pro|Ultra)\s+\d{2,3}\b/g, (m) => m.replace(/\s+\d{2,3}$/, ''))

  // ─── Step 13: Remove USB-C, display types, misc ───
  name = name.replace(/\bUSB-C\b/gi, '')
  name = name.replace(/\bStandard Display\b/gi, '')
  name = name.replace(/\bNano Texture Display\b/gi, '')
  name = name.replace(/\bкейс MagSafe\b/gi, '')

  // ─── Step 14: Remove strap sizes & misc ───
  if (!isWatch || isGarmin) {
    name = name.replace(/\b[SML]\/[SML]\b/g, '')
  }
  name = name.replace(/\b[SML]\b(?![\w])/g, '')
  name = name.replace(/\bmm\b/gi, '')

  // ─── Step 15: Remove emoji ───
  name = name.replace(/[\u{1F1E0}-\u{1F1FF}]{2}/gu, '')
  name = name.replace(/[\u{1F300}-\u{1FAFF}]/gu, '')

  // ─── Step 16: Final cleanup ───
  name = name.replace(/\(\s*\/?\s*\)/g, '')       // empty () or (/)
  name = name.replace(/\s*\/\s*(?=\s|$)/g, '')    // trailing /
  name = name.replace(/\s+/g, ' ').trim()

  return name || fullName.slice(0, 60)
}

/**
 * Извлекает атрибуты из полного названия модели.
 */
function parseAttributes(fullName: string, brand: string, country: string): Record<string, string> {
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
  const chipConfig = normalized.match(/\b(\d+c\/\d+c)\b/)
  if (chipConfig) attrs['Чип'] = chipConfig[1]

  // ─── Chip (iPad): A16, M3, M4 ───
  if (isiPad) {
    const ipadChip = normalized.match(/\b(A\d+|M\d+)\b/)
    if (ipadChip) attrs['Чип'] = ipadChip[1]
  }

  // ─── Memory / Storage ───
  if (isMac || isMacBook) {
    const memMatches = normalized.match(/\b(\d+)\s*(GB|TB)\b/gi)
    if (memMatches && memMatches.length >= 2) {
      attrs['RAM'] = memMatches[0].replace(/\s+/g, '').toUpperCase()
      attrs['Память'] = memMatches[1].replace(/\s+/g, '').toUpperCase()
    } else if (memMatches && memMatches.length === 1) {
      attrs['Память'] = memMatches[0].replace(/\s+/g, '').toUpperCase()
    }
    if (isMacBook) {
      const screenMatch = normalized.match(/\b(13|14|15|16)\b/)
      if (screenMatch) attrs['Экран'] = screenMatch[1] + '"'
    }
  } else if (!isDyson && !isTV) {
    // Samsung/Huawei/Honor: 12/256Gb, 16/1TB
    const slashMem = normalized.match(/\b(\d+)\/(\d+)\s*(GB|TB|Gb|gb)?\b/i)
    if (slashMem) {
      attrs['RAM'] = slashMem[1] + 'GB'
      const unit = (slashMem[3] || 'GB').toUpperCase()
      attrs['Память'] = slashMem[2] + unit
    } else {
      // iPhone/iPad/Pixel/Xbox/Steam Deck: 256GB, 1TB
      const storageSingle = normalized.match(/\b(\d+\s*(?:GB|TB))\b/i)
      if (storageSingle) {
        attrs['Память'] = storageSingle[1].replace(/\s+/g, '').toUpperCase()
      }
    }
  }

  // ─── SIM ───
  const simMatch = normalized.match(/\b(2Sim|eSim|e-Sim|1Sim\+eSim|Dual\s*SIM)\b/i)
  if (simMatch) attrs['SIM'] = simMatch[1]

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
    if (bandSize) attrs['Ремешок'] = bandSize[1]
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
      attrs['Цвет'] = dysonColor[1]
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

  // ─── USB-C (AirPods) ───
  if (/USB-C/i.test(normalized)) attrs['Разъём'] = 'USB-C'

  // ─── Console: PS5 revision ───
  const revMatch = normalized.match(/(\d+)\s*ревизия/i)
  if (revMatch) attrs['Ревизия'] = revMatch[1]

  // ─── Accessories / Комплектация ───
  if (/без кейса/i.test(normalized)) attrs['Комплектация'] = 'Без кейса'
  else if (/с кейсом/i.test(normalized)) attrs['Комплектация'] = 'С кейсом'
  else if (/диффузор/i.test(normalized)) attrs['Комплектация'] = 'Диффузор'
  if (/\+?\s*Touch\s*ID/i.test(normalized)) attrs['Touch ID'] = 'Да'
  if (/Nano\s*Texture/i.test(normalized)) attrs['Дисплей'] = 'Nano Texture'
  if (/Coanda\s*2x/i.test(normalized)) attrs['Серия'] = 'Coanda 2x'

  // ─── iPad: WIFI ───
  if (/iPad/i.test(normalized)) {
    if (/WIFI|Wi-?Fi/i.test(normalized) && !/Cellular/i.test(normalized)) {
      if (!attrs['Связь']) attrs['Связь'] = 'Wi-Fi'
    }
  }

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

// New single-sheet column indices for stale price check
const STALE_NAME_COL = 4   // E: Название модели
const STALE_PRICE_COL = 9  // J: Рекомендованная стоимость
const STALE_DATE_COL = 12  // M: Дата обновления

/**
 * Проверяет устаревшие цены (>6 часов без обновления) по колонке «Дата обновления» в Google Sheets.
 */
export async function checkStalePrices(): Promise<StaleItem[]> {
  const SIX_HOURS = 6 * 60 * 60 * 1000
  const now = Date.now()
  const staleItems: StaleItem[] = []

  const allSheets = await getSheetNames()
  const sheetName = allSheets[0]
  if (!sheetName) return staleItems

  try {
    const data = await readSheet(sheetName)
    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      const name = (row[STALE_NAME_COL] ?? '').toString().trim()
      const price = (row[STALE_PRICE_COL] ?? '').toString().trim()
      const dateStr = (row[STALE_DATE_COL] ?? '').toString().trim()

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
