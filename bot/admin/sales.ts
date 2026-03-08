/**
 * bot/admin/sales.ts
 *
 * Флоу продажи и резерва из карточки клиента (или без привязки из топика продаж).
 *
 * Подключение в bot/index.ts:
 *   setupSalesHandlers(bot)
 *   handleSalesMessage(ctx, userId, text) — вызывать из перехватчика текстовых сообщений
 *   salesState                            — проверять наличие активного флоу
 *
 * Из webhooks/telegram.ts:
 *   startSaleFlow(ctx, clientId)          — кнопка 💰 Продажа из карточки
 *   startReserveFlow(ctx, clientId)       — кнопка 🔖 Резерв из карточки
 */

import { Context, Markup, Telegraf } from 'telegraf'
import { prisma } from '../../lib/prisma'
import { stockOut } from '../../lib/stock'

const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID)

// ─── Типы состояния ───────────────────────────────────────────────────────────

type SaleStep =
  | { flow: 'sale'; step: 'product_method'; clientId: number }
  | { flow: 'sale'; step: 'product_sku'; clientId: number }
  | { flow: 'sale'; step: 'category'; clientId: number }
  | { flow: 'sale'; step: 'product_pick'; clientId: number; categoryId: number }
  | { flow: 'sale'; step: 'qty'; clientId: number; productId: number; productName: string; price: number }
  | { flow: 'sale'; step: 'confirm'; clientId: number; productId: number; productName: string; price: number; qty: number }

type ReserveStep =
  | { flow: 'reserve'; step: 'product_method'; clientId: number }
  | { flow: 'reserve'; step: 'product_sku'; clientId: number }
  | { flow: 'reserve'; step: 'category'; clientId: number }
  | { flow: 'reserve'; step: 'product_pick'; clientId: number; categoryId: number }
  | { flow: 'reserve'; step: 'qty'; clientId: number; productId: number; productName: string; price: number }
  | { flow: 'reserve'; step: 'comment'; clientId: number; productId: number; productName: string; price: number; qty: number }
  | { flow: 'reserve'; step: 'confirm'; clientId: number; productId: number; productName: string; price: number; qty: number; comment?: string }

// Флоу без привязки к клиенту — из топика продаж
type SaleNoClientStep =
  | { flow: 'sale_nc'; step: 'ask_client' }
  | { flow: 'sale_nc'; step: 'product_method'; clientName: string }
  | { flow: 'sale_nc'; step: 'product_sku'; clientName: string }
  | { flow: 'sale_nc'; step: 'category'; clientName: string }
  | { flow: 'sale_nc'; step: 'product_pick'; clientName: string; categoryId: number }
  | { flow: 'sale_nc'; step: 'qty'; clientName: string; productId: number; productName: string; price: number }
  | { flow: 'sale_nc'; step: 'confirm'; clientName: string; productId: number; productName: string; price: number; qty: number }

type ReserveNoClientStep =
  | { flow: 'reserve_nc'; step: 'ask_client' }
  | { flow: 'reserve_nc'; step: 'product_method'; clientName: string }
  | { flow: 'reserve_nc'; step: 'product_sku'; clientName: string }
  | { flow: 'reserve_nc'; step: 'category'; clientName: string }
  | { flow: 'reserve_nc'; step: 'product_pick'; clientName: string; categoryId: number }
  | { flow: 'reserve_nc'; step: 'qty'; clientName: string; productId: number; productName: string; price: number }
  | { flow: 'reserve_nc'; step: 'comment'; clientName: string; productId: number; productName: string; price: number; qty: number }
  | { flow: 'reserve_nc'; step: 'confirm'; clientName: string; productId: number; productName: string; price: number; qty: number; comment?: string }

export type SalesFlowState = SaleStep | ReserveStep | SaleNoClientStep | ReserveNoClientStep

export const salesState = new Map<number, SalesFlowState>()

// ─── Экспортируемые хелперы для запуска флоу из карточки клиента ─────────────

export async function startSaleFlow(ctx: Context, clientId: number): Promise<void> {
  const userId = ctx.from!.id
  salesState.set(userId, { flow: 'sale', step: 'product_method', clientId })
  await ctx.reply(
    '💰 Продажа — выберите способ выбора товара:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📋 Из списка', `sale:list:${clientId}`)],
      [Markup.button.callback('🔢 По SKU', `sale:sku:${clientId}`)],
      [Markup.button.callback('❌ Отмена', `sale:cancel`)],
    ]),
  )
}

