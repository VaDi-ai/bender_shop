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

import * as xlsx from 'xlsx'
import { Context, Markup, Telegraf } from 'telegraf'
import { prisma } from '../../lib/prisma'

// ─── Типы состояния ───────────────────────────────────────────────────────────

type AddFlow =
  | { flow: 'add'; step: 'sku' }
  | { flow: 'add'; step: 'name'; sku: string }
  | { flow: 'add'; step: 'price'; sku: string; name: string }
  | { flow: 'add'; step: 'category'; sku: string; name: string; price: number }
  | {
      flow: 'add'
      step: 'photo'
      sku: string
      name: string
      price: number
      category: string
      photoFileIds: string[]
    }
  | {
      flow: 'add'
      step: 'qty'
      sku: string
      name: string
      price: number
      category: string
      photoFileIds: string[]
    }

type ReceiveFlow =
  | { flow: 'receive'; step: 'sku' }
  | { flow: 'receive'; step: 'qty'; sku: string; productName: string; currentStock: number }

type WriteoffFlow =
  | { flow: 'writeoff'; step: 'sku' }
  | { flow: 'writeoff'; step: 'qty'; sku: string; productName: string; currentStock: number }

type ImportFlow = { flow: 'import'; step: 'awaiting_file' }
type ReceiveFileFlow = { flow: 'receive_file'; step: 'awaiting_file' }
type WriteoffFileFlow = { flow: 'writeoff_file'; step: 'awaiting_file' }
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
  | ReceiveFlow
  | WriteoffFlow
  | ImportFlow
  | ReceiveFileFlow
  | WriteoffFileFlow
  | CategoryAddFlow
  | CategoryRenameFlow
  | CategoryBannerFlow
  | VariantAddFlow
  | AttrAddFlow
  | AttrEditFlow
  | SpecAddFlow
  | ReceiveVariantFlow
  | WriteoffVariantFlow
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
function parseFileRows(buffer: Buffer, fname: string): FileRow[] | string {
  const ext = (fname.match(/\.(\w+)$/) ?? [])[1]?.toLowerCase()

  if (ext === 'xlsx' || ext === 'xls') {
    return parseXlsx(buffer)
  }

  // Для txt / csv / без расширения — pipe-separated
  return parsePipe(buffer.toString('utf8'))
}

function parseXlsx(buffer: Buffer): FileRow[] | string {
  const wb = xlsx.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  if (raw.length < 2) return 'Файл пуст или содержит только заголовок'

  const header = (raw[0] as unknown[]).map((h) => String(h).toLowerCase().trim())
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
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i] as unknown[]
    const sku = String(row[idx.sku] ?? '').trim()
    if (!sku) continue
    const qty = parseInt(String(row[idx.qty] ?? ''), 10)
    if (isNaN(qty) || qty < 0) continue

    rows.push({
      sku,
      name: idx.name >= 0 ? String(row[idx.name] ?? '').trim() || null : null,
      price: idx.price >= 0 ? parseFloat(String(row[idx.price] ?? '').replace(',', '.')) || null : null,
      category: idx.category >= 0 ? String(row[idx.category] ?? '').trim() || null : null,
      photoUrl: idx.photo >= 0 ? String(row[idx.photo] ?? '').trim() || null : null,
      qty,
    })
  }
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
  const products = await prisma.product.findMany({
    include: { category: true },
    orderBy: [{ name: 'asc' }],
  })

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('➕ Добавить', 'inv:add'),
      Markup.button.callback('📝 Редактировать', 'inv:edit_product'),
    ],
    [
      Markup.button.callback('📥 Оприходовать', 'inv:receive'),
      Markup.button.callback('📤 Списать', 'inv:writeoff'),
    ],
    [
      Markup.button.callback('📂 Категории', 'inv:categories'),
      Markup.button.callback('📤 Экспорт в файл', 'inv:export'),
    ],
    [
      Markup.button.callback('📥 Импорт из файла', 'inv:import'),
    ],
    [
      Markup.button.callback('📥 Оприходовать из файла', 'inv:receive_file'),
      Markup.button.callback('📤 Списать из файла', 'inv:writeoff_file'),
    ],
    [
      Markup.button.callback('🏠 Главное меню', 'back:main'),
    ],
  ])

  if (products.length === 0) {
    await ctx.reply('📦 Товаров пока нет. Нажмите «➕ Добавить» чтобы создать первый.', keyboard)
    return
  }

  // Группируем по категории
  const byCategory = new Map<string, typeof products>()
  for (const p of products) {
    const cat = p.category?.name ?? 'Без категории'
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(p)
  }

  const lines: string[] = ['📦 Товароучёт\n']
  for (const [cat, items] of byCategory) {
    lines.push(`— ${cat} —`)
    for (const p of items) {
      const dot = !p.isAvailable ? '⚫' : p.stock > 0 ? '🟢' : '🔴'
      lines.push(`${dot} [${p.sku}] ${p.name}  ${p.stock} шт. · ${p.price} ₽`)
    }
    lines.push('')
  }

  const total = products.reduce((s, p) => s + p.stock, 0)
  lines.push(`Итого позиций: ${products.length}, единиц на складе: ${total}`)

  await ctx.reply(lines.join('\n'), keyboard)
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

