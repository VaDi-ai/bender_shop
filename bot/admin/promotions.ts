/**
 * bot/admin/promotions.ts
 *
 * Управление акциями:
 *   • Создать акцию (7 шагов)
 *   • Активные / завершённые акции
 *   • Запуск с необязательной рассылкой клиентам
 *   • Завершение акции (откат цен)
 *
 * Подключение в bot/index.ts:
 *   setupPromotionsHandlers(bot)
 *   showPromotionsMenu(ctx)
 *   promotionsState — Map для сброса в back:main
 *   handlePromotionsMessage(ctx, uid, txt) → boolean
 */

import { Context, Markup, Telegraf } from 'telegraf'
import { prisma } from '../../lib/prisma'
import { applyPromotion, cancelPromotion, findVariantsByFilter, filterLabel } from '../../lib/promotions'

// ─── Типы состояния ───────────────────────────────────────────────────────────

type PromoFlow =
  | { step: 'name' }
  | { step: 'discount_type'; name: string }
  | { step: 'discount_value'; name: string; discountType: 'percent' | 'fixed' }
  | { step: 'filter_type'; name: string; discountType: 'percent' | 'fixed'; discountValue: number }
  | { step: 'filter_category'; name: string; discountType: 'percent' | 'fixed'; discountValue: number }
  | { step: 'filter_brand'; name: string; discountType: 'percent' | 'fixed'; discountValue: number }
  | { step: 'filter_attribute'; name: string; discountType: 'percent' | 'fixed'; discountValue: number }
  | { step: 'filter_products'; name: string; discountType: 'percent' | 'fixed'; discountValue: number; selectedProductIds: number[] }
  | { step: 'dates'; name: string; discountType: 'percent' | 'fixed'; discountValue: number; filterType: string; filterValue: string }
  | { step: 'dates_input'; name: string; discountType: 'percent' | 'fixed'; discountValue: number; filterType: string; filterValue: string }
  | { step: 'preview'; name: string; discountType: 'percent' | 'fixed'; discountValue: number; filterType: string; filterValue: string; startsAt?: Date; endsAt?: Date }

export const promotionsState = new Map<number, PromoFlow>()

// ─── Вспомогательные утилиты ──────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n.toLocaleString('ru-RU') + ' ₽'
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function parseDateRange(str: string): { startsAt: Date; endsAt: Date } | null {
  const m = str.match(/(\d{2})\.(\d{2})\.(\d{4})\s*[-–]\s*(\d{2})\.(\d{2})\.(\d{4})/)
  if (!m) return null
  const startsAt = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`)
  const endsAt = new Date(`${m[6]}-${m[5]}-${m[4]}T23:59:59`)
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) return null
  return { startsAt, endsAt }
}

// ─── Главное меню акций ───────────────────────────────────────────────────────

export async function showPromotionsMenu(ctx: Context): Promise<void> {
  const activeCount = await prisma.promotion.count({ where: { isActive: true } })
  await ctx.reply(
    `🏷️ Акции\n\nАктивных: ${activeCount}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('➕ Создать акцию', 'promo:create')],
      [Markup.button.callback('📋 Активные акции', 'promo:list_active')],
      [Markup.button.callback('🕐 Завершённые акции', 'promo:list_done')],
      [Markup.button.callback('🔙 Назад', 'back:main')],
    ]),
  )
}

// ─── Шаг 1: Ввод названия ─────────────────────────────────────────────────────

async function askName(ctx: Context, userId: number): Promise<void> {
  promotionsState.set(userId, { step: 'name' })
  await ctx.reply(
    'Введите название акции (для внутреннего использования):\nНапример: Скидки на iPhone март 2026',
    Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'promo:cancel')]]),
  )
}

// ─── Шаг 2: Тип скидки ───────────────────────────────────────────────────────

async function askDiscountType(ctx: Context, userId: number, name: string): Promise<void> {
  promotionsState.set(userId, { step: 'discount_type', name })
  await ctx.reply(
    `Акция: ${name}\n\nВыберите тип скидки:`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('💯 Процент', `promo:dtype:percent`),
        Markup.button.callback('💰 Фиксированная сумма', `promo:dtype:fixed`),
      ],
      [Markup.button.callback('❌ Отмена', 'promo:cancel')],
    ]),
  )
}

// ─── Шаг 3: Размер скидки ────────────────────────────────────────────────────

