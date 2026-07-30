/**
 * bot/admin/pricing.ts — Управление ценами
 *
 * Меню: из сообщения | курс доллара | из файла | точечно | история
 */

import https from 'https'
import ExcelJS from 'exceljs'
import { Context, Markup, Telegraf } from 'telegraf'
import log from '../../lib/logger'
import { prisma } from '../../lib/prisma'
import {
  CURRENCY_FLAGS, fetchCurrencyRates,
  roundPrice, updateCurrencyRates, type CurrencyChange,
} from '../../lib/currency'
import {
  parseSupplierMessage as aiParseSupplier,
} from '../../lib/ai-parser'
import { getUserId } from '../helpers'
import { logSecurityEvent } from '../../lib/security-log'
import {
  loadRules, validateRules, applyMarkupRules,
  formatRule,
} from '../../lib/markup-rules'
import { WRITEBACK_COLS } from '../../lib/sheets-sync'

// ─── Типы ─────────────────────────────────────────────────────────────────────
// ParsedLine/MatchedVariant + matchVariants вынесены в lib/price-matching.ts
// (PR-6): нужны и боту, и веб-батчам разбора прайсов. Логика не менялась.

import { matchVariants, ParsedLine, MatchedVariant } from '../../lib/price-matching'
import { toParsedLine } from '../../lib/price-batch'
import { detectBrandFromName, detectCategoryFromName } from '../../lib/product-from-price'

export type PendingVariant = {
  variantId: number
  productId: number
  productName: string
  brand?: string
  categoryId?: number
  variantSku: string
  attrs: string
  currentPrice: number
  newPrice: number
  comment?: string
  costPrice?: number   // Закупочная цена от поставщика (для записи в БД при apply)
}

type PricingSource = 'message' | 'file' | 'markup' | 'manual' | 'currency_update'

type PricingFlow =
  | { flow: 'awaiting_message'; rate?: number }
  | { flow: 'awaiting_supplier_name'; parsed: ParsedLine[] }
  | { flow: 'awaiting_markup'; matches: MatchedVariant[]; unmatched: ParsedLine[]; rate?: number }
  | { flow: 'awaiting_markup_or_rules'; supplierName: string; matches: MatchedVariant[]; unmatched: ParsedLine[] }
  | { flow: 'bulk_pct'; filterType: 'all' | 'category'; filterValue: string; filterLabel: string }
  | {
      flow: 'preview'
      source: PricingSource
      markup: number | null
      label: string
      pendingVariants: PendingVariant[]
      excludedVariantIds: number[]
    }
  | { flow: 'rules_add_min' }
  | { flow: 'rules_add_max'; minCost: number }
  | { flow: 'rules_add_mode'; minCost: number; maxCost: number | null }
  | { flow: 'rules_add_value'; minCost: number; maxCost: number | null; mode: string }
  | { flow: 'rules_edit_pick' }
  | { flow: 'rules_edit_value'; ruleId: number }
  | { flow: 'rules_delete_pick' }
  | { flow: 'rules_test' }
  | { flow: 'awaiting_file' }
  | { flow: 'manual_product_pick'; page: number }
  | { flow: 'manual_variant_pick'; productId: number; productName: string }
  | {
      flow: 'manual_price_input'
      variantId: number
      variantSku: string
      productName: string
      attrs: string
      currentPrice: number
    }
  | { flow: 'manual_all_price'; productId: number; productName: string }
  // ── Корректировка цен по курсу USD ──────────────────────────────────────────
  | { flow: 'usd_adjust_preview'; pending: PendingVariant[]; changePct: number }
  // ── Мастер создания товара из прайса ──────────────────────────────────────
  | { flow: 'create_from_price'; items: ParsedLine[]; currentIndex: number; supplierName: string; draft: QuickProductDraft }
  | { flow: 'create_from_price_qty'; items: ParsedLine[]; currentIndex: number; supplierName: string; draft: QuickProductDraft }
  | { flow: 'create_from_price_search'; items: ParsedLine[]; currentIndex: number; supplierName: string; draft: QuickProductDraft }

type QuickProductDraft = {
  name: string
  brand: string
  category: string | null
  color: string | null
  memory: string | null
  country: string | null
  costPrice: number
  retailPrice: number
  quantity: number
}

export const pricingState = new Map<number, PricingFlow>()

// ─── Матчинг вариантов ────────────────────────────────────────────────────────

// ─── Форматирование ───────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n.toLocaleString('ru-RU') + ' ₽'
}

function fmtDiff(diff: number): string {
  return (diff >= 0 ? '+' : '') + fmtPrice(diff)
}

// ─── Построение PendingVariant из MatchedVariant[] ───────────────────────────

function buildPendingFromMatches(
  matches: MatchedVariant[],
  markup: number | null,
  rate: number | null,
): PendingVariant[] {
  return matches.map((m) => {
    const effective = rate ? roundPrice(m.supplierPrice * rate) : m.supplierPrice
    const newPrice = markup !== null ? roundPrice(effective * (1 + markup / 100)) : effective
    const p = m.parsed
    const attsParts = [p.storage ? `${p.storage} ГБ` : null, p.color].filter(Boolean)
    return {
      variantId: m.variantId, productId: m.productId, productName: m.productName,
      brand: m.brand, categoryId: m.categoryId, variantSku: m.variantSku,
      attrs: attsParts.join(', '),
      currentPrice: m.currentPrice, newPrice,
    }
  })
}

// ─── Меню ─────────────────────────────────────────────────────────────────────

export async function showPricingMenu(ctx: Context): Promise<void> {
  await ctx.reply(
    '💰 Управление ценами',
    Markup.inlineKeyboard([
      [Markup.button.callback('📨 Из сообщения поставщика', 'pricing:msg')],
      [Markup.button.callback('📊 Правила наценки', 'pricing:rules')],
      [Markup.button.callback('💱 Курс доллара', 'pricing:rate')],
      [Markup.button.callback('🔙 Назад', 'back:main')],
    ]),
  )
}

// ─── Универсальный предпросмотр ───────────────────────────────────────────────

async function showPreview(ctx: Context, userId: number): Promise<void> {
  const state = pricingState.get(userId)
  if (!state || state.flow !== 'preview') return

  const active = state.pendingVariants.filter(
    (v) => !state.excludedVariantIds.includes(v.variantId),
  )
  const excludedCount = state.excludedVariantIds.length

  const lines: string[] = ['📊 Предпросмотр изменений:\n']
  const preview = active.slice(0, 12)
  for (const v of preview) {
    const diff = v.newPrice - v.currentPrice
    const attrsStr = v.attrs ? ` (${v.attrs})` : ''
    lines.push(`${v.productName}${attrsStr}: ${fmtPrice(v.currentPrice)} → ${fmtPrice(v.newPrice)} (${fmtDiff(diff)})`)
  }
  if (active.length > 12) lines.push(`… и ещё ${active.length - 12}`)

  const excludedNote = excludedCount > 0 ? ` (исключено: ${excludedCount} по фильтрам)` : ''
  lines.push(`\nБудет обновлено: ${active.length} вариантов${excludedNote}`)

  const keyboard =
    active.length === 0
      ? Markup.inlineKeyboard([
          [Markup.button.callback('🔽 Исключить позиции', 'pricing:exclude')],
          [Markup.button.callback('❌ Отмена', 'pricing:cancel')],
        ])
      : Markup.inlineKeyboard([
          [Markup.button.callback('🔽 Исключить позиции', 'pricing:exclude')],
          [
            Markup.button.callback('✅ Применить', 'pricing:apply'),
            Markup.button.callback('❌ Отмена', 'pricing:cancel'),
          ],
        ])

  await ctx.reply(lines.join('\n'), keyboard)
}

// ─── Меню исключений ──────────────────────────────────────────────────────────

async function showExcludeMenu(ctx: Context, userId: number): Promise<void> {
  const state = pricingState.get(userId)
  if (!state || state.flow !== 'preview') return

  const active = state.pendingVariants.filter(
    (v) => !state.excludedVariantIds.includes(v.variantId),
  )

  await ctx.reply(
    `Исключить из обновления:\nОсталось: ${active.length} | Исключено: ${state.excludedVariantIds.length}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('⏱️ Изм. < 60 мин', 'pricing:excl_60m'),
        Markup.button.callback('⏱️ Изм. сегодня', 'pricing:excl_today'),
      ],
      [
        Markup.button.callback('🏢 По бренду', 'pricing:excl_brands'),
        Markup.button.callback('🗂️ По категории', 'pricing:excl_cats'),
      ],
      [Markup.button.callback('📦 По товару', 'pricing:excl_prods')],
      [Markup.button.callback('✅ Готово — к предпросмотру', 'pricing:preview')],
    ]),
  )
}

// ─── Применение изменений ─────────────────────────────────────────────────────

async function applyChanges(ctx: Context, userId: number): Promise<void> {
  const state = pricingState.get(userId)
  if (!state || state.flow !== 'preview') return

  const active = state.pendingVariants.filter(
    (v) => !state.excludedVariantIds.includes(v.variantId),
  )
  pricingState.delete(userId)

  if (active.length === 0) {
    await ctx.reply('Нет вариантов для обновления.')
    return
  }

  let updated = 0
  const errors: string[] = []

  for (const v of active) {
    try {
      const updateData: Record<string, any> = { price: v.newPrice }
      // Если передана закупочная цена (flow от поставщика) — сохранить в ProductVariant
      if (v.costPrice && v.costPrice > 0) {
        updateData.costPrice = v.costPrice
        updateData.lastSyncedCostPrice = v.costPrice
      }
      await prisma.productVariant.update({ where: { id: v.variantId }, data: updateData })
      await prisma.priceChange.create({
        data: {
          variantId: v.variantId,
          oldPrice: v.currentPrice,
          newPrice: v.newPrice,
          source: state.source,
          markup: state.markup,
          comment: v.comment || null,
          createdBy: String(userId),
        },
      })
      try { await logSecurityEvent('price_changed', { variantId: v.variantId, variantSku: v.variantSku, oldPrice: v.currentPrice, newPrice: v.newPrice, source: state.source, adminId: userId }, userId) } catch { /* logging failure should not break the operation */ }
      updated++

      // Автосохранение алиаса для обучения парсера (только для flow от поставщика)
      if (state.source === 'message' && v.costPrice && v.costPrice > 0) {
        try {
          const aliasText = v.productName.toLowerCase()
          await prisma.priceAlias.upsert({
            where: { alias: aliasText },
            create: { alias: aliasText, productId: v.productId, variantId: v.variantId },
            update: { productId: v.productId, variantId: v.variantId, isIgnored: false },
          }).catch(() => {})
        } catch { /* ignore alias save errors */ }
      }
    } catch {
      errors.push(v.variantSku)
    }
  }

  // ── Записать обновлённые цены в Google Sheets (только для flow от поставщика) ──
  if (state.source === 'message') {
    try {
      const { readSheet, getProductSheetNames, batchUpdate: batchUpdateSheets } = await import('../../lib/google-sheets')
      const now = new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })

      // Полистовой учёт: строка товара может быть на любом листе (кроме служебных).
      // Читаем все листы один раз и ищем совпадение по «Название модели» (колонка E).
      const sheetNames = await getProductSheetNames()
      const sheetsData: { sheetName: string; data: string[][] }[] = []
      for (const sheetName of sheetNames) {
        try {
          sheetsData.push({ sheetName, data: await readSheet(sheetName) })
        } catch (err) {
          log.warn('Pricing failed to read sheet', { sheetName, error: err instanceof Error ? err.message : String(err) })
        }
      }

      const sheetUpdates: { range: string; values: (string | number)[][] }[] = []

      for (const v of active) {
        const costRaw = v.costPrice ?? null
        if (costRaw === null || isNaN(costRaw)) continue

        // Берём точный fullName варианта из attributes — это то имя, по которому
        // sheets-sync кладёт строку в таблицу. Исключает false-positive fuzzy-match.
        let targetFullName: string | null = null
        try {
          const variant = await prisma.productVariant.findUnique({
            where: { id: v.variantId },
            select: { attributes: true },
          })
          const attrs = variant?.attributes as Record<string, unknown> | null
          if (attrs && typeof attrs.fullName === 'string') {
            targetFullName = attrs.fullName
          }
        } catch { /* ignore */ }

        // Fallback на имя продукта если fullName не найден
        const searchName = targetFullName || v.productName
        const supplierLabel = state.label || ''

        // Колонка E (index 4) = «Название модели». Ищем первое совпадение по листам.
        let found = false
        for (const { sheetName, data } of sheetsData) {
          for (let i = 1; i < data.length; i++) {
            const cellName = (data[i]?.[4] ?? '').toString().trim()
            if (!cellName) continue

            if (cellName === searchName || cellName.toLowerCase() === searchName.toLowerCase()) {
              const rowNum = i + 1
              sheetUpdates.push({ range: "'" + sheetName + "'!" + WRITEBACK_COLS.costPrice + rowNum, values: [[costRaw]] })
              sheetUpdates.push({ range: "'" + sheetName + "'!" + WRITEBACK_COLS.price + rowNum, values: [[v.newPrice]] })
              sheetUpdates.push({ range: "'" + sheetName + "'!" + WRITEBACK_COLS.supplier + rowNum + ':' + WRITEBACK_COLS.date + rowNum, values: [[supplierLabel, now]] })
              found = true
              break
            }
          }
          if (found) break
        }
      }

      if (sheetUpdates.length > 0) {
        await batchUpdateSheets(sheetUpdates)
        log.info('Pricing wrote to sheets', { updates: sheetUpdates.length })
      }
    } catch (err) {
      log.error('Pricing sheets writeback error', { error: err instanceof Error ? err.message : String(err) })
      // Не блокируем — цены в БД уже обновлены, таблица актуализируется при следующем sync
    }
  }

  const errMsg = errors.length > 0 ? `\n❌ Ошибки (${errors.length}): ${errors.join(', ')}` : ''
  await ctx.reply(
    `✅ Цены обновлены: ${updated} вариантов${errMsg}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('📋 История', 'pricing:history')],
      [Markup.button.callback('🔙 Меню цен', 'pricing:menu')],
    ]),
  )
}

