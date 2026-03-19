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

// Листы с товарами (одинаковая структура)
const PRODUCT_SHEETS = ['Товарное наличие вариант 1', 'Аксессуары', 'Услуги']
const DEFAULT_QTY = 3 // если «В наличие» пусто

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
    // Пропускаем заголовок (строка 1)
    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      const brand = (row[1] ?? '').trim()
      const category = (row[2] ?? '').trim()
      const fullName = (row[3] ?? '').trim()
      const country = (row[4] ?? '').trim()
      const priceRaw = (row[5] ?? '').toString().replace(/\s/g, '').replace(',', '.')
      const qtyRaw = (row[6] ?? '').toString().trim()

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
 * - Каждая строка таблицы = один ProductVariant
 * - Product группируется по бренд + базовое имя модели (без цвета/памяти/страны)
 * - Если товар/вариант не существует — создаётся
 * - Если существует — обновляется цена и количество
 * - Товары которые есть в БД но нет в таблице — помечаются isAvailable=false
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

  // Preload all data for performance
  const existingVariants = await prisma.productVariant.findMany({ include: { product: true } })
  const variantsByFullName = new Map<string, typeof existingVariants[0]>()
  for (const v of existingVariants) {
    const attrs = v.attributes as Record<string, unknown> | null
    if (attrs && typeof attrs.fullName === 'string') {
      variantsByFullName.set(attrs.fullName, v)
    }
  }

  const categoriesMap = new Map<string, { id: number; name: string }>()
  const allCategories = await prisma.category.findMany()
  for (const c of allCategories) categoriesMap.set(c.name, c)

  const productsByKey = new Map<string, any>()
  const allProducts = await prisma.product.findMany()
  for (const p of allProducts) productsByKey.set(p.name + '|' + p.categoryId, p)

  let created = 0
  let updated = 0
  const errors: string[] = []
  const seenVariantIds = new Set<number>()
  const startTime = Date.now()

  for (let idx = 0; idx < rows.length; idx++) {
    if (idx % 50 === 0) {
      console.log(`[Sheets Sync] Processing row ${idx + 1}/${rows.length}...`)
    }
    if (Date.now() - startTime > 10 * 60 * 1000) {
      console.error(`[Sheets Sync] Timeout after 10 minutes at row ${idx + 1}/${rows.length}`)
      errors.push(`Timeout after 10 minutes at row ${idx + 1}`)
      break
    }
    const row = rows[idx]
    try {
      // Найти или создать категорию (from map)
      let category = categoriesMap.get(row.category)
      if (!category) {
        category = await prisma.category.upsert({
          where: { name: row.category },
          create: { name: row.category },
          update: {},
        })
        categoriesMap.set(row.category, category)
      }

      // Ищем существующий вариант по fullName (from map)
      const variant = variantsByFullName.get(row.fullName)

      if (variant) {
        // Обновить цену и количество
        const newQty = row.quantity
        const oldQty = variant.quantity

        await prisma.productVariant.update({
          where: { id: variant.id },
          data: {
            price: new Decimal(row.price),
            quantity: newQty,
            inStock: newQty > 0,
          },
        })

        // Обновить product-level данные
        const allVariants = await prisma.productVariant.findMany({
          where: { productId: variant.productId },
        })
        const totalQty = allVariants.reduce((s, v) => s + (v.id === variant!.id ? newQty : v.quantity), 0)

        await prisma.product.update({
          where: { id: variant.productId },
          data: {
            price: new Decimal(Math.min(...allVariants.map(v => Number(v.id === variant!.id ? row.price : v.price)))),
            stock: totalQty,
            quantity: totalQty,
            isAvailable: totalQty > 0,
            brand: row.brand || undefined,
            categoryId: category.id,
          },
        })

        seenVariantIds.add(variant.id)
        if (oldQty !== newQty || Number(variant.price) !== row.price) updated++
      } else {
        // Создать новый товар/вариант
        const productName = extractProductName(row.fullName, row.brand)
        const productKey = productName + '|' + category.id

        // Ищем существующий Product (from map)
        let product = productsByKey.get(productKey)

        if (!product) {
          const catNum = String(category.id).padStart(2, '0')
          const count = await prisma.product.count({ where: { categoryId: category.id } })
          const productSku = `${catNum}-${String(count + 1).padStart(4, '0')}`

          product = await prisma.product.create({
            data: {
              sku: productSku,
              name: productName,
              brand: row.brand || null,
              categoryId: category.id,
              price: new Decimal(row.price),
              stock: row.quantity,
              quantity: row.quantity,
              isAvailable: row.quantity > 0,
              attributes: {},
              specs: {},
              photos: [],
            },
          })
          productsByKey.set(productKey, product)
        }

        // Создать вариант
        const variantCount = await prisma.productVariant.count({ where: { productId: product.id } })
        const variantSku = `${product.sku}-${String(variantCount + 1).padStart(3, '0')}`

        const attrs = parseAttributes(row.fullName, row.brand, row.country)

        const newVariant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: variantSku,
            price: new Decimal(row.price),
            quantity: row.quantity,
            inStock: row.quantity > 0,
            attributes: { ...attrs, fullName: row.fullName },
            photos: [],
          },
        })

        // Обновить product totals
        const totalQty = await prisma.productVariant.aggregate({
          where: { productId: product.id },
          _sum: { quantity: true },
        })
        await prisma.product.update({
          where: { id: product.id },
          data: {
            stock: totalQty._sum.quantity ?? 0,
            quantity: totalQty._sum.quantity ?? 0,
            isAvailable: (totalQty._sum.quantity ?? 0) > 0,
          },
        })

        seenVariantIds.add(newVariant.id)
        created++
      }
    } catch (err) {
      const msg = `Row ${row.rowIndex} (${row.sheetName}): ${row.fullName} — ${err}`
      errors.push(msg)
      console.error(`[Sheets Sync] Error row ${row.rowIndex}: ${err}`)
    }
  }

  // Пометить варианты которых нет в таблице как недоступные
  const allVariantsInDb = await prisma.productVariant.findMany({
    where: { NOT: { id: { in: Array.from(seenVariantIds) } } },
    select: { id: true, productId: true, attributes: true },
  })

  const toDisable = allVariantsInDb.filter(v => {
    const attrs = v.attributes as Record<string, unknown> | null
    return attrs && typeof attrs === 'object' && 'fullName' in attrs
  })

  let disabled = 0
  if (toDisable.length > 0) {
    await prisma.productVariant.updateMany({
      where: { id: { in: toDisable.map(v => v.id) } },
      data: { quantity: 0, inStock: false },
    })
    disabled = toDisable.length

    // Обновить product availability для disabled variants
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

/**
 * Извлекает базовое имя продукта из полного названия.
 * "Apple Watch SE 40 Midnight S/M 2024" → "Apple Watch SE 40"
 * "Samsung Galaxy S26 Ultra 16/1TB (SM-S948B) Cobalt Violet" → "Samsung Galaxy S26 Ultra"
 * "iPhone 17 Pro Max 256GB Blue" → "iPhone 17 Pro Max"
 */
function extractProductName(fullName: string, brand: string): string {
  let name = fullName

  // Убрать артикул в скобках: (SM-S948B), (MXEA3), (MF0X4)
  name = name.replace(/\s*\([A-Z0-9/]+\)\s*/g, ' ')

  // Убрать страну в скобках: (ОАЭ), (США)
  name = name.replace(/\s*\([А-Яа-яЁё]+\)\s*/g, ' ')

  // Убрать память: 256GB, 512GB, 1TB, 16/1TB, 12/256Gb, 8/128
  name = name.replace(/\s*\d+\/\d+\s*(GB|TB|Gb|gb)?\s*/gi, ' ')
  name = name.replace(/\s*\d+\s*(GB|TB|Gb)\s*/gi, ' ')

  // Убрать цвета (известные)
  const colors = ['Black', 'White', 'Silver', 'Gold', 'Blue', 'Red', 'Green', 'Orange', 'Purple',
    'Midnight', 'Starlight', 'Pink', 'Yellow', 'Cream', 'Cobalt Violet', 'Sky Blue',
    'Rose Gold', 'Space Gray', 'Jet Black', 'Natural', 'Titanium', 'Desert',
    'Mint', 'Lavender', 'Coral', 'Graphite', 'Sierra Blue', 'Alpine Green',
    'Deep Purple', 'Dark Green', 'Navy', 'Denim', 'Pur Fog', 'Jetblack']
  for (const color of colors) {
    name = name.replace(new RegExp(`\\b${color}\\b`, 'gi'), '')
  }

  // Убрать размеры ремешков: S/M, M/L, S, M, L
  name = name.replace(/\b[SML]\/[SML]\b/g, '')
  name = name.replace(/\b(GPS|LTE|Wi-Fi|Cellular)\b/gi, '')

  // Убрать год: 2024, 2025
  name = name.replace(/\b20[2-3]\d\b/g, '')

  // Убрать артикулы: MRP83, MWWF3, MEH94, SM-F741B
  name = name.replace(/\b[A-Z]{2,3}[A-Z0-9]{2,5}\b/g, '')
  name = name.replace(/\bSM-[A-Z0-9]+\b/g, '')

  // Убрать SIM info
  name = name.replace(/\b(eSIM|e-SIM|1\s*Sim|Dual\s*SIM|DS)\b/gi, '')

  // Убрать эмодзи-флаги и прочие эмодзи
  name = name.replace(/[\u{1F1E0}-\u{1F1FF}]{2}/gu, '')
  name = name.replace(/[\u{1F300}-\u{1FAFF}]/gu, '')

  // Убрать лишние пробелы
  name = name.replace(/\s+/g, ' ').trim()

  return name || fullName.slice(0, 60)
}

/**
 * Извлекает атрибуты из полного названия.
 */
function parseAttributes(fullName: string, brand: string, country: string): Record<string, string> {
  const attrs: Record<string, string> = {}

  // Память: 256GB, 512GB, 1TB, 16/1TB, 12/256Gb
  const storageMatch = fullName.match(/(\d+\/\d+\s*(?:GB|TB|Gb|gb)?|\d+\s*(?:GB|TB|Gb))/i)
  if (storageMatch) {
    const raw = storageMatch[1]
    if (raw.includes('/')) {
      const parts = raw.replace(/\s*(GB|TB|Gb|gb)/i, '').split('/')
      attrs['RAM'] = parts[0] + ' GB'
      const storagePart = parts[1].replace(/\s*/g, '')
      // Определить единицу
      const unitMatch = raw.match(/(GB|TB|Gb)/i)
      attrs['Память'] = storagePart + (unitMatch ? unitMatch[1].toUpperCase() : 'GB')
    } else {
      attrs['Память'] = raw.replace(/\s+/g, '').toUpperCase()
    }
  }

  // Цвет
  const colors = ['Cobalt Violet', 'Sky Blue', 'Rose Gold', 'Space Gray', 'Jet Black',
    'Alpine Green', 'Deep Purple', 'Dark Green', 'Pur Fog', 'Jetblack',
    'Black', 'White', 'Silver', 'Gold', 'Blue', 'Red', 'Green', 'Orange', 'Purple',
    'Midnight', 'Starlight', 'Pink', 'Yellow', 'Cream', 'Mint', 'Lavender',
    'Coral', 'Graphite', 'Natural', 'Titanium', 'Desert', 'Navy', 'Denim']
  for (const color of colors) {
    if (fullName.toLowerCase().includes(color.toLowerCase())) {
      attrs['Цвет'] = color
      break
    }
  }

  // Страна
  if (country) attrs['Страна'] = country

  // Размер (для часов): S/M, M/L, 40mm, 42mm, 44mm, 46mm, 49mm
  const sizeMatch = fullName.match(/\b(\d{2})\s*(mm|MM)?\b/) || fullName.match(/\b([SML]\/[SML])\b/)
  if (sizeMatch) attrs['Размер'] = sizeMatch[1] + (sizeMatch[2] || '')

  return attrs
}
