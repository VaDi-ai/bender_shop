/**
 * webhooks/supplier.ts
 *
 * Обработка сообщений из чатов поставщиков.
 * Бот добавлен в группы/каналы/личные чаты поставщиков.
 * При получении текстового сообщения — AI парсит и сохраняет цены.
 */

import { Telegraf } from 'telegraf'
import type { Context } from 'telegraf'
import { prisma } from '../lib/prisma'
import { parseSupplierMessage } from '../lib/ai-parser'
import { getApiKeyValue } from '../lib/api-key-store'
import { roundPrice } from '../lib/currency'
import log from '../lib/logger'

const ADMIN_IDS = (process.env.ADMIN_IDS ?? '').split(',').map((id) => Number(id.trim())).filter(Boolean)

/**
 * Обработка сообщения из чата поставщика.
 * Вызывается из bot middleware ПЕРЕД admin gate.
 */
export async function handleSupplierMessage(
  ctx: Context,
  bot: Telegraf,
): Promise<boolean> {
  const chatId = ctx.chat?.id
  const text = (ctx.message as { text?: string })?.text

  if (!chatId || !text) return false

  // Проверяем это чат поставщика?
  const supplier = await prisma.supplier.findUnique({
    where: { chatId: String(chatId) },
  })
  if (!supplier || !supplier.isActive) return false

  // Минимальная длина — отсекаем "ок", "привет" и т.д.
  if (text.length < 15) return false

  // Проверяем что сообщение похоже на прайс (содержит цену)
  const hasPricePattern = /\d{2,3}[.,]\d{3}|\d{4,6}\s*₽|\d{4,6}\s*р/i.test(text)
  if (!hasPricePattern) return false

  log.info('Parsing supplier price', { supplier: supplier.name, chatId, textPreview: text.slice(0, 80) })

  try {
    const parsed = await parseSupplierMessage(text)
    if (parsed.length === 0) return false

    // Сохраняем спарсенные цены
    const messageId = (ctx.message as { message_id?: number })?.message_id
    let savedCount = 0

    for (const item of parsed) {
      // Проверяем алиас перед сохранением
      const alias = await prisma.priceAlias.findUnique({
        where: { alias: item.model.toLowerCase().trim() },
      })

      if (alias?.isIgnored) continue

      // Если алиас привязан к товару — подставить название товара
      let model = item.model
      if (alias?.productId) {
        const linkedProduct = await prisma.product.findUnique({
          where: { id: alias.productId },
          select: { name: true },
        })
        if (linkedProduct) model = linkedProduct.name
      }

      await prisma.supplierPrice.create({
        data: {
          supplierId: supplier.id,
          model,
          storage: item.storage ?? null,
          ram: item.ram ?? null,
          color: item.color ?? null,
          simType: item.simType ?? null,
          country: item.country ?? null,
          price: item.price,
          rawMessage: item.rawLine || text.slice(0, 500),
          messageId: messageId ?? null,
        },
      })
      savedCount++
    }

    // Обновить lastPriceAt
    await prisma.supplier.update({
      where: { id: supplier.id },
      data: { lastPriceAt: new Date() },
    })

    log.info('Saved supplier prices', { supplier: supplier.name, savedCount })

    // Уведомить админов (если включено)
    const notifyEnabled = await getApiKeyValue('supplier_notify')
    if (notifyEnabled !== 'false') {
      const summary = parsed.map(p =>
        `${p.model}${p.ram ? ' ' + p.ram : ''}${p.storage ? '/' + p.storage : ''}${p.color ? ' ' + p.color : ''} — ${p.price.toLocaleString('ru-RU')}₽`,
      ).join('\n')

      const notification = [
        `📦 Новые цены от ${supplier.name}:`,
        '',
        summary,
      ].join('\n')

      for (const adminId of ADMIN_IDS) {
        try {
          await bot.telegram.sendMessage(adminId, notification)
        } catch { /* ignore */ }
      }
    }

    return true
  } catch (err) {
    log.error('Supplier parse error', { supplier: supplier.name, error: err instanceof Error ? err.message : String(err) })
    return false
  }
}

/**
 * Отправляет запрос цены в чат поставщика.
 */
export async function requestPriceFromSupplier(
  bot: Telegraf,
  supplierId: number,
  query: string,
): Promise<boolean> {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier || !supplier.isActive) return false

  try {
    await bot.telegram.sendMessage(
      supplier.chatId,
      `Добрый день! Подскажите актуальную цену:\n${query}`,
    )
    log.info('Price request sent', { supplier: supplier.name, query })
    return true
  } catch (err) {
    log.error('Failed to send price request', { supplier: supplier.name, error: err instanceof Error ? err.message : String(err) })
    return false
  }
}

/**
 * Отправляет запрос ВСЕМ активным поставщикам.
 * Возвращает количество успешно отправленных.
 */
export async function requestPriceFromAllSuppliers(
  bot: Telegraf,
  query: string,
): Promise<number> {
  const suppliers = await prisma.supplier.findMany({ where: { isActive: true } })
  let sent = 0
  for (const supplier of suppliers) {
    try {
      await bot.telegram.sendMessage(supplier.chatId, `Подскажите актуальную цену:\n${query}`)
      sent++
    } catch {
      log.error('Failed to request from supplier', { supplier: supplier.name })
    }
  }
  log.info('Price request sent to suppliers', { sent, total: suppliers.length, query })
  return sent
}

/**
 * Поиск лучшей цены среди поставщиков.
 * Ищет по модели (fuzzy match через LIKE).
 */
export async function findBestPrice(query: string): Promise<{
  supplier: string
  model: string
  storage: string | null
  color: string | null
  country: string | null
  price: number
  markup: number
  finalPrice: number
  parsedAt: Date
}[]> {
  const prices = await prisma.supplierPrice.findMany({
    where: {
      isActive: true,
      model: { contains: query, mode: 'insensitive' },
      parsedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    include: { supplier: true },
    orderBy: { price: 'asc' },
  })

  const defaultMarkupStr = await getApiKeyValue('default_markup')
  const defaultMarkup = parseFloat(defaultMarkupStr ?? '5')

  return prices.map(p => {
    const markup = p.supplier ? (Number(p.supplier.markup) || defaultMarkup) : defaultMarkup
    const basePrice = Number(p.price)
    const finalPrice = roundPrice(basePrice * (1 + markup / 100))

    return {
      supplier: p.supplier?.name ?? p.supplierName ?? 'неизвестный',
      model: p.model,
      storage: p.storage,
      color: p.color,
      country: p.country,
      price: basePrice,
      markup,
      finalPrice,
      parsedAt: p.parsedAt,
    }
  })
}
