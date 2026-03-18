/**
 * bot/admin/pricing.ts — Управление ценами
 *
 * Меню: из сообщения | курс доллара | из файла | точечно | история
 */

import https from 'https'
import ExcelJS from 'exceljs'
import { Context, Markup, Telegraf } from 'telegraf'
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

// ─── Типы ─────────────────────────────────────────────────────────────────────

type ParsedLine = {
  model: string
  storage?: string
  color?: string
  price: number
  rawLine: string
}

type MatchedVariant = {
  rawLine: string
  parsed: ParsedLine
  variantId: number
  variantSku: string
  productId: number
  productName: string
  brand?: string
  categoryId?: number
  currentPrice: number
  supplierPrice: number
}

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
}

type PricingSource = 'message' | 'file' | 'markup' | 'manual' | 'currency_update'

type PricingFlow =
  | { flow: 'awaiting_message'; rate?: number }
  | { flow: 'awaiting_markup'; matches: MatchedVariant[]; unmatched: ParsedLine[]; rate?: number }
  | { flow: 'bulk_pct'; filterType: 'all' | 'category'; filterValue: string; filterLabel: string }
  | {
      flow: 'preview'
      source: PricingSource
      markup: number | null
      label: string
      pendingVariants: PendingVariant[]
      excludedVariantIds: number[]
    }
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

export const pricingState = new Map<number, PricingFlow>()

// ─── Матчинг вариантов ────────────────────────────────────────────────────────

async function matchVariants(parsed: ParsedLine[]): Promise<{ matched: MatchedVariant[]; unmatched: ParsedLine[] }> {
  const matched: MatchedVariant[] = []
  const unmatched: ParsedLine[] = []

  for (const p of parsed) {
    const products = await prisma.product.findMany({
      where: { name: { contains: p.model, mode: 'insensitive' } },
      include: { variants: true },
    })
    if (!products.length) { unmatched.push(p); continue }

    let found: MatchedVariant | null = null
    outer:
    for (const product of products) {
      for (const variant of product.variants) {
        const attrs = variant.attributes as Record<string, string>
        const vals = Object.values(attrs).map((v) => v.toLowerCase())
        if (p.storage && !vals.some((v) => v.includes(p.storage!))) continue
        if (p.color && !vals.some((v) => v.includes(p.color!.toLowerCase()))) continue
        found = {
          rawLine: p.rawLine, parsed: p,
          variantId: variant.id, variantSku: variant.sku,
          productId: product.id, productName: product.name,
          brand: product.brand ?? undefined,
          categoryId: product.categoryId ?? undefined,
          currentPrice: Number(variant.price), supplierPrice: p.price,
        }
        break outer
      }
    }
    found ? matched.push(found) : unmatched.push(p)
  }
  return { matched, unmatched }
}

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
      [Markup.button.callback('💱 Курс доллара', 'pricing:rate')],
      [Markup.button.callback('📊 Из файла Excel', 'pricing:file')],
      [Markup.button.callback('✏️ Точечно', 'pricing:manual')],
      [Markup.button.callback('📋 История изменений', 'pricing:history')],
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
      await prisma.productVariant.update({ where: { id: v.variantId }, data: { price: v.newPrice } })
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
    } catch {
      errors.push(v.variantSku)
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

async function downloadTelegramFile(ctx: Context, fileId: string): Promise<Buffer> {
  const file = await ctx.telegram.getFile(fileId)
  const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const safeUrl = url.replace(process.env.BOT_TOKEN ?? '', '[REDACTED]')
    https.get(url, (res) => {
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', (err) => {
        console.error('[pricing] downloadTelegramFile res error:', safeUrl, err.message)
        reject(err)
      })
    }).on('error', (err) => {
      console.error('[pricing] downloadTelegramFile error:', safeUrl, err.message)
      reject(err)
    })
  })
}

// ─── Парсинг загруженного прайс-листа ────────────────────────────────────────

