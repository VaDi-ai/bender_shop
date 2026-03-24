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

// Column letters for writeback (supplier, date, description, specs)
export const WRITEBACK_COLS = {
  description: 'J',   // Описание
  specs: 'K',         // Характеристики
  price: 'L',         // Рекомендованная стоимость
  supplier: 'N',      // Лучший поставщик
  date: 'O',          // Дата обновления
}

export interface SheetRow {
  brand: string
  category: string      // «Общая категория» (для сайта)
  fullName: string      // «Название модели»
  color: string         // из колонки F
  memory: string        // из колонки G
  size: string          // из колонки H
  country: string       // из колонки I
  description: string   // из колонки J (бот заполняет)
  specs: string         // из колонки K (бот заполняет)
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

    const brand       = (row[1] ?? '').toString().trim()       // B: Бренд
    const category    = (row[3] ?? '').toString().trim()       // D: Общая категория (для сайта)
    const fullName    = (row[4] ?? '').toString().trim()       // E: Название модели
    const color       = (row[5] ?? '').toString().trim()       // F: Цвет
    const memory      = (row[6] ?? '').toString().trim()       // G: Память
    const size        = (row[7] ?? '').toString().trim()       // H: Размер
    const country     = (row[8] ?? '').toString().trim()       // I: Страна
    const description = (row[9] ?? '').toString().trim()       // J: Описание
    const specs       = (row[10] ?? '').toString().trim()      // K: Характеристики
    const priceRaw    = (row[11] ?? '').toString().replace(/\s/g, '').replace(',', '.')  // L: Цена
    const qtyRaw      = (row[12] ?? '').toString().trim()      // M: В наличие

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
      description,
      specs,
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
    sheetDescription: string
    sheetSpecs: Record<string, string>
    variants: VariantData[]
  }

  const groups = new Map<string, GroupedProduct>()

  for (const row of rows) {
    const productName = extractProductName(row.fullName, row.brand)
    const attrs = getAttributes(row)

    const key = `${productName}|${row.category}`

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
        sheetDescription: row.description,
        sheetSpecs: Object.keys(sheetSpecs).length > 0 ? sheetSpecs : {},
        variants: [],
      })
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
      const ALWAYS_SHOW = ['Память', 'RAM', 'Экран', 'Размер', 'Чип', 'SIM', 'Связь']
      for (const [k, vals] of Object.entries(aggregated)) {
        if (vals.size > 1 || ALWAYS_SHOW.includes(k)) {
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
            description: group.sheetDescription || null,
            specs: Object.keys(group.sheetSpecs).length > 0 ? group.sheetSpecs : {},
            photos: [],
          },
        })
        productsByKey.set(productKey, product)
        created++
      } else {
        // Update existing product
        const updateData: Record<string, any> = {
          price: new Decimal(minPrice),
          stock: totalQty,
          quantity: totalQty,
          isAvailable: totalQty > 0,
          attributes: productAttributes,
          brand: group.brand || undefined,
        }
        // Apply sheet description/specs only if product doesn't have them yet
        if (group.sheetDescription && !product.description) {
          updateData.description = group.sheetDescription
        }
        const hasSpecs = product.specs && typeof product.specs === 'object' && Object.keys(product.specs as object).length > 0
        if (Object.keys(group.sheetSpecs).length > 0 && !hasSpecs) {
          updateData.specs = group.sheetSpecs
        }
        await prisma.product.update({
          where: { id: product.id },
          data: updateData,
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
      console.log(`[Audit] ${issues.length} товаров без ожидаемых атрибутов:`)
      for (const issue of issues.slice(0, 30)) console.log(`  ${issue}`)
      if (issues.length > 30) console.log(`  ...и ещё ${issues.length - 30}`)
    }
  } catch { /* audit is non-critical */ }

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
 */
function getAttributes(row: SheetRow): Record<string, string> {
  const attrs: Record<string, string> = {}

  // 1. Из колонок (приоритет)
  if (row.color) {
    let colorVal = row.color
    // Яндекс — цвет может содержать описание: "65Вт с голосовым помощником Алиса Black"
    if (colorVal.length > 20) {
      const words = colorVal.split(/\s+/)
      const lastWord = words[words.length - 1]
      const KNOWN_COLORS = ['Black','White','Grey','Beige','Red','Blue','Green','Turquose','Turquoise','Violet','Orange','Pink','Brown','Yellow','Silver','Gold']
      if (KNOWN_COLORS.some(c => c.toLowerCase() === lastWord.toLowerCase())) {
        colorVal = lastWord
      }
    }
    attrs['Цвет'] = colorVal
  }
  if (row.memory) {
    const memStr = row.memory.toString().trim()
    // Формат "X/Y" или "X/YGB" — X=RAM, Y=Storage
    const slashMatch = memStr.match(/^(\d+)\s*\/\s*(\d+)\s*(GB|TB|Gb|gb|Tb|tb)?$/i)
    if (slashMatch) {
      const ram = slashMatch[1]
      const storage = slashMatch[2]
      const unit = (slashMatch[3] || 'GB').toUpperCase()
      if (!attrs['RAM']) attrs['RAM'] = ram + 'GB'
      const storageNum = parseInt(storage, 10)
      attrs['Память'] = storageNum >= 1024 ? Math.round(storageNum / 1024) + 'TB' : storage + unit
    } else {
      attrs['Память'] = memStr
    }
  }
  // Для ноутбуков размер = экран, не дублировать
  const isLaptop = row.category === 'Ноутбуки' || /macbook/i.test(row.fullName)
  if (isLaptop && row.size) {
    attrs['Экран'] = row.size
  } else if (row.size) {
    attrs['Размер'] = row.size
  }
  if (row.country) attrs['Страна'] = row.country

  // 2. Fallback: парсинг из названия (если колонка пуста)
  const parsed = parseAttributes(row.fullName, row.brand, row.country)
  for (const key of ['Цвет', 'Память', 'RAM', 'Размер', 'SIM', 'Связь', 'Чип', 'Ремешок', 'Комплектация', 'Экран', 'Серия', 'Диагональ', 'Разъём', 'Touch ID', 'Дисплей', 'Ревизия', 'Умный дом', 'AI', 'Материал', 'Состояние', 'Линзы', 'Крепление', 'Шумоподавление'] as const) {
    if (!attrs[key] && parsed[key]) attrs[key] = parsed[key]
  }

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
function extractProductName(fullName: string, brand: string): string {
  let name = fullName

  // ─── Step 0: Normalize ───
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

  // Fallback: SIM по стране для iPhone
  if (!attrs['SIM'] && /iphone/i.test(normalized)) {
    const countryMatch = fullName.match(/\((Индия|Япония|США|USA|India|Japan|Европа|Europe|ОАЭ|UAE|Таиланд|Thailand|Китай|China|Гонконг|Hong Kong)\)/i)
    if (countryMatch) {
      const c = countryMatch[1].toLowerCase()
      if (['китай', 'china', 'гонконг', 'hong kong'].some(x => c.includes(x))) {
        attrs['SIM'] = '2 SIM'
      } else {
        attrs['SIM'] = 'eSIM'
      }
    }
  }

  // Fallback: Samsung Galaxy — SIM + eSIM по умолчанию
  if (!attrs['SIM'] && /samsung.*galaxy/i.test(normalized)) {
    attrs['SIM'] = 'SIM + eSIM'
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

  // ─── Connector ───
  if (/USB-C/i.test(normalized)) attrs['Разъём'] = 'USB-C'
  else if (/\bLightning\b/i.test(normalized)) attrs['Разъём'] = 'Lightning'

  // ─── Console: PS5 revision ───
  const revMatch = normalized.match(/(\d+)\s*ревизия/i)
  if (revMatch) attrs['Ревизия'] = revMatch[1]

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

// New single-sheet column indices for stale price check
const STALE_NAME_COL = 4    // E: Название модели
const STALE_PRICE_COL = 11  // L: Рекомендованная стоимость
const STALE_DATE_COL = 14   // O: Дата обновления

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
        // Пропускаем категории не зависящие от курса
        const category = (row[3] ?? '').toString().trim()
        if (category === 'Услуги' || category === 'Аксессуары') continue

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
