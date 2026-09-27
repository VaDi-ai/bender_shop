/**
 * Read-only, часть 2 аудита дублей: дубли ВАРИАНТОВ по атрибутам.
 *
 * 1) Полная выгрузка вариантов товаров iPad (кейс менеджера: часть вариантов
 *    несёт «A16» / чип, часть — нет) с группировкой по конфигурации
 *    (Цвет + Память + Связь + Экран).
 * 2) Общий скан по каталогу: пары вариантов одного товара, отличающиеся ТОЛЬКО
 *    наличием/отсутствием одного атрибута.
 * 3) Безопасность будущего схлопывания: есть ли у призраков и у дублей-вариантов
 *    заказы/резервы (OrderItem/Reservation).
 *
 * Ничего не пишет.
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'

const SYSTEM_KEYS = new Set(['fullName', 'attrOverrides'])
/** Ключи, задающие конфигурацию (по ним варианты и должны различаться). */
const CONFIG_KEYS = ['Цвет', 'Память', 'Связь', 'Экран', 'RAM', 'SIM', 'Страна', 'Размер']

type Attrs = Record<string, unknown>
const clean = (a: unknown): Attrs => {
  const out: Attrs = {}
  for (const [k, v] of Object.entries((a ?? {}) as Attrs)) {
    if (SYSTEM_KEYS.has(k) || v === null || v === undefined || typeof v === 'object') continue
    out[k] = v
  }
  return out
}
const norm = (v: unknown): string => String(v).trim().toLowerCase().replace(/\s+/g, ' ')
const configKey = (a: Attrs): string =>
  CONFIG_KEYS.map(k => `${k}=${a[k] !== undefined ? norm(a[k]) : '—'}`).join(' | ')

