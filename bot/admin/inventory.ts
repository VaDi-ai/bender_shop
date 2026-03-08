/**
 * bot/admin/inventory.ts
 *
 * Товароучёт: список, добавить, оприходовать, списать, импорт прайса, экспорт xlsx.
 *
 * Подключение в bot/index.ts:
 *   setupInventoryHandlers(bot)              — регистрирует action-обработчики кнопок
 *   handleInventoryMessage(ctx, uid, txt)    — вызывать из перехватчика текстовых сообщений
 *   handleInventoryDocument(ctx, uid)        — вызывать из перехватчика документов
 *   handleInventoryPhoto(ctx, uid)           — вызывать из перехватчика фото
 *   inventoryState                           — проверять наличие активного флоу
 */

import ExcelJS from 'exceljs'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { Context, Markup, Telegraf } from 'telegraf'
import { prisma } from '../../lib/prisma'
import { stockIn, stockOut, getStockHistory } from '../../lib/stock'

// ─── Типы состояния ───────────────────────────────────────────────────────────

type AddFlow =
  | { flow: 'add'; step: 'sku' }
  | { flow: 'add'; step: 'name'; sku: string }
  | { flow: 'add'; step: 'description'; sku: string; name: string }
  | { flow: 'add'; step: 'specs'; sku: string; name: string; description: string | null }
  | {
      flow: 'add'
      step: 'attributes'
      sku: string
      name: string
      description: string | null
      specs: Record<string, string> | null
    }
  | {
      flow: 'add'
      step: 'price'
      sku: string
      name: string
      description: string | null
      specs: Record<string, string> | null
      attributes: Record<string, string[]> | null
    }
  | {
      flow: 'add'
      step: 'category'
      sku: string
      name: string
      description: string | null
      specs: Record<string, string> | null
      attributes: Record<string, string[]> | null
      price: number
    }
  | {
      flow: 'add'
      step: 'photo'
      sku: string
      name: string
      description: string | null
      specs: Record<string, string> | null
      attributes: Record<string, string[]> | null
      price: number
      category: string
      photoFileIds: string[]
    }
  | {
      flow: 'add'
      step: 'qty'
      sku: string
      name: string
      description: string | null
      specs: Record<string, string> | null
      attributes: Record<string, string[]> | null
      price: number
      category: string
      photoFileIds: string[]
    }

type StockInFlow =
  | { flow: 'stock_in'; step: 'qty'; variantId: number; variantSku: string; productName: string; currentQty: number }
  | { flow: 'stock_in'; step: 'comment'; variantId: number; variantSku: string; productName: string; currentQty: number; qty: number }

type StockOutFlow =
  | { flow: 'stock_out'; step: 'qty'; variantId: number; variantSku: string; productName: string; currentQty: number }
  | { flow: 'stock_out'; step: 'comment'; variantId: number; variantSku: string; productName: string; currentQty: number; qty: number }

type ImportFileFlow = { flow: 'import_file'; step: 'awaiting_file' }
type CategoryAddFlow =
  | { flow: 'category_add'; step: 'name' }
  | { flow: 'category_add'; step: 'textSide'; name: string }
type CategoryRenameFlow = { flow: 'category_rename'; step: 'name'; categoryId: number; oldName: string }
type CategoryBannerFlow = { flow: 'category_banner'; step: 'photo'; categoryId: number; categoryName: string }

type VariantAddFlow =
  | { flow: 'variant_add'; step: 'sku'; productId: number }
  | { flow: 'variant_add'; step: 'price'; productId: number; sku: string }
  | { flow: 'variant_add'; step: 'qty'; productId: number; sku: string; price: number }
  | {
      flow: 'variant_add'
      step: 'attrs'
      productId: number
      sku: string
      price: number
      qty: number
      attrKeys: string[]
      selectedAttrs: Record<string, string>
      currentAttrIndex: number
    }
  | {
      flow: 'variant_add'
      step: 'region'
      productId: number
      sku: string
      price: number
      qty: number
      attrs: Record<string, string>
    }
  | {
      flow: 'variant_add'
      step: 'photo'
      productId: number
      sku: string
      price: number
      qty: number
      attrs: Record<string, string>
      photos: string[]
    }

type AttrAddFlow =
  | { flow: 'attr_add'; step: 'name'; productId: number }
  | { flow: 'attr_add'; step: 'values'; productId: number; attrName: string }

type AttrEditFlow = { flow: 'attr_edit'; step: 'values'; productId: number; attrName: string }

type SpecAddFlow = { flow: 'spec_add'; step: 'input'; productId: number }

type BrandEditFlow = { flow: 'brand_edit'; step: 'input'; productId: number }

type ProductPhotoFlow = {
  flow: 'product_photo'
  step: 'uploading'
  productId: number
  pendingPhotos: string[]
}

type VariantPhotoEditFlow = {
  flow: 'variant_photo_edit'
  step: 'uploading'
  variantId: number
  productId: number
  pendingPhotos: string[]
}

type ReceiveVariantFlow = {
  flow: 'receive_variant'
  step: 'qty'
  variantId: number
  variantSku: string
  productName: string
  currentQty: number
}

type WriteoffVariantFlow = {
  flow: 'writeoff_variant'
  step: 'qty'
  variantId: number
  variantSku: string
  productName: string
  currentQty: number
}

export type InventoryFlowState =
  | AddFlow
  | StockInFlow
  | StockOutFlow
  | ImportFileFlow
  | CategoryAddFlow
  | CategoryRenameFlow
  | CategoryBannerFlow
  | VariantAddFlow
  | AttrAddFlow
  | AttrEditFlow
  | SpecAddFlow
  | BrandEditFlow
  | ProductPhotoFlow
  | VariantPhotoEditFlow

// userId → активный флоу (сбрасывается после завершения или отмены)
export const inventoryState = new Map<number, InventoryFlowState>()

// ─── Разбор строки файла ──────────────────────────────────────────────────────

interface FileRow {
  sku: string
  name: string | null
  price: number | null
  category: string | null
  photoUrl: string | null
  qty: number
}

/**
 * Парсит xlsx/xls/csv/txt в массив строк.
 * Поддерживает два формата:
 *   xlsx/xls — таблица с заголовками (SKU, Название, Цена, Категория, Фото, Количество)
 *   txt/csv/прочее — текст с разделителем «|»:
 *     SKU | Название | Цена | Категория | Фото URL | Количество
 *     Допустимо 2 колонки (SKU | Количество) — для оприходования/списания.
 * Возвращает строки или строку-ошибку.
 */
async function parseFileRows(buffer: Buffer, fname: string): Promise<FileRow[] | string> {
  const ext = (fname.match(/\.(\w+)$/) ?? [])[1]?.toLowerCase()

  if (ext === 'xlsx' || ext === 'xls') {
    return parseXlsx(buffer)
  }

  // Для txt / csv / без расширения — pipe-separated
  return parsePipe(buffer.toString('utf8'))
}

async function parseXlsx(buffer: Buffer): Promise<FileRow[] | string> {
  const workbook = new ExcelJS.Workbook()
  const tmpPath1 = path.join(os.tmpdir(), `import_${Date.now()}.xlsx`)
  fs.writeFileSync(tmpPath1, buffer)
  await workbook.xlsx.readFile(tmpPath1)
  fs.unlinkSync(tmpPath1)
  const ws = workbook.worksheets[0]

  if (!ws || ws.rowCount < 2) return 'Файл пуст или содержит только заголовок'

  const headerRow = ws.getRow(1)
  const header = (headerRow.values as (string | undefined)[]).map((h) =>
    String(h ?? '').toLowerCase().trim(),
  )
  const idx = {
    sku: header.findIndex((h) => ['sku', 'артикул'].includes(h)),
    name: header.findIndex((h) => ['название', 'name', 'наименование'].includes(h)),
    price: header.findIndex((h) => ['цена', 'price'].includes(h)),
    category: header.findIndex((h) => ['категория', 'category'].includes(h)),
    photo: header.findIndex((h) => ['фото', 'photo', 'фото url', 'photourl'].includes(h)),
    qty: header.findIndex((h) => ['количество', 'qty', 'quantity', 'кол-во', 'кол'].includes(h)),
  }

  if (idx.sku < 0 || idx.qty < 0) {
    const missing: string[] = []
    if (idx.sku < 0) missing.push('SKU / Артикул')
    if (idx.qty < 0) missing.push('Количество / Qty')
    return `Не найдены столбцы: ${missing.join(', ')}`
  }

  const rows: FileRow[] = []
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const vals = row.values as (ExcelJS.CellValue | undefined)[]
    const sku = String(vals[idx.sku] ?? '').trim()
    if (!sku) return
    const qty = parseInt(String(vals[idx.qty] ?? ''), 10)
    if (isNaN(qty) || qty < 0) return

    rows.push({
      sku,
      name: idx.name >= 0 ? String(vals[idx.name] ?? '').trim() || null : null,
      price: idx.price >= 0 ? parseFloat(String(vals[idx.price] ?? '').replace(',', '.')) || null : null,
      category: idx.category >= 0 ? String(vals[idx.category] ?? '').trim() || null : null,
      photoUrl: idx.photo >= 0 ? String(vals[idx.photo] ?? '').trim() || null : null,
      qty,
    })
  })
  return rows.length > 0 ? rows : 'Не удалось распознать ни одной строки'
}

function parsePipe(content: string): FileRow[] | string {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) return 'Файл пуст'

  // Пропускаем строку-заголовок, если первая колонка — «sku» или «артикул»
  const firstCol = lines[0].split('|')[0].trim().toLowerCase()
  const startLine = firstCol === 'sku' || firstCol === 'артикул' ? 1 : 0

  const rows: FileRow[] = []
  for (let i = startLine; i < lines.length; i++) {
    const cols = lines[i].split('|').map((c) => c.trim())
    if (cols.length < 2) continue

    const sku = cols[0]
    if (!sku) continue

    // Последняя колонка — количество
    const qty = parseInt(cols[cols.length - 1], 10)
    if (isNaN(qty) || qty < 0) continue

    let name: string | null = null
    let price: number | null = null
    let category: string | null = null
    let photoUrl: string | null = null

    if (cols.length >= 6) {
      // Полный формат: SKU | Название | Цена | Категория | Фото URL | Количество
      name = cols[1] || null
      const p = parseFloat(cols[2].replace(',', '.'))
      if (!isNaN(p) && p >= 0) price = p
      category = cols[3] || null
      photoUrl = cols[4] || null
    } else if (cols.length >= 3) {
      // SKU | Название | ... | Количество
      name = cols[1] || null
      if (cols.length >= 4) {
        const p = parseFloat(cols[2].replace(',', '.'))
        if (!isNaN(p) && p >= 0) price = p
      }
    }
    // 2 колонки: SKU | Количество — name/price/category/photo остаются null

    rows.push({ sku, name, price, category, photoUrl, qty })
  }
  return rows.length > 0 ? rows : 'Не удалось распознать ни одной строки'
}

// ─── Список товаров ───────────────────────────────────────────────────────────

export async function showInventory(ctx: Context): Promise<void> {
  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('➕ Новый товар', 'inv:add'),
      Markup.button.callback('📝 Редактировать', 'inv:edit_product'),
    ],
    [
      Markup.button.callback('📊 Остатки', 'inv:stock_list'),
      Markup.button.callback('🗂️ Категории', 'inv:categories'),
    ],
    [
      Markup.button.callback('📥 Импорт', 'inv:import_menu'),
      Markup.button.callback('📤 Экспорт', 'inv:export'),
    ],
    [Markup.button.callback('🏠 Главное меню', 'back:main')],
  ])
  await ctx.reply('📦 Товароучёт', keyboard)
}

// ─── Список категорий ─────────────────────────────────────────────────────────

async function showCategories(ctx: Context): Promise<void> {
  const categories = await prisma.category.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  })

  const rows: ReturnType<typeof Markup.button.callback>[][] = categories.map((cat) => {
    const banner = cat.imageFile ? '🖼️' : '🚫'
    return [
      Markup.button.callback(`${banner} ${cat.name} (${cat._count.products})`, `inv:cat_edit:${cat.id}`),
      Markup.button.callback('🗑️', `inv:cat_delete:${cat.id}`),
    ]
  })
  rows.push([Markup.button.callback('➕ Добавить категорию', 'inv:category_add')])
  rows.push([Markup.button.callback('🔙 К товароучёту', 'inv:back')])

  const text = categories.length === 0 ? '📂 Категории\n\nКатегорий пока нет.' : '📂 Категории'
  await ctx.reply(text, Markup.inlineKeyboard(rows))
}

// ─── Карточка редактирования категории ────────────────────────────────────────

async function showCategoryEdit(ctx: Context, categoryId: number): Promise<void> {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { _count: { select: { products: true } } },
  })
  if (!cat) {
    await ctx.reply('❌ Категория не найдена.')
    await showCategories(ctx)
    return
  }

  const bannerStatus = cat.imageFile ? '🖼️ Баннер: загружен ✅' : '🖼️ Баннер: не загружен ❌'
  const sideLabel = cat.textSide === 'right' ? '▶️ Текст справа' : '◀️ Текст слева'
  const text = [
    `📂 ${cat.name}`,
    `Товаров: ${cat._count.products}`,
    bannerStatus,
    `Сторона текста: ${sideLabel}`,
  ].join('\n')

  await ctx.reply(
    text,
    Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Переименовать', `inv:cat_rename:${cat.id}`)],
      [
        Markup.button.callback('🖼️ Сменить баннер', `inv:cat_banner:${cat.id}`),
        Markup.button.callback('↔️ Сменить сторону текста', `inv:cat_textside:${cat.id}`),
      ],
      [Markup.button.callback('🔙 К категориям', 'inv:categories')],
    ]),
  )
}

// ─── Вспомогательные функции выбора товара (оприходование / списание) ─────────