// ─── История ──────────────────────────────────────────────────────────────────

async function showHistory(ctx: Context): Promise<void> {
  const changes = await prisma.priceChange.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { variant: { include: { product: true } } },
  })

  if (!changes.length) {
    await ctx.reply('📋 История пуста.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'pricing:menu')]]))
    return
  }

  const SRC: Record<string, string> = { message: '📨', file: '📊', markup: '📈', manual: '✏️', currency_update: '💱' }
  const lines = changes.map((c) => {
    const name = c.variant.product.name.slice(0, 22)
    const src = SRC[c.source] ?? c.source
    const date = c.createdAt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    const mu = c.markup !== null ? ` +${c.markup}%` : ''
    return `${date} ${src}${mu}: ${name} ${fmtPrice(Number(c.oldPrice))} → ${fmtPrice(Number(c.newPrice))}`
  })

  await ctx.reply(
    `📋 История (последние ${changes.length}):\n\n${lines.join('\n')}`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'pricing:menu')]]),
  )
}

// ─── Список товаров для ручного редактирования ────────────────────────────────

const MANUAL_PAGE_SIZE = 12

async function showManualProductList(ctx: Context, userId: number, page: number): Promise<void> {
  const products = await prisma.product.findMany({
    orderBy: { name: 'asc' },
    skip: page * MANUAL_PAGE_SIZE,
    take: MANUAL_PAGE_SIZE + 1,
    include: { _count: { select: { variants: true } } },
  })

  const hasNext = products.length > MANUAL_PAGE_SIZE
  const items = products.slice(0, MANUAL_PAGE_SIZE)

  pricingState.set(userId, { flow: 'manual_product_pick', page })

  const rows = items.map((p) => [
    Markup.button.callback(
      `${p.name.slice(0, 32)} (${p._count.variants})`,
      `pricing:man_prod:${p.id}`,
    ),
  ])

  const nav: ReturnType<typeof Markup.button.callback>[] = []
  if (page > 0) nav.push(Markup.button.callback('◀️ Назад', `pricing:man_page:${page - 1}`))
  if (hasNext) nav.push(Markup.button.callback('▶️ Далее', `pricing:man_page:${page + 1}`))
  if (nav.length) rows.push(nav)
  rows.push([Markup.button.callback('❌ Отмена', 'pricing:cancel')])

  await ctx.reply('✏️ Выберите товар:', Markup.inlineKeyboard(rows))
}

async function showManualVariantList(ctx: Context, userId: number, productId: number): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { orderBy: { id: 'asc' } } },
  })
  if (!product) { await ctx.reply('Товар не найден.'); return }
  if (!product.variants.length) { await ctx.reply('У товара нет вариантов.'); return }

  pricingState.set(userId, {
    flow: 'manual_variant_pick',
    productId: product.id,
    productName: product.name,
  })

  const lines = [`✏️ ${product.name}:\n`]
  const varBtns: ReturnType<typeof Markup.button.callback>[] = []

  product.variants.forEach((v, i) => {
    const attrs = Object.values(v.attributes as Record<string, string>).join(', ')
    lines.push(`${i + 1}. ${attrs} — ${fmtPrice(Number(v.price))}`)
    varBtns.push(Markup.button.callback(`✏️ №${i + 1}`, `pricing:man_v:${v.id}`))
  })

  const varRows: ReturnType<typeof Markup.button.callback>[][] = []
  for (let i = 0; i < varBtns.length; i += 3) varRows.push(varBtns.slice(i, i + 3))

  await ctx.reply(
    lines.join('\n'),
    Markup.inlineKeyboard([
      ...varRows,
      [Markup.button.callback('✏️ Все сразу', `pricing:man_all:${product.id}`)],
      [Markup.button.callback('🔙 К списку', 'pricing:manual')],
    ]),
  )
}

// ─── Генерация xlsx прайс-листа ───────────────────────────────────────────────

export async function generatePriceListBuffer(): Promise<Buffer> {
  const variants = await prisma.productVariant.findMany({
    include: { product: true },
    orderBy: [{ product: { name: 'asc' } }, { id: 'asc' }],
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Прайс-лист')

  // A=SKU B=Товар C=Атрибуты D=Текущая цена E=Новая цена F=Комментарий
  ws.columns = [
    { key: 'sku',      width: 25 },
    { key: 'name',     width: 25 },
    { key: 'attrs',    width: 35 },
    { key: 'price',    width: 15 },
    { key: 'newPrice', width: 15 },
    { key: 'comment',  width: 20 },
  ]

  const headerFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B579A' } }
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } }
  const newPriceFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2A3A2A' } }

  const headerRow = ws.addRow(['SKU', 'Товар', 'Атрибуты', 'Текущая цена', 'Новая цена', 'Комментарий'])
  headerRow.eachCell((cell) => { cell.fill = headerFill; cell.font = headerFont })

  // Числовой формат для колонок D и E
  ws.getColumn('price').numFmt = '#,##0'
  ws.getColumn('newPrice').numFmt = '#,##0'

  const altFills = ['FFFFFFFF', 'FFF2F2F2']
  variants.forEach((v, i) => {
    const attrsObj = v.attributes as Record<string, string>
    const attrs = Object.entries(attrsObj)
      .map(([k, val]) => `${k}: ${val}`).join(', ')
    const rowFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: altFills[i % 2] } }
    const row = ws.addRow([v.sku, v.product.name, attrs, Number(v.price), null, ''])
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill = colNum === 5 ? newPriceFill : rowFill
    })
  })

  ws.views = [{ state: 'frozen', ySplit: 1 }]
  const raw = await wb.xlsx.writeBuffer()
  return Buffer.from(raw as ArrayBuffer)
}

// ─── Скачивание файла из Telegram ─────────────────────────────────────────────

export async function downloadTelegramFile(ctx: Context, fileId: string): Promise<Buffer> {
  const file = await ctx.telegram.getFile(fileId)
  const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const safeUrl = url.replace(process.env.BOT_TOKEN ?? '', '[REDACTED]')
    https.get(url, (res) => {
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', (err) => {
        log.error('Pricing download file response error', { error: err.message })
        reject(err)
      })
    }).on('error', (err) => {
      log.error('Pricing download file error', { error: err.message })
      reject(err)
    })
  })
}

// ─── Парсинг загруженного прайс-листа ────────────────────────────────────────

async function parsePriceListXlsx(buffer: Buffer): Promise<{ sku: string; newPrice: number; comment: string }[]> {
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ExcelJS Buffer type mismatch with Node 22
  await wb.xlsx.load(buffer as any)
  // Try sheet named "Прайс-лист", fallback to first sheet
  const ws = wb.getWorksheet('Прайс-лист') ?? wb.worksheets[0]
  if (!ws) return []

  const rows: { sku: string; newPrice: number; comment: string }[] = []
  ws.eachRow((row, n) => {
    if (n === 1) return // skip header
    const sku = String(row.getCell(1).value ?? '').trim()
    if (!sku) return
    const newPriceVal = row.getCell(5).value  // колонка E — Новая цена
    if (!newPriceVal) return
    const newPrice = typeof newPriceVal === 'object' && newPriceVal !== null && 'result' in (newPriceVal as object)
      ? Number((newPriceVal as { result: unknown }).result)
      : Number(newPriceVal)
    if (isNaN(newPrice) || newPrice <= 0) return
    const comment = String(row.getCell(6).value ?? '').trim()  // колонка F — Комментарий
    rows.push({ sku, newPrice, comment })
  })
  return rows
}

// ─── Вспомогательные функции ──────────────────────────────────────────────────

function directionEmoji(d: 'up' | 'down' | 'same'): string {
  if (d === 'up') return '📈'
  if (d === 'down') return '📉'
  return '➡️'
}

function formatChangePercent(pct: string, dir: 'up' | 'down' | 'same'): string {
  if (dir === 'same') return 'без изменений'
  return (dir === 'up' ? '+' : '') + pct + '%'
}

// ─── Определение бренда/категории по модели ──────────────────────────────────