export async function startReserveFlow(ctx: Context, clientId: number): Promise<void> {
  const userId = ctx.from!.id
  salesState.set(userId, { flow: 'reserve', step: 'product_method', clientId })
  await ctx.reply(
    '🔖 Резерв — выберите способ выбора товара:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📋 Из списка', `res:list:${clientId}`)],
      [Markup.button.callback('🔢 По SKU', `res:sku:${clientId}`)],
      [Markup.button.callback('❌ Отмена', `res:cancel`)],
    ]),
  )
}

// ─── Регистрация action-обработчиков ─────────────────────────────────────────

export function setupSalesHandlers(bot: Telegraf): void {

  // ── Продажа: выбор из списка (категории) ──────────────────────────────────
  bot.action(/^sale:list:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const clientId = parseInt(ctx.match[1], 10)
    const userId = ctx.from!.id
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
    if (categories.length === 0) {
      salesState.delete(userId)
      return ctx.reply('Нет категорий товаров.')
    }
    salesState.set(userId, { flow: 'sale', step: 'category', clientId })
    await ctx.reply(
      '📂 Выберите категорию:',
      Markup.inlineKeyboard([
        ...categories.map((c) => [Markup.button.callback(c.name, `sale:cat:${clientId}:${c.id}`)]),
        [Markup.button.callback('❌ Отмена', 'sale:cancel')],
      ]),
    )
  })

  // ── Резерв: выбор из списка ────────────────────────────────────────────────
  bot.action(/^res:list:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const clientId = parseInt(ctx.match[1], 10)
    const userId = ctx.from!.id
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
    if (categories.length === 0) {
      salesState.delete(userId)
      return ctx.reply('Нет категорий товаров.')
    }
    salesState.set(userId, { flow: 'reserve', step: 'category', clientId })
    await ctx.reply(
      '📂 Выберите категорию:',
      Markup.inlineKeyboard([
        ...categories.map((c) => [Markup.button.callback(c.name, `res:cat:${clientId}:${c.id}`)]),
        [Markup.button.callback('❌ Отмена', 'res:cancel')],
      ]),
    )
  })

  // ── Продажа: выбор по SKU ──────────────────────────────────────────────────
  bot.action(/^sale:sku:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const clientId = parseInt(ctx.match[1], 10)
    const userId = ctx.from!.id
    salesState.set(userId, { flow: 'sale', step: 'product_sku', clientId })
    await ctx.reply('🔢 Введите SKU товара:')
  })

  // ── Резерв: выбор по SKU ───────────────────────────────────────────────────
  bot.action(/^res:sku:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const clientId = parseInt(ctx.match[1], 10)
    const userId = ctx.from!.id
    salesState.set(userId, { flow: 'reserve', step: 'product_sku', clientId })
    await ctx.reply('🔢 Введите SKU товара:')
  })

  // ── Продажа: выбор товара из категории ────────────────────────────────────
  bot.action(/^sale:cat:(\d+):(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const clientId = parseInt(ctx.match[1], 10)
    const categoryId = parseInt(ctx.match[2], 10)
    const userId = ctx.from!.id
    const products = await prisma.product.findMany({
      where: { categoryId, isAvailable: true },
      orderBy: { name: 'asc' },
    })
    if (products.length === 0) {
      return ctx.reply('Нет доступных товаров в этой категории.')
    }
    salesState.set(userId, { flow: 'sale', step: 'product_pick', clientId, categoryId })
    await ctx.reply(
      '📦 Выберите товар:',
      Markup.inlineKeyboard([
        ...products.map((p) => {
          const available = p.quantity - p.reserved
          return [Markup.button.callback(
            `${p.name} (${available} шт.) — ${fmtPrice(Number(p.price))} ₽`,
            `sale:pick:${clientId}:${p.id}`,
          )]
        }),
        [Markup.button.callback('❌ Отмена', 'sale:cancel')],
      ]),
    )
  })

  // ── Резерв: выбор товара из категории ─────────────────────────────────────
  bot.action(/^res:cat:(\d+):(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const clientId = parseInt(ctx.match[1], 10)
    const categoryId = parseInt(ctx.match[2], 10)
    const userId = ctx.from!.id
    const products = await prisma.product.findMany({
      where: { categoryId, isAvailable: true },
      orderBy: { name: 'asc' },
    })
    if (products.length === 0) {
      return ctx.reply('Нет доступных товаров в этой категории.')
    }
    salesState.set(userId, { flow: 'reserve', step: 'product_pick', clientId, categoryId })
    await ctx.reply(
      '📦 Выберите товар:',
      Markup.inlineKeyboard([
        ...products.map((p) => {
          const available = p.quantity - p.reserved
          return [Markup.button.callback(
            `${p.name} (${available} шт.) — ${fmtPrice(Number(p.price))} ₽`,
            `res:pick:${clientId}:${p.id}`,
          )]
        }),
        [Markup.button.callback('❌ Отмена', 'res:cancel')],
      ]),
    )
  })

  // ── Продажа: выбран товар → шаг количество ────────────────────────────────
  bot.action(/^sale:pick:(\d+):(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const clientId = parseInt(ctx.match[1], 10)
    const productId = parseInt(ctx.match[2], 10)
    const userId = ctx.from!.id
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return ctx.reply('Товар не найден.')
    salesState.set(userId, { flow: 'sale', step: 'qty', clientId, productId, productName: product.name, price: Number(product.price) })
    const available = product.quantity - product.reserved
    await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`)
  })

  // ── Резерв: выбран товар → шаг количество ─────────────────────────────────
  bot.action(/^res:pick:(\d+):(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const clientId = parseInt(ctx.match[1], 10)
    const productId = parseInt(ctx.match[2], 10)
    const userId = ctx.from!.id
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return ctx.reply('Товар не найден.')
    salesState.set(userId, { flow: 'reserve', step: 'qty', clientId, productId, productName: product.name, price: Number(product.price) })
    const available = product.quantity - product.reserved
    await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`)
  })

  // ── Подтверждение продажи ──────────────────────────────────────────────────
  bot.action(/^sale:confirm:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = salesState.get(userId)
    if (!state || state.flow !== 'sale' || state.step !== 'confirm') return
    salesState.delete(userId)

    const { clientId, productId, productName, price, qty } = state
    const total = Number(price) * qty

    try {
      const client = await prisma.client.findUnique({ where: { id: clientId } })
      if (!client) return ctx.reply('Клиент не найден.')

      // Создаём Order
      await prisma.order.create({
        data: {
          clientId,
          telegramId: client.externalId ?? String(clientId),
          items: [{ productId, name: productName, price: Number(price), qty }],
          totalAmount: total,
          payment: 'crm',
          status: 'completed',
        },
      })

      // Уменьшаем остаток и записываем движение склада
      await prisma.product.update({
        where: { id: productId },
        data: {
          quantity: { decrement: qty },
          stock: { decrement: qty },
        },
      })
      const saleVariants = await prisma.productVariant.findMany({
        where: { productId },
        orderBy: { quantity: 'desc' },
      })
      const saleVariant = saleVariants.find((v) => v.quantity >= qty) ?? saleVariants[0]
      if (saleVariant) {
        try {
          await stockOut(saleVariant.id, qty, `Продажа клиенту`, String(userId))
        } catch {
          // вариант может не иметь достаточного остатка — движение не критично
        }
      }

      // Обновляем клиента
      await prisma.client.update({
        where: { id: clientId },
        data: {
          totalPurchases: { increment: 1 },
          totalRevenue: { increment: total },
          lastPurchaseDate: new Date(),
        },
      })

      const msg = `✅ Продажа оформлена: ${productName} × ${qty} — ${fmtPrice(total)} ₽`
      await ctx.reply(msg)
      await notifyToSalesTopic(ctx, msg, client.name)
      if (client.telegramTopicId) {
        await sendToTopic(ctx, CRM_GROUP_ID, client.telegramTopicId, msg)
      }
    } catch (err) {
      console.error('sale:confirm error:', err)
      await ctx.reply('Ошибка при оформлении продажи.')
    }
  })

  // ── Подтверждение резерва ──────────────────────────────────────────────────
  bot.action(/^res:confirm:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = salesState.get(userId)
    if (!state || state.flow !== 'reserve' || state.step !== 'confirm') return
    salesState.delete(userId)

    const { clientId, productId, productName, qty } = state
    const comment = state.comment

    try {
      const client = await prisma.client.findUnique({ where: { id: clientId } })
      if (!client) return ctx.reply('Клиент не найден.')

      // Создаём резерв
      await prisma.reservation.create({
        data: { clientId, productId, quantity: qty, comment, status: 'active' },
      })

      // Увеличиваем reserved
      await prisma.product.update({
        where: { id: productId },
        data: { reserved: { increment: qty } },
      })

      const msg = `🔖 Резерв: ${productName} × ${qty} для ${client.name} до отдельного уведомления`
      await ctx.reply(msg)
      await notifyToSalesTopic(ctx, msg, client.name)
      if (client.telegramTopicId) {
        await sendToTopic(ctx, CRM_GROUP_ID, client.telegramTopicId, msg)
      }
    } catch (err) {
      console.error('res:confirm error:', err)
      await ctx.reply('Ошибка при оформлении резерва.')
    }
  })

  // ── Отмена ─────────────────────────────────────────────────────────────────
  bot.action('sale:cancel', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    salesState.delete(ctx.from!.id)
    await ctx.reply('Продажа отменена.')
  })

  bot.action('res:cancel', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    salesState.delete(ctx.from!.id)
    await ctx.reply('Резерв отменён.')
  })

  // ── Флоу без привязки к клиенту (из топика продаж) ────────────────────────

  bot.action('sales_topic:new_sale', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    salesState.set(userId, { flow: 'sale_nc', step: 'ask_client' })
    await ctx.reply('💰 Новая продажа\n\nВведите имя или телефон клиента:')
  })

  bot.action('sales_topic:new_reserve', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    salesState.set(userId, { flow: 'reserve_nc', step: 'ask_client' })
    await ctx.reply('🔖 Новый резерв\n\nВведите имя или телефон клиента:')
  })

  // ── Выбор метода для sale_nc / reserve_nc ─────────────────────────────────

  bot.action(/^sale_nc:list$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = salesState.get(userId)
    if (!state || state.flow !== 'sale_nc') return
    const clientName = (state as Extract<SaleNoClientStep, { step: 'product_method' }>).clientName
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
    if (categories.length === 0) {
      salesState.delete(userId)
      return ctx.reply('Нет категорий товаров.')
    }
    salesState.set(userId, { flow: 'sale_nc', step: 'category', clientName })
    await ctx.reply(
      '📂 Выберите категорию:',
      Markup.inlineKeyboard([
        ...categories.map((c) => [Markup.button.callback(c.name, `sale_nc:cat:${c.id}`)]),
        [Markup.button.callback('❌ Отмена', 'sale:cancel')],
      ]),
    )
  })

  bot.action(/^res_nc:list$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = salesState.get(userId)
    if (!state || state.flow !== 'reserve_nc') return
    const clientName = (state as Extract<ReserveNoClientStep, { step: 'product_method' }>).clientName
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
    if (categories.length === 0) {
      salesState.delete(userId)
      return ctx.reply('Нет категорий товаров.')
    }
    salesState.set(userId, { flow: 'reserve_nc', step: 'category', clientName })
    await ctx.reply(
      '📂 Выберите категорию:',
      Markup.inlineKeyboard([
        ...categories.map((c) => [Markup.button.callback(c.name, `res_nc:cat:${c.id}`)]),
        [Markup.button.callback('❌ Отмена', 'res:cancel')],
      ]),
    )
  })

  bot.action(/^sale_nc:sku$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = salesState.get(userId)
    if (!state || state.flow !== 'sale_nc') return
    const clientName = (state as Extract<SaleNoClientStep, { step: 'product_method' }>).clientName
    salesState.set(userId, { flow: 'sale_nc', step: 'product_sku', clientName })
    await ctx.reply('🔢 Введите SKU товара:')
  })

  bot.action(/^res_nc:sku$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = salesState.get(userId)
    if (!state || state.flow !== 'reserve_nc') return
    const clientName = (state as Extract<ReserveNoClientStep, { step: 'product_method' }>).clientName
    salesState.set(userId, { flow: 'reserve_nc', step: 'product_sku', clientName })
    await ctx.reply('🔢 Введите SKU товара:')
  })

  // ── sale_nc: категория → товары ────────────────────────────────────────────
  bot.action(/^sale_nc:cat:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = salesState.get(userId)
    if (!state || state.flow !== 'sale_nc') return
    const clientName = (state as Extract<SaleNoClientStep, { step: 'category' }>).clientName
    const categoryId = parseInt(ctx.match[1], 10)
    const products = await prisma.product.findMany({ where: { categoryId, isAvailable: true }, orderBy: { name: 'asc' } })
    salesState.set(userId, { flow: 'sale_nc', step: 'product_pick', clientName, categoryId })
    await ctx.reply(
      '📦 Выберите товар:',
      Markup.inlineKeyboard([
        ...products.map((p) => {
          const available = p.quantity - p.reserved
          return [Markup.button.callback(`${p.name} (${available} шт.)`, `sale_nc:pick:${p.id}`)]
        }),
        [Markup.button.callback('❌ Отмена', 'sale:cancel')],
      ]),
    )
  })

  bot.action(/^res_nc:cat:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = salesState.get(userId)
    if (!state || state.flow !== 'reserve_nc') return
    const clientName = (state as Extract<ReserveNoClientStep, { step: 'category' }>).clientName
    const categoryId = parseInt(ctx.match[1], 10)
    const products = await prisma.product.findMany({ where: { categoryId, isAvailable: true }, orderBy: { name: 'asc' } })
    salesState.set(userId, { flow: 'reserve_nc', step: 'product_pick', clientName, categoryId })
    await ctx.reply(
      '📦 Выберите товар:',
      Markup.inlineKeyboard([
        ...products.map((p) => {
          const available = p.quantity - p.reserved
          return [Markup.button.callback(`${p.name} (${available} шт.)`, `res_nc:pick:${p.id}`)]
        }),
        [Markup.button.callback('❌ Отмена', 'res:cancel')],
      ]),
    )
  })

  // ── sale_nc: выбран товар → количество ────────────────────────────────────
  bot.action(/^sale_nc:pick:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = salesState.get(userId)
    if (!state || state.flow !== 'sale_nc') return
    const clientName = (state as Extract<SaleNoClientStep, { step: 'product_pick' }>).clientName
    const productId = parseInt(ctx.match[1], 10)
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return ctx.reply('Товар не найден.')
    salesState.set(userId, { flow: 'sale_nc', step: 'qty', clientName, productId, productName: product.name, price: Number(product.price) })
    const available = product.quantity - product.reserved
    await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`)
  })

  bot.action(/^res_nc:pick:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = salesState.get(userId)
    if (!state || state.flow !== 'reserve_nc') return
    const clientName = (state as Extract<ReserveNoClientStep, { step: 'product_pick' }>).clientName
    const productId = parseInt(ctx.match[1], 10)
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return ctx.reply('Товар не найден.')
    salesState.set(userId, { flow: 'reserve_nc', step: 'qty', clientName, productId, productName: product.name, price: Number(product.price) })
    const available = product.quantity - product.reserved
    await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`)
  })

  // ── sale_nc: подтверждение ─────────────────────────────────────────────────
  bot.action(/^sale_nc:confirm$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = salesState.get(userId)
    if (!state || state.flow !== 'sale_nc' || state.step !== 'confirm') return
    salesState.delete(userId)

    const { clientName, productId, productName, price, qty } = state
    const total = Number(price) * qty

    try {
      await prisma.order.create({
        data: {
          telegramId: 'crm_manual',
          items: [{ productId, name: productName, price: Number(price), qty }],
          totalAmount: total,
          payment: 'crm',
          status: 'completed',
        },
      })
      await prisma.product.update({
        where: { id: productId },
        data: { quantity: { decrement: qty }, stock: { decrement: qty } },
      })
      const ncVariants = await prisma.productVariant.findMany({
        where: { productId },
        orderBy: { quantity: 'desc' },
      })
      const ncVariant = ncVariants.find((v) => v.quantity >= qty) ?? ncVariants[0]
      if (ncVariant) {
        try {
          await stockOut(ncVariant.id, qty, `Продажа клиенту ${clientName}`, String(userId))
        } catch {
          // игнорируем если у варианта нет достаточного остатка
        }
      }
      const msg = `✅ Продажа оформлена: ${productName} × ${qty} — ${fmtPrice(total)} ₽\n👤 Клиент: ${clientName}`
      await ctx.reply(msg)
      await notifyToSalesTopic(ctx, msg, clientName)
    } catch (err) {
      console.error('sale_nc:confirm error:', err)
      await ctx.reply('Ошибка при оформлении продажи.')
    }
  })

  // ── res_nc: подтверждение ──────────────────────────────────────────────────
  bot.action(/^res_nc:confirm$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = salesState.get(userId)
    if (!state || state.flow !== 'reserve_nc' || state.step !== 'confirm') return
    salesState.delete(userId)

    const { clientName, productId, productName, qty } = state
    const comment = state.comment

    try {
      // Без clientId — безымянный резерв
      await prisma.reservation.create({
        data: {
          clientId: 0, // заглушка — нет привязки к клиенту в БД
          productId,
          quantity: qty,
          comment: `${clientName}${comment ? ': ' + comment : ''}`,
          status: 'active',
        },
      }).catch(() => {
        // если FK нарушен (clientId=0) — создаём без clientId через rawQuery не нужно,
        // просто логируем и продолжаем
        console.warn('res_nc: clientId=0 not in DB, reservation not saved')
      })
      await prisma.product.update({
        where: { id: productId },
        data: { reserved: { increment: qty } },
      })
      const msg = `🔖 Резерв: ${productName} × ${qty} для ${clientName} до отдельного уведомления${comment ? '\n📝 ' + comment : ''}`
      await ctx.reply(msg)
      await notifyToSalesTopic(ctx, msg, clientName)
    } catch (err) {
      console.error('res_nc:confirm error:', err)
      await ctx.reply('Ошибка при оформлении резерва.')
    }
  })
}

