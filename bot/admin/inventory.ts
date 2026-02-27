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
    const product = await prisma.product.findUnique({ where: { sku } })
    if (!product) {
      await ctx.reply('❌ Товар не найден.')
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
    const product = await prisma.product.findUnique({ where: { sku } })
    if (!product) {
      await ctx.reply('❌ Товар не найден.')
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

  const photos = (ctx.message as { photo?: Array<{ file_id: string }> })?.photo
  if (!photos || !Array.isArray(photos) || photos.length === 0) return false

  const bestPhoto = photos[photos.length - 1]

  // ── Баннер категории ───────────────────────────────────────────────────────
  if (state.flow === 'category_banner' && state.step === 'photo') {
    const s = state as CategoryBannerFlow
    try {
      await prisma.category.update({
        where: { id: s.categoryId },
        data: { imageFile: bestPhoto.file_id },
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
  const newFileIds = [...s.photoFileIds, bestPhoto.file_id]
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
      const product = await prisma.product.findUnique({ where: { sku: text } })
      if (!product) {
        await ctx.reply(`❌ Товар с артикулом «${text}» не найден. Проверьте SKU:`)
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
      const product = await prisma.product.findUnique({ where: { sku: text } })
      if (!product) {
        await ctx.reply(`❌ Товар с артикулом «${text}» не найден. Проверьте SKU:`)
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