function detectBrand(model: string): string {
  const lower = model.toLowerCase()
  if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('macbook') ||
      lower.includes('airpods') || lower.includes('apple watch') || lower.includes('mac mini') ||
      lower.includes('imac')) return 'Apple'
  if (lower.includes('galaxy') || lower.includes('samsung')) return 'Samsung'
  if (lower.includes('huawei') || lower.includes('pura')) return 'Huawei'
  if (lower.includes('honor')) return 'Honor'
  if (lower.includes('xiaomi') || lower.includes('redmi') || lower.includes('poco')) return 'Xiaomi'
  if (lower.includes('sony') || lower.includes('playstation') || lower.includes('ps5')) return 'Sony'
  if (lower.includes('dyson')) return 'Dyson'
  if (lower.includes('jbl')) return 'JBL'
  if (lower.includes('marshall')) return 'Marshall'
  if (lower.includes('nintendo') || lower.includes('switch')) return 'Nintendo'
  return ''
}

function detectCategory(model: string): string {
  const lower = model.toLowerCase()
  if (lower.includes('iphone') || lower.includes('galaxy s') || lower.includes('galaxy z') ||
      lower.includes('huawei pura') || lower.includes('honor') || lower.includes('pixel')) return 'Телефоны'
  if (lower.includes('macbook') || lower.includes('laptop')) return 'Ноутбуки и компьютеры'
  if (lower.includes('ipad') || lower.includes('tab')) return 'Планшеты'
  if (lower.includes('watch')) return 'Часы'
  if (lower.includes('airpods') || lower.includes('buds') || lower.includes('jbl') ||
      lower.includes('marshall') || lower.includes('headphone')) return 'Аудио'
  if (lower.includes('playstation') || lower.includes('ps5') || lower.includes('xbox') ||
      lower.includes('switch') || lower.includes('nintendo')) return 'Игровые консоли'
  if (lower.includes('dyson')) return 'Бытовая техника'
  return 'Аксессуары'
}

// ─── Кнопки поставщиков ──────────────────────────────────────────────────────

async function getSupplierButtons(): Promise<ReturnType<typeof Markup.button.callback>[][]> {
  const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, take: 6 })
  if (suppliers.length === 0) return []
  return suppliers.map(s => [Markup.button.callback(`🏭 ${s.name}`, `pricing:supplier_select:${s.id}`)])
}

// ─── Обработка прайса поставщика → Google Sheets ─────────────────────────────

async function processSupplierPrice(
  ctx: Context,
  userId: number,
  supplierName: string,
  parsed: ParsedLine[],
): Promise<void> {
  await ctx.reply('⏳ Сопоставляю с каталогом...')

  try {
    // 1. Сопоставить позиции из прайса с товарами в БД
    const { matched, unmatched, ignored } = await matchVariants(parsed)

    // 2. Сохранить закупочные цены в SupplierPrice (история)
    for (const m of matched) {
      try {
        await prisma.supplierPrice.create({
          data: {
            supplierName,
            productName: m.parsed.rawLine,
            variantId: m.variantId,
            model: m.parsed.model,
            storage: m.parsed.storage || null,
            color: m.parsed.color || null,
            price: m.supplierPrice,
            rawMessage: m.parsed.rawLine,
          },
        })
      } catch (err) {
        log.debug('SupplierPrice create skipped', { model: m.parsed.model, error: err instanceof Error ? err.message : String(err) })
      }
    }

    // 3. Показать результат и предложить способ наценки
    const unmatchedLines = unmatched.slice(0, 5).map(u => `  • ${u.rawLine}`).join('\n')
    const unmatchedNote = unmatched.length > 0
      ? `\n\n⚠️ Не найдено (${unmatched.length}):\n${unmatchedLines}${unmatched.length > 5 ? `\n  … и ещё ${unmatched.length - 5}` : ''}`
      : ''
    const ignoredNote = ignored.length > 0 ? `\n🚫 Игнорируется: ${ignored.length}` : ''

    pricingState.set(userId, {
      flow: 'awaiting_markup_or_rules',
      supplierName,
      matches: matched,
      unmatched,
    })

    // Проверим есть ли настроенные правила
    const rules = await loadRules()
    const rulesValid = validateRules(rules)

    const rulesButton = rulesValid.ok
      ? Markup.button.callback('📊 По правилам наценки', 'pricing:apply_rules')
      : Markup.button.callback('📊 Правила (⚠️ не настроены)', 'pricing:rules')

    await ctx.reply(
      [
        `✅ Прайс «${supplierName}» обработан:`,
        `📦 Найдено в каталоге: ${matched.length} из ${parsed.length}`,
        unmatchedNote,
        ignoredNote,
        '',
        'Выберите способ расчёта рекомендованных цен:',
      ].filter(s => s !== undefined && s !== '').join('\n'),
      Markup.inlineKeyboard([
        [rulesButton],
        [Markup.button.callback('📈 Разовый %', 'pricing:apply_pct_input')],
        ...(unmatched.length > 0 ? [[
          Markup.button.callback('🆕 Создать новые (' + unmatched.length + ')', 'pricing:create_new'),
        ]] : []),
        [Markup.button.callback('❌ Отмена', 'pricing:cancel')],
      ]),
    )
  } catch (err) {
    log.error('Pricing process supplier price error', { error: err instanceof Error ? err.message : String(err) })
    await ctx.reply('❌ Ошибка обработки прайса: ' + (err instanceof Error ? err.message : 'Неизвестная ошибка'))
    pricingState.delete(userId)
  }
}

// ─── Мастер создания товара из прайса: helpers ──────────────────────────────
// detectBrandFromName/detectCategoryFromName переехали в lib/product-from-price
// (нужны и веб-заведению из очереди «не узнал») — импорт в шапке файла.

async function showCreateCard(ctx: Context, userId: number, items: ParsedLine[], index: number, supplierName: string): Promise<void> {
  if (index >= items.length) {
    await ctx.reply('✅ Все позиции обработаны.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Меню цен', 'pricing:menu')]]))
    pricingState.delete(userId)
    return
  }

  const p = items[index]!
  const brand = detectBrandFromName(p.model)
  const category = detectCategoryFromName(p.model)
  const rules = await loadRules()
  const retailPrice = rules.length > 0 ? applyMarkupRules(p.price, rules) : p.price
  const DEFAULT_QTY = parseInt(process.env.DEFAULT_STOCK_QTY || '3', 10)

  const draft: QuickProductDraft = {
    name: p.model + (p.storage ? ' ' + p.storage : '') + (p.color ? ' ' + p.color : ''),
    brand,
    category,
    color: p.color || null,
    memory: p.storage || null,
    country: null,
    costPrice: p.price,
    retailPrice,
    quantity: DEFAULT_QTY,
  }

  pricingState.set(userId, {
    flow: 'create_from_price',
    items,
    currentIndex: index,
    supplierName,
    draft,
  })

  const catDisplay = draft.category || '⚠️ не определена'
  const lines = [
    `🆕 Новый товар (${index + 1} из ${items.length})`,
    '',
    '📝 Название: ' + draft.name,
    '🏷 Бренд: ' + (draft.brand || '⚠️ не определён'),
    '📦 Категория: ' + catDisplay,
    '🎨 Цвет: ' + (draft.color || '—'),
    '💾 Память: ' + (draft.memory || '—'),
    '💵 Закупка: ' + draft.costPrice.toLocaleString('ru-RU') + ' ₽',
    '💰 Рекомендованная: ' + draft.retailPrice.toLocaleString('ru-RU') + ' ₽',
    '📊 Кол-во: ' + draft.quantity + ' шт',
    '',
    'Что исправить?',
  ]

  await ctx.reply(lines.join('\n'), Markup.inlineKeyboard([
    [
      Markup.button.callback('📦 Категория', 'pricing:qc_category'),
      Markup.button.callback('📊 Кол-во', 'pricing:qc_qty'),
    ],
    [
      Markup.button.callback('✅ Создать', 'pricing:qc_confirm'),
      Markup.button.callback('🔍 Найти', 'pricing:qc_search'),
    ],
    [
      Markup.button.callback('⏭ Пропустить', 'pricing:qc_skip'),
    ],
    [
      Markup.button.callback('🚫 Игнорировать всегда', 'pricing:qc_ignore'),
      Markup.button.callback('❌ Отмена', 'pricing:cancel'),
    ],
  ]))
}

// ─── Регистрация обработчиков ─────────────────────────────────────────────────