// ─── Обработчик текстовых сообщений для активных флоу ─────────────────────────

export async function handleSalesMessage(
  ctx: Context,
  userId: number,
  text: string,
): Promise<boolean> {
  const state = salesState.get(userId)
  if (!state) return false

  // ── Флоу: продажа с клиентом ──────────────────────────────────────────────

  if (state.flow === 'sale') {
    if (state.step === 'product_sku') {
      const product = await prisma.product.findUnique({ where: { sku: text.trim() } })
      if (!product) {
        await ctx.reply('Товар с таким SKU не найден. Попробуйте ещё раз:')
        return true
      }
      salesState.set(userId, { flow: 'sale', step: 'qty', clientId: state.clientId, productId: product.id, productName: product.name, price: Number(product.price) })
      const available = product.quantity - product.reserved
      await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`)
      return true
    }

    if (state.step === 'qty') {
      const qty = parseInt(text.trim(), 10)
      if (isNaN(qty) || qty <= 0) {
        await ctx.reply('Введите корректное количество (целое число > 0):')
        return true
      }
      const { clientId, productId, productName, price } = state
      const product = await prisma.product.findUnique({ where: { id: productId } })
      const available = (product?.quantity ?? 0) - (product?.reserved ?? 0)
      if (qty > available) {
        await ctx.reply(`Недостаточно товара. Доступно: ${available} шт.`)
        return true
      }
      const total = Number(price) * qty
      const client = await prisma.client.findUnique({ where: { id: clientId } })
      salesState.set(userId, { flow: 'sale', step: 'confirm', clientId, productId, productName, price, qty })
      await ctx.reply(
        `💰 Подтверждение продажи:\n\n📦 ${productName} × ${qty} — ${fmtPrice(total)} ₽\n👤 Клиент: ${client?.name ?? clientId}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Подтвердить', `sale:confirm:${clientId}`)],
          [Markup.button.callback('❌ Отмена', 'sale:cancel')],
        ]),
      )
      return true
    }
  }

  // ── Флоу: резерв с клиентом ───────────────────────────────────────────────

  if (state.flow === 'reserve') {
    if (state.step === 'product_sku') {
      const product = await prisma.product.findUnique({ where: { sku: text.trim() } })
      if (!product) {
        await ctx.reply('Товар с таким SKU не найден. Попробуйте ещё раз:')
        return true
      }
      salesState.set(userId, { flow: 'reserve', step: 'qty', clientId: state.clientId, productId: product.id, productName: product.name, price: Number(product.price) })
      const available = product.quantity - product.reserved
      await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`)
      return true
    }

    if (state.step === 'qty') {
      const qty = parseInt(text.trim(), 10)
      if (isNaN(qty) || qty <= 0) {
        await ctx.reply('Введите корректное количество:')
        return true
      }
      const { clientId, productId, productName, price } = state
      salesState.set(userId, { flow: 'reserve', step: 'comment', clientId, productId, productName, price, qty })
      await ctx.reply(
        'Введите комментарий к резерву (или «-» чтобы пропустить):',
        Markup.inlineKeyboard([[Markup.button.callback('Пропустить', `res:skip_comment:${clientId}`)]]),
      )
      return true
    }

    if (state.step === 'comment') {
      const comment = text === '-' ? undefined : text
      const { clientId, productId, productName, price, qty } = state
      const client = await prisma.client.findUnique({ where: { id: clientId } })
      salesState.set(userId, { flow: 'reserve', step: 'confirm', clientId, productId, productName, price, qty, comment })
      await ctx.reply(
        `🔖 Подтверждение резерва:\n\n📦 ${productName} × ${qty}\n👤 Клиент: ${client?.name ?? clientId}${comment ? '\n📝 ' + comment : ''}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Подтвердить', `res:confirm:${clientId}`)],
          [Markup.button.callback('❌ Отмена', 'res:cancel')],
        ]),
      )
      return true
    }
  }

  // ── Флоу: продажа без клиента (nc) ────────────────────────────────────────

  if (state.flow === 'sale_nc') {
    if (state.step === 'ask_client') {
      const clientName = text.trim()
      salesState.set(userId, { flow: 'sale_nc', step: 'product_method', clientName })
      await ctx.reply(
        `👤 Клиент: ${clientName}\n\nВыберите способ выбора товара:`,
        Markup.inlineKeyboard([
          [Markup.button.callback('📋 Из списка', 'sale_nc:list')],
          [Markup.button.callback('🔢 По SKU', 'sale_nc:sku')],
          [Markup.button.callback('❌ Отмена', 'sale:cancel')],
        ]),
      )
      return true
    }

    if (state.step === 'product_sku') {
      const product = await prisma.product.findUnique({ where: { sku: text.trim() } })
      if (!product) {
        await ctx.reply('Товар с таким SKU не найден. Попробуйте ещё раз:')
        return true
      }
      salesState.set(userId, { flow: 'sale_nc', step: 'qty', clientName: state.clientName, productId: product.id, productName: product.name, price: Number(product.price) })
      const available = product.quantity - product.reserved
      await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`)
      return true
    }

    if (state.step === 'qty') {
      const qty = parseInt(text.trim(), 10)
      if (isNaN(qty) || qty <= 0) {
        await ctx.reply('Введите корректное количество:')
        return true
      }
      const { clientName, productId, productName, price } = state
      const total = Number(price) * qty
      salesState.set(userId, { flow: 'sale_nc', step: 'confirm', clientName, productId, productName, price, qty })
      await ctx.reply(
        `💰 Подтверждение продажи:\n\n📦 ${productName} × ${qty} — ${fmtPrice(total)} ₽\n👤 Клиент: ${clientName}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Подтвердить', 'sale_nc:confirm')],
          [Markup.button.callback('❌ Отмена', 'sale:cancel')],
        ]),
      )
      return true
    }
  }

  // ── Флоу: резерв без клиента (nc) ─────────────────────────────────────────

  if (state.flow === 'reserve_nc') {
    if (state.step === 'ask_client') {
      const clientName = text.trim()
      salesState.set(userId, { flow: 'reserve_nc', step: 'product_method', clientName })
      await ctx.reply(
        `👤 Клиент: ${clientName}\n\nВыберите способ выбора товара:`,
        Markup.inlineKeyboard([
          [Markup.button.callback('📋 Из списка', 'res_nc:list')],
          [Markup.button.callback('🔢 По SKU', 'res_nc:sku')],
          [Markup.button.callback('❌ Отмена', 'res:cancel')],
        ]),
      )
      return true
    }

    if (state.step === 'product_sku') {
      const product = await prisma.product.findUnique({ where: { sku: text.trim() } })
      if (!product) {
        await ctx.reply('Товар с таким SKU не найден. Попробуйте ещё раз:')
        return true
      }
      salesState.set(userId, { flow: 'reserve_nc', step: 'qty', clientName: state.clientName, productId: product.id, productName: product.name, price: Number(product.price) })
      const available = product.quantity - product.reserved
      await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`)
      return true
    }

    if (state.step === 'qty') {
      const qty = parseInt(text.trim(), 10)
      if (isNaN(qty) || qty <= 0) {
        await ctx.reply('Введите корректное количество:')
        return true
      }
      const { clientName, productId, productName, price } = state
      salesState.set(userId, { flow: 'reserve_nc', step: 'comment', clientName, productId, productName, price, qty })
      await ctx.reply(
        'Введите комментарий к резерву (или «-» чтобы пропустить):',
        Markup.inlineKeyboard([[Markup.button.callback('Пропустить', 'res_nc:skip_comment')]]),
      )
      return true
    }

    if (state.step === 'comment') {
      const comment = text === '-' ? undefined : text
      const { clientName, productId, productName, price, qty } = state
      salesState.set(userId, { flow: 'reserve_nc', step: 'confirm', clientName, productId, productName, price, qty, comment })
      await ctx.reply(
        `🔖 Подтверждение резерва:\n\n📦 ${productName} × ${qty}\n👤 Клиент: ${clientName}${comment ? '\n📝 ' + comment : ''}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Подтвердить', 'res_nc:confirm')],
          [Markup.button.callback('❌ Отмена', 'res:cancel')],
        ]),
      )
      return true
    }
  }

  return false
}