// ─── Регистрация action-обработчиков ─────────────────────────────────────────

const FILE_FORMAT_HINT = [
  '',
  'Формат файла (pipe-разделитель):',
  '  SKU | Название | Цена | Категория | Фото URL | Количество',
  '',
  'Также принимается .xlsx/.xls с заголовками.',
].join('\n')

const FILE_FORMAT_SHORT_HINT = [
  '',
  'Формат файла (pipe-разделитель):',
  '  SKU | Количество',
  '',
  'Или полный формат:',
  '  SKU | Название | Цена | Категория | Фото URL | Количество',
  '',
  'Также принимается .xlsx/.xls.',
  'Только существующие товары — остальные пропускаются.',
].join('\n')

export function setupInventoryHandlers(bot: Telegraf): void {
  bot.action('inv:add', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    inventoryState.set(userId, { flow: 'add', step: 'sku' })
    await ctx.reply(
      '➕ Добавление товара\n\nШаг 1 из 6 — введите артикул (SKU):',
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  bot.action('inv:receive', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    await showPickMethod(ctx, 'receive')
  })

  bot.action('inv:writeoff', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    await showPickMethod(ctx, 'writeoff')
  })

  // ── Оприходование: выбор метода ────────────────────────────────────────────

  bot.action('inv:r_from_sku', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    inventoryState.set(userId, { flow: 'receive', step: 'sku' })
    await ctx.reply(
      '📥 Оприходование\n\nВведите артикул (SKU) товара:',
      Markup.keyboard([['🔙 Назад', '❌ Отмена']]).resize(),
    )
  })

  bot.action('inv:r_from_list', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    await showCategoriesForPick(ctx, 'receive')
  })

  bot.action(/^inv:r_cat:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const categoryId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await showProductsForPick(ctx, 'receive', categoryId)
  })

  bot.action(/^inv:r_prod:(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const sku = (ctx.match as RegExpMatchArray)[1]
    const product = await prisma.product.findUnique({ where: { sku }, include: { variants: true } })
    if (!product) {
      await ctx.reply('❌ Товар не найден.')
      return
    }
    if (product.variants.length > 0) {
      await showVariantsForPick(ctx, 'receive', product)
      return
    }
    inventoryState.set(userId, {
      flow: 'receive',
      step: 'qty',
      sku: product.sku,
      productName: product.name,
      currentStock: product.stock,
    })
    await ctx.reply(
      `📥 ${product.name} [${product.sku}]\nТекущий остаток: ${product.stock} шт.\n\nСколько единиц добавить на склад?`,
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  // ── Списание: выбор метода ────────────────────────────────────────────────

  bot.action('inv:w_from_sku', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    inventoryState.set(userId, { flow: 'writeoff', step: 'sku' })
    await ctx.reply(
      '📤 Списание\n\nВведите артикул (SKU) товара:',
      Markup.keyboard([['🔙 Назад', '❌ Отмена']]).resize(),
    )
  })

  bot.action('inv:w_from_list', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    await showCategoriesForPick(ctx, 'writeoff')
  })

  bot.action(/^inv:w_cat:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const categoryId = parseInt((ctx.match as RegExpMatchArray)[1], 10)
    await showProductsForPick(ctx, 'writeoff', categoryId)
  })

  bot.action(/^inv:w_prod:(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    const sku = (ctx.match as RegExpMatchArray)[1]
    const product = await prisma.product.findUnique({ where: { sku }, include: { variants: true } })
    if (!product) {
      await ctx.reply('❌ Товар не найден.')
      return
    }
    if (product.variants.length > 0) {
      await showVariantsForPick(ctx, 'writeoff', product)
      return
    }
    inventoryState.set(userId, {
      flow: 'writeoff',
      step: 'qty',
      sku: product.sku,
      productName: product.name,
      currentStock: product.stock,
    })
    await ctx.reply(
      `📤 ${product.name} [${product.sku}]\nТекущий остаток: ${product.stock} шт.\n\nСколько единиц списать?`,
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
      price: s.price,
      category: s.category,
      photoFileIds: s.photoFileIds,
    })

    const photoInfo = s.photoFileIds.length > 0
      ? `${s.photoFileIds.length} фото`
      : 'без фото'

    await ctx.reply(
      `Фото: ${photoInfo}\n\nШаг 6 из 6 — введите начальное количество на складе:`,
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
      price: s.price,
      category: cat.name,
      photoFileIds: [],
    })

    await ctx.reply(
      `Категория: ${cat.name}\n\nШаг 5 из 6 — отправьте фото товара (можно несколько, до 7 штук).\nКогда закончите — нажмите ✅ Готово\n\nДля отмены напишите «❌ Отмена»`,
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

  // ── Импорт из файла (upsert: обновляет все поля и УСТАНАВЛИВАЕТ количество) ──

  bot.action('inv:import', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    inventoryState.set(userId, { flow: 'import', step: 'awaiting_file' })
    await ctx.reply(
      [
        '📥 Импорт из файла',
        '',
        'Существующие товары: все поля обновятся, количество заменится.',
        'Новые товары будут созданы автоматически.',
        FILE_FORMAT_HINT,
      ].join('\n'),
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  // ── Оприходовать из файла (quantity += qty для существующих SKU) ──

  bot.action('inv:receive_file', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    inventoryState.set(userId, { flow: 'receive_file', step: 'awaiting_file' })
    await ctx.reply(
      [
        '📥 Оприходование из файла',
        '',
        'Остаток каждого товара увеличится на указанное количество.',
        FILE_FORMAT_SHORT_HINT,
      ].join('\n'),
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  // ── Списать из файла (quantity -= qty для существующих SKU) ──

  bot.action('inv:writeoff_file', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
    inventoryState.set(userId, { flow: 'writeoff_file', step: 'awaiting_file' })
    await ctx.reply(
      [
        '📤 Списание из файла',
        '',
        'Остаток каждого товара уменьшится на указанное количество (не ниже 0).',
        FILE_FORMAT_SHORT_HINT,
      ].join('\n'),
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  bot.action('inv:export', async (ctx) => {
    try { await ctx.answerCbQuery('Генерирую файл…') } catch { /* ignore stale query */ }
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
        step: 'photo',
        productId: s.productId,
        sku: s.sku,
        price: s.price,
        qty: s.qty,
        attrs: newSelectedAttrs,
        photos: [],
      })
      await ctx.reply(
        `${currentKey}: ${value} ✅\n\nШаг 5 — добавьте фото варианта (до 5 штук) или пропустите:`,
        Markup.inlineKeyboard([
          [Markup.button.callback('⏭️ Пропустить', 'inv:var_photo_skip')],
        ]),
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

  // ── Оприходование/списание конкретного варианта ───────────────────────────

  bot.action(/^inv:r_variant:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
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
    const attrStr = Object.values(attrs).join(' / ')
    inventoryState.set(userId, {
      flow: 'receive_variant',
      step: 'qty',
      variantId,
      variantSku: variant.sku,
      productName: `${variant.product.name} [${attrStr || variant.sku}]`,
      currentQty: variant.quantity,
    })
    await ctx.reply(
      `📥 ${variant.product.name}\nВариант: ${attrStr || variant.sku}\nТекущий остаток: ${variant.quantity} шт.\n\nСколько единиц добавить?`,
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  bot.action(/^inv:w_variant:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore stale query */ }
    const userId = ctx.from!.id
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
    const attrStr = Object.values(attrs).join(' / ')
    inventoryState.set(userId, {
      flow: 'writeoff_variant',
      step: 'qty',
      variantId,
      variantSku: variant.sku,
      productName: `${variant.product.name} [${attrStr || variant.sku}]`,
      currentQty: variant.quantity,
    })
    await ctx.reply(
      `📤 ${variant.product.name}\nВариант: ${attrStr || variant.sku}\nТекущий остаток: ${variant.quantity} шт.\n\nСколько единиц списать?`,
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
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
    case 'receive':
      return handleReceiveFlow(ctx, userId, text, state)
    case 'writeoff':
      return handleWriteoffFlow(ctx, userId, text, state)
    case 'variant_add':
      return handleVariantAddFlow(ctx, userId, text, state)
    case 'attr_add':
      return handleAttrAddFlow(ctx, userId, text, state)
    case 'attr_edit':
      return handleAttrEditFlow(ctx, userId, text, state)
    case 'spec_add':
      return handleSpecAddFlow(ctx, userId, text, state)
    case 'receive_variant':
      return handleReceiveVariantFlow(ctx, userId, text, state)
    case 'writeoff_variant':
      return handleWriteoffVariantFlow(ctx, userId, text, state)
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
    case 'import':
    case 'receive_file':
    case 'writeoff_file': {
      if (text === '❌ Отмена') {
        inventoryState.delete(userId)
        await ctx.reply('Отменено.', Markup.removeKeyboard())
        await showInventory(ctx)
      } else {
        await ctx.reply('📎 Пришлите файл .xlsx, .xls или текстовый файл с разделителем «|»')
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
  if (
    !state ||
    (state.flow !== 'import' && state.flow !== 'receive_file' && state.flow !== 'writeoff_file')
  )
    return

  const doc = (
    ctx.message as { document?: { file_id: string; file_name?: string; mime_type?: string } }
  )?.document
  if (!doc) return

  const mime = doc.mime_type ?? ''
  const fname = doc.file_name ?? 'file'
  const isSupported =
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    mime.includes('plain') ||
    /\.(xlsx?|csv|txt)$/i.test(fname)

  if (!isSupported) {
    await ctx.reply('❌ Неподдерживаемый формат. Отправьте .xlsx, .xls, .csv или .txt')
    return
  }

  await ctx.reply('⏳ Обрабатываю файл…')

  try {
    const fileUrl = await ctx.telegram.getFileLink(doc.file_id)
    const res = await fetch(fileUrl.href)
    const buffer = Buffer.from(await res.arrayBuffer())

    const result = parseFileRows(buffer, fname)
    if (typeof result === 'string') {
      inventoryState.delete(userId)
      await ctx.reply(`❌ ${result}`, Markup.removeKeyboard())
      await showInventory(ctx)
      return
    }

    const flow = state.flow
    inventoryState.delete(userId)

    if (flow === 'import') {
      await processImport(ctx, result)
    } else if (flow === 'receive_file') {
      await processReceiveFile(ctx, result)
    } else {
      await processWriteoffFile(ctx, result)
    }
  } catch (err) {
    console.error('inventory file error:', err)
    inventoryState.delete(userId)
    await ctx.reply(
      '❌ Ошибка при обработке файла. Проверьте формат и попробуйте снова.',
      Markup.removeKeyboard(),
    )
    await showInventory(ctx)
  }
}

// ─── Обработка импорта (upsert + SET qty) ────────────────────────────────────

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

// ─── Экспорт остатков в xlsx ──────────────────────────────────────────────────

async function exportInventory(ctx: Context): Promise<void> {
  try {
    const products = await prisma.product.findMany({
      include: { category: true },
      orderBy: [{ name: 'asc' }],
    })

    const rows = [
      ['SKU', 'Название', 'Категория', 'Цена', 'Количество', 'Наличие'],
      ...products.map((p) => [
        p.sku,
        p.name,
        p.category?.name ?? '',
        Number(p.price),
        p.quantity,
        p.isAvailable ? 'Да' : 'Нет',
      ]),
    ]

    const wb = xlsx.utils.book_new()
    const ws = xlsx.utils.aoa_to_sheet(rows)

    ws['!cols'] = [
      { wch: 14 }, // SKU
      { wch: 30 }, // Название
      { wch: 14 }, // Категория
      { wch: 10 }, // Цена
      { wch: 12 }, // Количество
      { wch: 10 }, // Наличие
    ]

    xlsx.utils.book_append_sheet(wb, ws, 'Остатки')
    const buffer: Buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })

    const date = new Date().toISOString().slice(0, 10)
    await ctx.replyWithDocument({ source: buffer, filename: `stock_${date}.xlsx` })
    await showInventory(ctx)
  } catch (err) {
    console.error('inventory export error:', err)
    await ctx.reply('❌ Ошибка при генерации файла.')
  }
}

// ─── Флоу: добавить товар (6 шагов) ──────────────────────────────────────────

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
      await ctx.reply(`SKU: ${text}\n\nШаг 2 из 6 — введите название товара:`)
      return true
    }

    case 'name': {
      inventoryState.set(userId, { flow: 'add', step: 'price', sku: state.sku, name: text })
      await ctx.reply(`Название: ${text}\n\nШаг 3 из 6 — введите цену в рублях (например: 1500):`)
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
      await ctx.reply('Шаг 4 из 6 — выберите категорию:', Markup.inlineKeyboard(catRows))
      return true
    }

    case 'category': {
      inventoryState.set(userId, {
        flow: 'add',
        step: 'photo',
        sku: state.sku,
        name: state.name,
        price: state.price,
        category: text,
        photoFileIds: [],
      })
      // Убираем reply-клавиатуру отдельным сообщением, затем показываем инструкцию с inline-кнопкой
      await ctx.reply(`Категория: ${text}`, Markup.removeKeyboard())
      await ctx.reply(
        'Шаг 5 из 6 — отправьте фото товара (можно несколько, до 7 штук).\nКогда закончите — нажмите ✅ Готово\n\nДля отмены напишите «❌ Отмена»',
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
            ...(state.category && { category: { connectOrCreate: { where: { name: state.category }, create: { name: state.category } } } }),
            photoUrl,
            stock: qty,
            quantity: qty,
            isAvailable: qty > 0,
          },
        })
        inventoryState.delete(userId)
        const photoInfo = state.photoFileIds.length > 0 ? `${state.photoFileIds.length} шт.` : '—'
        await ctx.reply(
          [
            '✅ Товар добавлен!',
            '',
            `Артикул:   ${product.sku}`,
            `Название:  ${product.name}`,
            `Цена:      ${product.price} ₽`,
            `Категория: ${state.category ?? '—'}`,
            `Фото:      ${photoInfo}`,
            `На складе: ${product.stock} шт.`,
          ].join('\n'),
          Markup.removeKeyboard(),
        )
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

// ─── Флоу: оприходование ─────────────────────────────────────────────────────

async function handleReceiveFlow(
  ctx: Context,
  userId: number,
  text: string,
  state: ReceiveFlow,
): Promise<boolean> {
  if (text === '❌ Отмена') {
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showInventory(ctx)
    return true
  }

  if (text === '🔙 Назад' && state.step === 'sku') {
    inventoryState.delete(userId)
    await ctx.reply('Выбор метода:', Markup.removeKeyboard())
    await showPickMethod(ctx, 'receive')
    return true
  }

  switch (state.step) {
    case 'sku': {
      const product = await prisma.product.findUnique({ where: { sku: text }, include: { variants: true } })
      if (!product) {
        await ctx.reply(`❌ Товар с артикулом «${text}» не найден. Проверьте SKU:`)
        return true
      }
      if (product.variants.length > 0) {
        inventoryState.delete(userId)
        await ctx.reply('Товар имеет варианты. Выберите вариант:', Markup.removeKeyboard())
        await showVariantsForPick(ctx, 'receive', product)
        return true
      }
      inventoryState.set(userId, {
        flow: 'receive',
        step: 'qty',
        sku: text,
        productName: product.name,
        currentStock: product.stock,
      })
      await ctx.reply(
        `📥 ${product.name} [${product.sku}]\nТекущий остаток: ${product.stock} шт.\n\nСколько единиц добавить на склад?`,
        Markup.keyboard([['❌ Отмена']]).resize(),
      )
      return true
    }

    case 'qty': {
      const qty = parseInt(text, 10)
      if (isNaN(qty) || qty <= 0) {
        await ctx.reply('❌ Введите положительное целое число')
        return true
      }
      try {
        const product = await prisma.product.update({
          where: { sku: state.sku },
          data: {
            stock: { increment: qty },
            quantity: { increment: qty },
            isAvailable: true,
          },
        })
        inventoryState.delete(userId)
        await ctx.reply(
          `✅ Оприходовано\n\n${product.name} [${product.sku}]\nДобавлено: +${qty} шт.\nНовый остаток: ${product.stock} шт.`,
          Markup.removeKeyboard(),
        )
        await showInventory(ctx)
      } catch (err) {
        console.error('inventory receive error:', err)
        inventoryState.delete(userId)
        await ctx.reply('❌ Ошибка при обновлении. Попробуйте снова.', Markup.removeKeyboard())
        await showInventory(ctx)
      }
      return true
    }
  }
}

// ─── Флоу: списание ───────────────────────────────────────────────────────────

async function handleWriteoffFlow(
  ctx: Context,
  userId: number,
  text: string,
  state: WriteoffFlow,
): Promise<boolean> {
  if (text === '❌ Отмена') {
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showInventory(ctx)
    return true
  }

  if (text === '🔙 Назад' && state.step === 'sku') {
    inventoryState.delete(userId)
    await ctx.reply('Выбор метода:', Markup.removeKeyboard())
    await showPickMethod(ctx, 'writeoff')
    return true
  }

  switch (state.step) {
    case 'sku': {
      const product = await prisma.product.findUnique({ where: { sku: text }, include: { variants: true } })
      if (!product) {
        await ctx.reply(`❌ Товар с артикулом «${text}» не найден. Проверьте SKU:`)
        return true
      }
      if (product.variants.length > 0) {
        inventoryState.delete(userId)
        await ctx.reply('Товар имеет варианты. Выберите вариант:', Markup.removeKeyboard())
        await showVariantsForPick(ctx, 'writeoff', product)
        return true
      }
      inventoryState.set(userId, {
        flow: 'writeoff',
        step: 'qty',
        sku: text,
        productName: product.name,
        currentStock: product.stock,
      })
      await ctx.reply(
        `📤 ${product.name} [${product.sku}]\nТекущий остаток: ${product.stock} шт.\n\nСколько единиц списать?`,
        Markup.keyboard([['❌ Отмена']]).resize(),
      )
      return true
    }

    case 'qty': {
      const qty = parseInt(text, 10)
      if (isNaN(qty) || qty <= 0) {
        await ctx.reply('❌ Введите положительное целое число')
        return true
      }
      if (qty > state.currentStock) {
        await ctx.reply(
          `❌ Нельзя списать ${qty} шт. — на складе только ${state.currentStock} шт.`,
        )
        return true
      }
      const newStock = state.currentStock - qty
      try {
        const product = await prisma.product.update({
          where: { sku: state.sku },
          data: {
            stock: newStock,
            quantity: newStock,
            isAvailable: newStock > 0,
          },
        })
        inventoryState.delete(userId)
        const notice = newStock === 0 ? '\n⚠️ Остаток 0 — товар снят с продажи.' : ''
        await ctx.reply(
          `✅ Списано\n\n${product.name} [${product.sku}]\nСписано: −${qty} шт.\nОстаток: ${product.stock} шт.${notice}`,
          Markup.removeKeyboard(),
        )
        await showInventory(ctx)
      } catch (err) {
        console.error('inventory writeoff error:', err)
        inventoryState.delete(userId)
        await ctx.reply('❌ Ошибка при обновлении. Попробуйте снова.', Markup.removeKeyboard())
        await showInventory(ctx)
      }
      return true
    }
  }
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
          step: 'photo',
          productId: state.productId,
          sku: state.sku,
          price: state.price,
          qty,
          attrs: {},
          photos: [],
        })
        await ctx.reply(
          `Количество: ${qty} шт.\n\nШаг 5 — добавьте фото варианта (до 5 штук) или пропустите:`,
          Markup.inlineKeyboard([[Markup.button.callback('⏭️ Пропустить', 'inv:var_photo_skip')]]),
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

// ─── Флоу: оприходование варианта ────────────────────────────────────────────

async function handleReceiveVariantFlow(
  ctx: Context,
  userId: number,
  text: string,
  state: ReceiveVariantFlow,
): Promise<boolean> {
  if (text === '❌ Отмена') {
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showInventory(ctx)
    return true
  }

  const qty = parseInt(text, 10)
  if (isNaN(qty) || qty <= 0) {
    await ctx.reply('❌ Введите положительное целое число')
    return true
  }
  try {
    const variant = await prisma.productVariant.update({
      where: { id: state.variantId },
      data: { quantity: { increment: qty }, inStock: true },
    })
    inventoryState.delete(userId)
    await ctx.reply(
      `✅ Оприходовано\n\n${state.productName}\nДобавлено: +${qty} шт.\nНовый остаток: ${variant.quantity} шт.`,
      Markup.removeKeyboard(),
    )
    await showInventory(ctx)
  } catch (err) {
    console.error('receive_variant error:', err)
    inventoryState.delete(userId)
    await ctx.reply('❌ Ошибка при обновлении.', Markup.removeKeyboard())
    await showInventory(ctx)
  }
  return true
}

// ─── Флоу: списание варианта ──────────────────────────────────────────────────

async function handleWriteoffVariantFlow(
  ctx: Context,
  userId: number,
  text: string,
  state: WriteoffVariantFlow,
): Promise<boolean> {
  if (text === '❌ Отмена') {
    inventoryState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showInventory(ctx)
    return true
  }

  const qty = parseInt(text, 10)
  if (isNaN(qty) || qty <= 0) {
    await ctx.reply('❌ Введите положительное целое число')
    return true
  }
  if (qty > state.currentQty) {
    await ctx.reply(
      `❌ Нельзя списать ${qty} шт. — на складе только ${state.currentQty} шт.`,
    )
    return true
  }
  const newQty = state.currentQty - qty
  try {
    const variant = await prisma.productVariant.update({
      where: { id: state.variantId },
      data: { quantity: newQty, inStock: newQty > 0 },
    })
    inventoryState.delete(userId)
    const notice = variant.quantity === 0 ? '\n⚠️ Остаток 0 — вариант снят с продажи.' : ''
    await ctx.reply(
      `✅ Списано\n\n${state.productName}\nСписано: −${qty} шт.\nОстаток: ${variant.quantity} шт.${notice}`,
      Markup.removeKeyboard(),
    )
    await showInventory(ctx)
  } catch (err) {
    console.error('writeoff_variant error:', err)
    inventoryState.delete(userId)
    await ctx.reply('❌ Ошибка при обновлении.', Markup.removeKeyboard())
    await showInventory(ctx)
  }
  return true
}