async function askDiscountValue(
  ctx: Context,
  userId: number,
  name: string,
  discountType: 'percent' | 'fixed',
): Promise<void> {
  promotionsState.set(userId, { step: 'discount_value', name, discountType })
  const hint =
    discountType === 'percent'
      ? 'Введите процент скидки (1–90):'
      : 'Введите сумму скидки в рублях:'
  await ctx.reply(
    hint,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'promo:cancel')]]),
  )
}

// ─── Шаг 4: Тип фильтра ──────────────────────────────────────────────────────

async function askFilterType(
  ctx: Context,
  userId: number,
  name: string,
  discountType: 'percent' | 'fixed',
  discountValue: number,
): Promise<void> {
  promotionsState.set(userId, { step: 'filter_type', name, discountType, discountValue })
  const discLabel =
    discountType === 'percent' ? `${discountValue}%` : fmtPrice(discountValue)
  await ctx.reply(
    `Акция: ${name}\nСкидка: ${discLabel}\n\nНа что применяется:`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('🗂️ По категории', 'promo:ftype:category'),
        Markup.button.callback('🏢 По бренду', 'promo:ftype:brand'),
      ],
      [
        Markup.button.callback('🏷️ По атрибуту', 'promo:ftype:attribute'),
        Markup.button.callback('📦 Конкретные товары', 'promo:ftype:products'),
      ],
      [Markup.button.callback('❌ Отмена', 'promo:cancel')],
    ]),
  )
}

// ─── Шаг 4а: Выбор категории ─────────────────────────────────────────────────

async function showCategoryPicker(ctx: Context): Promise<void> {
  const cats = await prisma.category.findMany({
    include: {
      products: {
        include: { _count: { select: { variants: true } } },
      },
    },
    orderBy: { name: 'asc' },
  })

  if (cats.length === 0) {
    await ctx.reply(
      'Категории не найдены.',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'promo:cancel')]]),
    )
    return
  }

  const rows = cats.map((c) => {
    const varCount = c.products.reduce((s, p) => s + p._count.variants, 0)
    return [Markup.button.callback(`${c.name} (${varCount})`, `promo:pick_cat:${c.name.slice(0, 50)}`)]
  })
  rows.push([Markup.button.callback('❌ Отмена', 'promo:cancel')])

  await ctx.reply('Выберите категорию:', Markup.inlineKeyboard(rows))
}

// ─── Шаг 4б: Выбор бренда ────────────────────────────────────────────────────

async function showBrandPicker(ctx: Context): Promise<void> {
  const brands = await prisma.product.groupBy({
    by: ['brand'],
    where: { brand: { not: null } },
    _count: { id: true },
    orderBy: { brand: 'asc' },
  })

  if (brands.length === 0) {
    await ctx.reply(
      'Бренды не найдены.',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'promo:cancel')]]),
    )
    return
  }

  const rows = brands.map((b) => [
    Markup.button.callback(
      `${b.brand} (${b._count.id})`,
      `promo:pick_brand:${(b.brand ?? '').slice(0, 50)}`,
    ),
  ])
  rows.push([Markup.button.callback('❌ Отмена', 'promo:cancel')])

  await ctx.reply('Выберите бренд:', Markup.inlineKeyboard(rows))
}

// ─── Шаг 4г: Выбор конкретных товаров ────────────────────────────────────────

async function showProductPicker(ctx: Context, selectedIds: number[]): Promise<void> {
  const products = await prisma.product.findMany({
    orderBy: { name: 'asc' },
    take: 50,
  })

  if (products.length === 0) {
    await ctx.reply(
      'Товары не найдены.',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'promo:cancel')]]),
    )
    return
  }

  const rows = products.map((p) => {
    const selected = selectedIds.includes(p.id)
    const label = `${selected ? '✅' : '☐'} ${p.name.slice(0, 40)}`
    return [Markup.button.callback(label, `promo:toggle_prod:${p.id}`)]
  })

  rows.push([
    Markup.button.callback(
      `✅ Готово (${selectedIds.length} выбрано)`,
      'promo:products_done',
    ),
  ])
  rows.push([Markup.button.callback('❌ Отмена', 'promo:cancel')])

  await ctx.reply('Выберите товары (нажмите для выбора):', Markup.inlineKeyboard(rows))
}

// ─── Шаг 5: Сроки ────────────────────────────────────────────────────────────

