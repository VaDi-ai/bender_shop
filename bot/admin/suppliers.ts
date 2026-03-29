/**
 * bot/admin/suppliers.ts
 *
 * Управление поставщиками:
 *   - Список поставщиков с последней активностью
 *   - Добавить (имя → chat ID → тип чата → наценка)
 *   - Редактировать (имя, наценка, вкл/выкл)
 *   - Удалить
 *   - Просмотр цен от поставщика
 *   - Наценка по умолчанию
 *   - Сводка цен за сегодня
 */

import { Context, Markup, Telegraf } from 'telegraf'
import { prisma } from '../../lib/prisma'
import { getApiKeyValue, setApiKeyValue } from '../../lib/api-key-store'
import { getUserId } from '../helpers'
import { logSecurityEvent } from '../../lib/security-log'

// ─── Типы ─────────────────────────────────────────────────────────────────────

type SupplierFlow =
  | { flow: 'add_name' }
  | { flow: 'add_chatid'; name: string; chatId?: string }
  | { flow: 'add_markup'; name: string; chatId: string; chatType: string }
  | { flow: 'edit_name'; supplierId: number }
  | { flow: 'edit_markup'; supplierId: number }
  | { flow: 'default_markup' }

export const suppliersState = new Map<number, SupplierFlow>()

// ─── Форматирование ───────────────────────────────────────────────────────────

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(d: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  if (date.getTime() === today.getTime()) return fmtTime(d)
  const diff = today.getTime() - date.getTime()
  if (diff < 24 * 60 * 60 * 1000) return 'вчера'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

// ─── Меню поставщиков ─────────────────────────────────────────────────────────

export async function showSuppliersMenu(ctx: Context): Promise<void> {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { prices: { where: { isActive: true } } } } },
  })

  const defaultMarkup = await getApiKeyValue('default_markup')
  const markupVal = defaultMarkup ?? '5'

  const lines = ['🏭 Поставщики\n']
  for (const s of suppliers) {
    const status = s.isActive ? '' : ' ❌ неактивен'
    const lastPrice = s.lastPriceAt ? `🕐 ${fmtDate(s.lastPriceAt)}` : '🕐 —'
    lines.push(`${s.name} — 📦 ${s._count.prices} цен, ${lastPrice}${status}`)
  }
  if (!suppliers.length) lines.push('Нет поставщиков')

  const supplierRows = suppliers.map(s => [
    Markup.button.callback(`📦 ${s.name.slice(0, 28)}`, `sup:view:${s.id}`),
  ])

  await ctx.reply(
    lines.join('\n'),
    Markup.inlineKeyboard([
      ...supplierRows,
      [Markup.button.callback('➕ Добавить поставщика', 'sup:add')],
      [Markup.button.callback(`⚙️ Наценка по умолчанию: ${markupVal}%`, 'sup:default_markup')],
      [Markup.button.callback('📊 Все цены за сегодня', 'sup:today')],
      [Markup.button.callback('🔙 Назад', 'back:main')],
    ]),
  )
}

// ─── Просмотр цен поставщика ──────────────────────────────────────────────────

async function showSupplierPrices(ctx: Context, supplierId: number): Promise<void> {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier) { await ctx.reply('❌ Поставщик не найден.'); return }

  const prices = await prisma.supplierPrice.findMany({
    where: { supplierId, isActive: true },
    orderBy: { parsedAt: 'desc' },
    take: 20,
  })

  const lines = [`📦 Цены от ${supplier.name} (наценка ${Number(supplier.markup)}%):\n`]
  if (!prices.length) {
    lines.push('Нет активных цен')
  } else {
    for (const p of prices) {
      const parts = [p.model]
      if (p.storage) parts.push(p.storage)
      if (p.color) parts.push(p.color)
      if (p.country) parts.push(p.country)
      parts.push(`— ${Number(p.price).toLocaleString('ru-RU')}₽`)
      parts.push(`(${fmtTime(p.parsedAt)})`)
      lines.push(parts.join(' '))
    }
  }

  const statusLabel = supplier.isActive ? '❌ Выключить' : '✅ Включить'
  const statusAction = supplier.isActive ? `sup:disable:${supplierId}` : `sup:enable:${supplierId}`

  await ctx.reply(
    lines.join('\n'),
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✏️ Имя', `sup:edit_name:${supplierId}`),
        Markup.button.callback(`💰 Наценка: ${Number(supplier.markup)}%`, `sup:edit_markup:${supplierId}`),
      ],
      [
        Markup.button.callback(statusLabel, statusAction),
        Markup.button.callback('🗑️ Удалить', `sup:del:${supplierId}`),
      ],
      [Markup.button.callback('🔙 Назад', 'sup:menu')],
    ]),
  )
}