async function parsePriceListXlsx(buffer: Buffer): Promise<{ sku: string; newPrice: number; comment: string }[]> {
  const wb = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const page = parseInt(ctx.match[1], 10)
    await showManualProductList(ctx, getUserId(ctx), page)
  })

  bot.action(/^pricing:man_prod:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Загрузка...') } catch { /* ignore: answerCbQuery may fail if query expired */ }
    await showManualVariantList(ctx, getUserId(ctx), parseInt(ctx.match[1], 10))
  })

  bot.action(/^pricing:man_v:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const variantId = parseInt(ctx.match[1], 10)
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
    await ctx.reply(
      `Введите новую цену для ${variant.product.name} (${attrs})\nТекущая цена: ${fmtPrice(Number(variant.price))}:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:cancel')]]),
    )
  })

  bot.action(/^pricing:man_all:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const productId = parseInt(ctx.match[1], 10)
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return await ctx.reply('Товар не найден.')
    pricingState.set(userId, {
      flow: 'manual_all_price',
      productId: product.id,
      productName: product.name,
    })
    await ctx.reply(
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
    await ctx.reply('Выберите категорию:', Markup.inlineKeyboard(rows))
  })

  bot.action(/^pricing:bulk_cat:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const cat = await prisma.category.findUnique({ where: { id: parseInt(ctx.match[1], 10) } })
    if (!cat) return await ctx.reply('Категория не найдена.')
    pricingState.set(getUserId(ctx), {
      flow: 'bulk_pct',
      filterType: 'category',
      filterValue: cat.name,
      filterLabel: `категория «${cat.name}»`,
    })
    await ctx.reply(
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
    const catId = parseInt(ctx.match[1], 10)
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
    const productId = parseInt(ctx.match[1], 10)
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
}

// ─── Обработчик текстовых сообщений ──────────────────────────────────────────

export async function handlePricingMessage(
  ctx: Context,
  userId: number,
  text: string,
): Promise<boolean> {
  const state = pricingState.get(userId)
  if (!state) return false

  // Парсинг сообщения поставщика (AI)
  if (state.flow === 'awaiting_message') {
    const indicator = await ctx.reply('🤖 AI анализирует сообщение…')
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
      parsed = aiResults.map((r) => ({
        model: r.model,
        storage: r.storage ?? undefined,
        color: r.color ?? undefined,
        price: r.price,
        rawLine: r.rawLine,
      }))
    } catch {
      await ctx.reply(
        '❌ Ошибка AI парсинга. Попробуйте ещё раз.',
        Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:cancel')]]),
      )
      return true
    }
    void indicator // indicator already sent, no need to delete in Telegram bot API

    await ctx.reply(`⏳ AI нашёл позиций: ${parsed.length}. Ищу совпадения…`)
    const { matched, unmatched } = await matchVariants(parsed)

    const total = matched.length + unmatched.length
    const lines = [`📊 Распознано: ${total}\n`]
    for (const m of matched) {
      const effective = state.rate ? Math.round(m.supplierPrice * state.rate) : m.supplierPrice
      lines.push(
        `✅ ${m.productName}`,
        `   Текущая: ${fmtPrice(m.currentPrice)} → Поставщик: ${fmtPrice(effective)}`,
      )
    }
    for (const u of unmatched) lines.push(`❓ ${u.rawLine.slice(0, 60)} — не найден`)

    if (!matched.length) {
      await ctx.reply(lines.join('\n') + '\n\n❌ Ни один вариант не найден.',
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'pricing:menu')]]))
      return true
    }

    pricingState.set(userId, { flow: 'awaiting_markup', matches: matched, unmatched, rate: state.rate })
    await ctx.reply(
      lines.join('\n') + `\n\nВведите наценку % (например: 5) или /skip — без наценки:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'pricing:cancel')]]),
    )
    return true
  }

  // Ввод наценки (из сообщения)
  if (state.flow === 'awaiting_markup') {
    let markup: number | null = null
    if (text.trim() !== '/skip') {
      const val = parseFloat(text.replace(',', '.'))
      if (isNaN(val) || val < 0 || val > 300) {
        await ctx.reply('Введите число 0–300 или /skip:')
        return true
      }
      markup = val
    }
    const pendingVariants = buildPendingFromMatches(state.matches, markup, state.rate ?? null)
    const rateLabel = state.rate ? `курс ${state.rate}` : ''
    const markupLabel = markup !== null ? `наценка ${markup}%` : ''
    const label = [rateLabel, markupLabel].filter(Boolean).join(', ') || 'цены поставщика'
    pricingState.set(userId, {
      flow: 'preview',
      source: 'message',
      markup,
      label,
      pendingVariants,
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

  return false
}

// ─── Обработчик документов (xlsx прайс-лист) ─────────────────────────────────

export async function handlePricingDocument(ctx: Context, userId: number): Promise<boolean> {
  const state = pricingState.get(userId)
  if (!state || state.flow !== 'awaiting_file') return false

  const doc = (ctx.message as { document?: { file_id: string; mime_type?: string } })?.document
  if (!doc) return false

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
    console.error('handlePricingDocument error:', err)
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

    const c = changes[0]
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