async function askDates(
  ctx: Context,
  userId: number,
  base: { name: string; discountType: 'percent' | 'fixed'; discountValue: number; filterType: string; filterValue: string },
): Promise<void> {
  promotionsState.set(userId, { step: 'dates', ...base })
  await ctx.reply(
    'Указать сроки акции?',
    Markup.inlineKeyboard([
      [Markup.button.callback('📅 Указать сроки', 'promo:set_dates')],
      [Markup.button.callback('⏭️ Без ограничений', 'promo:no_dates')],
      [Markup.button.callback('❌ Отмена', 'promo:cancel')],
    ]),
  )
}

// ─── Шаг 6: Предпросмотр ─────────────────────────────────────────────────────

async function showPreview(ctx: Context, userId: number): Promise<void> {
  const state = promotionsState.get(userId)
  if (!state || state.step !== 'preview') return

  const variants = await findVariantsByFilter(state.filterType, state.filterValue)
  const count = variants.length

  const discLabel =
    state.discountType === 'percent'
      ? `${state.discountValue}%`
      : fmtPrice(state.discountValue)

  const period = state.startsAt && state.endsAt
    ? `${fmtDate(state.startsAt)} — ${fmtDate(state.endsAt)}`
    : 'Без ограничений'

  // Показываем первые 3 варианта с ценами
  const previewLines = variants.slice(0, 3).map((v) => {
    const attrs = v.attributes as Record<string, string>
    const attrStr = Object.values(attrs).join(' ')
    const orig = Number(v.price)
    let newP: number
    if (state.discountType === 'percent') {
      newP = Math.max(1, Math.round(orig * (1 - state.discountValue / 100)))
    } else {
      newP = Math.max(1, Math.round(orig - state.discountValue))
    }
    return `${v.product.name} ${attrStr}: ${fmtPrice(orig)} → ${fmtPrice(newP)}`
  })

  const more = count > 3 ? `\n… и ещё ${count - 3} вариант(ов)` : ''

  const text = [
    `Акция: ${state.name}`,
    `Скидка: ${discLabel}`,
    `Применяется к: ${filterLabel(state.filterType, state.filterValue)} (${count} вариантов)`,
    `Период: ${period}`,
    '',
    'Затронутые варианты:',
    ...previewLines,
    more,
  ]
    .filter((l) => l !== undefined)
    .join('\n')

  if (count === 0) {
    await ctx.reply(
      `${text}\n\n⚠️ По выбранному фильтру нет товаров.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✏️ Изменить', 'promo:edit')],
        [Markup.button.callback('❌ Отмена', 'promo:cancel')],
      ]),
    )
    return
  }

  await ctx.reply(
    text,
    Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Запустить без уведомления', 'promo:launch_silent')],
      [Markup.button.callback('📢 Запустить + разослать клиентам', 'promo:launch_notify')],
      [
        Markup.button.callback('✏️ Изменить', 'promo:edit'),
        Markup.button.callback('❌ Отмена', 'promo:cancel'),
      ],
    ]),
  )
}

// ─── Запуск акции ─────────────────────────────────────────────────────────────

async function launchPromotion(ctx: Context, userId: number, withNotification: boolean): Promise<void> {
  const state = promotionsState.get(userId)
  if (!state || state.step !== 'preview') return
  promotionsState.delete(userId)

  const promo = await prisma.promotion.create({
    data: {
      name: state.name,
      discountType: state.discountType,
      discountValue: state.discountValue,
      filterType: state.filterType,
      filterValue: state.filterValue,
      startsAt: state.startsAt ?? null,
      endsAt: state.endsAt ?? null,
      isActive: true,
    },
  })

  const varCount = await applyPromotion(promo.id)

  if (withNotification) {
    await sendPromoNotification(ctx, promo.id, state)
    await prisma.promotion.update({
      where: { id: promo.id },
      data: { notificationSent: true },
    })
  }

  const discLabel =
    state.discountType === 'percent' ? `${state.discountValue}%` : fmtPrice(state.discountValue)

  await ctx.reply(
    [
      `✅ Акция «${state.name}» запущена!`,
      `Скидка ${discLabel} применена к ${varCount} вариантам.`,
      withNotification ? '📢 Уведомление клиентам отправлено.' : '',
    ]
      .filter(Boolean)
      .join('\n'),
    Markup.inlineKeyboard([
      [Markup.button.callback('📋 Активные акции', 'promo:list_active')],
      [Markup.button.callback('🏠 Главное меню', 'back:main')],
    ]),
  )
}

// ─── Рассылка уведомления об акции ───────────────────────────────────────────

async function sendPromoNotification(
  ctx: Context,
  _promoId: number,
  state: Extract<PromoFlow, { step: 'preview' }>,
): Promise<void> {
  const discLabel =
    state.discountType === 'percent' ? `${state.discountValue}%` : fmtPrice(state.discountValue)
  const filter = filterLabel(state.filterType, state.filterValue)
  const webappUrl = process.env.WEBAPP_URL ?? ''

  const text = [
    '🔥 АКЦИЯ В BENDER SHOP!',
    '',
    state.name,
    `Скидка ${discLabel} на ${filter}`,
    '',
    'Успейте купить по выгодной цене!',
    '👉 Открыть магазин',
  ].join('\n')

  const clients = await prisma.client.findMany({
    where: { source: 'telegram', externalId: { not: null } },
    select: { externalId: true },
  })

  const inlineKeyboard = webappUrl
    ? { inline_keyboard: [[{ text: '🛒 В магазин', url: webappUrl }]] }
    : undefined

  let sent = 0
  let failed = 0

  for (const c of clients) {
    try {
      await ctx.telegram.sendMessage(c.externalId!, text, {
        reply_markup: inlineKeyboard,
      })
      sent++
    } catch {
      failed++
    }
    await new Promise((r) => setTimeout(r, 50))
  }

  await prisma.broadcastLog.create({
    data: {
      type: 'all',
      target: `promo:${state.name}`,
      messageText: text,
      totalSent: sent,
      totalFailed: failed,
      createdBy: String(ctx.from!.id),
    },
  })
}

// ─── Список акций ─────────────────────────────────────────────────────────────

async function showActiveList(ctx: Context): Promise<void> {
  const promos = await prisma.promotion.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  })

  if (promos.length === 0) {
    await ctx.reply(
      'Нет активных акций.',
      Markup.inlineKeyboard([
        [Markup.button.callback('➕ Создать акцию', 'promo:create')],
        [Markup.button.callback('🔙 Назад', 'promo:menu')],
      ]),
    )
    return
  }

  const rows: ReturnType<typeof Markup.button.callback>[][] = []
  const lines: string[] = ['📋 Активные акции:\n']

  for (const p of promos) {
    const discLabel =
      p.discountType === 'percent'
        ? `${p.discountValue}%`
        : fmtPrice(Number(p.discountValue))
    const until = p.endsAt ? ` — до ${fmtDate(p.endsAt)}` : ''
    lines.push(`🔥 ${p.name} — ${discLabel} — ${filterLabel(p.filterType, p.filterValue)}${until}`)
    rows.push([
      Markup.button.callback(`📊 ${p.name.slice(0, 25)}`, `promo:stat:${p.id}`),
      Markup.button.callback(`🛑 Завершить`, `promo:confirm_cancel:${p.id}`),
    ])
  }

  rows.push([Markup.button.callback('🔙 Назад', 'promo:menu')])
  await ctx.reply(lines.join('\n'), Markup.inlineKeyboard(rows))
}

async function showDoneList(ctx: Context): Promise<void> {
  const promos = await prisma.promotion.findMany({
    where: { isActive: false },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  if (promos.length === 0) {
    await ctx.reply(
      'Нет завершённых акций.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'promo:menu')]]),
    )
    return
  }

  const lines = promos.map((p) => {
    const discLabel =
      p.discountType === 'percent'
        ? `${p.discountValue}%`
        : fmtPrice(Number(p.discountValue))
    return `✓ ${p.name} — ${discLabel} — ${filterLabel(p.filterType, p.filterValue)}`
  })

  await ctx.reply(
    `🕐 Завершённые акции (последние ${promos.length}):\n\n${lines.join('\n')}`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'promo:menu')]]),
  )
}

// ─── Регистрация обработчиков ─────────────────────────────────────────────────

export function setupPromotionsHandlers(bot: Telegraf): void {
  // Меню
  bot.action('promo:menu', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    await showPromotionsMenu(ctx)
  })

  // Создать акцию
  bot.action('promo:create', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    await askName(ctx, ctx.from!.id)
  })

  // Тип скидки
  bot.action(/^promo:dtype:(percent|fixed)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = promotionsState.get(userId)
    if (!state || state.step !== 'discount_type') return
    const discountType = ctx.match[1] as 'percent' | 'fixed'
    await askDiscountValue(ctx, userId, state.name, discountType)
  })

  // Тип фильтра
  bot.action(/^promo:ftype:(category|brand|attribute|products)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = promotionsState.get(userId)
    if (!state || state.step !== 'filter_type') return
    const ftype = ctx.match[1]

    if (ftype === 'category') {
      promotionsState.set(userId, { ...state, step: 'filter_category' })
      await showCategoryPicker(ctx)
    } else if (ftype === 'brand') {
      promotionsState.set(userId, { ...state, step: 'filter_brand' })
      await showBrandPicker(ctx)
    } else if (ftype === 'attribute') {
      promotionsState.set(userId, { ...state, step: 'filter_attribute' })
      await ctx.reply(
        'Введите атрибут и значение:\nФормат: Память: 256 ГБ\nили: Цвет: Cosmic Orange',
        Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'promo:cancel')]]),
      )
    } else {
      promotionsState.set(userId, { ...state, step: 'filter_products', selectedProductIds: [] })
      await showProductPicker(ctx, [])
    }
  })

  // Выбор категории
  bot.action(/^promo:pick_cat:(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = promotionsState.get(userId)
    if (!state || state.step !== 'filter_category') return
    const catName = ctx.match[1]
    await askDates(ctx, userId, {
      name: state.name,
      discountType: state.discountType,
      discountValue: state.discountValue,
      filterType: 'category',
      filterValue: catName,
    })
  })

  // Выбор бренда
  bot.action(/^promo:pick_brand:(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = promotionsState.get(userId)
    if (!state || state.step !== 'filter_brand') return
    const brand = ctx.match[1]
    await askDates(ctx, userId, {
      name: state.name,
      discountType: state.discountType,
      discountValue: state.discountValue,
      filterType: 'brand',
      filterValue: brand,
    })
  })

  // Переключение товара (чекбокс)
  bot.action(/^promo:toggle_prod:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = promotionsState.get(userId)
    if (!state || state.step !== 'filter_products') return
    const prodId = parseInt(ctx.match[1], 10)
    const ids = state.selectedProductIds.includes(prodId)
      ? state.selectedProductIds.filter((id) => id !== prodId)
      : [...state.selectedProductIds, prodId]
    promotionsState.set(userId, { ...state, selectedProductIds: ids })
    await showProductPicker(ctx, ids)
  })

  // Конкретные товары: готово
  bot.action('promo:products_done', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = promotionsState.get(userId)
    if (!state || state.step !== 'filter_products') return
    if (state.selectedProductIds.length === 0) {
      try { await ctx.answerCbQuery('Выберите хотя бы один товар') } catch {}
      return
    }
    await askDates(ctx, userId, {
      name: state.name,
      discountType: state.discountType,
      discountValue: state.discountValue,
      filterType: 'products',
      filterValue: state.selectedProductIds.join(','),
    })
  })

  // Сроки: указать
  bot.action('promo:set_dates', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = promotionsState.get(userId)
    if (!state || state.step !== 'dates') return
    promotionsState.set(userId, { ...state, step: 'dates_input' })
    await ctx.reply(
      'Введите период в формате ДД.ММ.ГГГГ-ДД.ММ.ГГГГ\nНапример: 01.03.2026-31.03.2026',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'promo:cancel')]]),
    )
  })

  // Сроки: без ограничений
  bot.action('promo:no_dates', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = promotionsState.get(userId)
    if (!state || state.step !== 'dates') return
    promotionsState.set(userId, { ...state, step: 'preview' })
    await showPreview(ctx, userId)
  })

  // Запуск без уведомления
  bot.action('promo:launch_silent', async (ctx) => {
    try { await ctx.answerCbQuery('Запускаю акцию…') } catch {}
    await launchPromotion(ctx, ctx.from!.id, false)
  })

  // Запуск с рассылкой
  bot.action('promo:launch_notify', async (ctx) => {
    try { await ctx.answerCbQuery('Запускаю акцию и рассылку…') } catch {}
    await launchPromotion(ctx, ctx.from!.id, true)
  })

  // Редактировать (вернуться к началу)
  bot.action('promo:edit', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    await askName(ctx, ctx.from!.id)
  })

  // Отмена
  bot.action('promo:cancel', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    promotionsState.delete(ctx.from!.id)
    await showPromotionsMenu(ctx)
  })

  // Список активных
  bot.action('promo:list_active', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    await showActiveList(ctx)
  })

  // Список завершённых
  bot.action('promo:list_done', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    await showDoneList(ctx)
  })

  // Статистика акции
  bot.action(/^promo:stat:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const promoId = parseInt(ctx.match[1], 10)
    const promo = await prisma.promotion.findUnique({ where: { id: promoId } })
    if (!promo) return await ctx.reply('Акция не найдена.')

    const priceCount = await prisma.promotionPrice.count({ where: { promotionId: promoId } })
    const discLabel =
      promo.discountType === 'percent'
        ? `${promo.discountValue}%`
        : fmtPrice(Number(promo.discountValue))

    const period =
      promo.startsAt && promo.endsAt
        ? `${fmtDate(promo.startsAt)} — ${fmtDate(promo.endsAt)}`
        : 'Без ограничений'

    await ctx.reply(
      [
        `📊 Акция: ${promo.name}`,
        `Скидка: ${discLabel}`,
        `Фильтр: ${filterLabel(promo.filterType, promo.filterValue)}`,
        `Вариантов: ${priceCount}`,
        `Период: ${period}`,
        `Уведомление: ${promo.notificationSent ? '✅ отправлено' : '❌ не отправлялось'}`,
      ].join('\n'),
      Markup.inlineKeyboard([
        [Markup.button.callback('🛑 Завершить акцию', `promo:confirm_cancel:${promoId}`)],
        [Markup.button.callback('🔙 Назад', 'promo:list_active')],
      ]),
    )
  })

  // Подтверждение завершения
  bot.action(/^promo:confirm_cancel:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const promoId = parseInt(ctx.match[1], 10)
    const promo = await prisma.promotion.findUnique({ where: { id: promoId } })
    if (!promo) return await ctx.reply('Акция не найдена.')

    await ctx.reply(
      `Завершить акцию «${promo.name}»?\nЦены будут восстановлены.`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Да, завершить', `promo:do_cancel:${promoId}`),
          Markup.button.callback('❌ Нет', 'promo:list_active'),
        ],
      ]),
    )
  })

  // Выполнение завершения
  bot.action(/^promo:do_cancel:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('Завершаю акцию…') } catch {}
    const promoId = parseInt(ctx.match[1], 10)
    const promo = await prisma.promotion.findUnique({ where: { id: promoId } })
    if (!promo) return await ctx.reply('Акция не найдена.')

    await cancelPromotion(promoId)

    await ctx.reply(
      `✅ Акция «${promo.name}» завершена. Цены восстановлены.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📋 Активные акции', 'promo:list_active')],
        [Markup.button.callback('🏠 Главное меню', 'back:main')],
      ]),
    )
  })
}

