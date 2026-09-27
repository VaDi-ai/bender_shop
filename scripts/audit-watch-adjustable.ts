/**
 * Read-only: истинные дубли среди РЕГУЛИРУЕМЫХ ремешков (Milanese / Link).
 *
 * Находка, ломающая наивное правило: у Apple Watch **Ultra** ремешок Milanese
 * Loop выпускается в размерах S / M / L, и размер стоит в названии, но НЕ
 * попадает ни в один атрибут. Поэтому по атрибутам такие варианты выглядят
 * близнецами, хотя это разные товары. У Series (S10/S11) Milanese размера нет —
 * там близнецов действительно нет.
 *
 * Отсюда правило: размер ремешка достаём ИЗ ИМЕНИ и включаем в ключ. Дубль —
 * только когда совпал и размер (или его нет у обоих).
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'

const out: string[] = []
const say = (s = ''): void => { console.log(s); out.push(s) }

const ADJUSTABLE = /\b(milanese|link\s*bracelet)\b/i
const SYS = new Set(['fullName', 'attrOverrides'])
const cleanAttrs = (a: unknown): Record<string, string> => {
  const o: Record<string, string> = {}
  for (const [k, v] of Object.entries((a ?? {}) as Record<string, unknown>)) {
    if (SYS.has(k) || v === null || v === undefined || typeof v === 'object') continue
    o[k] = String(v).trim()
  }
  return o
}

/** Размер ремешка из имени: «Milanese Loop M», «Milanese S», «… Loop M/L». */
export function bandSizeFromName(fullName: string): string | null {
  const m = fullName.match(/\b(?:milanese|link\s*bracelet)(?:\s+loop)?\s+(S\/M|M\/L|S|M|L)\b/i)
  return m ? m[1]!.toUpperCase() : null
}

async function main() {
  const watches = await prisma.product.findMany({
    where: { name: { contains: 'watch', mode: 'insensitive' } },
    include: { variants: { select: { id: true, sku: true, attributes: true, quantity: true, inStock: true, price: true, photos: true } } },
  })

  const pairs: Array<{ productId: number; productName: string; keep: number; hide: number; why: string; key: string }> = []

  for (const p of watches) {
    const adj = p.variants.filter(v => {
      const a = cleanAttrs(v.attributes)
      const fn = String((v.attributes as Record<string, unknown>)?.fullName ?? '')
      return ADJUSTABLE.test(`${fn} ${a['Ремешок'] ?? ''}`)
    })
    if (adj.length < 2) continue

    say(`\n════ #${p.id} «${p.name}» — регулируемых вариантов ${adj.length} ════`)
    const groups = new Map<string, typeof adj>()
    for (const v of adj) {
      const a = cleanAttrs(v.attributes)
      const fn = String((v.attributes as Record<string, unknown>)?.fullName ?? '')
      const size = bandSizeFromName(fn)
      // ключ: атрибуты БЕЗ «Ремешок» (он тут всегда Milanese) + размер из имени
      const base = Object.entries(a).filter(([k]) => k !== 'Ремешок' && k !== 'Материал')
        .map(([k, v2]) => `${k}=${v2.toLowerCase()}`).sort().join(' | ')
      const key = `${base} | РазмерРемешка=${size ?? '—'}`
      say(`    #${v.id} · размер ремешка: ${size ?? '— (нет в имени)'} · остаток ${v.quantity} · ${Number(v.price)} ₽`)
      say(`        ${fn}`)
      say(`        атрибуты: ${Object.entries(a).map(([k, v2]) => `${k}=${v2}`).join(' · ')}`)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(v)
    }

    for (const [key, vs] of groups) {
      if (vs.length < 2) continue
      // Победитель: остаток → полнота атрибутов → больший id (свежая запись)
      const sorted = [...vs].sort((a, b) =>
        (b.quantity - a.quantity) ||
        (Object.keys(cleanAttrs(b.attributes)).length - Object.keys(cleanAttrs(a.attributes)).length) ||
        (b.id - a.id))
      const keep = sorted[0]!
      for (const hide of sorted.slice(1)) {
        pairs.push({
          productId: p.id, productName: p.name, keep: keep.id, hide: hide.id, key,
          why: 'регулируемый ремешок, размер ремешка совпал (или отсутствует у обоих)',
        })
        say(`    ⇒ ДУБЛЬ: оставить #${keep.id} (остаток ${keep.quantity}), скрыть #${hide.id} (остаток ${hide.quantity})`)
        say(`        ключ: ${key}`)
      }
    }
  }

  say(`\n\n════ ИТОГО: пар к схлопыванию (Milanese/Link, размер совпал) ════`)
  if (!pairs.length) say('  нет')
  for (const p of pairs) say(`  товар #${p.productId} «${p.productName}»: оставить #${p.keep}, скрыть #${p.hide}`)
  say(`\n  Всего пар: ${pairs.length}`)

  const file = path.resolve(__dirname, '../reports/watch-adjustable-2026-08-26.txt')
  fs.writeFileSync(file, out.join('\n'))
  fs.writeFileSync(path.resolve(__dirname, '../reports/watch-adjustable-pairs.json'), JSON.stringify(pairs, null, 2))
  console.log('\nОтчёт: ' + file)
}

main().finally(() => prisma.$disconnect())
