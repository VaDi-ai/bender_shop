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
import { atomicSale, releaseReserve } from '../../lib/stock'
import { getApiKeyValue } from '../../lib/api-key-store'
import { getUserId } from '../helpers'
import { logSecurityEvent } from '../../lib/security-log'

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
  const userId = getUserId(ctx)
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
  const userId = getUserId(ctx)
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

  // ── Выбор найденного клиента (sale/reserve) ──────────────────────────────

  bot.action(/^sale:pick_client:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const clientId = parseInt(ctx.match[1], 10)
    await startSaleFlow(ctx, clientId)
  })

  bot.action(/^res:pick_client:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const clientId = parseInt(ctx.match[1], 10)
    await startReserveFlow(ctx, clientId)
  })

  bot.action(/^sale_nc:use_name:(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const clientName = decodeURIComponent(ctx.match[1])
    salesState.set(userId, { flow: 'sale_nc', step: 'product_method', clientName })
    await ctx.reply(
      `👤 Клиент: ${clientName} (новый)\n\nВыберите способ выбора товара:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📋 Из списка', 'sale_nc:list')],
        [Markup.button.callback('🔢 По SKU', 'sale_nc:sku')],
        [Markup.button.callback('❌ Отмена', 'sale:cancel')],
      ]),
    )
  })

  bot.action(/^res_nc:use_name:(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore */ }
    const userId = getUserId(ctx)
    const clientName = decodeURIComponent(ctx.match[1])
    salesState.set(userId, { flow: 'reserve_nc', step: 'product_method', clientName })
    await ctx.reply(
      `👤 Клиент: ${clientName} (новый)\n\nВыберите способ выбора товара:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📋 Из списка', 'res_nc:list')],
        [Markup.button.callback('🔢 По SKU', 'res_nc:sku')],
        [Markup.button.callback('❌ Отмена', 'res:cancel')],
      ]),
    )
  })

  // ── Продажа: выбор из списка (категории) ──────────────────────────────────
  bot.action(/^sale:list:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const clientId = parseInt(ctx.match[1], 10)
    const userId = getUserId(ctx)
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
    if (categories.length === 0) {
      salesState.delete(userId)
      return await ctx.reply('Нет категорий товаров.')
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
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const clientId = parseInt(ctx.match[1], 10)
    const userId = getUserId(ctx)
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
    if (categories.length === 0) {
      salesState.delete(userId)
      return await ctx.reply('Нет категорий товаров.')
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
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const clientId = parseInt(ctx.match[1], 10)
    const userId = getUserId(ctx)
    salesState.set(userId, { flow: 'sale', step: 'product_sku', clientId })
    await ctx.reply('🔢 Введите SKU товара:')
  })

  // ── Резерв: выбор по SKU ───────────────────────────────────────────────────
  bot.action(/^res:sku:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const clientId = parseInt(ctx.match[1], 10)
    const userId = getUserId(ctx)
    salesState.set(userId, { flow: 'reserve', step: 'product_sku', clientId })
    await ctx.reply('🔢 Введите SKU товара:')
  })

  // ── Продажа: выбор товара из категории ────────────────────────────────────
  bot.action(/^sale:cat:(\d+):(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const clientId = parseInt(ctx.match[1], 10)
    const categoryId = parseInt(ctx.match[2], 10)
    const userId = getUserId(ctx)
    const products = await prisma.product.findMany({
      where: { categoryId, isAvailable: true },
      orderBy: { name: 'asc' },
    })
    if (products.length === 0) {
      return await ctx.reply('Нет доступных товаров в этой категории.')
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
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const clientId = parseInt(ctx.match[1], 10)
    const categoryId = parseInt(ctx.match[2], 10)
    const userId = getUserId(ctx)
    const products = await prisma.product.findMany({
      where: { categoryId, isAvailable: true },
      orderBy: { name: 'asc' },
    })
    if (products.length === 0) {
      return await ctx.reply('Нет доступных товаров в этой категории.')
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
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const clientId = parseInt(ctx.match[1], 10)
    const productId = parseInt(ctx.match[2], 10)
    const userId = getUserId(ctx)
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return await ctx.reply('Товар не найден.')
    salesState.set(userId, { flow: 'sale', step: 'qty', clientId, productId, productName: product.name, price: Number(product.price) })
    const available = product.quantity - product.reserved
    await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`)
  })

  // ── Резерв: выбран товар → шаг количество ─────────────────────────────────
  bot.action(/^res:pick:(\d+):(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const clientId = parseInt(ctx.match[1], 10)
    const productId = parseInt(ctx.match[2], 10)
    const userId = getUserId(ctx)
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return await ctx.reply('Товар не найден.')
    salesState.set(userId, { flow: 'reserve', step: 'qty', clientId, productId, productName: product.name, price: Number(product.price) })
    const available = product.quantity - product.reserved
    await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`)
  })

  // ── Подтверждение продажи ──────────────────────────────────────────────────
  bot.action(/^sale:confirm:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const state = salesState.get(userId)
    if (!state || state.flow !== 'sale' || state.step !== 'confirm') return
    salesState.delete(userId)

    const { clientId, productId, productName, price, qty } = state
    const total = Number(price) * qty

    try {
      const client = await prisma.client.findUnique({ where: { id: clientId } })
      if (!client) return await ctx.reply('Клиент не найден.')

      // Атомарно: проверяем остаток, создаём Order, списываем со склада
      await atomicSale({
        productId,
        qty,
        price: Number(price),
        productName,
        clientId,
        telegramId: client.externalId ?? String(clientId),
        userId: String(userId),
        comment: `Продажа клиенту ${client.name}`,
      })
      try { await logSecurityEvent('sale_confirmed', { productId, productName, qty, price, clientId, adminId: userId }, userId) } catch { /* logging failure should not break the operation */ }

      // Update lastPurchaseDate (totalRevenue/totalPurchases already incremented by atomicSale)
      await prisma.client.update({
        where: { id: clientId },
        data: { lastPurchaseDate: new Date() },
      })

      // Если продажа закрывает активный резерв — завершить его и освободить reserved
      const activeReservation = await prisma.reservation.findFirst({
        where: { clientId, productId, status: 'active' },
        orderBy: { createdAt: 'asc' },
      })
      if (activeReservation) {
        await releaseReserve(activeReservation.id, 'completed')
        try { await logSecurityEvent('reservation_released', { reservationId: activeReservation.id, status: 'completed', adminId: userId }, userId) } catch { /* logging failure should not break the operation */ }
      }

      const msg = `✅ Продажа оформлена: ${productName} × ${qty} — ${fmtPrice(total)} ₽`
      await ctx.reply(msg)
      await notifyToSalesTopic(ctx, msg, client.name)
      if (client.telegramTopicId) {
        await sendToTopicCtx(ctx, CRM_GROUP_ID, client.telegramTopicId, msg)
      }
    } catch (err) {
      console.error('sale:confirm error:', err)
      await ctx.reply('Ошибка при оформлении продажи.')
    }
  })

  // ── Подтверждение резерва ──────────────────────────────────────────────────
  bot.action(/^res:confirm:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const state = salesState.get(userId)
    if (!state || state.flow !== 'reserve' || state.step !== 'confirm') return
    salesState.delete(userId)

    const { clientId, productId, productName, qty } = state
    const comment = state.comment

    try {
      const client = await prisma.client.findUnique({ where: { id: clientId } })
      if (!client) return await ctx.reply('Клиент не найден.')

      // Атомарно: проверяем остаток, создаём резерв, инкрементируем reserved
      const reservation = await prisma.$transaction(async (tx) => {
        const product = await tx.product.findUniqueOrThrow({ where: { id: productId } })
        const available = product.quantity - product.reserved
        if (qty > available) {
          throw new Error(`Недостаточно товара. Доступно: ${available} шт.`)
        }
        const res = await tx.reservation.create({
          data: { clientId, productId, quantity: qty, comment, status: 'active' },
        })
        await tx.product.update({
          where: { id: productId },
          data: { reserved: { increment: qty } },
        })
        return res
      })

      try { await logSecurityEvent('reservation_created', { productId, variantId: null, quantity: qty, clientId, adminId: userId }, userId) } catch { /* logging must not break operation */ }

      const msg = `🔖 Резерв: ${productName} × ${qty} для ${client.name} до отдельного уведомления`
      await ctx.reply(
        msg,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Выдан', `res:do_complete:${reservation.id}`),
            Markup.button.callback('❌ Отменить', `res:do_cancel:${reservation.id}`),
          ],
        ]),
      )
      await notifyToSalesTopic(ctx, msg, client.name)
      if (client.telegramTopicId) {
        await sendToTopicCtx(ctx, CRM_GROUP_ID, client.telegramTopicId, msg)
      }
    } catch (err) {
      console.error('res:confirm error:', err)
      await ctx.reply('Ошибка при оформлении резерва.')
    }
  })

  // ── Отмена ─────────────────────────────────────────────────────────────────
  bot.action('sale:cancel', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    salesState.delete(getUserId(ctx))
    await ctx.reply('Продажа отменена.')
  })

  bot.action('res:cancel', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    salesState.delete(getUserId(ctx))
    await ctx.reply('Резерв отменён.')
  })

  // ── Флоу без привязки к клиенту (из топика продаж) ────────────────────────

  bot.action('sales_topic:new_sale', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    salesState.set(userId, { flow: 'sale_nc', step: 'ask_client' })
    await ctx.reply('💰 Новая продажа\n\n🔍 Найти клиента:\nВведите имя, телефон или @username')
  })

  bot.action('sales_topic:new_reserve', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    salesState.set(userId, { flow: 'reserve_nc', step: 'ask_client' })
    await ctx.reply('🔖 Новый резерв\n\n🔍 Найти клиента:\nВведите имя, телефон или @username')
  })

  // ── Выбор метода для sale_nc / reserve_nc ─────────────────────────────────

  bot.action(/^sale_nc:list$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const state = salesState.get(userId)
    if (!state || state.flow !== 'sale_nc') return
    const clientName = (state as Extract<SaleNoClientStep, { step: 'product_method' }>).clientName
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
    if (categories.length === 0) {
      salesState.delete(userId)
      return await ctx.reply('Нет категорий товаров.')
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
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const state = salesState.get(userId)
    if (!state || state.flow !== 'reserve_nc') return
    const clientName = (state as Extract<ReserveNoClientStep, { step: 'product_method' }>).clientName
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
    if (categories.length === 0) {
      salesState.delete(userId)
      return await ctx.reply('Нет категорий товаров.')
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
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const state = salesState.get(userId)
    if (!state || state.flow !== 'sale_nc') return
    const clientName = (state as Extract<SaleNoClientStep, { step: 'product_method' }>).clientName
    salesState.set(userId, { flow: 'sale_nc', step: 'product_sku', clientName })
    await ctx.reply('🔢 Введите SKU товара:')
  })

  bot.action(/^res_nc:sku$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const state = salesState.get(userId)
    if (!state || state.flow !== 'reserve_nc') return
    const clientName = (state as Extract<ReserveNoClientStep, { step: 'product_method' }>).clientName
    salesState.set(userId, { flow: 'reserve_nc', step: 'product_sku', clientName })
    await ctx.reply('🔢 Введите SKU товара:')
  })

  // ── sale_nc: категория → товары ────────────────────────────────────────────
  bot.action(/^sale_nc:cat:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
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
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
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
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const state = salesState.get(userId)
    if (!state || state.flow !== 'sale_nc') return
    const clientName = (state as Extract<SaleNoClientStep, { step: 'product_pick' }>).clientName
    const productId = parseInt(ctx.match[1], 10)
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return await ctx.reply('Товар не найден.')
    salesState.set(userId, { flow: 'sale_nc', step: 'qty', clientName, productId, productName: product.name, price: Number(product.price) })
    const available = product.quantity - product.reserved
    await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`)
  })

  bot.action(/^res_nc:pick:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const state = salesState.get(userId)
    if (!state || state.flow !== 'reserve_nc') return
    const clientName = (state as Extract<ReserveNoClientStep, { step: 'product_pick' }>).clientName
    const productId = parseInt(ctx.match[1], 10)
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product) return await ctx.reply('Товар не найден.')
    salesState.set(userId, { flow: 'reserve_nc', step: 'qty', clientName, productId, productName: product.name, price: Number(product.price) })
    const available = product.quantity - product.reserved
    await ctx.reply(`📦 ${product.name}\nДоступно: ${available} шт.\n\nВведите количество:`)
  })

  // ── sale_nc: подтверждение ─────────────────────────────────────────────────
  bot.action(/^sale_nc:confirm$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const state = salesState.get(userId)
    if (!state || state.flow !== 'sale_nc' || state.step !== 'confirm') return
    salesState.delete(userId)

    const { clientName, productId, productName, price, qty } = state
    const total = Number(price) * qty

    try {
      // Атомарно: проверяем остаток, создаём Order, списываем со склада
      await atomicSale({
        productId,
        qty,
        price: Number(price),
        productName,
        clientId: null,
        telegramId: 'crm_manual',
        userId: String(userId),
        comment: `Продажа клиенту ${clientName}`,
      })
      try { await logSecurityEvent('sale_confirmed', { productId, productName, qty, price, clientName, adminId: userId }, userId) } catch { /* logging failure should not break the operation */ }
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
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    const state = salesState.get(userId)
    if (!state || state.flow !== 'reserve_nc' || state.step !== 'confirm') return
    salesState.delete(userId)

    const { clientName, productId, productName, qty } = state
    const comment = state.comment

    try {
      // Атомарно: проверяем остаток, создаём резерв, инкрементируем reserved
      const reservation = await prisma.$transaction(async (tx) => {
        const product = await tx.product.findUniqueOrThrow({ where: { id: productId } })
        const available = product.quantity - product.reserved
        if (qty > available) {
          throw new Error(`Недостаточно товара. Доступно: ${available} шт.`)
        }
        const res = await tx.reservation.create({
          data: {
            clientId: null,
            productId,
            quantity: qty,
            comment: `${clientName}${comment ? ': ' + comment : ''}`,
            status: 'active',
          },
        })
        await tx.product.update({
          where: { id: productId },
          data: { reserved: { increment: qty } },
        })
        return res
      })
      try { await logSecurityEvent('reservation_created', { productId, variantId: null, quantity: qty, clientName, adminId: userId }, userId) } catch { /* logging must not break operation */ }

      const msg = `🔖 Резерв: ${productName} × ${qty} для ${clientName} до отдельного уведомления${comment ? '\n📝 ' + comment : ''}`
      await ctx.reply(
        msg,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Выдан', `res:do_complete:${reservation.id}`),
            Markup.button.callback('❌ Отменить', `res:do_cancel:${reservation.id}`),
          ],
        ]),
      )
      await notifyToSalesTopic(ctx, msg, clientName)
    } catch (err) {
      console.error('res_nc:confirm error:', err)
      await ctx.reply(`⚠️ Ошибка при оформлении резерва: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // ── Завершить резерв (выдан) ───────────────────────────────────────────────
  bot.action(/^res:do_complete:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const reservationId = parseInt(ctx.match[1], 10)
    try {
      const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } })
      if (!reservation || reservation.status !== 'active') {
        return ctx.answerCbQuery('Резерв уже закрыт или не найден')
      }
      await releaseReserve(reservationId, 'completed')
      try { await logSecurityEvent('reservation_released', { reservationId, status: 'completed', adminId: getUserId(ctx) }, getUserId(ctx)) } catch { /* logging failure should not break the operation */ }
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch((err) => console.error('[sales] editMarkup:', err))
      await ctx.reply(`✅ Резерв #${reservationId} завершён — товар выдан.`)
    } catch (err) {
      console.error('res:do_complete error:', err)
      await ctx.reply('Ошибка при завершении резерва.')
    }
  })

  // ── Отменить резерв ────────────────────────────────────────────────────────
  bot.action(/^res:do_cancel:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const reservationId = parseInt(ctx.match[1], 10)
    try {
      const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } })
      if (!reservation || reservation.status !== 'active') {
        return ctx.answerCbQuery('Резерв уже закрыт или не найден')
      }
      await releaseReserve(reservationId, 'cancelled')
      try { await logSecurityEvent('reservation_released', { reservationId, status: 'cancelled', adminId: getUserId(ctx) }, getUserId(ctx)) } catch { /* logging failure should not break the operation */ }
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch((err) => console.error('[sales] editMarkup:', err))
      await ctx.reply(`❌ Резерв #${reservationId} отменён.`)
    } catch (err) {
      console.error('res:do_cancel error:', err)
      await ctx.reply('Ошибка при отмене резерва.')
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
      const product = await prisma.product.findUnique({ where: { id: productId } })
      const available = (product?.quantity ?? 0) - (product?.reserved ?? 0)
      if (qty > available) {
        await ctx.reply(`Недостаточно товара. Доступно: ${available} шт.`)
        return true
      }
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
      const query = text.trim()
      // Search existing clients
      const clients = await prisma.client.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
            { telegramUsername: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 5,
      })

      if (clients.length > 0) {
        const buttons = clients.map(c => [
          Markup.button.callback(
            `${c.name}${c.phone ? ' • ' + c.phone : ''}`.slice(0, 64),
            `sale:pick_client:${c.id}`
          ),
        ])
        buttons.push([Markup.button.callback(`➕ Новый: "${query}"`, `sale_nc:use_name:${encodeURIComponent(query)}`)])
        buttons.push([Markup.button.callback('❌ Отмена', 'sale:cancel')])
        await ctx.reply(`🔍 Найдено ${clients.length} клиентов:`, Markup.inlineKeyboard(buttons))
        return true
      }

      // Not found — proceed with name as-is
      salesState.set(userId, { flow: 'sale_nc', step: 'product_method', clientName: query })
      await ctx.reply(
        `👤 Клиент: ${query} (новый)\n\nВыберите способ выбора товара:`,
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
      const query = text.trim()
      // Search existing clients
      const clients = await prisma.client.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
            { telegramUsername: { contains: query, mode: 'insensitive' } },
          ],
        },
        take: 5,
      })

      if (clients.length > 0) {
        const buttons = clients.map(c => [
          Markup.button.callback(
            `${c.name}${c.phone ? ' • ' + c.phone : ''}`.slice(0, 64),
            `res:pick_client:${c.id}`
          ),
        ])
        buttons.push([Markup.button.callback(`➕ Новый: "${query}"`, `res_nc:use_name:${encodeURIComponent(query)}`)])
        buttons.push([Markup.button.callback('❌ Отмена', 'res:cancel')])
        await ctx.reply(`🔍 Найдено ${clients.length} клиентов:`, Markup.inlineKeyboard(buttons))
        return true
      }

      // Not found — proceed with name as-is
      salesState.set(userId, { flow: 'reserve_nc', step: 'product_method', clientName: query })
      await ctx.reply(
        `👤 Клиент: ${query} (новый)\n\nВыберите способ выбора товара:`,
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
      const product = await prisma.product.findUnique({ where: { id: productId } })
      const available = (product?.quantity ?? 0) - (product?.reserved ?? 0)
      if (qty > available) {
        await ctx.reply(`Недостаточно товара. Доступно: ${available} шт.`)
        return true
      }
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
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
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
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
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
    const topicValue = await getApiKeyValue('sales_topic')
    if (!topicValue) return
    const threadId = parseInt(topicValue, 10)
    if (isNaN(threadId)) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ctx.telegram.sendMessage as any)(CRM_GROUP_ID, text, { message_thread_id: threadId })
  } catch (err) {
    console.error('notifyToSalesTopic error:', err)
  }
}

async function sendToTopicCtx(ctx: Context, chatId: number, threadId: number, text: string): Promise<void> {
  const { sendToTopic: _send } = await import('../../lib/telegram-helpers')
  await _send(ctx.telegram, chatId, threadId, text)
}

function fmtPrice(n: number): string {
  return n.toLocaleString('ru-RU')
}