export function setupPricingHandlers(bot: Telegraf): void {

  // ── Навигация ──────────────────────────────────────────────────────────────

  bot.action('pricing:menu', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    pricingState.delete(getUserId(ctx))
    await showPricingMenu(ctx)
  })

  bot.action('pricing:cancel', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    pricingState.delete(getUserId(ctx))
    await showPricingMenu(ctx)
  })

  bot.action('pricing:history', async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Загрузка...') } catch { /* ignore: answerCbQuery may fail if query expired */ }
    await showHistory(ctx)
  })

  // ── Из сообщения ───────────────────────────────────────────────────────────

  bot.action('pricing:msg', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    pricingState.set(getUserId(ctx), { flow: 'awaiting_message' })
    await ctx.reply(
      'Перешлите сообщение от поставщика или вставьте текст с ценами.\n\n' +
      'Формат:\niPhone 17 Pro 256 Silver - 122.000₽\niPhone 16 256 Black - 68.500₽',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:cancel')]]),
    )
  })

  // ── Выбор поставщика ────────────────────────────────────────────────────

  bot.action(/^pricing:supplier_select:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'awaiting_supplier_name') return

    const supplierId = parseInt((ctx.match as RegExpMatchArray)[1]!, 10)
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } })
    if (!supplier) return

    await processSupplierPrice(ctx, userId, supplier.name, state.parsed)
  })

  bot.action('pricing:supplier_manual', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    await ctx.reply('Введите имя поставщика:')
  })

  // ── Применить правила наценки к прайсу поставщика ───────────────────────

  bot.action('pricing:apply_rules', async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Рассчитываю...') } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'awaiting_markup_or_rules') return

    const rules = await loadRules()

    const pending: PendingVariant[] = state.matches.map(m => {
      const newPrice = applyMarkupRules(m.supplierPrice, rules)
      const p = m.parsed
      const attsParts = [p.storage ? p.storage + ' ГБ' : null, p.color].filter(Boolean)
      return {
        variantId: m.variantId, productId: m.productId, productName: m.productName,
        brand: m.brand, categoryId: m.categoryId, variantSku: m.variantSku,
        attrs: attsParts.join(', '),
        currentPrice: m.currentPrice, newPrice,
        costPrice: m.supplierPrice,  // закупочная — для записи costPrice в БД при apply
      }
    })

    pricingState.set(userId, {
      flow: 'preview',
      source: 'message',
      markup: null,
      label: 'По правилам наценки (' + state.supplierName + ')',
      pendingVariants: pending,
      excludedVariantIds: [],
    })

    await showPreview(ctx, userId)
  })

  // ── Разовый % — ввод процента ──────────────────────────────────────────

  bot.action('pricing:apply_pct_input', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'awaiting_markup_or_rules') return

    // Переключаемся на flow с выбором %
    pricingState.set(userId, {
      flow: 'awaiting_markup',
      matches: state.matches,
      unmatched: state.unmatched,
    })

    await ctx.reply(
      'Введите процент наценки или выберите:',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('3%', 'pricing:pct:3'),
          Markup.button.callback('5%', 'pricing:pct:5'),
          Markup.button.callback('7%', 'pricing:pct:7'),
          Markup.button.callback('10%', 'pricing:pct:10'),
        ],
        [Markup.button.callback('❌ Отмена', 'pricing:cancel')],
      ]),
    )
  })

  // ── Быстрые кнопки % ──────────────────────────────────────────────────

  bot.action(/^pricing:pct:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'awaiting_markup') return

    const markup = parseInt((ctx.match as RegExpMatchArray)[1]!, 10)
    const pending = buildPendingFromMatches(state.matches, markup, state.rate ?? null)
    // Добавить costPrice в comment для записи в БД при apply
    for (let i = 0; i < pending.length; i++) {
      const m = state.matches[i]
      if (m) pending[i]!.costPrice = m.supplierPrice
    }

    pricingState.set(userId, {
      flow: 'preview',
      source: 'message',
      markup,
      label: markup + '% (' + (state.matches[0]?.productName || 'поставщик') + ')',
      pendingVariants: pending,
      excludedVariantIds: [],
    })

    await showPreview(ctx, userId)
  })

  // ── Мастер создания новых товаров ──────────────────────────────────────

  bot.action('pricing:create_new', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'awaiting_markup_or_rules') return

    if (state.unmatched.length === 0) {
      await ctx.reply('Все позиции уже найдены в каталоге.')
      return
    }

    await ctx.reply(
      `🆕 Создание ${state.unmatched.length} новых товаров\n\nВыберите режим:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📋 По одному (с подтверждением)', 'pricing:create_one_by_one')],
        [Markup.button.callback('🚀 Создать все сразу (AI угадает категории)', 'pricing:create_all_bulk')],
        [Markup.button.callback('🔙 Назад', 'pricing:cancel')],
      ]),
    )
  })

  bot.action('pricing:create_one_by_one', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'awaiting_markup_or_rules') return

    await showCreateCard(ctx, userId, state.unmatched, 0, state.supplierName)
  })

  // ── Мастер создания: выбор категории ──────────────────────────────────

  bot.action('pricing:qc_category', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'create_from_price') return

    const cats = await prisma.category.findMany({ orderBy: { name: 'asc' } })
    const buttons = cats.map(c => [
      Markup.button.callback(c.name, 'pricing:qc_cat_set:' + c.id),
    ])
    buttons.push([Markup.button.callback('🔙 К карточке', 'pricing:qc_back')])

    await ctx.reply('Выберите категорию:', Markup.inlineKeyboard(buttons))
  })

  bot.action(/^pricing:qc_cat_set:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'create_from_price') return

    const catId = parseInt((ctx.match as RegExpMatchArray)[1]!, 10)
    const cat = await prisma.category.findUnique({ where: { id: catId } })
    if (cat) state.draft.category = cat.name

    await showCreateCard(ctx, userId, state.items, state.currentIndex, state.supplierName)
  })

  bot.action('pricing:qc_back', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (
      !state ||
      (state.flow !== 'create_from_price' &&
        state.flow !== 'create_from_price_qty' &&
        state.flow !== 'create_from_price_search')
    ) return
    await showCreateCard(ctx, userId, state.items, state.currentIndex, state.supplierName)
  })

  // ── Мастер создания: ввод количества ──────────────────────────────────

  bot.action('pricing:qc_qty', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'create_from_price') return
    await ctx.reply('Введите количество:',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 К карточке', 'pricing:qc_back')]]))
    pricingState.set(userId, {
      flow: 'create_from_price_qty',
      items: state.items,
      currentIndex: state.currentIndex,
      supplierName: state.supplierName,
      draft: state.draft,
    })
  })

  // ── Мастер создания: подтверждение ────────────────────────────────────

  bot.action('pricing:qc_confirm', async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Создаю...') } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'create_from_price') return

    const d = state.draft
    if (!d.category) {
      await ctx.reply('⚠️ Укажите категорию перед созданием.',
        Markup.inlineKeyboard([[Markup.button.callback('📦 Категория', 'pricing:qc_category')]]))
      return
    }

    try {
      const category = await prisma.category.upsert({
        where: { name: d.category },
        create: { name: d.category },
        update: {},
      })

      const catNum = String(category.id).padStart(2, '0')
      const productSku = catNum + '-' + Date.now().toString(36).slice(-4) + '-' + Math.random().toString(36).slice(-3)
      const variantSku = productSku + '-' + Math.random().toString(36).slice(-3)

      const attrs: Record<string, string> = {}
      if (d.color) attrs['Цвет'] = d.color
      if (d.memory) attrs['Память'] = d.memory

      const { Decimal } = await import('@prisma/client/runtime/client')

      const product = await prisma.product.create({
        data: {
          sku: productSku,
          name: d.name,
          brand: d.brand || null,
          categoryId: category.id,
          price: new Decimal(d.retailPrice),
          stock: d.quantity,
          quantity: d.quantity,
          isAvailable: d.quantity > 0,
          attributes: Object.keys(attrs).length > 0
            ? Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, [v]]))
            : {},
          photos: [],
        },
      })

      await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: variantSku,
          price: new Decimal(d.retailPrice),
          costPrice: new Decimal(d.costPrice),
          lastSyncedCostPrice: new Decimal(d.costPrice),
          quantity: d.quantity,
          inStock: d.quantity > 0,
          attributes: { ...attrs, fullName: d.name },
          photos: [],
        },
      })

      const aliasKey = d.name.trim().toLowerCase()
      await prisma.priceAlias.upsert({
        where: { alias: aliasKey },
        create: { alias: aliasKey, productId: product.id },
        update: { productId: product.id, isIgnored: false },
      }).catch(() => {})

      await ctx.reply('✅ Товар создан: ' + d.name + ' (' + d.category + ')')

      await showCreateCard(ctx, userId, state.items, state.currentIndex + 1, state.supplierName)
    } catch (err) {
      log.error('Quick create product error', { error: err instanceof Error ? err.message : String(err) })
      await ctx.reply('❌ Ошибка: ' + (err instanceof Error ? err.message : 'Неизвестная ошибка'))
    }
  })

  // ── Мастер создания: пропустить ───────────────────────────────────────

  bot.action('pricing:qc_skip', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'create_from_price') return
    await showCreateCard(ctx, userId, state.items, state.currentIndex + 1, state.supplierName)
  })

  // ── Мастер создания: игнорировать всегда ──────────────────────────────

  bot.action('pricing:qc_ignore', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'create_from_price') return

    const p = state.items[state.currentIndex]
    if (p) {
      const aliasKey = p.rawLine.trim().toLowerCase()
      await prisma.priceAlias.upsert({
        where: { alias: aliasKey },
        create: { alias: aliasKey, isIgnored: true },
        update: { isIgnored: true, productId: null, variantId: null },
      }).catch(() => {})
      await ctx.reply('🚫 «' + p.rawLine.slice(0, 50) + '» будет игнорироваться.')
    }

    await showCreateCard(ctx, userId, state.items, state.currentIndex + 1, state.supplierName)
  })

  // ── Мастер создания: поиск существующего товара ───────────────────────

  bot.action('pricing:qc_search', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'create_from_price') return

    const p = state.items[state.currentIndex]
    if (!p) return

    const candidates = await prisma.product.findMany({
      where: { name: { contains: p.model.split(' ').slice(0, 2).join(' '), mode: 'insensitive' } },
      take: 8,
      orderBy: { name: 'asc' },
      include: { category: true },
    })

    if (candidates.length === 0) {
      await ctx.reply('🔍 Ничего не найдено по «' + p.model + '». Введите поисковый запрос:')
      pricingState.set(userId, {
        flow: 'create_from_price_search',
        items: state.items,
        currentIndex: state.currentIndex,
        supplierName: state.supplierName,
        draft: state.draft,
      })
      return
    }

    const buttons = candidates.map(c => [
      Markup.button.callback(
        (c.name + (c.category ? ' [' + c.category.name + ']' : '')).slice(0, 64),
        'pricing:qc_link:' + c.id,
      ),
    ])
    buttons.push([Markup.button.callback('🔙 К карточке', 'pricing:qc_back')])

    await ctx.reply('🔍 Найдено. Выберите товар для привязки:', Markup.inlineKeyboard(buttons))
  })

  bot.action(/^pricing:qc_link:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || (state.flow !== 'create_from_price' && state.flow !== 'create_from_price_search')) return

    const productId = parseInt((ctx.match as RegExpMatchArray)[1]!, 10)
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) { await ctx.reply('Товар не найден.'); return }

    const p = state.items[state.currentIndex]
    if (!p) return

    const aliasKey = p.rawLine.trim().toLowerCase()
    await prisma.priceAlias.upsert({
      where: { alias: aliasKey },
      create: { alias: aliasKey, productId: product.id },
      update: { productId: product.id, isIgnored: false },
    }).catch(() => {})

    await ctx.reply('✅ Привязано: «' + p.model + '» → ' + product.name + '\nАлиас сохранён — в следующий раз сматчится автоматически.')

    await showCreateCard(ctx, userId, state.items, state.currentIndex + 1, state.supplierName)
  })

  // ── Массовое создание всех новых ──────────────────────────────────────

  bot.action('pricing:create_all_bulk', async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Создаю...') } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'awaiting_markup_or_rules') return

    const rules = await loadRules()
    const DEFAULT_QTY = parseInt(process.env.DEFAULT_STOCK_QTY || '3', 10)
    let created = 0
    let errors = 0

    const { Decimal } = await import('@prisma/client/runtime/client')

    for (const p of state.unmatched) {
      try {
        const brand = detectBrandFromName(p.model)
        const catName = detectCategoryFromName(p.model) || 'Другое'
        const retailPrice = rules.length > 0 ? applyMarkupRules(p.price, rules) : p.price

        const category = await prisma.category.upsert({
          where: { name: catName },
          create: { name: catName },
          update: {},
        })

        const catNum = String(category.id).padStart(2, '0')
        const productSku = catNum + '-' + Date.now().toString(36).slice(-4) + '-' + Math.random().toString(36).slice(-3)
        const variantSku = productSku + '-' + Math.random().toString(36).slice(-3)

        const name = p.model + (p.storage ? ' ' + p.storage : '') + (p.color ? ' ' + p.color : '')
        const attrs: Record<string, string> = {}
        if (p.color) attrs['Цвет'] = p.color
        if (p.storage) attrs['Память'] = p.storage

        const product = await prisma.product.create({
          data: {
            sku: productSku,
            name,
            brand: brand || null,
            categoryId: category.id,
            price: new Decimal(retailPrice),
            stock: DEFAULT_QTY,
            quantity: DEFAULT_QTY,
            isAvailable: true,
            attributes: Object.keys(attrs).length > 0
              ? Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, [v]]))
              : {},
            photos: [],
          },
        })

        await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: variantSku,
            price: new Decimal(retailPrice),
            costPrice: new Decimal(p.price),
            lastSyncedCostPrice: new Decimal(p.price),
            quantity: DEFAULT_QTY,
            inStock: true,
            attributes: { ...attrs, fullName: name },
            photos: [],
          },
        })

        await prisma.priceAlias.upsert({
          where: { alias: name.trim().toLowerCase() },
          create: { alias: name.trim().toLowerCase(), productId: product.id },
          update: { productId: product.id, isIgnored: false },
        }).catch(() => {})

        created++
      } catch (err) {
        log.error('Bulk create error', { model: p.model, error: err instanceof Error ? err.message : String(err) })
        errors++
      }
    }

    pricingState.delete(userId)
    await ctx.reply(
      [
        '✅ Массовое создание завершено:',
        '📦 Создано: ' + created,
        errors > 0 ? '❌ Ошибок: ' + errors : '',
        '🤖 Категории определены автоматически по AI-эвристике.',
        'Проверьте категории в 📦 Товароучёт → по категориям.',
      ].filter(Boolean).join('\n'),
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Меню цен', 'pricing:menu')]]),
    )
  })

  // ── Курс доллара ──────────────────────────────────────────────────────────

  bot.action('pricing:rate', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }

    const usdRate = await prisma.currencyRate.findUnique({ where: { currency: 'USD' } })
    const currentRate = usdRate ? Number(usdRate.rate) : 0
    const previousRate = usdRate?.previousRate ? Number(usdRate.previousRate) : currentRate

    const changePercent = previousRate > 0
      ? (((currentRate - previousRate) / previousRate) * 100).toFixed(2)
      : '0.00'
    const direction = currentRate > previousRate ? '📈' : currentRate < previousRate ? '📉' : '➡️'

    const lines = [
      '💱 Курс доллара',
      '',
      `🇺🇸 USD: ${currentRate.toFixed(2)}₽`,
      previousRate !== currentRate
        ? `Изменение: ${direction} ${changePercent}% (было ${previousRate.toFixed(2)}₽)`
        : 'Без изменений',
    ]

    await ctx.reply(
      lines.join('\n'),
      Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Обновить курс с ЦБ', 'pricing:usd_refresh')],
        ...(currentRate !== previousRate
          ? [[Markup.button.callback(`📊 Скорректировать цены (${changePercent}%)`, 'pricing:usd_adjust')]]
          : []),
        [Markup.button.callback('🔙 Назад', 'pricing:menu')],
      ]),
    )
  })

  bot.action('pricing:usd_refresh', async (ctx) => {
    try { await ctx.answerCbQuery('⏳') } catch { /* ignore: answerCbQuery may fail if query expired */ }
    try {
      const rates = await fetchCurrencyRates()
      const usdRate = rates['USD']
      if (!usdRate) {
        await ctx.reply('❌ Не удалось получить курс USD с ЦБ РФ')
        return
      }

      const existing = await prisma.currencyRate.findUnique({ where: { currency: 'USD' } })
      await prisma.currencyRate.upsert({
        where: { currency: 'USD' },
        create: { currency: 'USD', rate: usdRate },
        update: { previousRate: existing?.rate ?? usdRate, rate: usdRate },
      })

      await ctx.reply(`✅ Курс USD обновлён: ${usdRate.toFixed(2)}₽`)
    } catch {
      await ctx.reply('❌ Ошибка при получении курса')
    }
  })

  bot.action('pricing:usd_adjust', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)

    const usdRate = await prisma.currencyRate.findUnique({ where: { currency: 'USD' } })
    if (!usdRate || !usdRate.previousRate) {
      await ctx.reply('Нет данных об изменении курса.')
      return
    }

    const current = Number(usdRate.rate)
    const previous = Number(usdRate.previousRate)
    const changePct = ((current - previous) / previous) * 100

    // Получить все варианты с ценой > 0
    const variants = await prisma.productVariant.findMany({
      where: { price: { gt: 0 } },
      include: { product: true },
    })

    // Построить список изменений
    const pending: PendingVariant[] = variants.map(v => ({
      variantId: v.id,
      productId: v.productId,
      productName: v.product.name,
      brand: v.product.brand ?? undefined,
      categoryId: v.product.categoryId ?? undefined,
      variantSku: v.sku,
      attrs: Object.entries(v.attributes as Record<string, string>).map(([k, val]) => `${k}: ${val}`).join(', '),
      currentPrice: Number(v.price),
      newPrice: roundPrice(Number(v.price) * (1 + changePct / 100)),
    })).filter(v => v.newPrice !== v.currentPrice)

    if (!pending.length) {
      await ctx.reply('Нет вариантов для обновления (цены не изменились после округления).')
      return
    }

    // Показать превью (первые 20 позиций)
    const preview = pending.slice(0, 20)
    const lines = [
      `📊 Корректировка цен: ${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%`,
      `Затронуто: ${pending.length} вариантов\n`,
      ...preview.map(p => `${p.variantSku}: ${p.currentPrice.toLocaleString('ru-RU')}₽ → ${p.newPrice.toLocaleString('ru-RU')}₽`),
      pending.length > 20 ? `\n...и ещё ${pending.length - 20} позиций` : '',
    ]

    pricingState.set(userId, {
      flow: 'preview',
      source: 'currency_update',
      markup: null,
      label: `курс USD ${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%`,
      pendingVariants: pending,
      excludedVariantIds: [],
    })

    await ctx.reply(
      lines.join('\n'),
      Markup.inlineKeyboard([
        [Markup.button.callback('🔽 Исключить позиции', 'pricing:exclude')],
        [
          Markup.button.callback('✅ Применить', 'pricing:apply'),
          Markup.button.callback('❌ Отмена', 'pricing:cancel'),
        ],
      ]),
    )
  })

  // Из уведомления о курсах → корректировка
  bot.action('pricing:cadj_from_notify', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    if (!lastCurrencyChanges.length) {
      await ctx.reply('Нет данных об изменениях курсов. Нажмите «🔄 Обновить курс с ЦБ».',
        Markup.inlineKeyboard([[Markup.button.callback('💰 Меню цен', 'pricing:menu')]]))
      return
    }
    // Redirect to usd_adjust
    await ctx.callbackQuery
    // Simulate pricing:usd_adjust
    const userId = getUserId(ctx)
    const usdRate = await prisma.currencyRate.findUnique({ where: { currency: 'USD' } })
    if (!usdRate || !usdRate.previousRate) {
      await ctx.reply('Нет данных об изменении курса.')
      return
    }

    const current = Number(usdRate.rate)
    const previous = Number(usdRate.previousRate)
    const changePct = ((current - previous) / previous) * 100

    const variants = await prisma.productVariant.findMany({
      where: { price: { gt: 0 } },
      include: { product: true },
    })

    const pending: PendingVariant[] = variants.map(v => ({
      variantId: v.id,
      productId: v.productId,
      productName: v.product.name,
      brand: v.product.brand ?? undefined,
      categoryId: v.product.categoryId ?? undefined,
      variantSku: v.sku,
      attrs: Object.entries(v.attributes as Record<string, string>).map(([k, val]) => `${k}: ${val}`).join(', '),
      currentPrice: Number(v.price),
      newPrice: roundPrice(Number(v.price) * (1 + changePct / 100)),
    })).filter(v => v.newPrice !== v.currentPrice)

    if (!pending.length) {
      await ctx.reply('Нет вариантов для обновления.')
      return
    }

    pricingState.set(userId, {
      flow: 'preview',
      source: 'currency_update',
      markup: null,
      label: `курс USD ${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%`,
      pendingVariants: pending,
      excludedVariantIds: [],
    })

    const preview = pending.slice(0, 20)
    const lines = [
      `📊 Корректировка цен: ${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%`,
      `Затронуто: ${pending.length} вариантов\n`,
      ...preview.map(p => `${p.variantSku}: ${p.currentPrice.toLocaleString('ru-RU')}₽ → ${p.newPrice.toLocaleString('ru-RU')}₽`),
      pending.length > 20 ? `\n...и ещё ${pending.length - 20} позиций` : '',
    ]

    await ctx.reply(
      lines.join('\n'),
      Markup.inlineKeyboard([
        [Markup.button.callback('🔽 Исключить позиции', 'pricing:exclude')],
        [
          Markup.button.callback('✅ Применить', 'pricing:apply'),
          Markup.button.callback('❌ Отмена', 'pricing:cancel'),
        ],
      ]),
    )
  })

  // ── Из файла Excel ─────────────────────────────────────────────────────────

  bot.action('pricing:file', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    await ctx.reply(
      '📊 Обновление цен из файла Excel',
      Markup.inlineKeyboard([
        [Markup.button.callback('📥 Скачать прайс-лист', 'pricing:file_dl')],
        [Markup.button.callback('📤 Загрузить обновлённый', 'pricing:file_ul')],
        [Markup.button.callback('🔙 Назад', 'pricing:menu')],
      ]),
    )
  })

  bot.action('pricing:file_dl', async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Генерирую...') } catch { /* ignore: answerCbQuery may fail if query expired */ }
    await ctx.reply('⏳ Формирую прайс-лист…')
    try {
      const port = process.env.API_PORT ?? '3000'
      const response = await fetch(`http://localhost:${port}/api/download/price-list`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      const today = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')
      await ctx.replyWithDocument(
        { source: buffer, filename: `price-list-${today}.xlsx` },
        { caption: '📊 Прайс-лист с текущими ценами\n\nЗаполни колонку «Новая цена» и загрузи обратно.' },
      )
    } catch {
      await ctx.reply('❌ Ошибка при генерации файла.')
    }
  })

  bot.action('pricing:file_ul', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    pricingState.set(getUserId(ctx), { flow: 'awaiting_file' })
    await ctx.reply(
      'Загрузите заполненный файл прайс-листа (xlsx).\nЗаполните только колонку «Новая цена».',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:cancel')]]),
    )
  })

  // ── Точечное редактирование ────────────────────────────────────────────────

  bot.action('pricing:manual', async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Загрузка...') } catch { /* ignore: answerCbQuery may fail if query expired */ }
    await showManualProductList(ctx, getUserId(ctx), 0)
  })

  bot.action(/^pricing:man_page:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const page = parseInt(ctx.match[1]!, 10)
    await showManualProductList(ctx, getUserId(ctx), page)
  })

  bot.action(/^pricing:man_prod:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Загрузка...') } catch { /* ignore: answerCbQuery may fail if query expired */ }
    await showManualVariantList(ctx, getUserId(ctx), parseInt(ctx.match[1]!, 10))
  })

  bot.action(/^pricing:man_v:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const variantId = parseInt(ctx.match[1]!, 10)
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true },
    })
    if (!variant) return await ctx.reply('Вариант не найден.')
    const attrs = Object.values(variant.attributes as Record<string, string>).join(', ')
    pricingState.set(userId, {
      flow: 'manual_price_input',
      variantId: variant.id,
      variantSku: variant.sku,
      productName: variant.product.name,
      attrs,
      currentPrice: Number(variant.price),
    })
    return await ctx.reply(
      `Введите новую цену для ${variant.product.name} (${attrs})\nТекущая цена: ${fmtPrice(Number(variant.price))}:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:cancel')]]),
    )
  })

  bot.action(/^pricing:man_all:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const productId = parseInt(ctx.match[1]!, 10)
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return await ctx.reply('Товар не найден.')
    pricingState.set(userId, {
      flow: 'manual_all_price',
      productId: product.id,
      productName: product.name,
    })
    return await ctx.reply(
      `Введите новую цену — применится ко всем вариантам «${product.name}»:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:cancel')]]),
    )
  })

  // ── Массовая наценка (bulk) ────────────────────────────────────────────────

  bot.action('pricing:bulk', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    await ctx.reply(
      '📈 Массовая наценка — применить к:',
      Markup.inlineKeyboard([
        [Markup.button.callback('📦 Всем вариантам', 'pricing:bulk_all')],
        [Markup.button.callback('🗂️ По категории', 'pricing:bulk_cats')],
        [Markup.button.callback('❌ Отмена', 'pricing:menu')],
      ]),
    )
  })

  bot.action('pricing:bulk_all', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    pricingState.set(getUserId(ctx), { flow: 'bulk_pct', filterType: 'all', filterValue: '', filterLabel: 'все варианты' })
    await ctx.reply(
      'Введите процент наценки (например: 5 или 10):',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:cancel')]]),
    )
  })

  bot.action('pricing:bulk_cats', async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Загрузка...') } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const cats = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    })
    if (!cats.length) return await ctx.reply('Категории не найдены.')
    const rows = cats.map((c) => [
      Markup.button.callback(`${c.name} (${c._count.products})`, `pricing:bulk_cat:${c.id}`),
    ])
    rows.push([Markup.button.callback('❌ Отмена', 'pricing:menu')])
    return await ctx.reply('Выберите категорию:', Markup.inlineKeyboard(rows))
  })

  bot.action(/^pricing:bulk_cat:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const cat = await prisma.category.findUnique({ where: { id: parseInt(ctx.match[1]!, 10) } })
    if (!cat) return await ctx.reply('Категория не найдена.')
    pricingState.set(getUserId(ctx), {
      flow: 'bulk_pct',
      filterType: 'category',
      filterValue: cat.name,
      filterLabel: `категория «${cat.name}»`,
    })
    return await ctx.reply(
      `Категория «${cat.name}». Введите процент наценки:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:cancel')]]),
    )
  })

  // ── Универсальный предпросмотр ─────────────────────────────────────────────

  bot.action('pricing:preview', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    await showPreview(ctx, getUserId(ctx))
  })

  bot.action('pricing:apply', async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Применяю...') } catch { /* ignore: answerCbQuery may fail if query expired */ }
    await applyChanges(ctx, getUserId(ctx))
  })

  bot.action('pricing:exclude', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    await showExcludeMenu(ctx, getUserId(ctx))
  })

  // ── Фильтры исключений ─────────────────────────────────────────────────────

  bot.action('pricing:excl_60m', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'preview') return

    const since = new Date(Date.now() - 60 * 60 * 1000)
    const recent = await prisma.priceChange.findMany({
      where: { createdAt: { gte: since } },
      select: { variantId: true },
      distinct: ['variantId'],
    })
    const ids = new Set(recent.map((r) => r.variantId))
    const toExclude = state.pendingVariants.filter((v) => ids.has(v.variantId)).map((v) => v.variantId)
    const newExcluded = [...new Set([...state.excludedVariantIds, ...toExclude])]
    pricingState.set(userId, { ...state, excludedVariantIds: newExcluded })
    const added = newExcluded.length - state.excludedVariantIds.length
    await ctx.reply(`✅ Исключено ${added} вариантов (изменены за последний час)`)
    await showExcludeMenu(ctx, userId)
  })

  bot.action('pricing:excl_today', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'preview') return

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const recent = await prisma.priceChange.findMany({
      where: { createdAt: { gte: today } },
      select: { variantId: true },
      distinct: ['variantId'],
    })
    const ids = new Set(recent.map((r) => r.variantId))
    const toExclude = state.pendingVariants.filter((v) => ids.has(v.variantId)).map((v) => v.variantId)
    const newExcluded = [...new Set([...state.excludedVariantIds, ...toExclude])]
    pricingState.set(userId, { ...state, excludedVariantIds: newExcluded })
    const added = newExcluded.length - state.excludedVariantIds.length
    await ctx.reply(`✅ Исключено ${added} вариантов (изменены сегодня)`)
    await showExcludeMenu(ctx, userId)
  })

  bot.action('pricing:excl_brands', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const state = pricingState.get(getUserId(ctx))
    if (!state || state.flow !== 'preview') return
    const active = state.pendingVariants.filter((v) => !state.excludedVariantIds.includes(v.variantId))
    const brands = [...new Set(active.filter((v) => v.brand).map((v) => v.brand!))]
    if (!brands.length) { await ctx.reply('Бренды не определены в текущем списке.'); return }
    const rows = brands.map((b) => [
      Markup.button.callback(b.slice(0, 40), `pricing:excl_b:${b.slice(0, 40)}`),
    ])
    rows.push([Markup.button.callback('🔙 Назад', 'pricing:exclude')])
    await ctx.reply('Исключить бренд:', Markup.inlineKeyboard(rows))
  })

  bot.action(/^pricing:excl_b:(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const brand = ctx.match[1]
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'preview') return
    const toExclude = state.pendingVariants
      .filter((v) => !state.excludedVariantIds.includes(v.variantId) && v.brand?.slice(0, 40) === brand)
      .map((v) => v.variantId)
    const newExcluded = [...new Set([...state.excludedVariantIds, ...toExclude])]
    pricingState.set(userId, { ...state, excludedVariantIds: newExcluded })
    await ctx.reply(`✅ Исключено ${toExclude.length} вариантов бренда «${brand}»`)
    await showExcludeMenu(ctx, userId)
  })

  bot.action('pricing:excl_cats', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const state = pricingState.get(getUserId(ctx))
    if (!state || state.flow !== 'preview') return
    const active = state.pendingVariants.filter((v) => !state.excludedVariantIds.includes(v.variantId))
    const catIds = [...new Set(active.filter((v) => v.categoryId).map((v) => v.categoryId!))]
    if (!catIds.length) { await ctx.reply('Категории не определены.'); return }
    const cats = await prisma.category.findMany({ where: { id: { in: catIds } } })
    const rows = cats.map((c) => [
      Markup.button.callback(c.name, `pricing:excl_c:${c.id}`),
    ])
    rows.push([Markup.button.callback('🔙 Назад', 'pricing:exclude')])
    await ctx.reply('Исключить категорию:', Markup.inlineKeyboard(rows))
  })

  bot.action(/^pricing:excl_c:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const catId = parseInt(ctx.match[1]!, 10)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'preview') return
    const toExclude = state.pendingVariants
      .filter((v) => !state.excludedVariantIds.includes(v.variantId) && v.categoryId === catId)
      .map((v) => v.variantId)
    const newExcluded = [...new Set([...state.excludedVariantIds, ...toExclude])]
    pricingState.set(userId, { ...state, excludedVariantIds: newExcluded })
    await ctx.reply(`✅ Исключено ${toExclude.length} вариантов по категории`)
    await showExcludeMenu(ctx, userId)
  })

  bot.action('pricing:excl_prods', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const state = pricingState.get(getUserId(ctx))
    if (!state || state.flow !== 'preview') return
    const active = state.pendingVariants.filter((v) => !state.excludedVariantIds.includes(v.variantId))
    const seen = new Map<number, string>()
    active.forEach((v) => { if (!seen.has(v.productId)) seen.set(v.productId, v.productName) })
    if (!seen.size) { await ctx.reply('Нет товаров.'); return }
    const rows = [...seen.entries()].slice(0, 20).map(([id, name]) => [
      Markup.button.callback(name.slice(0, 40), `pricing:excl_p:${id}`),
    ])
    rows.push([Markup.button.callback('🔙 Назад', 'pricing:exclude')])
    await ctx.reply('Исключить товар:', Markup.inlineKeyboard(rows))
  })

  bot.action(/^pricing:excl_p:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const productId = parseInt(ctx.match[1]!, 10)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'preview') return
    const toExclude = state.pendingVariants
      .filter((v) => !state.excludedVariantIds.includes(v.variantId) && v.productId === productId)
      .map((v) => v.variantId)
    const newExcluded = [...new Set([...state.excludedVariantIds, ...toExclude])]
    pricingState.set(userId, { ...state, excludedVariantIds: newExcluded })
    await ctx.reply(`✅ Исключено ${toExclude.length} вариантов товара`)
    await showExcludeMenu(ctx, userId)
  })

  // ── 📊 Правила наценки ──────────────────────────────────────────────────

  bot.action('pricing:rules', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const rules = await loadRules()
    const validation = validateRules(rules)

    const lines = ['📊 Правила наценки\n']
    if (rules.length === 0) {
      lines.push('Правил пока нет. Добавьте первое правило.')
    } else {
      rules.forEach((r, i) => lines.push(formatRule(r, i)))
      lines.push('')
      lines.push(validation.ok ? '✅ Покрытие полное' : `⚠️ ${validation.error}`)
    }

    await ctx.reply(lines.join('\n'), Markup.inlineKeyboard([
      [Markup.button.callback('➕ Добавить', 'pricing:rules_add')],
      [Markup.button.callback('✏️ Изменить', 'pricing:rules_edit'), Markup.button.callback('🗑 Удалить', 'pricing:rules_del')],
      [Markup.button.callback('🧪 Тест', 'pricing:rules_test')],
      [Markup.button.callback('🔙 Меню цен', 'pricing:menu')],
    ]))
  })

  // ── Добавление правила: шаг 1 — минимальная цена ──────────────────────

  bot.action('pricing:rules_add', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)

    // Подсказка: если правил нет, первое должно начинаться с 0
    const rules = await loadRules()
    const enabled = rules.filter(r => r.enabled).sort((a, b) => a.minCost - b.minCost)
    const nextMin = enabled.length > 0 && enabled[enabled.length - 1]!.maxCost !== null
      ? enabled[enabled.length - 1]!.maxCost
      : (enabled.length === 0 ? 0 : null)

    const hint = nextMin !== null ? `\n💡 Подсказка: следующий интервал начинается с ${nextMin}` : ''
    pricingState.set(userId, { flow: 'rules_add_min' })
    await ctx.reply(
      `➕ Новое правило\n\nШаг 1 — введите минимальную закупочную цену (от):${hint}\n\nНапример: 0 или 5000`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:rules')]]),
    )
  })

  // ── Удаление правила ──────────────────────────────────────────────────

  bot.action('pricing:rules_del', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const rules = await loadRules()
    if (rules.length === 0) {
      await ctx.reply('Нет правил для удаления.')
      return
    }
    const buttons = rules.map((r, i) => [
      Markup.button.callback(`🗑 ${formatRule(r, i)}`.slice(0, 64), `pricing:rules_del_confirm:${r.id}`)
    ])
    buttons.push([Markup.button.callback('🔙 Назад', 'pricing:rules')])
    await ctx.reply('Выберите правило для удаления:', Markup.inlineKeyboard(buttons))
  })

  // ── Редактирование правила ────────────────────────────────────────────

  bot.action('pricing:rules_edit', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const rules = await loadRules()
    if (rules.length === 0) {
      await ctx.reply('Нет правил для редактирования.')
      return
    }
    const buttons = rules.map((r, i) => [
      Markup.button.callback(formatRule(r, i).slice(0, 64), 'pricing:rules_edit_pick:' + r.id),
    ])
    buttons.push([Markup.button.callback('🔙 Назад', 'pricing:rules')])
    await ctx.reply('Выберите правило для редактирования (изменится сумма/процент наценки):', Markup.inlineKeyboard(buttons))
  })

  bot.action(/^pricing:rules_edit_pick:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const ruleId = parseInt((ctx.match as RegExpMatchArray)[1]!, 10)
    const rule = await prisma.markupRule.findUnique({ where: { id: ruleId } })
    if (!rule) { await ctx.reply('Правило не найдено.'); return }

    pricingState.set(userId, { flow: 'rules_edit_value', ruleId })

    const unit = rule.mode === 'percent' ? '%' : '₽'
    const from = Number(rule.minCost).toLocaleString('ru-RU')
    const to = rule.maxCost !== null ? Number(rule.maxCost).toLocaleString('ru-RU') + ' ₽' : '∞'

    await ctx.reply(
      `✏️ Редактирование правила: ${from} – ${to}\nТекущая наценка: ${rule.mode === 'percent' ? '+' + Number(rule.value) + '%' : '+' + Number(rule.value).toLocaleString('ru-RU') + ' ₽'}\n\nВведите новое значение наценки (${unit}):`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:rules')]]),
    )
  })

  bot.action(/^pricing:rules_del_confirm:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const ruleId = parseInt((ctx.match as RegExpMatchArray)[1]!, 10)
    await prisma.markupRule.delete({ where: { id: ruleId } }).catch(() => {})
    await ctx.reply('✅ Правило удалено.')
    // Показать обновлённый список
    const rules = await loadRules()
    const validation = validateRules(rules)
    const lines = ['📊 Правила наценки\n']
    if (rules.length === 0) {
      lines.push('Правил нет.')
    } else {
      rules.forEach((r, i) => lines.push(formatRule(r, i)))
      lines.push('')
      lines.push(validation.ok ? '✅ Покрытие полное' : `⚠️ ${validation.error}`)
    }
    await ctx.reply(lines.join('\n'), Markup.inlineKeyboard([
      [Markup.button.callback('➕ Добавить', 'pricing:rules_add')],
      [Markup.button.callback('✏️ Изменить', 'pricing:rules_edit'), Markup.button.callback('🗑 Удалить', 'pricing:rules_del')],
      [Markup.button.callback('🧪 Тест', 'pricing:rules_test')],
      [Markup.button.callback('🔙 Меню цен', 'pricing:menu')],
    ]))
  })

  // ── Тестирование правил ───────────────────────────────────────────────

  bot.action('pricing:rules_test', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    pricingState.set(userId, { flow: 'rules_test' })
    await ctx.reply(
      '🧪 Тестирование правил\n\nВведите закупочную цену для проверки:\n\nНапример: 8500 или 45000',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'pricing:rules')]]),
    )
  })

  // ── Выбор типа наценки (fixed / percent) ──────────────────────────────

  bot.action(/^pricing:rules_mode:(fixed|percent)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = pricingState.get(userId)
    if (!state || state.flow !== 'rules_add_mode') return

    const mode = (ctx.match as RegExpMatchArray)[1]!
    pricingState.set(userId, {
      flow: 'rules_add_value',
      minCost: state.minCost,
      maxCost: state.maxCost,
      mode,
    })

    const unit = mode === 'percent' ? '%' : '₽'
    await ctx.reply(
      `Шаг 4 — введите размер наценки (${unit}):\n\nНапример: ${mode === 'percent' ? '7 или 10' : '1000 или 2500'}`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:rules')]]),
    )
  })
}

// ─── Обработчик текстовых сообщений ──────────────────────────────────────────

export async function handlePricingMessage(
  ctx: Context,
  userId: number,
  text: string,
): Promise<boolean> {
  const state = pricingState.get(userId)
  if (!state) return false

  // Парсинг сообщения поставщика (AI) → спросить имя поставщика
  if (state.flow === 'awaiting_message') {
    await ctx.reply('🤖 AI анализирует сообщение…')
    let parsed: ParsedLine[]
    try {
      const aiResults = await aiParseSupplier(text)
      if (!aiResults.length) {
        await ctx.reply(
          '❌ AI не смог распознать товары в этом сообщении. Проверьте формат.',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:cancel')]]),
        )
        return true
      }
      // Общий маппинг с веб-батчами: страна/SIM тоже доезжают до матчера
      parsed = aiResults.map(toParsedLine)
    } catch {
      await ctx.reply(
        '❌ Ошибка AI парсинга. Попробуйте ещё раз.',
        Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:cancel')]]),
      )
      return true
    }

    // Показать что распознано и спросить поставщика
    const previewLines = parsed.slice(0, 10).map(p =>
      `• ${p.model} ${p.storage ?? ''} ${p.color ?? ''} — ${p.price.toLocaleString('ru-RU')}₽`
    )
    if (parsed.length > 10) previewLines.push(`... и ещё ${parsed.length - 10} позиций`)

    const supplierButtons = await getSupplierButtons()

    await ctx.reply(
      `✅ Распознано позиций: ${parsed.length}\n\n${previewLines.join('\n')}\n\nОт какого поставщика этот прайс?`,
      Markup.inlineKeyboard([
        ...supplierButtons,
        [Markup.button.callback('✏️ Ввести имя вручную', 'pricing:supplier_manual')],
        [Markup.button.callback('❌ Отмена', 'pricing:cancel')],
      ]),
    )

    pricingState.set(userId, { flow: 'awaiting_supplier_name', parsed })
    return true
  }

  // Ввод имени поставщика вручную
  if (state.flow === 'awaiting_supplier_name') {
    const supplierName = text.trim()
    if (supplierName.length < 2 || supplierName.length > 50) {
      await ctx.reply('Имя поставщика: 2-50 символов')
      return true
    }
    await processSupplierPrice(ctx, userId, supplierName, state.parsed)
    return true
  }

  // Ввод % наценки для разового расчёта (supplier prices → pending preview)
  if (state.flow === 'awaiting_markup') {
    const markup = parseInt(text, 10)
    if (isNaN(markup) || markup <= 0 || markup > 100) {
      await ctx.reply('Введите число от 1 до 100 (процент наценки):')
      return true
    }
    const pending = buildPendingFromMatches(state.matches, markup, state.rate ?? null)
    for (let i = 0; i < pending.length; i++) {
      const m = state.matches[i]
      if (m) pending[i]!.costPrice = m.supplierPrice
    }
    pricingState.set(userId, {
      flow: 'preview',
      source: 'message',
      markup,
      label: markup + '%',
      pendingVariants: pending,
      excludedVariantIds: [],
    })
    await showPreview(ctx, userId)
    return true
  }

  // Ввод % для массовой наценки
  if (state.flow === 'bulk_pct') {
    const val = parseFloat(text.replace(',', '.'))
    if (isNaN(val) || val <= 0 || val > 300) {
      await ctx.reply('Введите процент от 0.1 до 300:')
      return true
    }
    await ctx.reply('⏳ Считаю…')

    const where =
      state.filterType === 'all'
        ? {}
        : { product: { category: { name: state.filterValue } } }
    const variants = await prisma.productVariant.findMany({
      where,
      include: { product: true },
    })

    const pending: PendingVariant[] = variants.map((v) => {
      const attrs = v.attributes as Record<string, string>
      const attrsStr = Object.entries(attrs).map(([k, val]) => `${k}: ${val}`).join(', ')
      const oldPrice = Number(v.price)
      return {
        variantId: v.id,
        productId: v.productId,
        productName: v.product.name,
        brand: v.product.brand ?? undefined,
        categoryId: v.product.categoryId ?? undefined,
        variantSku: v.sku,
        attrs: attrsStr,
        currentPrice: oldPrice,
        newPrice: roundPrice(oldPrice * (1 + val / 100)),
      }
    }).filter((v) => v.newPrice !== v.currentPrice)

    pricingState.set(userId, {
      flow: 'preview',
      source: 'markup',
      markup: val,
      label: `${state.filterLabel}, наценка ${val}%`,
      pendingVariants: pending,
      excludedVariantIds: [],
    })
    await showPreview(ctx, userId)
    return true
  }

  // Ввод цены для одного варианта (точечно)
  if (state.flow === 'manual_price_input') {
    const val = parseFloat(text.replace(/\s/g, '').replace(',', '.'))
    if (isNaN(val) || val <= 0) {
      await ctx.reply('Введите положительное число:')
      return true
    }
    const newPrice = roundPrice(val)
    const pending: PendingVariant[] = [{
      variantId: state.variantId,
      productId: 0,
      productName: state.productName,
      variantSku: state.variantSku,
      attrs: state.attrs,
      currentPrice: state.currentPrice,
      newPrice,
    }]
    pricingState.set(userId, {
      flow: 'preview',
      source: 'manual',
      markup: null,
      label: 'точечное изменение',
      pendingVariants: pending,
      excludedVariantIds: [],
    })
    await showPreview(ctx, userId)
    return true
  }

  // Ввод цены для всех вариантов товара (точечно)
  if (state.flow === 'manual_all_price') {
    const val = parseFloat(text.replace(/\s/g, '').replace(',', '.'))
    if (isNaN(val) || val <= 0) {
      await ctx.reply('Введите положительное число:')
      return true
    }
    const newPrice = roundPrice(val)
    const variants = await prisma.productVariant.findMany({
      where: { productId: state.productId },
      include: { product: true },
    })
    const pending: PendingVariant[] = variants.map((v) => {
      const attrs = Object.values(v.attributes as Record<string, string>).join(', ')
      return {
        variantId: v.id, productId: v.productId, productName: v.product.name,
        variantSku: v.sku, attrs, currentPrice: Number(v.price), newPrice,
      }
    })
    pricingState.set(userId, {
      flow: 'preview',
      source: 'manual',
      markup: null,
      label: `${state.productName} — все варианты`,
      pendingVariants: pending,
      excludedVariantIds: [],
    })
    await showPreview(ctx, userId)
    return true
  }

  // ── Правила наценки: ввод данных ────────────────────────────────────────

  if (state.flow === 'rules_add_min') {
    const val = parseFloat(text.replace(/\s/g, '').replace(',', '.'))
    if (isNaN(val) || val < 0) {
      await ctx.reply('❌ Введите положительное число. Например: 0 или 5000')
      return true
    }
    pricingState.set(userId, { flow: 'rules_add_max', minCost: val })
    await ctx.reply(
      `Шаг 2 — введите максимальную закупочную цену (до):\n\nДля последнего правила (до бесконечности) отправьте: 0 или слово «бесконечность»\n\nНапример: 5000 или 10000 или 0`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:rules')]]),
    )
    return true
  }

  if (state.flow === 'rules_add_max') {
    const trimmed = text.trim().toLowerCase()
    let maxCost: number | null = null
    if (trimmed === '0' || trimmed === 'бесконечность' || trimmed === 'inf' || trimmed === '∞') {
      maxCost = null
    } else {
      const val = parseFloat(trimmed.replace(/\s/g, '').replace(',', '.'))
      if (isNaN(val) || val <= 0) {
        await ctx.reply('❌ Введите положительное число или 0 для бесконечности.')
        return true
      }
      if (val <= state.minCost) {
        await ctx.reply(`❌ Максимум (${val}) должен быть больше минимума (${state.minCost}).`)
        return true
      }
      maxCost = val
    }
    pricingState.set(userId, { flow: 'rules_add_mode', minCost: state.minCost, maxCost })
    await ctx.reply(
      'Шаг 3 — тип наценки:',
      Markup.inlineKeyboard([
        [Markup.button.callback('💵 Фиксированная сумма (+₽)', 'pricing:rules_mode:fixed')],
        [Markup.button.callback('📊 Процент (%)', 'pricing:rules_mode:percent')],
        [Markup.button.callback('❌ Отмена', 'pricing:rules')],
      ]),
    )
    return true
  }

  if (state.flow === 'rules_add_value') {
    const val = parseFloat(text.replace(/\s/g, '').replace(',', '.'))
    if (isNaN(val) || val <= 0) {
      await ctx.reply('❌ Введите положительное число.')
      return true
    }

    // Создать правило
    await prisma.markupRule.create({
      data: {
        minCost: state.minCost,
        maxCost: state.maxCost,
        mode: state.mode,
        value: val,
      },
    })

    pricingState.delete(userId)

    // Валидация после добавления
    const rules = await loadRules()
    const validation = validateRules(rules)

    const from = state.minCost.toLocaleString('ru-RU')
    const to = state.maxCost !== null ? state.maxCost.toLocaleString('ru-RU') + ' ₽' : '∞'
    const action = state.mode === 'percent' ? `+${val}%` : `+${val.toLocaleString('ru-RU')} ₽`

    await ctx.reply(
      [
        `✅ Правило добавлено: ${from} – ${to} → ${action}`,
        '',
        validation.ok ? '✅ Покрытие полное' : `⚠️ ${validation.error}`,
      ].join('\n'),
      Markup.inlineKeyboard([
        [Markup.button.callback('📊 Все правила', 'pricing:rules')],
        [Markup.button.callback('➕ Добавить ещё', 'pricing:rules_add')],
        [Markup.button.callback('🔙 Меню цен', 'pricing:menu')],
      ]),
    )
    return true
  }

  if (state.flow === 'rules_edit_value') {
    const val = parseFloat(text.replace(/\s/g, '').replace(',', '.'))
    if (isNaN(val) || val <= 0) {
      await ctx.reply('❌ Введите положительное число.')
      return true
    }

    try {
      await prisma.markupRule.update({
        where: { id: state.ruleId },
        data: { value: val },
      })

      pricingState.delete(userId)

      const rules = await loadRules()
      const validation = validateRules(rules)

      await ctx.reply(
        `✅ Правило обновлено: наценка = ${val}\n\n${validation.ok ? '✅ Покрытие полное' : '⚠️ ' + validation.error}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('📊 Все правила', 'pricing:rules')],
          [Markup.button.callback('🔙 Меню цен', 'pricing:menu')],
        ]),
      )
    } catch (err) {
      await ctx.reply('❌ Ошибка: ' + (err instanceof Error ? err.message : 'Неизвестная ошибка'))
    }
    return true
  }

  if (state.flow === 'rules_test') {
    const val = parseFloat(text.replace(/\s/g, '').replace(',', '.'))
    if (isNaN(val) || val <= 0) {
      await ctx.reply('❌ Введите положительное число.')
      return true
    }
    const rules = await loadRules()
    const result = applyMarkupRules(val, rules)
    const diff = result - val
    const enabled = rules.filter(r => r.enabled).sort((a, b) => a.minCost - b.minCost)
    const matched = enabled.find(r => r.minCost <= val && (r.maxCost === null || val < r.maxCost))

    const ruleDesc = matched
      ? `Правило: ${matched.minCost.toLocaleString('ru-RU')} – ${matched.maxCost !== null ? matched.maxCost.toLocaleString('ru-RU') + ' ₽' : '∞'} → ${matched.mode === 'percent' ? '+' + matched.value + '%' : '+' + matched.value.toLocaleString('ru-RU') + ' ₽'}`
      : 'Подходящее правило не найдено'

    await ctx.reply(
      [
        `🧪 Тест наценки:`,
        '',
        `💵 Закупка: ${val.toLocaleString('ru-RU')} ₽`,
        `💰 Рекомендованная: ${result.toLocaleString('ru-RU')} ₽`,
        `📈 Наценка: +${diff.toLocaleString('ru-RU')} ₽`,
        '',
        ruleDesc,
        `(округление _90 вверх)`,
      ].join('\n'),
      Markup.inlineKeyboard([
        [Markup.button.callback('🧪 Ещё тест', 'pricing:rules_test')],
        [Markup.button.callback('📊 Все правила', 'pricing:rules')],
        [Markup.button.callback('🔙 Меню цен', 'pricing:menu')],
      ]),
    )
    pricingState.delete(userId)
    return true
  }

  // ── Мастер создания: текстовый поиск по каталогу ────────────────────────
  if (state.flow === 'create_from_price_search') {
    const query = text.trim()
    if (query.length < 2) {
      await ctx.reply('Введите минимум 2 символа для поиска.')
      return true
    }

    const candidates = await prisma.product.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      take: 10,
      orderBy: { name: 'asc' },
      include: { category: true },
    })

    if (candidates.length === 0) {
      await ctx.reply('🔍 Ничего не найдено по «' + query + '». Попробуйте другой запрос или вернитесь к созданию.',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 К карточке', 'pricing:qc_back')]]))
      return true
    }

    const buttons = candidates.map(c => [
      Markup.button.callback(
        (c.name + (c.category ? ' [' + c.category.name + ']' : '')).slice(0, 64),
        'pricing:qc_link:' + c.id,
      ),
    ])
    buttons.push([Markup.button.callback('🔙 К карточке', 'pricing:qc_back')])
    await ctx.reply('🔍 Результаты:', Markup.inlineKeyboard(buttons))
    return true
  }

  // ── Мастер создания: ввод количества ────────────────────────────────────
  if (state.flow === 'create_from_price_qty') {
    const qty = parseInt(text, 10)
    if (isNaN(qty) || qty <= 0) {
      await ctx.reply('Введите положительное число.')
      return true
    }
    const updated = { ...state.draft, quantity: qty }
    pricingState.set(userId, {
      flow: 'create_from_price',
      items: state.items,
      currentIndex: state.currentIndex,
      supplierName: state.supplierName,
      draft: updated,
    })
    await showCreateCard(ctx, userId, state.items, state.currentIndex, state.supplierName)
    return true
  }

  return false
}

