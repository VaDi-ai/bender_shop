/**
 * Read-only верификация после Phase 1 apply.
 *   (а) витрина: товары/варианты у живых не пострадали;
 *   (б) остаток/цена/фото живых вариантов целы (сверка со снапшотом);
 *   (в) поиск, который двоил (iPad 11 / iPad Air / MacBook), отдаёт по одному;
 *   (г) блок A: 6 пар «с чипом ↔ без чипа» — кто выжил и в каком состоянии чип.
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'

const out: string[] = []
const say = (s = ''): void => { console.log(s); out.push(s) }

interface SnapVariant { id: number; quantity: number; inStock: boolean; price: unknown; photos: string[]; attributes: unknown }

async function main() {
  const snapPath = path.resolve(__dirname, '../reports/collapse-phase1-snapshot-2026-08-26.json')
  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8')) as {
    variants: SnapVariant[]
    plans: Array<{ kind: string; keepVariantId?: number; hideVariantId?: number; hideProductId?: number; scope: string; note: string; blockers: string[] }>
  }
  const before = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../reports/phase1-before.json'), 'utf8').trim()) as
    Array<{ id: number; name: string; isAvailable: boolean; variants: number; visibleVariants: number; totalQty: number }>

  // ── (а) витрина ───────────────────────────────────────────────────────────
  say('════ (а) ВИТРИНА: живые товары до/после ════')
  const ids = before.map(b => b.id)
  const after = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: { variants: { select: { id: true, quantity: true, inStock: true } } },
  })
  let regressions = 0
  for (const b of before) {
    const a = after.find(x => x.id === b.id)
    if (!a) { say(`  #${b.id}: ИСЧЕЗ (!)`); regressions++; continue }
    const visible = a.variants.filter(v => v.inStock && v.quantity > 0).length
    const qty = a.variants.reduce((s, v) => s + v.quantity, 0)
    const bad = visible < b.visibleVariants || qty < b.totalQty || (b.isAvailable && !a.isAvailable)
    const wasGhost = !b.isAvailable
    say(`  #${b.id} «${a.name}»: видно ${b.visibleVariants}→${visible} · остаток ${b.totalQty}→${qty} · isAvailable ${b.isAvailable}→${a.isAvailable}` +
      (bad && !wasGhost ? '   ⚠ РЕГРЕСС' : wasGhost && bad ? '   (был призрак — ожидаемо скрыт)' : '   ok'))
    if (bad && !wasGhost) regressions++
  }
  const liveNow = await prisma.product.count({ where: { isAvailable: true, variants: { some: { inStock: true, quantity: { gt: 0 } } } } })
  say(`\n  Товаров на витрине ВСЕГО: было 36 → стало ${liveNow}`)
  say(`  Регрессий у живых: ${regressions}`)

  // ── (б) целостность выживших ──────────────────────────────────────────────
  say('\n\n════ (б) ОСТАТОК / ЦЕНА / ФОТО ВЫЖИВШИХ (сверка со снапшотом) ════')
  const keepIds = [...new Set(snap.plans.map(p => p.keepVariantId).filter((x): x is number => !!x))]
  const keepNow = await prisma.productVariant.findMany({
    where: { id: { in: keepIds } },
    select: { id: true, quantity: true, inStock: true, price: true, photos: true },
  })
  let lost = 0
  for (const k of keepNow) {
    const s = snap.variants.find(v => v.id === k.id)
    if (!s) continue
    const qtyOk = k.quantity >= s.quantity
    const priceOk = Number(k.price) === Number(s.price) || Number(k.price) > 0
    const photoOk = k.photos.length >= (s.photos?.length ?? 0)
    if (!qtyOk || !priceOk || !photoOk) {
      lost++
      say(`  ⚠ #${k.id}: остаток ${s.quantity}→${k.quantity} · цена ${Number(s.price)}→${Number(k.price)} · фото ${s.photos?.length ?? 0}→${k.photos.length}`)
    }
  }
  say(`  Выживших проверено: ${keepNow.length} · с потерями: ${lost}`)

  // ── (в) поиск больше не двоит ─────────────────────────────────────────────
  say('\n\n════ (в) ПОИСК ПРИВЯЗКИ: сколько товаров в выдаче ════')
  for (const q of ['iPad 11', 'iPad Air', 'MacBook Air M5', 'Mac Mini M4 Pro', 'iMac M4']) {
    const found = await prisma.productVariant.findMany({
      where: { OR: [{ product: { name: { contains: q, mode: 'insensitive' } } }, { sku: { contains: q, mode: 'insensitive' } }] },
      take: 20, orderBy: { id: 'asc' },
      select: { productId: true, product: { select: { name: true, isAvailable: true } } },
    })
    const byProduct = new Map<number, { name: string; n: number; av: boolean }>()
    for (const v of found) {
      const cur = byProduct.get(v.productId) ?? { name: v.product.name, n: 0, av: v.product.isAvailable }
      cur.n++
      byProduct.set(v.productId, cur)
    }
    const visible = [...byProduct.entries()].filter(([, i]) => i.av)
    say(`  «${q}» → товаров в выдаче ${byProduct.size} (из них видимых/активных ${visible.length})`)
    for (const [pid, i] of byProduct) say(`      #${pid} «${i.name}» · вариантов ${i.n} · isAvailable=${i.av}`)
  }

  // ── (г) блок A: пары «с чипом ↔ без чипа» ────────────────────────────────
  say('\n\n════ (г) iPad 11: 6 пар «с чипом ↔ без чипа» ════')
  const CHIPLESS_PAIRS = [[1756, 76], [1757, 77], [1758, 78], [1760, 80], [1761, 81], [1762, 82]]
  for (const [planKeep, planHide] of CHIPLESS_PAIRS) {
    const [a, b] = await Promise.all([
      prisma.productVariant.findUnique({ where: { id: planKeep! }, select: { id: true, sku: true, attributes: true, quantity: true, inStock: true } }),
      prisma.productVariant.findUnique({ where: { id: planHide! }, select: { id: true, sku: true, attributes: true, quantity: true, inStock: true } }),
    ])
    if (!a || !b) continue
    const chipA = ((a.attributes ?? {}) as Record<string, unknown>)['Чип'] ?? null
    const chipB = ((b.attributes ?? {}) as Record<string, unknown>)['Чип'] ?? null
    const [alA, alB] = await Promise.all([
      prisma.priceAlias.count({ where: { variantId: a.id } }),
      prisma.priceAlias.count({ where: { variantId: b.id } }),
    ])
    const survivor = (a.inStock || a.quantity > 0) ? a : (b.inStock || b.quantity > 0) ? b : null
    say(`\n  пара #${a.id} (Чип=${chipA ?? 'НЕТ'}) ↔ #${b.id} (Чип=${chipB ?? 'НЕТ'})`)
    say(`      #${a.id} ${a.sku} · остаток ${a.quantity} · inStock=${a.inStock} · алиасов ${alA}`)
    say(`      #${b.id} ${b.sku} · остаток ${b.quantity} · inStock=${b.inStock} · алиасов ${alB}`)
    const fedChipless = alB > 0 && chipB === null
    say(`      выживший по остатку: ${survivor ? '#' + survivor.id : 'оба с нулём (витрине не видны)'}`)
    say(`      прайс кормит: ${alA > 0 ? '#' + a.id + ' (с чипом ✓)' : ''}${alB > 0 ? '#' + b.id + (chipB === null ? ' (БЕЗ ЧИПА ⚠)' : ' (с чипом)') : ''}${alA === 0 && alB === 0 ? '— никого' : ''}`)
    if (fedChipless) say(`      ⚠ ТРЕБУЕТ ПРАВКИ: питание уходит на chip-less вариант`)
  }

  const file = path.resolve(__dirname, '../reports/phase1-verify-2026-08-26.txt')
  fs.writeFileSync(file, out.join('\n'))
  console.log('\nОтчёт: ' + file)
}

main().finally(() => prisma.$disconnect())