async function showPickMethod(ctx: Context, flow: 'receive' | 'writeoff'): Promise<void> {
  const prefix = flow === 'receive' ? 'r' : 'w'
  const label = flow === 'receive' ? '📥 Оприходование' : '📤 Списание'
  await ctx.reply(
    `${label}\n\nКак найти товар?`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('📋 Выбрать из списка', `inv:${prefix}_from_list`),
        Markup.button.callback('🔢 Ввести SKU', `inv:${prefix}_from_sku`),
      ],
      [Markup.button.callback('🔙 Назад', 'inv:back')],
    ]),
  )
}

async function showCategoriesForPick(ctx: Context, flow: 'receive' | 'writeoff'): Promise<void> {
  const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
  const prefix = flow === 'receive' ? 'r' : 'w'
  const label = flow === 'receive' ? '📥 Оприходование' : '📤 Списание'
  if (categories.length === 0) {
    await ctx.reply('❌ Категорий нет. Выберите другой способ.')
    await showPickMethod(ctx, flow)
    return
  }
  const rows: ReturnType<typeof Markup.button.callback>[][] = categories.map((c) => [
    Markup.button.callback(c.name, `inv:${prefix}_cat:${c.id}`),
  ])
  rows.push([Markup.button.callback('🔙 Назад', flow === 'receive' ? 'inv:receive' : 'inv:writeoff')])
  await ctx.reply(`${label}\n\nВыберите категорию:`, Markup.inlineKeyboard(rows))
}

async function showProductsForPick(
  ctx: Context,
  flow: 'receive' | 'writeoff',
  categoryId: number,
): Promise<void> {
  const products = await prisma.product.findMany({
    where: { categoryId },
    orderBy: { name: 'asc' },
  })
  const prefix = flow === 'receive' ? 'r' : 'w'
  if (products.length === 0) {
    await ctx.reply('❌ В этой категории нет товаров.')
    await showCategoriesForPick(ctx, flow)
    return
  }
  const rows: ReturnType<typeof Markup.button.callback>[][] = products.map((p) => [
    Markup.button.callback(`${p.name} (${p.stock} шт.)`, `inv:${prefix}_prod:${p.sku}`),
  ])
  rows.push([
    Markup.button.callback('🔙 Назад к категориям', `inv:${prefix}_from_list`),
  ])
  await ctx.reply('Выберите товар:', Markup.inlineKeyboard(rows))
}

// ─── Функции для редактирования товаров ───────────────────────────────────────

async function showCategoriesForProductEdit(ctx: Context): Promise<void> {
  const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
  if (categories.length === 0) {
    await ctx.reply('❌ Категорий нет. Добавьте товары сначала.')
    return
  }
  const rows: ReturnType<typeof Markup.button.callback>[][] = categories.map((c) => [
    Markup.button.callback(c.name, `inv:ep_cat:${c.id}`),
  ])
  rows.push([Markup.button.callback('🔙 К товароучёту', 'inv:back')])
  await ctx.reply('📝 Редактирование товара\n\nВыберите категорию:', Markup.inlineKeyboard(rows))
}

async function showProductsForEdit(ctx: Context, categoryId: number): Promise<void> {
  const products = await prisma.product.findMany({
    where: { categoryId },
    orderBy: { name: 'asc' },
  })
  if (products.length === 0) {
    await ctx.reply('❌ В этой категории нет товаров.')
    await showCategoriesForProductEdit(ctx)
    return
  }
  const rows: ReturnType<typeof Markup.button.callback>[][] = products.map((p) => [
    Markup.button.callback(`${p.name} [${p.sku}]`, `inv:ep_prod:${p.id}`),
  ])
  rows.push([Markup.button.callback('🔙 Назад', 'inv:edit_product')])
  await ctx.reply('Выберите товар:', Markup.inlineKeyboard(rows))
}

async function showVariantsForPick(
  ctx: Context,
  flow: 'receive' | 'writeoff',
  product: { id: number; name: string; variants: { id: number; sku: string; quantity: number; attributes: unknown }[] },
): Promise<void> {
  const prefix = flow === 'receive' ? 'r' : 'w'
  const label = flow === 'receive' ? '📥 Оприходование' : '📤 Списание'
  const rows: ReturnType<typeof Markup.button.callback>[][] = product.variants.map((v) => {
    const attrs = v.attributes as Record<string, string>
    const attrStr = Object.values(attrs).join(' / ')
    const btnLabel = `${attrStr || v.sku} — ${v.quantity} шт.`
    return [Markup.button.callback(btnLabel.slice(0, 60), `inv:${prefix}_variant:${v.id}`)]
  })
  rows.push([Markup.button.callback('🔙 Назад', `inv:${prefix}_from_list`)])
  await ctx.reply(
    `${label} — ${product.name}\n\nВыберите вариант:`,
    Markup.inlineKeyboard(rows),
  )
}

async function showProductCard(ctx: Context, productId: number): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true, variants: true },
  })
  if (!product) {
    await ctx.reply('❌ Товар не найден.')
    return
  }
  const attrs = product.attributes as Record<string, string[]> | null
  const specs = product.specs as Record<string, string> | null
  const lines: string[] = [
    `📦 ${product.name} [${product.sku}]`,
    `Категория: ${product.category?.name ?? '—'}`,
    `Цена: ${product.price} ₽`,
    `Остаток: ${product.stock} шт.`,
  ]
  if (product.badge) lines.push(`Метка: ${product.badge}`)
  if (product.brand) lines.push(`Бренд: ${product.brand}`)
  if (product.variants.length > 0) lines.push(`Вариантов: ${product.variants.length}`)
  if (attrs && Object.keys(attrs).length > 0) lines.push(`Атрибуты: ${Object.keys(attrs).join(', ')}`)
  if (specs && Object.keys(specs).length > 0) lines.push(`Характеристики: ${Object.keys(specs).length} шт.`)

  await ctx.reply(
    lines.join('\n'),
    Markup.inlineKeyboard([
      [
        Markup.button.callback('🎛️ Варианты', `inv:prod_variants:${productId}`),
        Markup.button.callback('🏷️ Атрибуты', `inv:prod_attrs:${productId}`),
      ],
      [
        Markup.button.callback('📋 Характеристики', `inv:prod_specs:${productId}`),
        Markup.button.callback('🏅 Метка', `inv:prod_badge:${productId}`),
      ],
      [
        Markup.button.callback('🖼️ Превью товара', `inv:prod_photos:${productId}`),
        Markup.button.callback('🏢 Бренд', `inv:prod_brand:${productId}`),
      ],
      [Markup.button.callback('🔙 К товароучёту', 'inv:back')],
    ]),
  )
}

async function showVariantsList(ctx: Context, productId: number): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { orderBy: { id: 'asc' } } },
  })
  if (!product) {
    await ctx.reply('❌ Товар не найден.')
    return
  }
  const rows: ReturnType<typeof Markup.button.callback>[][] = product.variants.map((v) => {
    const attrs = v.attributes as Record<string, string>
    const attrStr = Object.values(attrs).join(' / ')
    const label = `${v.sku}: ${attrStr || '—'} — ${v.price}₽ (${v.quantity} шт.)`
    return [
      Markup.button.callback(label.slice(0, 44), `inv:var_view:${v.id}`),
      Markup.button.callback('🖼️ Фото', `inv:var_photos:${v.id}`),
      Markup.button.callback('🗑️', `inv:var_del:${v.id}:${productId}`),
    ]
  })
  rows.push([Markup.button.callback('➕ Добавить вариант', `inv:variant_add:${productId}`)])
  rows.push([Markup.button.callback('🔙 Назад', `inv:ep_prod:${productId}`)])
  const text =
    product.variants.length === 0
      ? `🎛️ Варианты — ${product.name}\n\nВариантов пока нет.`
      : `🎛️ Варианты — ${product.name} (${product.variants.length} шт.)`
  await ctx.reply(text, Markup.inlineKeyboard(rows))
}

async function showProductAttrs(ctx: Context, productId: number): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) {
    await ctx.reply('❌ Товар не найден.')
    return
  }
  const attrs = (product.attributes as Record<string, string[]> | null) ?? {}
  const lines: string[] = [`🏷️ Атрибуты — ${product.name}\n`]
  for (const [key, values] of Object.entries(attrs)) {
    lines.push(`${key}: ${Array.isArray(values) ? values.join(', ') : values}`)
  }
  if (Object.keys(attrs).length === 0) lines.push('Атрибуты не заданы.')

  const rows: ReturnType<typeof Markup.button.callback>[][] = []
  for (const key of Object.keys(attrs)) {
    const safeKey = key.slice(0, 20) // ограничиваем длину для callback_data
    rows.push([
      Markup.button.callback(`✏️ ${key}`, `inv:attr_edit:${productId}:${safeKey}`),
      Markup.button.callback('🗑️', `inv:attr_del:${productId}:${safeKey}`),
    ])
  }
  rows.push([Markup.button.callback('➕ Добавить атрибут', `inv:attr_add:${productId}`)])
  rows.push([Markup.button.callback('🔙 Назад', `inv:ep_prod:${productId}`)])
  await ctx.reply(lines.join('\n'), Markup.inlineKeyboard(rows))
}

async function showProductSpecs(ctx: Context, productId: number): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) {
    await ctx.reply('❌ Товар не найден.')
    return
  }
  const specs = (product.specs as Record<string, string> | null) ?? {}
  const lines: string[] = [`📋 Характеристики — ${product.name}\n`]
  for (const [key, value] of Object.entries(specs)) {
    lines.push(`${key}: ${value}`)
  }
  if (Object.keys(specs).length === 0) lines.push('Характеристики не заданы.')

  const rows: ReturnType<typeof Markup.button.callback>[][] = []
  for (const key of Object.keys(specs)) {
    const safeKey = key.slice(0, 20)
    rows.push([
      Markup.button.callback(`🗑️ ${key}`, `inv:spec_del:${productId}:${safeKey}`),
    ])
  }
  rows.push([Markup.button.callback('➕ Добавить', `inv:spec_add:${productId}`)])
  rows.push([Markup.button.callback('🔙 Назад', `inv:ep_prod:${productId}`)])
  await ctx.reply(lines.join('\n'), Markup.inlineKeyboard(rows))
}

async function showProductPhotos(ctx: Context, productId: number): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) {
    await ctx.reply('❌ Товар не найден.')
    return
  }
  const count = product.photos.length
  await ctx.reply(
    `🖼️ Фото товара — ${product.name}\n\nТекущих фото: ${count}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('➕ Добавить фото', `inv:prod_photo_add:${productId}`),
        Markup.button.callback('🗑️ Очистить все фото', `inv:prod_photo_clear:${productId}`),
      ],
      [Markup.button.callback('🔙 Назад', `inv:ep_prod:${productId}`)],
    ]),
  )
}

async function showVariantPhotos(ctx: Context, variantId: number): Promise<void> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  })
  if (!variant) {
    await ctx.reply('❌ Вариант не найден.')
    return
  }
  const attrs = variant.attributes as Record<string, string>
  const attrStr = Object.values(attrs).join(' / ')
  await ctx.reply(
    `🖼️ Фото варианта — ${variant.product.name}\n${attrStr || variant.sku}\n\nТекущих фото: ${variant.photos.length}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('➕ Добавить фото', `inv:var_photo_add:${variantId}`),
        Markup.button.callback('🗑️ Очистить фото варианта', `inv:var_photo_clr:${variantId}`),
      ],
      [Markup.button.callback('🔙 Назад', `inv:prod_variants:${variant.productId}`)],
    ]),
  )
}

// ─── Раздел «Остатки» ─────────────────────────────────────────────────────────

async function showStockList(ctx: Context): Promise<void> {
  const products = await prisma.product.findMany({
    include: { variants: true },
    orderBy: { name: 'asc' },
  })
  if (products.length === 0) {
    await ctx.reply(
      '📊 Остатки\n\nТоваров нет.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'inv:back')]]),
    )
    return
  }
  const lines: string[] = ['📊 Остатки\n']
  const buttons: ReturnType<typeof Markup.button.callback>[][] = []
  for (const p of products) {
    const totalQty = p.variants.reduce((s, v) => s + v.quantity, 0)
    const vCount = p.variants.length
    lines.push(`📦 ${p.name} — ${totalQty} шт. (${vCount} вар.)`)
    buttons.push([Markup.button.callback(`📋 ${p.name}`, `inv:stock_product:${p.id}`)])
  }
  buttons.push([Markup.button.callback('🔙 Назад', 'inv:back')])
  await ctx.reply(lines.join('\n'), Markup.inlineKeyboard(buttons))
}

async function showStockProduct(ctx: Context, productId: number): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { orderBy: { id: 'asc' } } },
  })
  if (!product) {
    await ctx.reply('❌ Товар не найден.')
    return
  }
  const lines: string[] = [`📦 *${product.name}* — варианты:\n`]
  const buttons: ReturnType<typeof Markup.button.callback>[][] = []
  product.variants.forEach((v, i) => {
    const num = i + 1
    const attrs = v.attributes as Record<string, string>
    const attrStr = Object.values(attrs).join(', ')
    const price = Number(v.price).toLocaleString('ru-RU')
    lines.push(`${num}. ${attrStr || v.sku} — ${v.quantity} шт. | ${price} ₽`)
    lines.push(`   SKU: ${v.sku}`)
    buttons.push([
      Markup.button.callback(`➕ №${num}`, `inv:stock_in:${v.id}`),
      Markup.button.callback(`➖ №${num}`, `inv:stock_out:${v.id}`),
      Markup.button.callback(`📜 №${num}`, `inv:stock_hist:${v.id}`),
    ])
  })
  buttons.push([Markup.button.callback('🔙 К остаткам', 'inv:stock_list')])
  await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) })
}

