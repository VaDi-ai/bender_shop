/**
 * Read-only проверка: как теперь матчатся три строки MacBook Air M5 (MDHE4/MDHA4/MDHH4).
 */
import { prisma } from '../lib/prisma'
import { matchVariants } from '../lib/price-matching'

async function main() {
  const lines = [
    { model: 'MacBook Air 13 M5', storage: '512GB', color: 'Midnight', price: 117000, rawLine: 'MacBook MDHE4 Air 13 Midnight (M5, 16GB, 512GB) 2026 117000' },
    { model: 'MacBook Air 13 M5', storage: '512GB', color: 'Starlight', price: 116000, rawLine: 'MacBook MDHA4 Air 13 Starlight (M5, 16GB, 512GB) 2026 116000' },
    { model: 'MacBook Air 13 M5', storage: '512GB', color: 'Sky Blue', price: 115500, rawLine: 'MacBook MDHH4 Air 13 Sky Blue (M5, 16GB, 512GB) 2026 115500' },
  ]
  const { matched, unmatched, ignored } = await matchVariants(lines)
  for (const m of matched) {
    const v = await prisma.productVariant.findUnique({ where: { id: m.variantId }, select: { attributes: true } })
    const a = (v?.attributes ?? {}) as Record<string, unknown>
    console.log(`${m.rawLine.slice(8, 13)} → variant ${m.variantId} (${a['fullName']}), Цвет=${a['Цвет']}, текущая цена ${m.currentPrice}`)
  }
  for (const u of unmatched) console.log('UNMATCHED:', u.rawLine)
  for (const i of ignored) console.log('IGNORED:', i.rawLine)
}

main().finally(() => prisma.$disconnect())