// ─── Обработчик документов (xlsx прайс-лист) ─────────────────────────────────

export async function handlePricingDocument(ctx: Context, userId: number): Promise<boolean> {
  const state = pricingState.get(userId)
  if (!state || state.flow !== 'awaiting_file') return false

  const doc = (ctx.message as { document?: { file_id: string; mime_type?: string; file_name?: string; file_size?: number } })?.document
  if (!doc) return false

  const mime = doc.mime_type ?? ''
  const fname = doc.file_name ?? ''
  const allowedMimes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ]
  const isExcel = allowedMimes.includes(mime) || mime.includes('spreadsheet') || /\.xlsx?$/i.test(fname)

  if (!isExcel) {
    await ctx.reply('❌ Неподдерживаемый формат файла. Загрузите файл .xlsx (Excel).')
    return true
  }

  if (doc.file_size && doc.file_size > 10 * 1024 * 1024) {
    await ctx.reply('❌ Файл слишком большой (макс. 10 МБ).')
    return true
  }

  await ctx.reply('⏳ Обрабатываю файл…')

  try {
    const buffer = await downloadTelegramFile(ctx, doc.file_id)
    const updates = await parsePriceListXlsx(buffer)

    if (!updates.length) {
      await ctx.reply('❌ В файле нет строк с заполненной колонкой «Новая цена» (E).',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'pricing:file')]]))
      return true
    }

    const pending: PendingVariant[] = []
    const notFound: string[] = []

    for (const { sku, newPrice, comment } of updates) {
      const variant = await prisma.productVariant.findUnique({
        where: { sku },
        include: { product: true },
      })
      if (!variant) {
        notFound.push(sku)
        continue
      }
      const attrs = variant.attributes as Record<string, string>
      pending.push({
        variantId: variant.id,
        productId: variant.productId,
        productName: variant.product.name,
        brand: variant.product.brand ?? undefined,
        categoryId: variant.product.categoryId ?? undefined,
        variantSku: variant.sku,
        attrs: Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join(', '),
        currentPrice: Number(variant.price),
        newPrice,
        comment: comment || undefined,
      })
    }

    if (!pending.length) {
      await ctx.reply('❌ Ни один SKU из файла не найден в каталоге.',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'pricing:file')]]))
      return true
    }

    // Формируем сообщение предпросмотра
    const previewLines = ['📊 Предпросмотр изменений из файла:\n']
    for (const v of pending.slice(0, 12)) {
      const attrsStr = v.attrs ? ` (${v.attrs})` : ''
      previewLines.push(
        `${v.productName}${attrsStr}: ${fmtPrice(v.currentPrice)} → ${fmtPrice(v.newPrice)}`,
      )
    }
    if (pending.length > 12) previewLines.push(`… и ещё ${pending.length - 12}`)
    previewLines.push(`\nВсего: ${pending.length} вариантов`)
    if (notFound.length) previewLines.push(`❌ Не найдено SKU: ${notFound.slice(0, 5).join(', ')}${notFound.length > 5 ? ` и ещё ${notFound.length - 5}` : ''}`)

    pricingState.set(userId, {
      flow: 'preview', source: 'file', markup: null,
      label: 'из файла Excel',
      pendingVariants: pending, excludedVariantIds: [],
    })
    await ctx.reply(previewLines.join('\n'))
    await showPreview(ctx, userId)
  } catch (err) {
    log.error('Pricing document handler error', { error: err instanceof Error ? err.message : String(err) })
    await ctx.reply('❌ Ошибка при обработке файла. Убедитесь, что загружаете xlsx прайс-лист.')
  }

  return true
}

