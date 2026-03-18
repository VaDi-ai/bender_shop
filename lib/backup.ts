/**
 * lib/backup.ts
 *
 * Создаёт JSON-дамп ключевых таблиц БД.
 * Возвращает Buffer для отправки как файл.
 */

import { prisma } from './prisma'

export async function createBackupBuffer(): Promise<{ buffer: Buffer; stats: Record<string, number> }> {
  const data = {
    exportedAt: new Date().toISOString(),
    version: '1.0',

    products: await prisma.product.findMany({ include: { variants: true } }),
    categories: await prisma.category.findMany(),
    clients: await prisma.client.findMany(),
    orders: await prisma.order.findMany({ include: { items: true } }),
    reservations: await prisma.reservation.findMany(),
    promotions: await prisma.promotion.findMany({ include: { prices: true } }),
    suppliers: await prisma.supplier.findMany(),
    supplierPrices: await prisma.supplierPrice.findMany({
      where: { isActive: true },
    }),
    segments: await prisma.segment.findMany(),
    templates: await prisma.template.findMany(),
    heroBanners: await prisma.heroBanner.findMany(),
    apiKeys: await prisma.apiKey.findMany(),
    currencyRates: await prisma.currencyRate.findMany(),
    tasks: await prisma.task.findMany({ where: { status: 'pending' } }),
  }

  const stats: Record<string, number> = {}
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) stats[key] = value.length
  }

  const json = JSON.stringify(data)
  const buffer = Buffer.from(json, 'utf-8')

  return { buffer, stats }
}