async function showVariantStockHistory(ctx: Context, variantId: number): Promise<void> {
  const [variant, movements] = await Promise.all([
    prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: true } }),
    getStockHistory(variantId),
  ])
  if (!variant) {
    await ctx.reply('❌ Вариант не найден.')
    return
  }
  const attrs = variant.attributes as Record<string, string>
  const attrStr = Object.values(attrs).join(' / ')
  const lines: string[] = [`📜 История — ${variant.product.name} [${attrStr || variant.sku}]\n`]
  if (movements.length === 0) {
    lines.push('Движений нет.')
  } else {
    for (const m of movements.slice(0, 10)) {
      const icon = m.type === 'in' || m.type === 'reserve' ? '📥' : '📤'
      const sign = m.type === 'in' || m.type === 'reserve' ? '+' : '-'
      const date = m.createdAt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      lines.push(`${icon} ${sign}${m.quantity} шт. — ${m.comment ?? m.type} — ${date}`)
    }
  }
  await ctx.reply(
    lines.join('\n'),
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', `inv:stock_product:${variant.productId}`)]]),
  )
}

async function saveVariant(
  ctx: Context,
  userId: number,
  s: Extract<VariantAddFlow, { step: 'photo' }>,
): Promise<void> {
  try {
    const existing = await prisma.productVariant.findUnique({ where: { sku: s.sku } })
    if (existing) {
      await ctx.reply(`❌ Артикул «${s.sku}» уже занят. Попробуйте добавить вариант снова с другим SKU.`, Markup.removeKeyboard())
      inventoryState.delete(userId)
      await showVariantsList(ctx, s.productId)
      return
    }
    const variant = await prisma.productVariant.create({
      data: {
        productId: s.productId,
        sku: s.sku,
        price: s.price,
        quantity: s.qty,
        inStock: s.qty > 0,
        attributes: s.attrs,
        photos: s.photos,
      },
    })
    inventoryState.delete(userId)
    const attrStr = Object.entries(s.attrs).map(([k, v]) => `${k}: ${v}`).join(', ')
    await ctx.reply(
      [
        '✅ Вариант добавлен!',
        `Артикул:    ${variant.sku}`,
        `Атрибуты:   ${attrStr || '—'}`,
        `Цена:       ${variant.price} ₽`,
        `Количество: ${variant.quantity} шт.`,
        `Фото:       ${s.photos.length} шт.`,
      ].join('\n'),
      Markup.removeKeyboard(),
    )
    await showVariantsList(ctx, s.productId)
  } catch (err) {
    console.error('saveVariant error:', err)
    inventoryState.delete(userId)
    await ctx.reply('❌ Ошибка при сохранении варианта.', Markup.removeKeyboard())
    await showVariantsList(ctx, s.productId)
  }
}

// ─── Выбор региона ────────────────────────────────────────────────────────────

async function buildRegionKeyboard() {
  const regions = await prisma.region.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } })
  const rows: ReturnType<typeof Markup.button.callback>[][] = []
  for (let i = 0; i < regions.length; i += 4) {
    rows.push(regions.slice(i, i + 4).map((r) =>
      Markup.button.callback(`${r.flag} ${r.code}`, `inv:var_region:${r.code}`),
    ))
  }
  rows.push([Markup.button.callback('⏭️ Пропустить', 'inv:var_region_skip')])
  return Markup.inlineKeyboard(rows)
}

function regionToPhotoState(
  s: Extract<VariantAddFlow, { step: 'region' }>,
  regionCode?: string,
): Extract<VariantAddFlow, { step: 'photo' }> {
  const attrs = regionCode ? { ...s.attrs, 'Регион': regionCode } : { ...s.attrs }
  return {
    flow: 'variant_add',
    step: 'photo',
    productId: s.productId,
    sku: s.sku,
    price: s.price,
    qty: s.qty,
    attrs,
    photos: [],
  }
}

// ─── Регистрация action-обработчиков ─────────────────────────────────────────