// ─── Ежедневное уведомление о курсе USD ────────────────────────────────────

export type CurrencyNotifyResult = {
  changes: CurrencyChange[]
}

export async function sendDailyCurrencyRates(
  sendFn: (text: string, keyboard: ReturnType<typeof Markup.inlineKeyboard>) => Promise<void>,
): Promise<CurrencyNotifyResult | null> {
  try {
    const changes = await updateCurrencyRates()
    if (!changes.length) return null

    const c = changes[0]!
    const now = new Date()
    const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })

    const pctStr = formatChangePercent(c.changePercent, c.direction)
    const text = `💱 Курс доллара: ${c.newRate.toFixed(2)}₽ (${directionEmoji(c.direction)} ${pctStr})\n${dateStr}`

    await sendFn(
      text,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('📊 Скорректировать цены', 'pricing:cadj_from_notify'),
          Markup.button.callback('❌ Пропустить', 'back:main'),
        ],
      ]),
    )
    return { changes }
  } catch {
    await sendFn(
      '❌ Не удалось получить курс USD с ЦБ РФ',
      Markup.inlineKeyboard([[Markup.button.callback('💰 Меню цен', 'pricing:menu')]]),
    )
    return null
  }
}

// Глобальное хранилище последних изменений курсов (для notify → adjust флоу)
export const lastCurrencyChanges: CurrencyChange[] = []