async function main() {
  const out: string[] = []
  const say = (s = ''): void => { console.log(s); out.push(s) }

  // ── 1. iPad: все товары и варианты ────────────────────────────────────────
  const ipads = await prisma.product.findMany({
    where: { name: { contains: 'ipad', mode: 'insensitive' } },
    include: {
      category: { select: { name: true } },
      variants: { select: { id: true, sku: true, attributes: true, inStock: true, quantity: true, price: true } },
    },
    orderBy: { id: 'asc' },
  })

  say('=== iPad: товары ===')
  for (const p of ipads) {
    const live = p.isAvailable && p.variants.some(v => v.inStock && v.quantity > 0)
    say(`  #${p.id} «${p.name}» [${live ? 'ЖИВОЙ' : 'призрак'}] · кат. ${p.category?.name ?? '—'} · вариантов ${p.variants.length} · isAvailable=${p.isAvailable}`)
  }

  // Кейс менеджера: товары «iPad 11» / «Ipad Air 11»
  const targets = ipads.filter(p => /ipad\s*(air\s*)?11/i.test(p.name) && p.variants.length > 0)
  for (const p of targets) {
    say(`\n\n=== ВАРИАНТЫ #${p.id} «${p.name}» (${p.variants.length}) ===`)
    const groups = new Map<string, typeof p.variants>()
    for (const v of p.variants) {
      const k = configKey(clean(v.attributes))
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(v)
    }

    // Какие ключи вообще встречаются и у скольких вариантов — видно «чип»
    const keyFreq = new Map<string, number>()
    for (const v of p.variants) for (const k of Object.keys(clean(v.attributes))) keyFreq.set(k, (keyFreq.get(k) ?? 0) + 1)
    say('  Ключи атрибутов (сколько вариантов несут): ' +
      [...keyFreq.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' · '))

    const dupeGroups = [...groups.entries()].filter(([, vs]) => vs.length > 1)
    say(`  Конфигураций всего: ${groups.size} · задвоенных: ${dupeGroups.length}`)

    for (const [k, vs] of dupeGroups) {
      say(`\n    КОНФИГУРАЦИЯ: ${k}`)
      for (const v of vs) {
        const a = clean(v.attributes)
        const extra = Object.entries(a).filter(([kk]) => !CONFIG_KEYS.includes(kk))
        const fullName = ((v.attributes ?? {}) as Attrs).fullName
        say(`      вариант #${v.id} · sku ${v.sku} · остаток ${v.quantity} · inStock=${v.inStock} · ${Number(v.price)} ₽`)
        say(`          лишние/различающие атрибуты: ${extra.length ? extra.map(([kk, vv]) => `${kk}=${vv}`).join(' · ') : '— (нет)'}`)
        say(`          fullName: ${typeof fullName === 'string' ? fullName : '—'}`)
      }
    }
  }

  // ── 2. Общий скан: пары вариантов, отличающиеся ровно одним ключом ────────
  say('\n\n=== ОБЩИЙ СКАН: ВАРИАНТЫ, РАЗЛИЧАЮЩИЕСЯ ТОЛЬКО НАЛИЧИЕМ ОДНОГО АТРИБУТА ===')
  const products = await prisma.product.findMany({
    include: { variants: { select: { id: true, sku: true, attributes: true, inStock: true, quantity: true } } },
  })

  interface Pair {
    productId: number; productName: string; missingKey: string; extraValue: string
    withId: number; withQty: number; withInStock: boolean
    withoutId: number; withoutQty: number; withoutInStock: boolean
    config: string
  }
  const pairs: Pair[] = []
  for (const p of products) {
    if (p.variants.length < 2) continue
    // ключ «всё кроме K» → варианты; если у одного K есть, у другого нет — дубль
    for (const v1 of p.variants) {
      const a1 = clean(v1.attributes)
      for (const k of Object.keys(a1)) {
        const rest1 = Object.entries(a1).filter(([kk]) => kk !== k).map(([kk, vv]) => `${kk}=${norm(vv)}`).sort().join('|')
        for (const v2 of p.variants) {
          if (v2.id <= v1.id) continue
          const a2 = clean(v2.attributes)
          if (a2[k] !== undefined) continue                  // у второго ключ есть — не наш случай
          const rest2 = Object.entries(a2).map(([kk, vv]) => `${kk}=${norm(vv)}`).sort().join('|')
          if (rest1 !== rest2) continue                      // остальное должно совпасть точь-в-точь
          pairs.push({
            productId: p.id, productName: p.name, missingKey: k, extraValue: String(a1[k]),
            withId: v1.id, withQty: v1.quantity, withInStock: v1.inStock,
            withoutId: v2.id, withoutQty: v2.quantity, withoutInStock: v2.inStock,
            config: rest2 || '(без атрибутов)',
          })
        }
      }
    }
  }

  const byProduct = new Map<number, Pair[]>()
  for (const pr of pairs) {
    if (!byProduct.has(pr.productId)) byProduct.set(pr.productId, [])
    byProduct.get(pr.productId)!.push(pr)
  }
  const byKey = new Map<string, number>()
  for (const pr of pairs) byKey.set(pr.missingKey, (byKey.get(pr.missingKey) ?? 0) + 1)

  say(`Пар всего: ${pairs.length} · товаров затронуто: ${byProduct.size}`)
  say('По атрибуту-виновнику: ' + [...byKey.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' · '))
  say('')
  for (const [pid, prs] of [...byProduct.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 25)) {
    say(`  #${pid} «${prs[0]!.productName}» — пар: ${prs.length}`)
    for (const pr of prs.slice(0, 6)) {
      say(`      ${pr.missingKey}=${pr.extraValue}: вариант #${pr.withId} (остаток ${pr.withQty}${pr.withInStock ? ', в наличии' : ''})` +
        ` ↔ БЕЗ атрибута #${pr.withoutId} (остаток ${pr.withoutQty}${pr.withoutInStock ? ', в наличии' : ''})`)
      say(`          общая часть: ${pr.config}`)
    }
    if (prs.length > 6) say(`      … и ещё ${prs.length - 6} пар`)
  }

  // ── 3. Безопасность схлопывания: заказы и резервы ─────────────────────────
  say('\n\n=== БЕЗОПАСНОСТЬ СХЛОПЫВАНИЯ: ЗАКАЗЫ/РЕЗЕРВЫ ===')
  const dupeVariantIds = [...new Set(pairs.flatMap(p => [p.withId, p.withoutId]))]
  const [orderItems, reservations] = await Promise.all([
    dupeVariantIds.length ? prisma.orderItem.findMany({ where: { variantId: { in: dupeVariantIds } }, select: { variantId: true, orderId: true } }) : [],
    dupeVariantIds.length ? prisma.reservation.findMany({ where: { variantId: { in: dupeVariantIds } }, select: { variantId: true, id: true } }) : [],
  ])
  say(`Вариантов в парах-дублях: ${dupeVariantIds.length}`)
  say(`Из них с заказами (OrderItem): ${new Set(orderItems.map(o => o.variantId)).size} (строк заказа ${orderItems.length})`)
  say(`Из них с резервами (Reservation): ${new Set(reservations.map(r => r.variantId)).size}`)

  // Призраки из части 1: есть ли у их вариантов заказы
  const ghostProducts = products.filter(p => !p.isAvailable && p.variants.length > 0 && p.variants.every(v => v.quantity === 0))
  const ghostVariantIds = ghostProducts.flatMap(p => p.variants.map(v => v.id))
  const ghostOrders = ghostVariantIds.length
    ? await prisma.orderItem.findMany({ where: { variantId: { in: ghostVariantIds } }, select: { variantId: true } })
    : []
  const ghostReserv = ghostVariantIds.length
    ? await prisma.reservation.findMany({ where: { variantId: { in: ghostVariantIds } }, select: { variantId: true } })
    : []
  say(`\nТоваров-призраков С вариантами: ${ghostProducts.length} (вариантов ${ghostVariantIds.length})`)
  say(`  их варианты с заказами: ${new Set(ghostOrders.map(o => o.variantId)).size} · с резервами: ${new Set(ghostReserv.map(r => r.variantId)).size}`)
  say('  (OrderItem.variantId — onDelete: Restrict: вариант с заказом удалить нельзя, только скрыть)')

  // SKU-родословная MacBook: доказательство «переименовали → старый осиротел»
  say('\n\n=== SKU-РОДОСЛОВНАЯ (кейс MacBook) ===')
  const macs = products.filter(p => /macbook air m5/i.test(p.name))
  for (const p of macs) {
    const prefixes = new Map<string, number>()
    for (const v of p.variants) {
      const pref = v.sku.split('-').slice(0, 3).join('-')
      prefixes.set(pref, (prefixes.get(pref) ?? 0) + 1)
    }
    say(`  #${p.id} «${p.name}» · sku товара ${p.sku} · вариантов ${p.variants.length}` +
      (prefixes.size ? ` · префиксы sku вариантов: ${[...prefixes.entries()].map(([k, n]) => `${k}×${n}`).join(', ')}` : ''))
  }

  const file = path.resolve(__dirname, '../reports/variant-attr-dupes-2026-08-26.txt')
  fs.writeFileSync(file, out.join('\n'))
  console.log('\nОтчёт: ' + file)
}

main().finally(() => prisma.$disconnect())