// ─── Обработчик текстовых сообщений ──────────────────────────────────────────

export async function handlePromotionsMessage(
  ctx: Context,
  userId: number,
  text: string,
): Promise<boolean> {
  const state = promotionsState.get(userId)
  if (!state) return false

  // Шаг 1: название акции
  if (state.step === 'name') {
    if (text.length < 3) {
      await ctx.reply('Название слишком короткое. Попробуйте ещё раз.')
      return true
    }
    await askDiscountType(ctx, userId, text.trim())
    return true
  }

  // Шаг 3: размер скидки
  if (state.step === 'discount_value') {
    const val = parseFloat(text.replace(',', '.'))
    if (isNaN(val) || val <= 0) {
      await ctx.reply('Введите положительное число.')
      return true
    }
    if (state.discountType === 'percent' && (val < 1 || val > 90)) {
      await ctx.reply('Процент должен быть от 1 до 90.')
      return true
    }
    await askFilterType(ctx, userId, state.name, state.discountType, val)
    return true
  }

  // Шаг 4в: атрибут
  if (state.step === 'filter_attribute') {
    if (!text.includes(':')) {
      await ctx.reply('Формат: Ключ: Значение\nНапример: Память: 256 ГБ')
      return true
    }
    const filterValue = text.trim()
    await askDates(ctx, userId, {
      name: state.name,
      discountType: state.discountType,
      discountValue: state.discountValue,
      filterType: 'attribute',
      filterValue,
    })
    return true
  }

  // Шаг 5: ввод дат
  if (state.step === 'dates_input') {
    const parsed = parseDateRange(text)
    if (!parsed) {
      await ctx.reply(
        'Неверный формат. Пример: 01.03.2026-31.03.2026',
        Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'promo:cancel')]]),
      )
      return true
    }
    promotionsState.set(userId, {
      ...state,
      step: 'preview',
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
    })
    await showPreview(ctx, userId)
    return true
  }

  return false
}
