/**
 * Read-only: воспроизведёт ли следующий синк дубли/призраков.
 *
 * Читает ЖИВОЙ лист (readAllProducts) и прогоняет его строки через собственные
 * функции синка (extractProductName), не записывая ничего. Отвечает на вопросы:
 *   • остались ли строки старого формата — «(A16)», чип в названии, «)» в имени;
 *   • какие имена товаров синк построит и совпадут ли они с живыми Product;
 *   • какие имена создадут НОВЫЙ товар (то есть новую сироту).
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'
import { readAllProducts, extractProductName } from '../lib/sheets-sync'

const out: string[] = []
const say = (s = ''): void => { console.log(s); out.push(s) }

async function main() {
  const { rows, sheetsRead, sheetsFailed } = await readAllProducts()
  say(`=== ЛИСТ: строк прочитано ${rows.length} · листов ок ${sheetsRead}${sheetsFailed ? `, упало ${sheetsFailed}` : ''} ===`)

  // ── 1. Строки старого формата в «Название модели» ─────────────────────────
  const chipInName = rows.filter(r => /\((A\d{2}|M[1-9])\s*(pro|max|ultra)?\)/i.test(r.fullName))
  const a16 = rows.filter(r => /a16/i.test(r.fullName))
  const strayParen = rows.filter(r => /\)/.test(extractProductName(r.fullName, r.brand)))

  say(`\n=== 1. СТРОКИ СТАРОГО ФОРМАТА В «Название модели» ===`)
  say(`  С чипом в скобках «(A16)/(M4)…»: ${chipInName.length}`)
  for (const r of chipInName.slice(0, 15)) say(`      [${r.sheetName}] «${r.fullName}» → товар «${extractProductName(r.fullName, r.brand)}»`)
  if (chipInName.length > 15) say(`      … и ещё ${chipInName.length - 15}`)

  say(`\n  Упоминают A16 (в любом виде): ${a16.length}`)
  for (const r of a16.slice(0, 15)) say(`      [${r.sheetName}] «${r.fullName}» → товар «${extractProductName(r.fullName, r.brand)}»`)
  if (a16.length > 15) say(`      … и ещё ${a16.length - 15}`)

  say(`\n  Дают имя товара со скобкой «)» (артефакт): ${strayParen.length}`)
  for (const r of strayParen.slice(0, 15)) say(`      [${r.sheetName}] «${r.fullName}» → товар «${extractProductName(r.fullName, r.brand)}»`)
  if (strayParen.length > 15) say(`      … и ещё ${strayParen.length - 15}`)

  // ── 2. Какие имена товаров построит синк и что с ними в БД ────────────────
  const products = await prisma.product.findMany({
    include: { variants: { select: { id: true, quantity: true, inStock: true } } },
  })
  const byName = new Map<string, typeof products>()
  for (const p of products) {
    const k = p.name.trim().toLowerCase()
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k)!.push(p)
  }

  interface Built { name: string; count: number; sheets: Set<string>; sample: string }
  const built = new Map<string, Built>()
  for (const r of rows) {
    const name = extractProductName(r.fullName, r.brand)
    const k = name.trim().toLowerCase()
    const cur = built.get(k) ?? { name, count: 0, sheets: new Set<string>(), sample: r.fullName }
    cur.count++
    cur.sheets.add(r.sheetName)
    built.set(k, cur)
  }

  const known: string[] = []
  const unknown: Built[] = []
  for (const [k, b] of built) (byName.has(k) ? known : unknown).push(byName.has(k) ? k : (b as never))
  const unknownList = [...built.entries()].filter(([k]) => !byName.has(k)).map(([, b]) => b)

  say(`\n\n=== 2. ИМЕНА ТОВАРОВ, КОТОРЫЕ ПОСТРОИТ СИНК ===`)
  say(`  Уникальных имён из листа: ${built.size}`)
  say(`  Уже есть такой Product: ${built.size - unknownList.length}`)
  say(`  НЕТ в БД → синк создаст НОВЫЙ товар: ${unknownList.length}`)
  for (const b of unknownList.slice(0, 30)) {
    say(`      «${b.name}» ← строк ${b.count}, листы: ${[...b.sheets].join(', ')}`)
    say(`          пример строки: «${b.sample}»`)
  }
  if (unknownList.length > 30) say(`      … и ещё ${unknownList.length - 30}`)
  void known; void unknown

  // ── 3. Живые товары из кейса: питает ли их лист вообще ────────────────────
  say(`\n\n=== 3. КОНКРЕТНЫЕ ТОВАРЫ КЕЙСА: есть ли они в листе ===`)
  const watch = ['Ipad 11', 'Ipad Air 11', 'Ipad Air 13', 'Ipad Air 11 )', 'Ipad Air 13 )', 'Macbook Air M5']
  for (const w of watch) {
    const k = w.trim().toLowerCase()
    const b = built.get(k)
    const dbRows = byName.get(k) ?? []
    const dbInfo = dbRows.map(p => {
      const live = p.isAvailable && p.variants.some(v => v.inStock && v.quantity > 0)
      return `#${p.id}(${live ? 'живой' : 'призрак'}, вар. ${p.variants.length})`
    }).join(', ') || '— нет в БД'
    say(`  «${w}»: в листе строк ${b?.count ?? 0}${b ? ` (листы: ${[...b.sheets].join(', ')})` : ''} · в БД: ${dbInfo}`)
  }

  // Строки листа, относящиеся к iPad 11 / Air — посмотреть глазами
  say(`\n  Строки листа с «iPad 11» / «iPad Air 11» / «iPad Air 13»:`)
  const ipadRows = rows.filter(r => /ipad\s*(air\s*)?(11|13)\b/i.test(r.fullName))
  for (const r of ipadRows.slice(0, 40)) {
    say(`      [${r.sheetName}] «${r.fullName}» · Модель «${r.model}» · Цвет ${r.color} · Память ${r.memory} · остаток ${r.quantity}`)
    say(`          → имя товара: «${extractProductName(r.fullName, r.brand)}»`)
  }
  say(`      (всего таких строк: ${ipadRows.length})`)

  const file = path.resolve(__dirname, '../reports/sheet-format-check-2026-08-26.txt')
  fs.writeFileSync(file, out.join('\n'))
  console.log('\nОтчёт: ' + file)
}

main().finally(() => prisma.$disconnect())