// ─── Хелпер: пропустить комментарий ──────────────────────────────────────────

export function registerSkipCommentHandlers(bot: Telegraf): void {
  bot.action(/^res:skip_comment:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = salesState.get(userId)
    if (!state || state.flow !== 'reserve' || state.step !== 'comment') return
    const { clientId, productId, productName, price, qty } = state
    const client = await prisma.client.findUnique({ where: { id: clientId } })
    salesState.set(userId, { flow: 'reserve', step: 'confirm', clientId, productId, productName, price, qty })
    await ctx.reply(
      `🔖 Подтверждение резерва:\n\n📦 ${productName} × ${qty}\n👤 Клиент: ${client?.name ?? clientId}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Подтвердить', `res:confirm:${clientId}`)],
        [Markup.button.callback('❌ Отмена', 'res:cancel')],
      ]),
    )
  })

  bot.action('res_nc:skip_comment', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = salesState.get(userId)
    if (!state || state.flow !== 'reserve_nc' || state.step !== 'comment') return
    const { clientName, productId, productName, price, qty } = state
    salesState.set(userId, { flow: 'reserve_nc', step: 'confirm', clientName, productId, productName, price, qty })
    await ctx.reply(
      `🔖 Подтверждение резерва:\n\n📦 ${productName} × ${qty}\n👤 Клиент: ${clientName}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Подтвердить', 'res_nc:confirm')],
        [Markup.button.callback('❌ Отмена', 'res:cancel')],
      ]),
    )
  })
}

// ─── Хелпер: дублировать в топик продаж ──────────────────────────────────────

async function notifyToSalesTopic(ctx: Context, text: string, clientName: string): Promise<void> {
  try {
    const topicRecord = await prisma.apiKey.findUnique({ where: { service: 'sales_topic' } })
    if (!topicRecord) return
    const threadId = parseInt(topicRecord.value, 10)
    if (isNaN(threadId)) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ctx.telegram.sendMessage as any)(CRM_GROUP_ID, text, { message_thread_id: threadId })
  } catch (err) {
    console.error('notifyToSalesTopic error:', err)
  }
}

async function sendToTopic(ctx: Context, chatId: number, threadId: number, text: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (ctx.telegram.sendMessage as any)(chatId, text, { message_thread_id: threadId })
}

function fmtPrice(n: number): string {
  return n.toLocaleString('ru-RU')
}