// ─── Сводка цен за сегодня ────────────────────────────────────────────────────

async function showTodayPrices(ctx: Context): Promise<void> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const prices = await prisma.supplierPrice.findMany({
    where: { isActive: true, parsedAt: { gte: today } },
    include: { supplier: true },
    orderBy: { model: 'asc' },
  })

  if (!prices.length) {
    await ctx.reply(
      '📊 За сегодня нет новых цен.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'sup:menu')]]),
    )
    return
  }

  // Группировка по модели+storage
  const groups = new Map<string, typeof prices>()
  for (const p of prices) {
    const key = `${p.model}${p.storage ? ' ' + p.storage : ''}`
    const list = groups.get(key) ?? []
    list.push(p)
    groups.set(key, list)
  }

  const dateStr = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const lines = [`📊 Цены за сегодня (${dateStr}):\n`]

  for (const [model, items] of groups) {
    lines.push(`${model}:`)
    // Sort by price ascending
    items.sort((a, b) => Number(a.price) - Number(b.price))
    for (let i = 0; i < items.length; i++) {
      const p = items[i]!
      const country = p.country ? ` (${p.country})` : ''
      const best = i === 0 && items.length > 1 ? ' ← лучшая' : ''
      lines.push(`  ${p.supplier.name}: ${Number(p.price).toLocaleString('ru-RU')}₽${country}${best}`)
    }
    lines.push('')
  }

  // Truncate if too long
  const text = lines.join('\n').slice(0, 4000)

  await ctx.reply(
    text,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'sup:menu')]]),
  )
}

// ─── Регистрация обработчиков ─────────────────────────────────────────────────

