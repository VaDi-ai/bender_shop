/**
 * webhooks/supplier.ts
 *
 * Обработка сообщений из чатов поставщиков.
 * Бот добавлен в группы/каналы/личные чаты поставщиков.
 * При получении текстового сообщения — AI парсит и сохраняет цены.
 */

import { Context, Telegraf } from 'telegraf'
import { prisma } from '../lib/prisma'
import { parseSupplierMessage } from '../lib/ai-parser'
import { getApiKeyValue } from '../lib/api-key-store'
import { roundPrice } from '../lib/currency'

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

  console.log(`[supplier] Parsing price from "${supplier.name}" (chat ${chatId}): ${text.slice(0, 80)}...`)

  try {
    const parsed = await parseSupplierMessage(text)
    if (parsed.length === 0) return false

    // Сохраняем спарсенные цены
    const messageId = (ctx.message as { message_id?: number })?.message_id
    let savedCount = 0

    for (const item of parsed) {
      await prisma.supplierPrice.create({
        data: {
          supplierId: supplier.id,
          model: item.model,
          storage: item.storage ?? null,
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

    console.log(`[supplier] Saved ${savedCount} prices from "${supplier.name}"`)

    // Уведомить админов (если включено)
    const notifyEnabled = await getApiKeyValue('supplier_notify')
    if (notifyEnabled !== 'false') {
      const summary = parsed.map(p =>
        `${p.model}${p.storage ? ' ' + p.storage : ''}${p.color ? ' ' + p.color : ''} — ${p.price.toLocaleString('ru-RU')}₽`,
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
    console.error(`[supplier] Parse error from "${supplier.name}":`, err)
    return false
  }
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
    const markup = Number(p.supplier.markup) || defaultMarkup
    const basePrice = Number(p.price)
    const finalPrice = roundPrice(basePrice * (1 + markup / 100))

    return {
      supplier: p.supplier.name,
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
