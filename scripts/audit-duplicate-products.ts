/**
 * Read-only аудит дублей/призраков товаров.
 *
 * Группируем Product по «мягко» нормализованному имени (регистр, ё→е, пробелы,
 * пунктуация/дефисы) и показываем группы, где больше одного товара.
 * Для каждого товара: варианты, остаток, фото, видимость на витрине, дата,
 * чем «кормится» (PriceAlias / строки прайса / Avito).
 *
 * Ничего не пишет.
 *   npx ts-node scripts/audit-duplicate-products.ts
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'

/** Мягкий ключ: регистр, ё→е, пунктуация и лишние пробелы не различают товары. */
function softKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

interface Row {
  id: number
  name: string
  sku: string
  brand: string | null
  line: string | null
  category: string | null
  variants: number
  variantsInStock: number
  totalQuantity: number
  hasPhoto: boolean
  isAvailable: boolean
  onStorefront: boolean
  updatedAt: Date
  createdAt: Date
  aliasCount: number
  priceRows: number
  priceRowsFresh: number
  avito: boolean
  verdict: 'живой' | 'призрак' | 'спорный'
}

async function main() {
  const [products, aliases, priceRows] = await Promise.all([
    prisma.product.findMany({
      include: {
        category: { select: { name: true } },
        variants: { select: { id: true, inStock: true, quantity: true, photos: true } },
      },
    }),
    prisma.priceAlias.findMany({ select: { productId: true, variantId: true } }),
    prisma.supplierPrice.findMany({
      where: { variantId: { not: null } },
      select: { variantId: true, parsedAt: true },
    }),
  ])

  const aliasByProduct = new Map<number, number>()
  const aliasByVariant = new Map<number, number>()
  for (const a of aliases) {
    if (a.productId !== null) aliasByProduct.set(a.productId, (aliasByProduct.get(a.productId) ?? 0) + 1)
    if (a.variantId !== null) aliasByVariant.set(a.variantId, (aliasByVariant.get(a.variantId) ?? 0) + 1)
  }
  const FRESH_DAYS = 30
  const freshSince = new Date(Date.now() - FRESH_DAYS * 24 * 3600 * 1000)
  const rowsByVariant = new Map<number, { total: number; fresh: number }>()
  for (const r of priceRows) {
    const cur = rowsByVariant.get(r.variantId!) ?? { total: 0, fresh: 0 }
    cur.total++
    if (r.parsedAt >= freshSince) cur.fresh++
    rowsByVariant.set(r.variantId!, cur)
  }

  const toRow = (p: (typeof products)[number]): Row => {
    const variantsInStock = p.variants.filter(v => v.inStock && v.quantity > 0).length
    const totalQuantity = p.variants.reduce((s, v) => s + v.quantity, 0)
    const hasPhoto = !!(p.coverPhoto || p.photoUrl || p.photos.length || p.variants.some(v => v.photos.length))
    const aliasCount = (aliasByProduct.get(p.id) ?? 0)
      + p.variants.reduce((s, v) => s + (aliasByVariant.get(v.id) ?? 0), 0)
    const rowStats = p.variants.reduce((acc, v) => {
      const r = rowsByVariant.get(v.id)
      return r ? { total: acc.total + r.total, fresh: acc.fresh + r.fresh } : acc
    }, { total: 0, fresh: 0 })
    const onStorefront = p.isAvailable && variantsInStock > 0
    const fed = aliasCount > 0 || rowStats.total > 0
    const verdict: Row['verdict'] = onStorefront
      ? 'живой'
      : (totalQuantity === 0 && !fed && !p.avitoEnabled) ? 'призрак' : 'спорный'
    return {
      id: p.id, name: p.name, sku: p.sku, brand: p.brand, line: p.line,
      category: p.category?.name ?? null,
      variants: p.variants.length, variantsInStock, totalQuantity, hasPhoto,
      isAvailable: p.isAvailable, onStorefront,
      updatedAt: p.updatedAt, createdAt: p.createdAt,
      aliasCount, priceRows: rowStats.total, priceRowsFresh: rowStats.fresh,
      avito: p.avitoEnabled, verdict,
    }
  }

  const groups = new Map<string, Row[]>()
  for (const p of products) {
    const k = softKey(p.name)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(toRow(p))
  }
  const dupes = [...groups.entries()]
    .filter(([, rs]) => rs.length > 1)
    .map(([key, rs]) => ({ key, rows: rs.sort((a, b) => Number(b.onStorefront) - Number(a.onStorefront) || b.totalQuantity - a.totalQuantity || a.id - b.id) }))

  const totalDupeRows = dupes.reduce((s, g) => s + g.rows.length, 0)
  const ghosts = dupes.flatMap(g => g.rows.filter(r => r.verdict === 'призрак'))
  const disputed = dupes.flatMap(g => g.rows.filter(r => r.verdict === 'спорный'))
  const liveMulti = dupes.filter(g => g.rows.filter(r => r.verdict === 'живой').length > 1)
  // Группы, где различие ТОЛЬКО в написании (точные имена различаются)
  const spellingOnly = dupes.filter(g => new Set(g.rows.map(r => r.name)).size > 1)

  console.log('=== СВОДКА ===')
  console.log(`Товаров всего: ${products.length}`)
  console.log(`Групп-дублей (мягкий ключ): ${dupes.length}, товаров в них: ${totalDupeRows} (лишних: ${totalDupeRows - dupes.length})`)
  console.log(`Из них групп, где имена различаются написанием: ${spellingOnly.length}`)
  console.log(`Призраков (не на витрине, нулевой остаток, ничем не кормится): ${ghosts.length}`)
  console.log(`Спорных (не на витрине, но есть остаток/алиас/прайс/Avito): ${disputed.length}`)
  console.log(`Групп с БОЛЕЕ ЧЕМ одним живым (реальные близнецы на витрине): ${liveMulti.length}`)

  const fmtRow = (r: Row): string =>
    `    #${r.id} «${r.name}» [${r.verdict}]\n` +
    `        категория: ${r.category ?? '—'} · линейка: ${r.line ?? '—'} · бренд: ${r.brand ?? '—'} · sku ${r.sku}\n` +
    `        вариантов: ${r.variants} (в наличии ${r.variantsInStock}) · остаток: ${r.totalQuantity} · фото: ${r.hasPhoto ? 'есть' : 'НЕТ'}\n` +
    `        isAvailable=${r.isAvailable} · на витрине: ${r.onStorefront ? 'ДА' : 'нет'} · обновлён ${r.updatedAt.toISOString().slice(0, 10)} · создан ${r.createdAt.toISOString().slice(0, 10)}\n` +
    `        привязки: алиасов ${r.aliasCount} · строк прайса ${r.priceRows} (свежих за 30 дн: ${r.priceRowsFresh})${r.avito ? ' · Avito ВКЛ' : ''}`

  console.log('\n\n=== ГРУППЫ, ГДЕ ИМЕНА РАЗЛИЧАЮТСЯ НАПИСАНИЕМ (кейс менеджера) ===')
  for (const g of spellingOnly) {
    console.log(`\n  «${g.key}» — товаров: ${g.rows.length}`)
    for (const r of g.rows) console.log(fmtRow(r))
  }

  console.log('\n\n=== ГРУППЫ С НЕСКОЛЬКИМИ ЖИВЫМИ (близнецы на витрине) ===')
  for (const g of liveMulti.slice(0, 40)) {
    console.log(`\n  «${g.key}» — товаров: ${g.rows.length}`)
    for (const r of g.rows) console.log(fmtRow(r))
  }
  if (liveMulti.length > 40) console.log(`\n  … и ещё ${liveMulti.length - 40} групп`)

  console.log('\n\n=== КЕЙС МЕНЕДЖЕРА: MacBook ===')
  const macGroups = dupes.filter(g => /macbook/.test(g.key))
  for (const g of macGroups) {
    console.log(`\n  «${g.key}» — товаров: ${g.rows.length}`)
    for (const r of g.rows) console.log(fmtRow(r))
  }
  // Что реально увидит менеджер в поиске привязки (/variants?q=): contains по имени
  for (const q of ['MacBook Air M5', 'Macbook Air M5']) {
    const found = await prisma.productVariant.findMany({
      where: { OR: [{ product: { name: { contains: q, mode: 'insensitive' } } }, { sku: { contains: q, mode: 'insensitive' } }] },
      take: 20, orderBy: { id: 'asc' },
      select: { id: true, productId: true, product: { select: { name: true } } },
    })
    const byProduct = new Map<number, { name: string; n: number }>()
    for (const v of found) {
      const cur = byProduct.get(v.productId) ?? { name: v.product.name, n: 0 }
      cur.n++
      byProduct.set(v.productId, cur)
    }
    console.log(`\n  Поиск привязки «${q}» (первые 20 вариантов) → товары:`)
    for (const [pid, info] of byProduct) console.log(`      #${pid} «${info.name}» — вариантов в выдаче: ${info.n}`)
  }

  const file = path.resolve(__dirname, '../reports/duplicate-products-2026-08-26.json')
  fs.writeFileSync(file, JSON.stringify({
    takenAt: new Date().toISOString(),
    totals: {
      products: products.length, groups: dupes.length, rowsInGroups: totalDupeRows,
      ghosts: ghosts.length, disputed: disputed.length, groupsWithMultipleLive: liveMulti.length,
    },
    groups: dupes,
  }, null, 2))
  console.log('\n\nПолный отчёт: ' + file)
}

main().finally(() => prisma.$disconnect())