export function setupSupplierHandlers(bot: Telegraf): void {

  bot.action('sup:menu', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    suppliersState.delete(getUserId(ctx))
    await showSuppliersMenu(ctx)
  })

  // ── Просмотр поставщика ────────────────────────────────────────────────────

  bot.action(/^sup:view:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    await showSupplierPrices(ctx, parseInt(ctx.match[1]!, 10))
  })

  // ── Добавление поставщика ──────────────────────────────────────────────────

  bot.action('sup:add', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    suppliersState.set(getUserId(ctx), { flow: 'add_name' })
    await ctx.reply(
      'Шаг 1 — введите имя поставщика:',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'sup:menu')]]),
    )
  })

  // ── Редактирование ────────────────────────────────────────────────────────

  bot.action(/^sup:edit_name:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const supplierId = parseInt(ctx.match[1]!, 10)
    suppliersState.set(getUserId(ctx), { flow: 'edit_name', supplierId })
    await ctx.reply(
      'Введите новое имя поставщика:',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'sup:menu')]]),
    )
  })

  bot.action(/^sup:edit_markup:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const supplierId = parseInt(ctx.match[1]!, 10)
    suppliersState.set(getUserId(ctx), { flow: 'edit_markup', supplierId })
    await ctx.reply(
      'Введите наценку для этого поставщика (%, например 5):',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'sup:menu')]]),
    )
  })

  // ── Включить/выключить ────────────────────────────────────────────────────

  bot.action(/^sup:disable:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const id = parseInt(ctx.match[1]!, 10)
    await prisma.supplier.update({ where: { id }, data: { isActive: false } })
    try { await logSecurityEvent('supplier_updated', { supplierId: id, field: 'isActive', newValue: false, adminId: getUserId(ctx) }, getUserId(ctx)) } catch { /* ignore */ }
    await ctx.reply('❌ Поставщик выключен.')
    await showSupplierPrices(ctx, id)
  })

  bot.action(/^sup:enable:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const id = parseInt(ctx.match[1]!, 10)
    await prisma.supplier.update({ where: { id }, data: { isActive: true } })
    try { await logSecurityEvent('supplier_updated', { supplierId: id, field: 'isActive', newValue: true, adminId: getUserId(ctx) }, getUserId(ctx)) } catch { /* ignore */ }
    await ctx.reply('✅ Поставщик включён.')
    await showSupplierPrices(ctx, id)
  })

  // ── Удаление ──────────────────────────────────────────────────────────────

  bot.action(/^sup:del:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const id = parseInt(ctx.match[1]!, 10)
    const supplier = await prisma.supplier.findUnique({ where: { id } })
    if (!supplier) return
    await ctx.reply(
      `Удалить поставщика «${supplier.name}» и все его цены?`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Да, удалить', `sup:del_ok:${id}`),
          Markup.button.callback('❌ Отмена', `sup:view:${id}`),
        ],
      ]),
    )
  })

  bot.action(/^sup:del_ok:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Удаляю…') } catch { /* ignore */ }
    const id = parseInt(ctx.match[1]!, 10)
    const supplier = await prisma.supplier.findUnique({ where: { id } })
    await prisma.supplier.delete({ where: { id } })
    try { await logSecurityEvent('supplier_deleted', { supplierId: id, name: supplier?.name, adminId: getUserId(ctx) }, getUserId(ctx)) } catch { /* ignore */ }
    await ctx.reply('✅ Поставщик удалён.')
    await showSuppliersMenu(ctx)
  })

  // ── Наценка по умолчанию ──────────────────────────────────────────────────

  bot.action('sup:default_markup', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    suppliersState.set(getUserId(ctx), { flow: 'default_markup' })
    const current = await getApiKeyValue('default_markup')
    await ctx.reply(
      `Текущая наценка по умолчанию: ${current ?? '5'}%\n\nВведите новое значение:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'sup:menu')]]),
    )
  })

  // ── Цены за сегодня ───────────────────────────────────────────────────────

  bot.action('sup:today', async (ctx) => {
    try { await ctx.answerCbQuery('⏳ Загрузка...') } catch { /* ignore */ }
    await showTodayPrices(ctx)
  })

  // ── Выбор типа чата (при добавлении) ──────────────────────────────────────

  bot.action(/^sup:chattype:(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const state = suppliersState.get(userId)
    if (!state || state.flow !== 'add_chatid' || !state.chatId) return
    const chatType = ctx.match[1]!
    suppliersState.set(userId, { flow: 'add_markup', name: state.name, chatId: state.chatId, chatType })
    await ctx.reply(
      `Шаг 3 — введите наценку для «${state.name}» (%, по умолчанию 5):\n\nИли отправьте /skip для наценки 5%.`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'sup:menu')]]),
    )
  })
}

// ─── Обработчик текстовых сообщений ──────────────────────────────────────────

export async function handleSuppliersMessage(
  ctx: Context,
  userId: number,
  text: string,
): Promise<boolean> {
  const state = suppliersState.get(userId)
  if (!state) return false

  // Шаг 1: имя
  if (state.flow === 'add_name') {
    const name = text.trim()
    if (!name || name.length > 50) {
      await ctx.reply('Введите имя (до 50 символов):')
      return true
    }
    const exists = await prisma.supplier.findUnique({ where: { name } })
    if (exists) {
      await ctx.reply(`❌ Поставщик «${name}» уже существует.`)
      return true
    }
    suppliersState.set(userId, { flow: 'add_chatid', name })
    await ctx.reply(
      'Шаг 2 — перешлите любое сообщение из чата поставщика (бот определит chat ID)\nили введите chat ID вручную (число):',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'sup:menu')]]),
    )
    return true
  }

  // Шаг 2: chat ID
  if (state.flow === 'add_chatid') {
    // Проверяем пересланное сообщение
    const fwd = (ctx.message as { forward_from_chat?: { id: number; type: string } })?.forward_from_chat
    let chatId: string
    let chatType: string

    if (fwd) {
      chatId = String(fwd.id)
      chatType = fwd.type === 'channel' ? 'channel' : 'group'
    } else {
      // Ручной ввод chat ID
      const parsed = text.trim().replace(/\s/g, '')
      if (!/^-?\d+$/.test(parsed)) {
        await ctx.reply('Введите числовой chat ID или перешлите сообщение из чата поставщика:')
        return true
      }
      chatId = parsed
      // Ask chat type
      suppliersState.set(userId, { ...state, chatId })
      await ctx.reply(
        `Chat ID: ${chatId}\nВыберите тип чата:`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('👥 Группа', 'sup:chattype:group'),
            Markup.button.callback('📢 Канал', 'sup:chattype:channel'),
            Markup.button.callback('👤 Личный', 'sup:chattype:private'),
          ],
          [Markup.button.callback('❌ Отмена', 'sup:menu')],
        ]),
      )
      return true
    }

    // Forwarded → skip chat type selection
    const existsByChatId = await prisma.supplier.findUnique({ where: { chatId } })
    if (existsByChatId) {
      await ctx.reply(`❌ Чат ${chatId} уже привязан к поставщику «${existsByChatId.name}».`)
      return true
    }

    suppliersState.set(userId, { flow: 'add_markup', name: state.name, chatId, chatType })
    await ctx.reply(
      `Шаг 3 — введите наценку для «${state.name}» (%, по умолчанию 5):\n\nИли отправьте /skip для наценки 5%.`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'sup:menu')]]),
    )
    return true
  }

  // Шаг 3: наценка
  if (state.flow === 'add_markup') {
    let markup = 5
    if (text.trim() !== '/skip') {
      const val = parseFloat(text.replace(',', '.'))
      if (isNaN(val) || val < 0 || val > 100) {
        await ctx.reply('Введите число от 0 до 100 или /skip:')
        return true
      }
      markup = val
    }
    suppliersState.delete(userId)

    // Check chatId uniqueness again
    const existsByChatId = await prisma.supplier.findUnique({ where: { chatId: state.chatId } })
    if (existsByChatId) {
      await ctx.reply(`❌ Чат ${state.chatId} уже привязан к поставщику «${existsByChatId.name}».`)
      await showSuppliersMenu(ctx)
      return true
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: state.name,
        chatId: state.chatId,
        chatType: state.chatType,
        markup,
      },
    })
    try { await logSecurityEvent('supplier_created', { supplierId: supplier.id, name: state.name, chatId: state.chatId, adminId: userId }, userId) } catch { /* ignore */ }
    await ctx.reply(`✅ Поставщик «${state.name}» добавлен (наценка ${markup}%, чат ${state.chatId}).`)
    await showSuppliersMenu(ctx)
    return true
  }

  // Редактирование имени
  if (state.flow === 'edit_name') {
    const name = text.trim()
    if (!name || name.length > 50) {
      await ctx.reply('Введите имя (до 50 символов):')
      return true
    }
    suppliersState.delete(userId)
    const oldSupplier = await prisma.supplier.findUnique({ where: { id: state.supplierId } })
    await prisma.supplier.update({ where: { id: state.supplierId }, data: { name } })
    try { await logSecurityEvent('supplier_updated', { supplierId: state.supplierId, field: 'name', oldValue: oldSupplier?.name, newValue: name, adminId: userId }, userId) } catch { /* ignore */ }
    await ctx.reply(`✅ Имя изменено на «${name}».`)
    await showSupplierPrices(ctx, state.supplierId)
    return true
  }

  // Редактирование наценки
  if (state.flow === 'edit_markup') {
    const val = parseFloat(text.replace(',', '.'))
    if (isNaN(val) || val < 0 || val > 100) {
      await ctx.reply('Введите число от 0 до 100:')
      return true
    }
    suppliersState.delete(userId)
    const oldSup = await prisma.supplier.findUnique({ where: { id: state.supplierId } })
    await prisma.supplier.update({ where: { id: state.supplierId }, data: { markup: val } })
    try { await logSecurityEvent('supplier_updated', { supplierId: state.supplierId, field: 'markup', oldValue: Number(oldSup?.markup), newValue: val, adminId: userId }, userId) } catch { /* ignore */ }
    await ctx.reply(`✅ Наценка изменена на ${val}%.`)
    await showSupplierPrices(ctx, state.supplierId)
    return true
  }

  // Наценка по умолчанию
  if (state.flow === 'default_markup') {
    const val = parseFloat(text.replace(',', '.'))
    if (isNaN(val) || val < 0 || val > 100) {
      await ctx.reply('Введите число от 0 до 100:')
      return true
    }
    suppliersState.delete(userId)
    const oldMarkup = await getApiKeyValue('default_markup')
    await setApiKeyValue('default_markup', String(val))
    try { await logSecurityEvent('supplier_markup_changed', { oldMarkup: oldMarkup ?? '5', newMarkup: val, adminId: userId }, userId) } catch { /* ignore */ }
    await ctx.reply(`✅ Наценка по умолчанию: ${val}%.`)
    await showSuppliersMenu(ctx)
    return true
  }

  return false
}