export function setupInventoryHandlers(bot: Telegraf): void {
  bot.action('inv:add', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    inventoryState.set(userId, { flow: 'add', step: 'sku' })
    await ctx.reply(
      '➕ Добавление товара\n\nШаг 1 из 9 — введите артикул (SKU):',
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  // ── Раздел «Остатки» ──────────────────────────────────────────────────────

  bot.action('inv:stock_list', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    await showStockList(ctx)
  })

  bot.action(/^inv:stock_product:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await showStockProduct(ctx, productId)
  })

  bot.action(/^inv:stock_hist:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const variantId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await showVariantStockHistory(ctx, variantId)
  })

  bot.action(/^inv:stock_in:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = ctx.from!.id
    const variantId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId }, include: { product: true },
    })
    if (!variant) { await ctx.reply('❌ Вариант не найден.'); return }
    const attrs = variant.attributes as Record<string, string>
    inventoryState.set(userId, {
      flow: 'stock_in', step: 'qty',
      variantId, variantSku: variant.sku,
      productName: `${variant.product.name} [${Object.values(attrs).join(' / ') || variant.sku}]`,
      currentQty: variant.quantity,
    })
    await ctx.reply(
      `📥 Приход — ${variant.product.name}\nВариант: ${Object.values(attrs).join(' / ') || variant.sku}\nТекущий остаток: ${variant.quantity} шт.\n\nВведите количество для прихода:`,
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  bot.action(/^inv:stock_out:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = ctx.from!.id
    const variantId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId }, include: { product: true },
    })
    if (!variant) { await ctx.reply('❌ Вариант не найден.'); return }
    const attrs = variant.attributes as Record<string, string>
    inventoryState.set(userId, {
      flow: 'stock_out', step: 'qty',
      variantId, variantSku: variant.sku,
      productName: `${variant.product.name} [${Object.values(attrs).join(' / ') || variant.sku}]`,
      currentQty: variant.quantity,
    })
    await ctx.reply(
      `📤 Списание — ${variant.product.name}\nВариант: ${Object.values(attrs).join(' / ') || variant.sku}\nТекущий остаток: ${variant.quantity} шт.\n\nВведите количество для списания:`,
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  // ── Категории ──────────────────────────────────────────────────────────────

  bot.action('inv:categories', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    await showCategories(ctx)
  })

  bot.action('inv:category_add', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    inventoryState.set(userId, { flow: 'category_add', step: 'name' })
    await ctx.reply(
      '➕ Новая категория\n\nВведите название:',
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  // ── Редактирование категории ────────────────────────────────────────────────

  bot.action(/^inv:cat_edit:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const categoryId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await showCategoryEdit(ctx, categoryId)
  })

  // ── Сменить баннер ──────────────────────────────────────────────────────────

  bot.action(/^inv:cat_banner:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const categoryId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    const cat = await prisma.category.findUnique({ where: { id: categoryId } })
    if (!cat) {
      await ctx.reply('❌ Категория не найдена.')
      return
    }
    inventoryState.set(userId, { flow: 'category_banner', step: 'photo', categoryId: cat.id, categoryName: cat.name })
    await ctx.reply(
      `🖼️ Баннер для «${cat.name}»\n\nОтправьте фото-баннер:`,
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  // ── Сменить сторону текста ─────────────────────────────────────────────────

  bot.action(/^inv:cat_textside:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const categoryId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    const cat = await prisma.category.findUnique({ where: { id: categoryId } })
    if (!cat) {
      await ctx.reply('❌ Категория не найдена.')
      return
    }
    await ctx.reply(
      `↔️ Сторона текста для «${cat.name}»\n\nВыберите:`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('◀️ Текст слева', `inv:cat_textside_set:${cat.id}:left`),
          Markup.button.callback('▶️ Текст справа', `inv:cat_textside_set:${cat.id}:right`),
        ],
        [Markup.button.callback('🔙 Назад', `inv:cat_edit:${cat.id}`)],
      ]),
    )
  })

  bot.action(/^inv:cat_textside_set:(\d+):(left|right)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const m = ctx.match as RegExpMatchArray
    const categoryId = parseInt(m[1], 10)
    const side = m[2] as 'left' | 'right'
    const cat = await prisma.category.findUnique({ where: { id: categoryId } })
    if (!cat) {
      await ctx.reply('❌ Категория не найдена.')
      return
    }
    await prisma.category.update({ where: { id: categoryId }, data: { textSide: side } })
    const label = side === 'right' ? '▶️ Текст справа' : '◀️ Текст слева'
    await ctx.reply(`✅ Сторона текста «${cat.name}»: ${label}`)
    await showCategoryEdit(ctx, categoryId)
  })

  // ── Выбор стороны текста при добавлении категории ─────────────────────────

  bot.action(/^inv:cat_add_textside:(left|right)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const state = inventoryState.get(userId)
    if (!state || state.flow !== 'category_add' || state.step !== 'textSide') return

    const side = (ctx.match as RegExpMatchArray)[1] as 'left' | 'right'
    const s = state as Extract<CategoryAddFlow, { step: 'textSide' }>
    try {
      await prisma.category.create({ data: { name: s.name, textSide: side } })
      inventoryState.delete(userId)
      const label = side === 'right' ? '▶️ Текст справа' : '◀️ Текст слева'
      await ctx.reply(`✅ Категория «${s.name}» добавлена (${label}).`, Markup.removeKeyboard())
      await showCategories(ctx)
    } catch (err) {
      console.error('category add textSide error:', err)
      inventoryState.delete(userId)
      await ctx.reply('❌ Ошибка при сохранении.', Markup.removeKeyboard())
      await showInventory(ctx)
    }
  })

  bot.action('inv:back', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    await showInventory(ctx)
  })

  // ── Завершение загрузки фото (шаг 5 добавления товара) ────────────────────

  bot.action('inv:photo_done', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const state = inventoryState.get(userId)
    if (!state || state.flow !== 'add' || state.step !== 'photo') return

    const s = state as Extract<AddFlow, { step: 'photo' }>
    inventoryState.set(userId, {
      flow: 'add',
      step: 'qty',
      sku: s.sku,
      name: s.name,
      description: s.description,
      specs: s.specs,
      attributes: s.attributes,
      price: s.price,
      category: s.category,
      photoFileIds: s.photoFileIds,
    })

    const photoInfo = s.photoFileIds.length > 0
      ? `${s.photoFileIds.length} фото`
      : 'без фото'

    await ctx.reply(
      `Фото: ${photoInfo}\n\nШаг 9 из 9 — введите начальное количество на складе:`,
      Markup.keyboard([['0', '❌ Отмена']]).resize(),
    )
  })

  // ── Выбор категории при добавлении товара ──────────────────────────────────

  bot.action(/^inv:cat_select:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const state = inventoryState.get(userId)
    if (!state || state.flow !== 'add' || state.step !== 'category') return

    const categoryId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    const cat = await prisma.category.findUnique({ where: { id: categoryId } })
    if (!cat) {
      await ctx.reply('❌ Категория не найдена.')
      return
    }

    const s = state as Extract<AddFlow, { step: 'category' }>
    inventoryState.set(userId, {
      flow: 'add',
      step: 'photo',
      sku: s.sku,
      name: s.name,
      description: s.description,
      specs: s.specs,
      attributes: s.attributes,
      price: s.price,
      category: cat.name,
      photoFileIds: [],
    })

    await ctx.reply(
      `Категория: ${cat.name}\n\nШаг 8 из 9 — отправьте фото товара (можно несколько, до 7 штук).\nКогда закончите — нажмите ✅ Готово\n\nДля отмены напишите «❌ Отмена»`,
      Markup.inlineKeyboard([[Markup.button.callback('✅ Готово (без фото)', 'inv:photo_done')]]),
    )
  })

  bot.action('inv:cancel', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showInventory(ctx)
  })

  // ── Подменю «Импорт» ─────────────────────────────────────────────────────

  bot.action('inv:import_menu', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    await ctx.reply(
      '📥 Импорт',
      Markup.inlineKeyboard([
        [Markup.button.callback('📋 Скачать шаблон', 'inv:download_template')],
        [Markup.button.callback('📤 Загрузить файл',  'inv:import_file_start')],
        [Markup.button.callback('🔙 Назад',           'inv:back')],
      ]),
    )
  })

  bot.action('inv:download_template', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    await ctx.reply(
      [
        '📋 Шаблон для оприходования/списания',
        '',
        'Лист «Оприходование»:',
        '- SKU — артикул варианта товара',
        '- Количество — +5 приход, -2 списание',
        '- Комментарий — необязательно',
        '',
        'Лист «Справочник SKU» — все варианты с актуальными остатками.',
        '',
        'Скопируй нужные SKU из справочника в лист оприходования.',
      ].join('\n'),
    )
    try {
      const port = process.env.API_PORT ?? '3000'
      const response = await fetch(`http://localhost:${port}/api/download/template`)
      const buffer = Buffer.from(await response.arrayBuffer())
      await ctx.replyWithDocument({ source: buffer, filename: 'bender-shop-template.xlsx' })
    } catch (err) {
      console.error('[inv:download_template]', err)
      await ctx.reply('❌ Не удалось сформировать шаблон.')
    }
  })

  bot.action('inv:import_file_start', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = ctx.from!.id
    inventoryState.set(userId, { flow: 'import_file', step: 'awaiting_file' })
    await ctx.reply(
      'Отправьте заполненный файл шаблона (.xlsx)',
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  bot.action('inv:export', async (ctx) => {
    try { await ctx.answerCbQuery('Генерирую файл…') } catch { /* ignore */ }
    await exportInventory(ctx)
  })

  // ── Переименование категории ────────────────────────────────────────────────

  bot.action(/^inv:cat_rename:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const categoryId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    const cat = await prisma.category.findUnique({ where: { id: categoryId } })
    if (!cat) {
      await ctx.reply('❌ Категория не найдена.')
      return
    }
    inventoryState.set(userId, {
      flow: 'category_rename',
      step: 'name',
      categoryId: cat.id,
      oldName: cat.name,
    })
    await ctx.reply(
      `✏️ Переименование категории «${cat.name}»\n\nВведите новое название:`,
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  // ── Удаление категории ──────────────────────────────────────────────────────

  bot.action(/^inv:cat_delete:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const categoryId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    const cat = await prisma.category.findUnique({
      where: { id: categoryId },
      include: { _count: { select: { products: true } } },
    })
    if (!cat) {
      await ctx.reply('❌ Категория не найдена.')
      return
    }
    if (cat._count.products > 0) {
      await ctx.reply(
        `❌ Нельзя удалить — есть ${cat._count.products} товар(ов) в категории «${cat.name}».`,
      )
      return
    }
    await prisma.category.delete({ where: { id: categoryId } })
    await ctx.reply(`✅ Категория «${cat.name}» удалена.`)
    await showCategories(ctx)
  })

  // ── Редактирование товара — выбор категории и товара ───────────────────────

  bot.action('inv:edit_product', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    await showCategoriesForProductEdit(ctx)
  })

  bot.action(/^inv:ep_cat:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const categoryId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await showProductsForEdit(ctx, categoryId)
  })

  bot.action(/^inv:ep_prod:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await showProductCard(ctx, productId)
  })

  // ── Варианты товара ────────────────────────────────────────────────────────

  bot.action(/^inv:prod_variants:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await showVariantsList(ctx, productId)
  })

  bot.action(/^inv:variant_add:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    const product = await prisma.product.findUnique({ where: { id: productId } })
    inventoryState.set(userId, { flow: 'variant_add', step: 'sku', productId })
    await ctx.reply(
      `➕ Новый вариант — ${product?.name ?? ''}\n\nШаг 1 — введите артикул (SKU):\n(Пример: ${product?.sku ?? 'SKU'}-256-BLK)`,
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  bot.action(/^inv:var_view:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const variantId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true },
    })
    if (!variant) {
      await ctx.reply('❌ Вариант не найден.')
      return
    }
    const attrs = variant.attributes as Record<string, string>
    const lines = [
      `🎛️ Вариант [${variant.sku}]`,
      `Товар: ${variant.product.name}`,
      ...Object.entries(attrs).map(([k, v]) => `${k}: ${v}`),
      `Цена: ${variant.price} ₽`,
      `Остаток: ${variant.quantity} шт.`,
      `В наличии: ${variant.inStock ? 'Да' : 'Нет'}`,
      `Фото: ${variant.photos.length} шт.`,
    ]
    await ctx.reply(
      lines.join('\n'),
      Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Назад', `inv:prod_variants:${variant.productId}`)],
      ]),
    )
  })

  bot.action(/^inv:var_del:(\d+):(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const m = ctx.match as RegExpMatchArray
    const variantId = parseInt(m[1], 10)
    const productId = parseInt(m[2], 10)
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } })
    if (!variant) {
      await ctx.reply('❌ Вариант не найден.')
      return
    }
    const attrs = variant.attributes as Record<string, string>
    const attrStr = Object.values(attrs).join(' / ')
    await ctx.reply(
      `🗑️ Удалить вариант?\n\n${variant.sku}: ${attrStr || '—'} — ${variant.price}₽ (${variant.quantity} шт.)`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Да, удалить', `inv:var_del_ok:${variantId}:${productId}`),
          Markup.button.callback('❌ Отмена', `inv:prod_variants:${productId}`),
        ],
      ]),
    )
  })

  bot.action(/^inv:var_del_ok:(\d+):(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const m = ctx.match as RegExpMatchArray
    const variantId = parseInt(m[1], 10)
    const productId = parseInt(m[2], 10)
    await prisma.productVariant.delete({ where: { id: variantId } })
    await ctx.reply('✅ Вариант удалён.')
    await showVariantsList(ctx, productId)
  })

  // ── Фото существующего варианта ───────────────────────────────────────────

  bot.action(/^inv:var_photos:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const variantId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await showVariantPhotos(ctx, variantId)
  })

  bot.action(/^inv:var_photo_add:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const variantId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } })
    if (!variant) { await ctx.reply('❌ Вариант не найден.'); return }
    inventoryState.set(userId, {
      flow: 'variant_photo_edit',
      step: 'uploading',
      variantId,
      productId: variant.productId,
      pendingPhotos: [],
    })
    await ctx.reply(
      `Отправьте фото варианта (до 7 штук).\nУже загружено: ${variant.photos.length}\nНажмите ✅ Готово когда закончите.`,
      Markup.inlineKeyboard([[Markup.button.callback('✅ Готово', `inv:var_photo_done_e:${variantId}`)]]),
    )
  })

  bot.action(/^inv:var_photo_done_e:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const variantId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    const state = inventoryState.get(userId)
    const pending = state?.flow === 'variant_photo_edit' ? state.pendingPhotos : []
    inventoryState.delete(userId)
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } })
    if (!variant) { await ctx.reply('❌ Вариант не найден.', Markup.removeKeyboard()); return }
    const updatedPhotos = [...variant.photos, ...pending]
    await prisma.productVariant.update({ where: { id: variantId }, data: { photos: updatedPhotos } })
    await ctx.reply(`✅ Сохранено. Фото варианта: ${updatedPhotos.length} шт.`, Markup.removeKeyboard())
    await showVariantPhotos(ctx, variantId)
  })

  bot.action(/^inv:var_photo_clr:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const variantId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await ctx.reply(
      '🗑️ Удалить все фото варианта?',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Да, удалить', `inv:var_photo_clr_ok:${variantId}`),
          Markup.button.callback('❌ Отмена', `inv:var_photos:${variantId}`),
        ],
      ]),
    )
  })

  bot.action(/^inv:var_photo_clr_ok:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const variantId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await prisma.productVariant.update({ where: { id: variantId }, data: { photos: [] } })
    await ctx.reply('✅ Фото варианта очищены.')
    await showVariantPhotos(ctx, variantId)
  })

  // ── Выбор значения атрибута при добавлении варианта ──────────────────────

  bot.action(/^inv:var_attr:(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const state = inventoryState.get(userId)
    if (!state || state.flow !== 'variant_add' || state.step !== 'attrs') return
    const value = decodeURIComponent((ctx.match as RegExpMatchArray)[1])
    const s = state as Extract<VariantAddFlow, { step: 'attrs' }>
    const currentKey = s.attrKeys[s.currentAttrIndex]
    const newSelectedAttrs = { ...s.selectedAttrs, [currentKey]: value }
    const nextIndex = s.currentAttrIndex + 1

    if (nextIndex >= s.attrKeys.length) {
      inventoryState.set(userId, {
        flow: 'variant_add',
        step: 'region',
        productId: s.productId,
        sku: s.sku,
        price: s.price,
        qty: s.qty,
        attrs: newSelectedAttrs,
      })
      await ctx.reply(
        `${currentKey}: ${value} ✅\n\nШаг 5 — выберите регион/страну варианта:`,
        await buildRegionKeyboard(),
      )
    } else {
      inventoryState.set(userId, {
        flow: 'variant_add',
        step: 'attrs',
        productId: s.productId,
        sku: s.sku,
        price: s.price,
        qty: s.qty,
        attrKeys: s.attrKeys,
        selectedAttrs: newSelectedAttrs,
        currentAttrIndex: nextIndex,
      })
      const product = await prisma.product.findUnique({ where: { id: s.productId } })
      const productAttrs = product?.attributes as Record<string, string[]> | null
      const nextKey = s.attrKeys[nextIndex]
      const nextValues = productAttrs?.[nextKey] ?? []
      const valButtons = nextValues.map((v) => Markup.button.callback(v, `inv:var_attr:${encodeURIComponent(v)}`))
      const valRows: ReturnType<typeof Markup.button.callback>[][] = []
      for (let i = 0; i < valButtons.length; i += 3) valRows.push(valButtons.slice(i, i + 3))
      await ctx.reply(
        `${currentKey}: ${value} ✅\n\nВыберите ${nextKey}:`,
        Markup.inlineKeyboard(valRows),
      )
    }
  })

  // ── Выбор региона при добавлении варианта ─────────────────────────────────

  bot.action(/^inv:var_region:(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = inventoryState.get(userId)
    if (!state || state.flow !== 'variant_add' || state.step !== 'region') return
    const regionCode = (ctx.match as RegExpMatchArray)[1]
    const s = state as Extract<VariantAddFlow, { step: 'region' }>
    inventoryState.set(userId, regionToPhotoState(s, regionCode))
    await ctx.reply(
      `🌍 Регион: ${regionCode} ✅\n\nШаг 6 — добавьте фото варианта (до 5 штук) или пропустите:`,
      Markup.inlineKeyboard([[Markup.button.callback('⏭️ Пропустить', 'inv:var_photo_skip')]]),
    )
  })

  bot.action('inv:var_region_skip', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = inventoryState.get(userId)
    if (!state || state.flow !== 'variant_add' || state.step !== 'region') return
    const s = state as Extract<VariantAddFlow, { step: 'region' }>
    inventoryState.set(userId, regionToPhotoState(s))
    await ctx.reply(
      'Шаг 6 — добавьте фото варианта (до 5 штук) или пропустите:',
      Markup.inlineKeyboard([[Markup.button.callback('⏭️ Пропустить', 'inv:var_photo_skip')]]),
    )
  })

  bot.action('inv:var_photo_skip', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const state = inventoryState.get(userId)
    if (!state || state.flow !== 'variant_add' || state.step !== 'photo') return
    await saveVariant(ctx, userId, state as Extract<VariantAddFlow, { step: 'photo' }>)
  })

  bot.action('inv:var_photo_done', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const state = inventoryState.get(userId)
    if (!state || state.flow !== 'variant_add' || state.step !== 'photo') return
    await saveVariant(ctx, userId, state as Extract<VariantAddFlow, { step: 'photo' }>)
  })

  // ── Атрибуты товара ────────────────────────────────────────────────────────

  bot.action(/^inv:prod_attrs:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await showProductAttrs(ctx, productId)
  })

  bot.action(/^inv:attr_add:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    inventoryState.set(userId, { flow: 'attr_add', step: 'name', productId })
    await ctx.reply(
      '🏷️ Добавление атрибута\n\nШаг 1 — введите название (например: Память, Цвет):',
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  bot.action(/^inv:attr_edit:(\d+):(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const m = ctx.match as RegExpMatchArray
    const productId = parseInt(m[1], 10)
    const attrName = m[2]
    inventoryState.set(userId, { flow: 'attr_edit', step: 'values', productId, attrName })
    const product = await prisma.product.findUnique({ where: { id: productId } })
    const existingAttrs = (product?.attributes as Record<string, string[]> | null) ?? {}
    const currentValues = (existingAttrs[attrName] ?? []).join(', ')
    await ctx.reply(
      `✏️ Атрибут «${attrName}»\nТекущие значения: ${currentValues || '—'}\n\nВведите новые значения через запятую:`,
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  bot.action(/^inv:attr_del:(\d+):(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const m = ctx.match as RegExpMatchArray
    const productId = parseInt(m[1], 10)
    const attrName = m[2]
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return
    const attrs = (product.attributes as Record<string, string[]> | null) ?? {}
    delete attrs[attrName]
    await prisma.product.update({ where: { id: productId }, data: { attributes: attrs } })
    await ctx.reply(`✅ Атрибут «${attrName}» удалён.`)
    await showProductAttrs(ctx, productId)
  })

  // ── Характеристики товара ──────────────────────────────────────────────────

  bot.action(/^inv:prod_specs:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await showProductSpecs(ctx, productId)
  })

  bot.action(/^inv:spec_add:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    inventoryState.set(userId, { flow: 'spec_add', step: 'input', productId })
    await ctx.reply(
      '📋 Добавление характеристики\n\nВведите в формате:\nНазвание : Значение\n\nПример: Процессор : Apple A18',
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  bot.action(/^inv:spec_del:(\d+):(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const m = ctx.match as RegExpMatchArray
    const productId = parseInt(m[1], 10)
    const specName = m[2]
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return
    const specs = (product.specs as Record<string, string> | null) ?? {}
    delete specs[specName]
    await prisma.product.update({ where: { id: productId }, data: { specs } })
    await ctx.reply(`✅ Характеристика «${specName}» удалена.`)
    await showProductSpecs(ctx, productId)
  })

  // ── Метка товара ───────────────────────────────────────────────────────────

  bot.action(/^inv:prod_badge:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return
    await ctx.reply(
      `🏅 Метка товара\n\n${product.name}\nТекущая метка: ${product.badge ?? '—'}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('ХИТ', `inv:badge_set:${productId}:ХИТ`),
          Markup.button.callback('НОВИНКА', `inv:badge_set:${productId}:НОВИНКА`),
          Markup.button.callback('АКЦИЯ', `inv:badge_set:${productId}:АКЦИЯ`),
        ],
        [Markup.button.callback('❌ Убрать метку', `inv:badge_clear:${productId}`)],
        [Markup.button.callback('🔙 Назад', `inv:ep_prod:${productId}`)],
      ]),
    )
  })

  bot.action(/^inv:badge_set:(\d+):(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const m = ctx.match as RegExpMatchArray
    const productId = parseInt(m[1], 10)
    const badge = m[2]
    await prisma.product.update({ where: { id: productId }, data: { badge } })
    await ctx.reply(`✅ Метка «${badge}» установлена.`)
    await showProductCard(ctx, productId)
  })

  bot.action(/^inv:badge_clear:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await prisma.product.update({ where: { id: productId }, data: { badge: null } })
    await ctx.reply('✅ Метка убрана.')
    await showProductCard(ctx, productId)
  })

  // ── Бренд товара ────────────────────────────────────────────────────────────

  bot.action(/^inv:prod_brand:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return
    inventoryState.set(userId, { flow: 'brand_edit', step: 'input', productId })
    await ctx.reply(
      `🏢 Бренд товара\n\n${product.name}\nТекущий бренд: ${product.brand ?? '—'}\n\nВведите название бренда (или «-» чтобы очистить):`,
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  // ── Фото товара ─────────────────────────────────────────────────────────────

  bot.action(/^inv:prod_photos:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await showProductPhotos(ctx, productId)
  })

  bot.action(/^inv:prod_photo_add:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    inventoryState.set(userId, { flow: 'product_photo', step: 'uploading', productId, pendingPhotos: [] })
    await ctx.reply(
      'Отправьте фото товара (можно несколько, до 7 штук). Нажмите ✅ Готово когда закончите.',
      Markup.inlineKeyboard([[Markup.button.callback('✅ Готово', `inv:prod_photo_done:${productId}`)]]),
    )
  })

  bot.action(/^inv:prod_photo_done:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    const state = inventoryState.get(userId)
    const pending = (state?.flow === 'product_photo' ? state.pendingPhotos : [])
    inventoryState.delete(userId)

    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) {
      await ctx.reply('❌ Товар не найден.', Markup.removeKeyboard())
      return
    }
    const updatedPhotos = [...product.photos, ...pending]
    await prisma.product.update({ where: { id: productId }, data: { photos: updatedPhotos } })
    await ctx.reply(`✅ Сохранено. Фото товара: ${updatedPhotos.length} шт.`, Markup.removeKeyboard())
    await showProductCard(ctx, productId)
  })

  bot.action(/^inv:prod_photo_clear:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await ctx.reply(
      '🗑️ Удалить все фото товара?',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Да, удалить все', `inv:prod_photo_clear_ok:${productId}`),
          Markup.button.callback('❌ Отмена', `inv:prod_photos:${productId}`),
        ],
      ]),
    )
  })

  bot.action(/^inv:prod_photo_clear_ok:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const productId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await prisma.product.update({ where: { id: productId }, data: { photos: [] } })
    await ctx.reply('✅ Все фото удалены.')
    await showProductPhotos(ctx, productId)
  })

}

// ─── Пошаговый обработчик текста ─────────────────────────────────────────────
// Возвращает true если сообщение обработано и не нужно передавать дальше.

export async function handleInventoryMessage(
  ctx: Context,
  userId: number,
  text: string,
): Promise<boolean> {
  const state = inventoryState.get(userId)
  if (!state) return false

  switch (state.flow) {
    case 'add':
      return handleAddFlow(ctx, userId, text, state)
    case 'stock_in':
      return handleStockInFlow(ctx, userId, text, state)
    case 'stock_out':
      return handleStockOutFlow(ctx, userId, text, state)
    case 'variant_add':
      return handleVariantAddFlow(ctx, userId, text, state)
    case 'attr_add':
      return handleAttrAddFlow(ctx, userId, text, state)
    case 'attr_edit':
      return handleAttrEditFlow(ctx, userId, text, state)
    case 'spec_add':
      return handleSpecAddFlow(ctx, userId, text, state)
    case 'brand_edit':
      return handleBrandEditFlow(ctx, userId, text, state)
    case 'category_add':
      return handleCategoryAddFlow(ctx, userId, text, state)
    case 'category_rename':
      return handleCategoryRenameFlow(ctx, userId, text, state)
    case 'category_banner': {
      if (text === '❌ Отмена') {
        inventoryState.delete(userId)
        await ctx.reply('Отменено.', Markup.removeKeyboard())
        await showCategories(ctx)
      } else {
        await ctx.reply('📷 Пришлите фото баннера (или нажмите ❌ Отмена)')
      }
      return true
    }
    case 'product_photo': {
      if (text === '❌ Отмена') {
        const productId = (state as ProductPhotoFlow).productId
        inventoryState.delete(userId)
        await ctx.reply('Отменено.', Markup.removeKeyboard())
        await showProductCard(ctx, productId)
      } else {
        await ctx.reply('📷 Отправьте фото или нажмите ✅ Готово')
      }
      return true
    }
    case 'variant_photo_edit': {
      if (text === '❌ Отмена') {
        const variantId = (state as VariantPhotoEditFlow).variantId
        inventoryState.delete(userId)
        await ctx.reply('Отменено.', Markup.removeKeyboard())
        await showVariantPhotos(ctx, variantId)
      } else {
        await ctx.reply('📷 Отправьте фото или нажмите ✅ Готово')
      }
      return true
    }
    case 'import_file': {
      if (text === '❌ Отмена') {
        inventoryState.delete(userId)
        await ctx.reply('Отменено.', Markup.removeKeyboard())
        await showInventory(ctx)
      } else {
        await ctx.reply('📎 Отправьте заполненный файл шаблона (.xlsx)')
      }
      return true
    }
  }
}

// ─── Обработчик входящего фото ────────────────────────────────────────────────
// Вызывается из bot/index.ts для шага photo флоу добавления товара и баннера категории.

export async function handleInventoryPhoto(ctx: Context, userId: number): Promise<boolean> {
  const state = inventoryState.get(userId)
  if (!state) return false

  const msg = ctx.message as {
    photo?: Array<{ file_id: string }>
    document?: { file_id: string; mime_type?: string }
  }

  let fileId: string | null = null
  if (msg?.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
    fileId = msg.photo[msg.photo.length - 1].file_id
  } else if (msg?.document?.mime_type?.startsWith('image/')) {
    fileId = msg.document.file_id
  }
  if (!fileId) return false

  // ── Баннер категории ───────────────────────────────────────────────────────
  if (state.flow === 'category_banner' && state.step === 'photo') {
    const s = state as CategoryBannerFlow
    try {
      await prisma.category.update({
        where: { id: s.categoryId },
        data: { imageFile: fileId },
      })
      inventoryState.delete(userId)
      await ctx.reply(`✅ Баннер для «${s.categoryName}» сохранён.`, Markup.removeKeyboard())
      await showCategoryEdit(ctx, s.categoryId)
    } catch (err) {
      console.error('category banner error:', err)
      inventoryState.delete(userId)
      await ctx.reply('❌ Ошибка при сохранении баннера.', Markup.removeKeyboard())
    }
    return true
  }

  // ── Фото варианта ──────────────────────────────────────────────────────────
  if (state.flow === 'variant_add' && state.step === 'photo') {
    const s = state as Extract<VariantAddFlow, { step: 'photo' }>
    if (s.photos.length >= 5) {
      await ctx.reply(
        '❌ Лимит 5 фото достигнут.',
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Сохранить', 'inv:var_photo_done'),
            Markup.button.callback('⏭️ Пропустить', 'inv:var_photo_skip'),
          ],
        ]),
      )
      return true
    }
    const newPhotos = [...s.photos, fileId]
    inventoryState.set(userId, { ...s, photos: newPhotos })
    const remaining = 5 - newPhotos.length
    await ctx.reply(
      `📸 Фото ${newPhotos.length}/5 добавлено.${remaining > 0 ? ` Ещё ${remaining}.` : ' Лимит.'}\nНажмите ✅ Сохранить или добавьте ещё.`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Сохранить', 'inv:var_photo_done'),
          Markup.button.callback('⏭️ Пропустить фото', 'inv:var_photo_skip'),
        ],
      ]),
    )
    return true
  }

  // ── Фото при редактировании товара ────────────────────────────────────────
  if (state.flow === 'product_photo' && state.step === 'uploading') {
    const s = state as ProductPhotoFlow
    if (s.pendingPhotos.length >= 7) {
      await ctx.reply(
        '❌ Лимит 7 фото достигнут.',
        Markup.inlineKeyboard([[Markup.button.callback('✅ Готово', `inv:prod_photo_done:${s.productId}`)]]),
      )
      return true
    }
    const newPhotos = [...s.pendingPhotos, fileId]
    inventoryState.set(userId, { ...s, pendingPhotos: newPhotos })
    const remaining = 7 - newPhotos.length
    await ctx.reply(
      `📸 Фото ${newPhotos.length}/7 добавлено.${remaining > 0 ? ` Ещё ${remaining}.` : ' Лимит.'}`,
      Markup.inlineKeyboard([[Markup.button.callback('✅ Готово', `inv:prod_photo_done:${s.productId}`)]]),
    )
    return true
  }

  // ── Фото существующего варианта (редактирование) ──────────────────────────
  if (state.flow === 'variant_photo_edit' && state.step === 'uploading') {
    const s = state as VariantPhotoEditFlow
    if (s.pendingPhotos.length >= 7) {
      await ctx.reply(
        '❌ Лимит 7 фото достигнут.',
        Markup.inlineKeyboard([[Markup.button.callback('✅ Готово', `inv:var_photo_done_e:${s.variantId}`)]]),
      )
      return true
    }
    const newPhotos = [...s.pendingPhotos, fileId]
    inventoryState.set(userId, { ...s, pendingPhotos: newPhotos })
    const remaining = 7 - newPhotos.length
    await ctx.reply(
      `📸 Добавлено ${newPhotos.length} фото.${remaining > 0 ? ` Ещё ${remaining}.` : ' Лимит.'}`,
      Markup.inlineKeyboard([[Markup.button.callback('✅ Готово', `inv:var_photo_done_e:${s.variantId}`)]]),
    )
    return true
  }

  // ── Фото товара ────────────────────────────────────────────────────────────
  if (!state || state.flow !== 'add' || state.step !== 'photo') return false

  const s = state as Extract<AddFlow, { step: 'photo' }>

  if (s.photoFileIds.length >= 7) {
    await ctx.reply(
      '❌ Лимит 7 фото достигнут. Нажмите ✅ Готово чтобы продолжить.',
      Markup.inlineKeyboard([[Markup.button.callback('✅ Готово', 'inv:photo_done')]]),
    )
    return true
  }

  // Берём последний элемент массива — самое высокое качество
  const newFileIds = [...s.photoFileIds, fileId]
  inventoryState.set(userId, { ...s, photoFileIds: newFileIds })

  const count = newFileIds.length
  const remaining = 7 - count
  const hint = remaining > 0 ? ` Можно добавить ещё ${remaining}.` : ' Достигнут лимит.'

  await ctx.reply(
    `📸 Фото ${count}/7 добавлено.${hint}\nНажмите ✅ Готово чтобы продолжить.`,
    Markup.inlineKeyboard([[Markup.button.callback('✅ Готово', 'inv:photo_done')]]),
  )
  return true
}

// ─── Обработчик входящего документа ──────────────────────────────────────────

export async function handleInventoryDocument(ctx: Context, userId: number): Promise<void> {
  const state = inventoryState.get(userId)
  if (!state || state.flow !== 'import_file') return

  const doc = (
    ctx.message as { document?: { file_id: string; file_name?: string; mime_type?: string } }
  )?.document
  if (!doc) return

  const mime = doc.mime_type ?? ''
  const fname = doc.file_name ?? 'file'
  const isXlsx =
    mime.includes('spreadsheet') || mime.includes('excel') || /\.xlsx?$/i.test(fname)

  if (!isXlsx) {
    await ctx.reply('❌ Отправьте файл .xlsx (шаблон оприходования).')
    return
  }

  await ctx.reply('⏳ Обрабатываю файл…')

  try {
    const fileUrl = await ctx.telegram.getFileLink(doc.file_id)
    const res = await fetch(fileUrl.href)
    const buffer = Buffer.from(await res.arrayBuffer())
    inventoryState.delete(userId)
    await processImportFile(ctx, buffer, userId)
  } catch (err) {
    console.error('inventory file error:', err)
    inventoryState.delete(userId)
    await ctx.reply('❌ Ошибка при обработке файла.', Markup.removeKeyboard())
    await showInventory(ctx)
  }
}

// ─── Обработка файла импорта (лист «Оприходование» через stockIn/stockOut) ────

const IMPORT_EXAMPLE_SKUS = new Set(['IPHONE17PRO-256-ORG', 'MACBOOK-M4-16-256-MN'])

async function processImportFile(ctx: Context, buffer: Buffer, userId: number): Promise<void> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer)

  const sheet = wb.getWorksheet('Оприходование')
  if (!sheet) {
    await ctx.reply('❌ Лист «Оприходование» не найден. Используйте скачанный шаблон.', Markup.removeKeyboard())
    await showInventory(ctx)
    return
  }

  let inCount = 0; let inTotal = 0
  let outCount = 0; let outTotal = 0
  const notFound: string[] = []
  const errors: string[] = []

  const rows: ExcelJS.Row[] = []
  sheet.eachRow((row, rowNum) => { if (rowNum > 1) rows.push(row) })

  for (const row of rows) {
    const sku     = String(row.getCell(1).value ?? '').trim()
    const qtyCell = row.getCell(2).value
    const comment = String(row.getCell(3).value ?? '').trim() || undefined

    if (!sku || IMPORT_EXAMPLE_SKUS.has(sku)) continue
    const qty = typeof qtyCell === 'number' ? Math.round(qtyCell) : parseInt(String(qtyCell ?? ''), 10)
    if (isNaN(qty) || qty === 0) continue

    const variant = await prisma.productVariant.findUnique({ where: { sku } })
    if (!variant) { notFound.push(sku); continue }

    try {
      if (qty > 0) {
        await stockIn(variant.id, qty, comment ?? 'Импорт из файла', String(userId))
        inCount++; inTotal += qty
      } else {
        await stockOut(variant.id, Math.abs(qty), comment ?? 'Импорт из файла', String(userId))
        outCount++; outTotal += Math.abs(qty)
      }
    } catch (err) {
      errors.push(`${sku}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const lines = ['✅ Импорт завершён:']
  if (inCount > 0)      lines.push(`📥 Приход: ${inCount} позиций (+${inTotal} шт.)`)
  if (outCount > 0)     lines.push(`📤 Списание: ${outCount} позиций (-${outTotal} шт.)`)
  if (notFound.length)  lines.push(`❌ Не найдено SKU: ${notFound.join(', ')}`)
  if (errors.length)    lines.push(`⚠️ Ошибки: ${errors.join(', ')}`)

  await ctx.reply(lines.join('\n'), Markup.removeKeyboard())
  await showInventory(ctx)
}

// ─── Обработка импорта товаров (upsert + SET qty) — оставляем для processTemplateFile ──

async function processImport(ctx: Context, rows: FileRow[]): Promise<void> {
  let added = 0
  let updated = 0
  let errors = 0

  for (const row of rows) {
    // Для импорта нужны как минимум SKU и qty; name+price желательны при создании
    try {
      const existing = await prisma.product.findUnique({ where: { sku: row.sku } })

      if (existing) {
        await prisma.product.update({
          where: { sku: row.sku },
          data: {
            ...(row.name !== null && { name: row.name }),
            ...(row.price !== null && !isNaN(row.price) && { price: row.price }),
            ...(row.category !== null && { category: { connectOrCreate: { where: { name: row.category }, create: { name: row.category } } } }),
            ...(row.photoUrl !== null && { photoUrl: row.photoUrl }),
            stock: row.qty,
            quantity: row.qty,
            isAvailable: row.qty > 0,
          },
        })
        updated++
      } else {
        if (!row.name || row.price === null || isNaN(row.price)) {
          // Не хватает данных для создания нового товара
          errors++
          continue
        }
        await prisma.product.create({
          data: {
            sku: row.sku,
            name: row.name,
            price: row.price,
            ...(row.category !== null && { category: { connectOrCreate: { where: { name: row.category }, create: { name: row.category } } } }),
            photoUrl: row.photoUrl ?? undefined,
            stock: row.qty,
            quantity: row.qty,
            isAvailable: row.qty > 0,
          },
        })
        added++
      }
    } catch {
      errors++
    }
  }

  await ctx.reply(
    `✅ Импорт завершён\n\nДобавлено:  ${added}\nОбновлено: ${updated}\nОшибок:     ${errors}`,
    Markup.removeKeyboard(),
  )
  await showInventory(ctx)
}

// ─── Обработка оприходования из файла (qty +=) ───────────────────────────────

async function processReceiveFile(ctx: Context, rows: FileRow[]): Promise<void> {
  let processed = 0
  let skipped = 0
  let errors = 0

  for (const row of rows) {
    if (row.qty <= 0) {
      skipped++
      continue
    }
    try {
      const existing = await prisma.product.findUnique({ where: { sku: row.sku } })
      if (!existing) {
        skipped++
        continue
      }
      await prisma.product.update({
        where: { sku: row.sku },
        data: {
          stock: { increment: row.qty },
          quantity: { increment: row.qty },
          isAvailable: true,
        },
      })
      processed++
    } catch {
      errors++
    }
  }

  await ctx.reply(
    `✅ Оприходование из файла завершено\n\nОбработано: ${processed}\nПропущено (нет в БД / qty=0): ${skipped}\nОшибок: ${errors}`,
    Markup.removeKeyboard(),
  )
  await showInventory(ctx)
}

// ─── Обработка списания из файла (qty -=, не ниже 0) ─────────────────────────

async function processWriteoffFile(ctx: Context, rows: FileRow[]): Promise<void> {
  let processed = 0
  let skipped = 0
  let errors = 0

  for (const row of rows) {
    if (row.qty <= 0) {
      skipped++
      continue
    }
    try {
      const existing = await prisma.product.findUnique({ where: { sku: row.sku } })
      if (!existing) {
        skipped++
        continue
      }
      const newStock = Math.max(0, existing.stock - row.qty)
      await prisma.product.update({
        where: { sku: row.sku },
        data: {
          stock: newStock,
          quantity: newStock,
          isAvailable: newStock > 0,
        },
      })
      processed++
    } catch {
      errors++
    }
  }

  await ctx.reply(
    `✅ Списание из файла завершено\n\nОбработано: ${processed}\nПропущено (нет в БД / qty=0): ${skipped}\nОшибок: ${errors}`,
    Markup.removeKeyboard(),
  )
  await showInventory(ctx)
}

// ─── Обработка шаблона (два листа: Товары + Оприходование) ───────────────────

const EXAMPLE_SKUS = new Set([
  // old template
  'IPHONE17PRO-256-ORG', 'MACBOOK-AIR-M4-16-256',
  // new template (sheet "Товары и варианты")
  'IPHONE17PRO-256-BLU', 'IPHONE17PRO-512-ORG',
  'MACBOOK-M4-16-256-MN', 'MACBOOK-M4-16-512-ST',
  // old receipt sheet example
  'MACBOOK-AIR-M4-16-256',
])

// Вспомогательная функция: читает значение ячейки как строку
function cellStr(row: ExcelJS.Row, col: number): string {
  return String(row.getCell(col).value ?? '').trim()
}

// Вспомогательная функция: читает значение ячейки как число
function cellNum(row: ExcelJS.Row, col: number): number {
  const v = row.getCell(col).value
  return typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
}

// Собирает product.attributes из массива атрибутов вариантов
// Формат: { "Цвет": ["Cosmic Orange", "Deep Blue"], "Память": ["256 ГБ", "512 ГБ"] }
function buildProductAttributes(
  variantAttrs: Array<Record<string, string>>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const attrs of variantAttrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (!key || !value) continue
      if (!result[key]) result[key] = []
      if (!result[key].includes(value)) result[key].push(value)
    }
  }
  return result
}

async function processTemplateFile(ctx: Context, buffer: Buffer): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const tmpPath2 = path.join(os.tmpdir(), `import_${Date.now()}.xlsx`)
  fs.writeFileSync(tmpPath2, buffer)
  await workbook.xlsx.readFile(tmpPath2)
  fs.unlinkSync(tmpPath2)

  // Поддержка нового имени листа и обратная совместимость со старым
  const productsSheet =
    workbook.getWorksheet('Товары и варианты') ?? workbook.getWorksheet('Товары')
  const specsSheet    = workbook.getWorksheet('Характеристики')
  const receiptSheet  = workbook.getWorksheet('Оприходование')

  if (!productsSheet && !specsSheet && !receiptSheet) {
    await ctx.reply(
      '❌ В файле не найдены листы «Товары и варианты», «Характеристики» или «Оприходование». Используйте скачанный шаблон.',
    )
    await showInventory(ctx)
    return
  }

  const reports: string[] = []

  // ── Лист «Товары и варианты» ─────────────────────────────────────────────
  //
  // Колонки (новый формат):
  //   A(1)  Название товара*
  //   B(2)  Бренд
  //   C(3)  Категория*
  //   D(4)  Метка            — только первая строка группы
  //   E(5)  Описание         — только первая строка группы
  //   F(6)  SKU варианта*
  //   G(7)  Цена варианта*
  //   H(8)  Количество*
  //   I(9)  Атрибут1_Название
  //   J(10) Атрибут1_Значение
  //   K(11) Атрибут2_Название
  //   L(12) Атрибут2_Значение
  //   M(13) Атрибут3_Название
  //   N(14) Атрибут3_Значение
  //
  // Обратная совместимость со старым форматом (4 колонки: Название / Бренд / Категория / SKU / Цена / Кол / Описание / Метка)
  // определяется по наличию имени листа «Товары и варианты».

  if (productsSheet) {
    const isNewFormat = !!workbook.getWorksheet('Товары и варианты')

    let created = 0
    let skipped = 0
    const errors: string[] = []

    if (isNewFormat) {
      // ── Новый формат: группировка по названию товара ───────────────────────

      // Тип для накопленных данных строки
      type VariantRow = {
        variantSku: string
        price:      number
        qty:        number
        attrs:      Record<string, string>
      }
      type ProductGroup = {
        name:     string
        brand:    string | null
        category: string | null
        badge:    string | null
        desc:     string | null
        variants: VariantRow[]
      }

      // Собираем строки синхронно
      const allRows: ExcelJS.Row[] = []
      productsSheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) allRows.push(row)
      })

      // Группируем по имени товара; имя берём из первой строки группы
      // (последующие строки группы имеют пустое поле A и используют имя из предыдущей строки)
      const groups: Map<string, ProductGroup> = new Map()
      let lastProductName = ''

      for (const row of allRows) {
        const rawName = cellStr(row, 1)
        const productName = rawName || lastProductName
        if (!productName) continue
        lastProductName = productName

        const variantSku = cellStr(row, 6)
        if (!variantSku || EXAMPLE_SKUS.has(variantSku)) { skipped++; continue }

        const price = cellNum(row, 7)
        const qtyRaw = row.getCell(8).value
        const qty = typeof qtyRaw === 'number' ? Math.round(qtyRaw) : parseInt(String(qtyRaw ?? ''), 10)

        if (isNaN(price) || price < 0) { errors.push(`SKU ${variantSku}: некорректная цена`); continue }
        if (isNaN(qty)   || qty   < 0) { errors.push(`SKU ${variantSku}: некорректное количество`); continue }

        // Атрибуты из колонок I-N (3 пары)
        const attrs: Record<string, string> = {}
        for (let i = 0; i < 3; i++) {
          const attrName  = cellStr(row, 9  + i * 2)
          const attrValue = cellStr(row, 10 + i * 2)
          if (attrName && attrValue) attrs[attrName] = attrValue
        }

        if (!groups.has(productName)) {
          // Первая строка группы — читаем поля товара
          groups.set(productName, {
            name:     productName,
            brand:    cellStr(row, 2) || null,
            category: cellStr(row, 3) || null,
            badge:    cellStr(row, 4) || null,
            desc:     cellStr(row, 5) || null,
            variants: [],
          })
        }

        groups.get(productName)!.variants.push({ variantSku, price, qty, attrs })
      }

      // Сохраняем группы в БД
      for (const group of groups.values()) {
        if (group.variants.length === 0) continue

        try {
          // Ищем существующий товар по имени
          let product = await prisma.product.findFirst({ where: { name: group.name } })

          // Суммарный остаток по всем вариантам
          const totalQty = group.variants.reduce((s, v) => s + v.qty, 0)

          if (!product) {
            product = await prisma.product.create({
              data: {
                // Артикул товара = SKU первого варианта (уникальный идентификатор)
                sku:         group.variants[0].variantSku,
                name:        group.name,
                price:       group.variants[0].price,
                brand:       group.brand   ?? undefined,
                description: group.desc    ?? undefined,
                badge:       group.badge   ?? undefined,
                stock:       totalQty,
                quantity:    totalQty,
                isAvailable: totalQty > 0,
                attributes:  {},
                ...(group.category
                  ? {
                      category: {
                        connectOrCreate: {
                          where:  { name: group.category },
                          create: { name: group.category },
                        },
                      },
                    }
                  : {}),
              },
            })
            created++
          }

          // Создаём варианты (пропускаем уже существующие)
          const allVariantAttrs: Array<Record<string, string>> = []
          for (const v of group.variants) {
            const existingVariant = await prisma.productVariant.findUnique({ where: { sku: v.variantSku } })
            if (existingVariant) {
              allVariantAttrs.push(existingVariant.attributes as Record<string, string>)
              continue
            }
            await prisma.productVariant.create({
              data: {
                productId:  product.id,
                sku:        v.variantSku,
                price:      v.price,
                quantity:   v.qty,
                inStock:    v.qty > 0,
                attributes: v.attrs,
              },
            })
            allVariantAttrs.push(v.attrs)
          }

          // Обновляем product.attributes из всех вариантов
          const productAttributes = buildProductAttributes(allVariantAttrs)
          if (Object.keys(productAttributes).length > 0) {
            await prisma.product.update({
              where: { id: product.id },
              data:  { attributes: productAttributes },
            })
          }
        } catch (e: unknown) {
          errors.push(`Товар «${group.name}»: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    } else {
      // ── Старый формат (лист «Товары», колонки: Название/Бренд/Категория/SKU/Цена/Кол/Описание/Метка) ──

      const productRows: ExcelJS.Row[] = []
      productsSheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) productRows.push(row)
      })

      for (const row of productRows) {
        const name     = cellStr(row, 1)
        const brand    = cellStr(row, 2) || null
        const category = cellStr(row, 3) || null
        const sku      = cellStr(row, 4)
        const price    = cellNum(row, 5)
        const qtyRaw   = row.getCell(6).value
        const qty      = typeof qtyRaw === 'number' ? Math.round(qtyRaw) : parseInt(String(qtyRaw ?? ''), 10)
        const desc     = cellStr(row, 7) || null
        const badge    = cellStr(row, 8) || null

        if (!sku || EXAMPLE_SKUS.has(sku)) { skipped++; continue }
        if (!name) { skipped++; continue }

        if (isNaN(price) || price < 0) { errors.push(`SKU ${sku}: некорректная цена`); continue }
        if (isNaN(qty)   || qty   < 0) { errors.push(`SKU ${sku}: некорректное количество`); continue }

        try {
          const existing = await prisma.product.findUnique({ where: { sku } })
          if (existing) { skipped++; continue }

          const product = await prisma.product.create({
            data: {
              sku,
              name,
              price,
              brand:       brand       ?? undefined,
              description: desc        ?? undefined,
              badge:       badge       ?? undefined,
              stock:       qty,
              quantity:    qty,
              isAvailable: qty > 0,
              ...(category
                ? {
                    category: {
                      connectOrCreate: {
                        where:  { name: category },
                        create: { name: category },
                      },
                    },
                  }
                : {}),
            },
          })

          await prisma.productVariant.create({
            data: {
              productId:  product.id,
              sku:        `${sku}-V1`,
              price,
              quantity:   qty,
              inStock:    qty > 0,
              attributes: {},
            },
          })

          created++
        } catch (e: unknown) {
          errors.push(`SKU ${sku}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }

    const sheetName = isNewFormat ? 'Товары и варианты' : 'Товары'
    let sheetReport = `📦 Лист «${sheetName}»:\nСоздано: ${created}, пропущено: ${skipped}`
    if (errors.length) sheetReport += `\nОшибки (${errors.length}):\n${errors.slice(0, 10).join('\n')}`
    reports.push(sheetReport)
  }

  // ── Лист «Характеристики» ────────────────────────────────────────────────
  //
  // Колонки:
  //   A(1) Название товара*
  //   B(2) Характеристика*
  //   C(3) Значение*

  if (specsSheet) {
    let processed = 0
    let notFound: string[] = []
    const errors: string[] = []

    // Группируем specs по имени товара
    const specsMap: Map<string, Record<string, string>> = new Map()

    const specRows: ExcelJS.Row[] = []
    specsSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) specRows.push(row)
    })

    for (const row of specRows) {
      const productName = cellStr(row, 1)
      const specKey     = cellStr(row, 2)
      const specValue   = cellStr(row, 3)

      // Пропускаем примеры и пустые строки
      if (!productName || !specKey || !specValue) continue
      if (productName === 'iPhone 17 Pro' || productName === 'MacBook Air M4') continue

      if (!specsMap.has(productName)) specsMap.set(productName, {})
      specsMap.get(productName)![specKey] = specValue
    }

    for (const [productName, specs] of specsMap.entries()) {
      try {
        const product = await prisma.product.findFirst({ where: { name: productName } })
        if (!product) {
          notFound.push(productName)
          continue
        }
        const existingSpecs = (product.specs as Record<string, string> | null) ?? {}
        await prisma.product.update({
          where: { id: product.id },
          data:  { specs: { ...existingSpecs, ...specs } },
        })
        processed++
      } catch (e: unknown) {
        errors.push(`«${productName}»: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    let sheetReport = `📋 Лист «Характеристики»:\nОбновлено товаров: ${processed}`
    if (notFound.length) sheetReport += `\nНе найдены: ${notFound.slice(0, 10).join(', ')}`
    if (errors.length)   sheetReport += `\nОшибки: ${errors.slice(0, 5).join('\n')}`
    reports.push(sheetReport)
  }

  // ── Лист «Оприходование» ────────────────────────────────────────────────────
  if (receiptSheet) {
    let processed = 0
    let notFound: string[] = []
    let wentNegative: string[] = []

    const receiptRows: ExcelJS.Row[] = []
    receiptSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) receiptRows.push(row)
    })

    for (const row of receiptRows) {
      const sku    = cellStr(row, 1)
      const qtyRaw = row.getCell(2).value

      if (!sku || EXAMPLE_SKUS.has(sku)) continue

      const qty = typeof qtyRaw === 'number' ? Math.round(qtyRaw) : parseInt(String(qtyRaw ?? ''), 10)
      if (isNaN(qty) || qty === 0) continue

      try {
        // Сначала ищем вариант по SKU
        const variant = await prisma.productVariant.findUnique({ where: { sku } })
        if (variant) {
          if (qty < 0 && variant.quantity + qty < 0) {
            wentNegative.push(sku)
            continue
          }
          const newQty = Math.max(0, variant.quantity + qty)
          await prisma.productVariant.update({
            where: { sku },
            data:  { quantity: newQty, inStock: newQty > 0 },
          })
          processed++
          continue
        }

        // Если вариант не найден — ищем товар
        const product = await prisma.product.findUnique({ where: { sku } })
        if (!product) {
          notFound.push(sku)
          continue
        }
        if (qty < 0 && product.stock + qty < 0) {
          wentNegative.push(sku)
          continue
        }
        const newStock = Math.max(0, product.stock + qty)
        await prisma.product.update({
          where: { sku },
          data:  { stock: newStock, quantity: newStock, isAvailable: newStock > 0 },
        })
        processed++
      } catch {
        notFound.push(sku)
      }
    }

    let sheetReport = `📋 Лист «Оприходование»:\nОбработано: ${processed}`
    if (notFound.length)     sheetReport += `\nНе найдены SKU: ${notFound.slice(0, 10).join(', ')}`
    if (wentNegative.length) sheetReport += `\nОтказ (уйдёт в минус): ${wentNegative.join(', ')}`
    reports.push(sheetReport)
  }

  await ctx.reply(`✅ Шаблон обработан\n\n${reports.join('\n\n')}`, Markup.removeKeyboard())
  await showInventory(ctx)
}

// ─── Экспорт остатков в xlsx (по вариантам) ───────────────────────────────────

async function exportInventory(ctx: Context): Promise<void> {
  try {
    const variants = await prisma.productVariant.findMany({
      include: { product: true },
      orderBy: [{ product: { name: 'asc' } }, { id: 'asc' }],
    })

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Остатки')
    ws.columns = [
      { key: 'sku',      width: 28 },
      { key: 'product',  width: 30 },
      { key: 'attrs',    width: 35 },
      { key: 'price',    width: 14 },
      { key: 'qty',      width: 12 },
      { key: 'reserved', width: 16 },
    ]

    const headerFill: ExcelJS.FillPattern = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' },
    }
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFCCFF00' } }

    const hdr = ws.addRow(['SKU', 'Товар', 'Атрибуты', 'Цена', 'Остаток', 'Зарезервировано'])
    hdr.eachCell((cell) => { cell.fill = headerFill; cell.font = headerFont })

    const rowFills = ['FF1A1A1A', 'FF111111']
    variants.forEach((v, i) => {
      const attrs = Object.entries(v.attributes as Record<string, string>)
        .map(([k, val]) => `${k}: ${val}`).join(', ')
      const row = ws.addRow([v.sku, v.product.name, attrs, v.price.toString(), v.quantity, v.reserved])
      const fill: ExcelJS.FillPattern = {
        type: 'pattern', pattern: 'solid', fgColor: { argb: rowFills[i % 2] },
      }
      row.eachCell((cell) => { cell.fill = fill })
    })

    ws.views = [{ state: 'frozen', ySplit: 1 }]

    const buf = await wb.xlsx.writeBuffer()
    const date = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')
    await ctx.replyWithDocument({ source: Buffer.from(buf), filename: `остатки_${date}.xlsx` })
    await showInventory(ctx)
  } catch (err) {
    console.error('inventory export error:', err)
    await ctx.reply('❌ Ошибка при генерации файла.')
  }
}

// ─── Флоу: добавить товар (6 шагов) ──────────────────────────────────────────

// ─── Хелперы для генерации вариантов ─────────────────────────────────────────

function cartesianProduct(attrs: Record<string, string[]>): Array<Record<string, string>> {
  const keys = Object.keys(attrs)
  if (keys.length === 0) return []
  let result: Array<Record<string, string>> = [{}]
  for (const key of keys) {
    const next: Array<Record<string, string>> = []
    for (const existing of result) {
      for (const val of attrs[key]) {
        next.push({ ...existing, [key]: val })
      }
    }
    result = next
  }
  return result
}

function variantSkuFromAttrs(baseSku: string, attrs: Record<string, string>): string {
  const suffix = Object.values(attrs)
    .map(v => v.trim().split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').join(''))
    .join('-')
  return `${baseSku}-${suffix}`
}

// ─────────────────────────────────────────────────────────────────────────────

async function handleAddFlow(
  ctx: Context,
  userId: number,
  text: string,
  state: AddFlow,
): Promise<boolean> {
  if (text === '❌ Отмена') {
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showInventory(ctx)
    return true
  }

  switch (state.step) {
    case 'sku': {
      const existing = await prisma.product.findUnique({ where: { sku: text } })
      if (existing) {
        await ctx.reply(`❌ Артикул «${text}» уже занят. Введите другой SKU:`)
        return true
      }
      inventoryState.set(userId, { flow: 'add', step: 'name', sku: text })
      await ctx.reply(`SKU: ${text}\n\nШаг 2 из 9 — введите название товара:`)
      return true
    }

    case 'name': {
      inventoryState.set(userId, { flow: 'add', step: 'description', sku: state.sku, name: text })
      await ctx.reply(
        `Название: ${text}\n\nШаг 3 из 9 — введите описание товара (или /skip для пропуска):`,
      )
      return true
    }

    case 'description': {
      const description = text === '/skip' ? null : text
      inventoryState.set(userId, {
        flow: 'add',
        step: 'specs',
        sku: state.sku,
        name: state.name,
        description,
      })
      await ctx.reply(
        'Шаг 4 из 9 — введите характеристики товара или /skip\n' +
        'Формат: по одной на строку\n' +
        'Процессор: A19 Pro\n' +
        'Дисплей: 6.3 дюйма\n' +
        'Камера: 48 МП\n' +
        '(или /skip)',
      )
      return true
    }

    case 'specs': {
      let specs: Record<string, string> | null = null
      if (text !== '/skip') {
        const parsed: Record<string, string> = {}
        for (const line of text.split('\n')) {
          const idx = line.indexOf(':')
          if (idx > 0) {
            const key = line.slice(0, idx).trim()
            const val = line.slice(idx + 1).trim()
            if (key && val) parsed[key] = val
          }
        }
        if (Object.keys(parsed).length > 0) specs = parsed
      }
      inventoryState.set(userId, {
        flow: 'add',
        step: 'attributes',
        sku: state.sku,
        name: state.name,
        description: state.description,
        specs,
      })
      await ctx.reply(
        'Шаг 5 из 9 — введите атрибуты товара или /skip\n' +
        'Формат: Название: значение1, значение2, значение3\n' +
        'Например:\n' +
        'Цвет: Cosmic Orange, Deep Blue, Silver\n' +
        'Память: 256 ГБ, 512 ГБ, 1 ТБ\n' +
        '(или /skip)',
      )
      return true
    }

    case 'attributes': {
      let attributes: Record<string, string[]> | null = null
      if (text !== '/skip') {
        const parsed: Record<string, string[]> = {}
        for (const line of text.split('\n')) {
          const idx = line.indexOf(':')
          if (idx > 0) {
            const key = line.slice(0, idx).trim()
            const vals = line.slice(idx + 1).split(',').map(v => v.trim()).filter(Boolean)
            if (key && vals.length > 0) parsed[key] = vals
          }
        }
        if (Object.keys(parsed).length > 0) attributes = parsed
      }
      inventoryState.set(userId, {
        flow: 'add',
        step: 'price',
        sku: state.sku,
        name: state.name,
        description: state.description,
        specs: state.specs,
        attributes,
      })
      await ctx.reply(`Шаг 6 из 9 — введите цену в рублях (например: 1500):`)
      return true
    }

    case 'price': {
      const price = parseFloat(text.replace(',', '.'))
      if (isNaN(price) || price < 0) {
        await ctx.reply('❌ Введите корректную цену (например: 1500 или 1500.50)')
        return true
      }
      inventoryState.set(userId, {
        flow: 'add',
        step: 'category',
        sku: state.sku,
        name: state.name,
        description: state.description,
        specs: state.specs,
        attributes: state.attributes,
        price,
      })
      const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
      const categoryButtons = categories.map(c => Markup.button.callback(c.name, `inv:cat_select:${c.id}`))
      const catRows: ReturnType<typeof Markup.button.callback>[][] = []
      for (let i = 0; i < categoryButtons.length; i += 2) {
        catRows.push(categoryButtons.slice(i, i + 2))
      }
      catRows.push([Markup.button.callback('❌ Отмена', 'inv:cancel')])
      await ctx.reply(`Цена: ${price} ₽`, Markup.removeKeyboard())
      await ctx.reply('Шаг 7 из 9 — выберите категорию:', Markup.inlineKeyboard(catRows))
      return true
    }

    case 'category': {
      inventoryState.set(userId, {
        flow: 'add',
        step: 'photo',
        sku: state.sku,
        name: state.name,
        description: state.description,
        specs: state.specs,
        attributes: state.attributes,
        price: state.price,
        category: text,
        photoFileIds: [],
      })
      await ctx.reply(`Категория: ${text}`, Markup.removeKeyboard())
      await ctx.reply(
        'Шаг 8 из 9 — отправьте фото товара (можно несколько, до 7 штук).\nКогда закончите — нажмите ✅ Готово\n\nДля отмены напишите «❌ Отмена»',
        Markup.inlineKeyboard([[Markup.button.callback('✅ Готово (без фото)', 'inv:photo_done')]]),
      )
      return true
    }

    case 'photo': {
      // Фото обрабатываются в handleInventoryPhoto; здесь ловим только текст
      await ctx.reply(
        '📸 Отправьте фото товара или нажмите ✅ Готово',
        Markup.inlineKeyboard([[Markup.button.callback('✅ Готово (без фото)', 'inv:photo_done')]]),
      )
      return true
    }

    case 'qty': {
      const qty = parseInt(text, 10)
      if (isNaN(qty) || qty < 0) {
        await ctx.reply('❌ Введите целое неотрицательное число (0 и более)')
        return true
      }
      try {
        const photoUrl = state.photoFileIds.length > 0 ? state.photoFileIds[0] : undefined
        const product = await prisma.product.create({
          data: {
            sku: state.sku,
            name: state.name,
            price: state.price,
            ...(state.description && { description: state.description }),
            ...(state.specs && { specs: state.specs }),
            ...(state.attributes && { attributes: state.attributes }),
            ...(state.category && { category: { connectOrCreate: { where: { name: state.category }, create: { name: state.category } } } }),
            photoUrl,
            photos: state.photoFileIds,
            stock: qty,
            quantity: qty,
            isAvailable: qty > 0,
          },
        })

        // Генерируем варианты из атрибутов (декартово произведение)
        let variantCount = 0
        if (state.attributes && Object.keys(state.attributes).length > 0) {
          const combos = cartesianProduct(state.attributes)
          const usedSkus = new Set<string>()
          for (let i = 0; i < combos.length; i++) {
            let varSku = variantSkuFromAttrs(state.sku, combos[i])
            if (usedSkus.has(varSku)) varSku = `${varSku}-${i + 1}`
            usedSkus.add(varSku)
            const taken = await prisma.productVariant.findUnique({ where: { sku: varSku } })
            if (taken) varSku = `${varSku}-${Date.now()}`
            await prisma.productVariant.create({
              data: {
                productId: product.id,
                sku: varSku,
                price: 0,
                quantity: 0,
                inStock: false,
                attributes: combos[i],
                photos: [],
              },
            })
            variantCount++
          }
        }

        inventoryState.delete(userId)
        const photoInfo = state.photoFileIds.length > 0 ? `${state.photoFileIds.length} шт.` : '—'
        const lines = [
          variantCount > 0
            ? `✅ Товар создан, ${variantCount} вариантов сгенерировано`
            : '✅ Товар добавлен!',
          '',
          `Артикул:   ${product.sku}`,
          `Название:  ${product.name}`,
          `Цена:      ${product.price} ₽`,
          `Категория: ${state.category ?? '—'}`,
          `Фото:      ${photoInfo}`,
          `На складе: ${product.stock} шт.`,
        ]
        await ctx.reply(lines.join('\n'), Markup.removeKeyboard())
        await showInventory(ctx)
      } catch (err) {
        console.error('inventory add error:', err)
        inventoryState.delete(userId)
        await ctx.reply('❌ Ошибка при сохранении. Попробуйте снова.', Markup.removeKeyboard())
        await showInventory(ctx)
      }
      return true
    }
  }
}

// ─── Флоу: приход на склад (stock_in) ────────────────────────────────────────

async function handleStockInFlow(
  ctx: Context,
  userId: number,
  text: string,
  state: StockInFlow,
): Promise<boolean> {
  if (text === '❌ Отмена') {
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showInventory(ctx)
    return true
  }

  if (state.step === 'qty') {
    const qty = parseInt(text, 10)
    if (isNaN(qty) || qty <= 0) {
      await ctx.reply('❌ Введите положительное целое число')
      return true
    }
    inventoryState.set(userId, { ...state, step: 'comment', qty })
    await ctx.reply('Введите комментарий (или /skip):')
    return true
  }

  if (state.step === 'comment') {
    const comment = text === '/skip' ? 'Приход' : text
    try {
      await stockIn(state.variantId, state.qty, comment, String(userId))
      const updated = await prisma.productVariant.findUnique({ where: { id: state.variantId } })
      inventoryState.delete(userId)
      await ctx.reply(
        `✅ Приход ${state.qty} шт. записан. Новый остаток: ${updated?.quantity ?? '?'} шт.`,
        Markup.removeKeyboard(),
      )
      const variant = await prisma.productVariant.findUnique({ where: { id: state.variantId } })
      if (variant) await showStockProduct(ctx, variant.productId)
    } catch (err) {
      inventoryState.delete(userId)
      await ctx.reply(`❌ ${err instanceof Error ? err.message : 'Ошибка'}`, Markup.removeKeyboard())
      await showInventory(ctx)
    }
    return true
  }

  return false
}

// ─── Флоу: списание со склада (stock_out) ────────────────────────────────────

async function handleStockOutFlow(
  ctx: Context,
  userId: number,
  text: string,
  state: StockOutFlow,
): Promise<boolean> {
  if (text === '❌ Отмена') {
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showInventory(ctx)
    return true
  }

  if (state.step === 'qty') {
    const qty = parseInt(text, 10)
    if (isNaN(qty) || qty <= 0) {
      await ctx.reply('❌ Введите положительное целое число')
      return true
    }
    if (qty > state.currentQty) {
      await ctx.reply(`❌ Нельзя списать ${qty} шт. — на складе только ${state.currentQty} шт.`)
      return true
    }
    inventoryState.set(userId, { ...state, step: 'comment', qty })
    await ctx.reply('Введите комментарий (или /skip):')
    return true
  }

  if (state.step === 'comment') {
    const comment = text === '/skip' ? 'Списание' : text
    try {
      await stockOut(state.variantId, state.qty, comment, String(userId))
      const updated = await prisma.productVariant.findUnique({ where: { id: state.variantId } })
      inventoryState.delete(userId)
      await ctx.reply(
        `✅ Списание ${state.qty} шт. записано. Новый остаток: ${updated?.quantity ?? '?'} шт.`,
        Markup.removeKeyboard(),
      )
      const variant = await prisma.productVariant.findUnique({ where: { id: state.variantId } })
      if (variant) await showStockProduct(ctx, variant.productId)
    } catch (err) {
      inventoryState.delete(userId)
      await ctx.reply(`❌ ${err instanceof Error ? err.message : 'Ошибка'}`, Markup.removeKeyboard())
      await showInventory(ctx)
    }
    return true
  }

  return false
}


// ─── Флоу: добавить категорию ─────────────────────────────────────────────────

async function handleCategoryAddFlow(
  ctx: Context,
  userId: number,
  text: string,
  state: CategoryAddFlow,
): Promise<boolean> {
  if (text === '❌ Отмена') {
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showInventory(ctx)
    return true
  }

  // Шаг 1 — ввод имени
  if (state.step === 'name') {
    try {
      const existing = await prisma.category.findUnique({ where: { name: text } })
      if (existing) {
        await ctx.reply(`❌ Категория «${text}» уже существует. Введите другое название:`)
        return true
      }
      inventoryState.set(userId, { flow: 'category_add', step: 'textSide', name: text })
      await ctx.reply(
        `Категория: «${text}»\n\nВыберите сторону текста для баннера:`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('◀️ Текст слева', 'inv:cat_add_textside:left'),
            Markup.button.callback('▶️ Текст справа', 'inv:cat_add_textside:right'),
          ],
        ]),
      )
    } catch (err) {
      console.error('category add error:', err)
      inventoryState.delete(userId)
      await ctx.reply('❌ Ошибка при сохранении.', Markup.removeKeyboard())
      await showInventory(ctx)
    }
    return true
  }

  // Шаг 2 — ожидаем нажатие кнопки (текст здесь не обрабатываем)
  await ctx.reply('Выберите сторону текста с помощью кнопок выше.')
  return true
}

// ─── Флоу: переименовать категорию ────────────────────────────────────────────

async function handleCategoryRenameFlow(
  ctx: Context,
  userId: number,
  text: string,
  state: CategoryRenameFlow,
): Promise<boolean> {
  if (text === '❌ Отмена') {
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showCategories(ctx)
    return true
  }

  try {
    const conflict = await prisma.category.findUnique({ where: { name: text } })
    if (conflict && conflict.id !== state.categoryId) {
      await ctx.reply(`❌ Категория «${text}» уже существует. Введите другое название:`)
      return true
    }
    await prisma.category.update({ where: { id: state.categoryId }, data: { name: text } })
    inventoryState.delete(userId)
    await ctx.reply(
      `✅ Категория переименована: «${state.oldName}» → «${text}»`,
      Markup.removeKeyboard(),
    )
    await showCategories(ctx)
  } catch (err) {
    console.error('category rename error:', err)
    inventoryState.delete(userId)
    await ctx.reply('❌ Ошибка при переименовании.', Markup.removeKeyboard())
    await showCategories(ctx)
  }
  return true
}

// ─── Флоу: добавление варианта ────────────────────────────────────────────────

async function handleVariantAddFlow(
  ctx: Context,
  userId: number,
  text: string,
  state: VariantAddFlow,
): Promise<boolean> {
  if (text === '❌ Отмена') {
    const productId = state.productId
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showVariantsList(ctx, productId)
    return true
  }

  switch (state.step) {
    case 'sku': {
      const existing = await prisma.productVariant.findUnique({ where: { sku: text } })
      if (existing) {
        await ctx.reply(`❌ Артикул «${text}» уже занят. Введите другой SKU:`)
        return true
      }
      inventoryState.set(userId, { flow: 'variant_add', step: 'price', productId: state.productId, sku: text })
      await ctx.reply(`SKU: ${text}\n\nШаг 2 — введите цену в рублях:`)
      return true
    }

    case 'price': {
      const price = parseFloat(text.replace(',', '.'))
      if (isNaN(price) || price < 0) {
        await ctx.reply('❌ Введите корректную цену (например: 89990)')
        return true
      }
      inventoryState.set(userId, {
        flow: 'variant_add',
        step: 'qty',
        productId: state.productId,
        sku: state.sku,
        price,
      })
      await ctx.reply(`Цена: ${price} ₽\n\nШаг 3 — введите количество на складе:`)
      return true
    }

    case 'qty': {
      const qty = parseInt(text, 10)
      if (isNaN(qty) || qty < 0) {
        await ctx.reply('❌ Введите целое неотрицательное число')
        return true
      }
      const product = await prisma.product.findUnique({ where: { id: state.productId } })
      const productAttrs = (product?.attributes as Record<string, string[]> | null) ?? {}
      const attrKeys = Object.keys(productAttrs)

      if (attrKeys.length === 0) {
        inventoryState.set(userId, {
          flow: 'variant_add',
          step: 'region',
          productId: state.productId,
          sku: state.sku,
          price: state.price,
          qty,
          attrs: {},
        })
        await ctx.reply(
          `Количество: ${qty} шт.\n\nШаг 5 — выберите регион/страну варианта:`,
          await buildRegionKeyboard(),
        )
      } else {
        inventoryState.set(userId, {
          flow: 'variant_add',
          step: 'attrs',
          productId: state.productId,
          sku: state.sku,
          price: state.price,
          qty,
          attrKeys,
          selectedAttrs: {},
          currentAttrIndex: 0,
        })
        const firstKey = attrKeys[0]
        const firstValues = productAttrs[firstKey] ?? []
        const valButtons = firstValues.map((v) =>
          Markup.button.callback(v, `inv:var_attr:${encodeURIComponent(v)}`),
        )
        const valRows: ReturnType<typeof Markup.button.callback>[][] = []
        for (let i = 0; i < valButtons.length; i += 3) valRows.push(valButtons.slice(i, i + 3))
        await ctx.reply(
          `Количество: ${qty} шт.\n\nШаг 4 — выберите ${firstKey}:`,
          Markup.inlineKeyboard(valRows),
        )
      }
      return true
    }

    case 'attrs': {
      await ctx.reply('Используйте кнопки выше для выбора значения атрибута.')
      return true
    }

    case 'region': {
      await ctx.reply('Выберите регион кнопкой выше:', await buildRegionKeyboard())
      return true
    }

    case 'photo': {
      await ctx.reply(
        'Отправьте фото или нажмите кнопку:',
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Сохранить', 'inv:var_photo_done'),
            Markup.button.callback('⏭️ Пропустить', 'inv:var_photo_skip'),
          ],
        ]),
      )
      return true
    }
  }
}

// ─── Флоу: добавление атрибута ────────────────────────────────────────────────

async function handleAttrAddFlow(
  ctx: Context,
  userId: number,
  text: string,
  state: AttrAddFlow,
): Promise<boolean> {
  if (text === '❌ Отмена') {
    const productId = state.productId
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showProductAttrs(ctx, productId)
    return true
  }

  if (state.step === 'name') {
    const trimmed = text.trim()
    if (!trimmed) {
      await ctx.reply('❌ Название не может быть пустым.')
      return true
    }
    inventoryState.set(userId, {
      flow: 'attr_add',
      step: 'values',
      productId: state.productId,
      attrName: trimmed,
    })
    await ctx.reply(
      `Атрибут: «${trimmed}»\n\nШаг 2 — введите значения через запятую:\n(Пример: 128GB, 256GB, 512GB)`,
    )
    return true
  }

  if (state.step === 'values') {
    const values = text.split(',').map((v) => v.trim()).filter(Boolean)
    if (values.length === 0) {
      await ctx.reply('❌ Введите хотя бы одно значение.')
      return true
    }
    const product = await prisma.product.findUnique({ where: { id: state.productId } })
    const attrs = (product?.attributes as Record<string, string[]> | null) ?? {}
    attrs[state.attrName] = values
    await prisma.product.update({ where: { id: state.productId }, data: { attributes: attrs } })
    inventoryState.delete(userId)
    await ctx.reply(
      `✅ Атрибут «${state.attrName}» добавлен: ${values.join(', ')}`,
      Markup.removeKeyboard(),
    )
    await showProductAttrs(ctx, state.productId)
    return true
  }

  return true
}

// ─── Флоу: редактирование атрибута ────────────────────────────────────────────

async function handleAttrEditFlow(
  ctx: Context,
  userId: number,
  text: string,
  state: AttrEditFlow,
): Promise<boolean> {
  if (text === '❌ Отмена') {
    const productId = state.productId
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showProductAttrs(ctx, productId)
    return true
  }

  const values = text.split(',').map((v) => v.trim()).filter(Boolean)
  if (values.length === 0) {
    await ctx.reply('❌ Введите хотя бы одно значение.')
    return true
  }
  const product = await prisma.product.findUnique({ where: { id: state.productId } })
  const attrs = (product?.attributes as Record<string, string[]> | null) ?? {}
  attrs[state.attrName] = values
  await prisma.product.update({ where: { id: state.productId }, data: { attributes: attrs } })
  inventoryState.delete(userId)
  await ctx.reply(
    `✅ Атрибут «${state.attrName}» обновлён: ${values.join(', ')}`,
    Markup.removeKeyboard(),
  )
  await showProductAttrs(ctx, state.productId)
  return true
}

// ─── Флоу: добавление характеристики ─────────────────────────────────────────

async function handleSpecAddFlow(
  ctx: Context,
  userId: number,
  text: string,
  state: SpecAddFlow,
): Promise<boolean> {
  if (text === '❌ Отмена') {
    const productId = state.productId
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showProductSpecs(ctx, productId)
    return true
  }

  const colonIdx = text.indexOf(':')
  if (colonIdx < 1) {
    await ctx.reply('❌ Неверный формат. Используйте: Название : Значение')
    return true
  }
  const key = text.slice(0, colonIdx).trim()
  const value = text.slice(colonIdx + 1).trim()
  if (!key || !value) {
    await ctx.reply('❌ Название и значение не могут быть пустыми.')
    return true
  }

  const product = await prisma.product.findUnique({ where: { id: state.productId } })
  const specs = (product?.specs as Record<string, string> | null) ?? {}
  specs[key] = value
  await prisma.product.update({ where: { id: state.productId }, data: { specs } })
  inventoryState.delete(userId)
  await ctx.reply(`✅ Характеристика добавлена: ${key}: ${value}`, Markup.removeKeyboard())
  await showProductSpecs(ctx, state.productId)
  return true
}

// ─── Флоу: редактирование бренда ─────────────────────────────────────────────

async function handleBrandEditFlow(
  ctx: Context,
  userId: number,
  text: string,
  state: BrandEditFlow,
): Promise<boolean> {
  if (text === '❌ Отмена') {
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showProductCard(ctx, state.productId)
    return true
  }
  const trimmed = text.trim()
  const brand = trimmed === '-' ? null : trimmed
  await prisma.product.update({ where: { id: state.productId }, data: { brand } })
  inventoryState.delete(userId)
  await ctx.reply(
    brand ? `✅ Бренд установлен: ${brand}` : '✅ Бренд очищен.',
    Markup.removeKeyboard(),
  )
  await showProductCard(ctx, state.productId)
  return true
}

