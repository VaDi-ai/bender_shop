/**
 * Схлопывание дублей, ФАЗА 1 — DRY-RUN по умолчанию.
 *
 * Что делает (и только это):
 *   A) дубли вариантов iPad 11 (#433): победитель — тот, кого кормит лист/прайс
 *      или у кого остаток; переносим остаток/цену/фото, дубль → inStock=false,
 *      quantity=0;
 *   B) истинные дубли вариантов iPad Air 11/13 — совпадает ВЕСЬ набор атрибутов,
 *      включая «Чип» (пары M3/M4 в ключе различаются и потому исключены сами);
 *   C) группы-призраки с вариантами: перенос на живого, родитель-призрак скрыт.
 *   D) артефакт имени « )» — ЗАБЛОКИРОВАН: лист кормит эти товары прямо сейчас
 *      (58 строк «2026)»), правка только в БД будет отменена следующим синком.
 *
 * Жёсткие ограды:
 *   • ничего не удаляем — только скрываем (inStock=false, quantity=0,
 *     isAvailable=false у товара). OrderItem.variantId = onDelete: Restrict;
 *   • не склеиваем через «+» (S26/S26+, Redmi Note Pro/Pro+) — стоп-лист;
 *   • не склеиваем через поколение чипа — «Чип» входит в ключ конфигурации;
 *   • Apple Watch S11/Ultra и призраки без вариантов в эту фазу НЕ входят;
 *   • варианты с заказами/резервами/алиасами помечаются отдельно: их только
 *     скрываем, а привязки к ним показываем владельцу для перепривязки.
 *
 *   npx ts-node scripts/collapse-dupes-phase1.ts           — dry-run (снапшот + план)
 *   npx ts-node scripts/collapse-dupes-phase1.ts --apply   — выполнить (после ревью)
 */
import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'

const APPLY = process.argv.includes('--apply')
const ACTOR = 'claude-collapse-phase1'
const STAMP = '2026-08-26-paren'

const out: string[] = []
const say = (s = ''): void => { console.log(s); out.push(s) }

// ─── Ограды ───────────────────────────────────────────────────────────────────
/** Имена, которые НЕЛЬЗЯ схлопывать: различие в «+»/поколении — это разные модели. */
const FORBIDDEN_MERGE = [/\+\s*$/, /\bpro\+/i, /\bs\d+\+/i]
const isForbiddenPair = (a: string, b: string): boolean =>
  a.trim().toLowerCase() !== b.trim().toLowerCase() &&
  FORBIDDEN_MERGE.some(re => re.test(a) !== re.test(b))

const SYS = new Set(['fullName', 'attrOverrides'])
type Attrs = Record<string, unknown>
const cleanAttrs = (a: unknown): Record<string, string> => {
  const o: Record<string, string> = {}
  for (const [k, v] of Object.entries((a ?? {}) as Attrs)) {
    if (SYS.has(k) || v === null || v === undefined || typeof v === 'object') continue
    o[k] = String(v).trim().toLowerCase().replace(/\s+/g, ' ')
  }
  return o
}
/** Ключ конфигурации = ВЕСЬ набор атрибутов, включая «Чип» (M3 ≠ M4). */
const configKey = (a: unknown): string =>
  Object.entries(cleanAttrs(a)).sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => `${k}=${v}`).join(' | ')

interface Plan {
  kind: 'variant-dupe' | 'ghost-product'
  scope: string
  keepVariantId?: number
  hideVariantId?: number
  hideProductId?: number
  moveQuantity?: number
  movePrice?: number
  movePhotos?: number
  note: string
  blockers: string[]
}

async function main() {
  const plans: Plan[] = []

  // ── Данные ────────────────────────────────────────────────────────────────
  const products = await prisma.product.findMany({
    include: {
      category: { select: { name: true } },
      variants: { select: { id: true, sku: true, attributes: true, price: true, quantity: true, inStock: true, photos: true } },
    },
  })
  const byId = new Map(products.map(p => [p.id, p]))
  const allVariantIds = products.flatMap(p => p.variants.map(v => v.id))

  const [aliases, priceRows, orderItems, reservations] = await Promise.all([
    prisma.priceAlias.findMany({ select: { id: true, alias: true, variantId: true, productId: true } }),
    prisma.supplierPrice.findMany({ where: { variantId: { in: allVariantIds } }, select: { id: true, variantId: true, parsedAt: true } }),
    prisma.orderItem.findMany({ where: { variantId: { in: allVariantIds } }, select: { variantId: true, orderId: true } }),
    prisma.reservation.findMany({ where: { variantId: { in: allVariantIds } }, select: { variantId: true, id: true } }),
  ])
  const aliasByVariant = new Map<number, typeof aliases>()
  for (const a of aliases) {
    if (a.variantId === null) continue
    if (!aliasByVariant.has(a.variantId)) aliasByVariant.set(a.variantId, [])
    aliasByVariant.get(a.variantId)!.push(a)
  }
  const priceByVariant = new Map<number, number>()
  for (const r of priceRows) priceByVariant.set(r.variantId!, (priceByVariant.get(r.variantId!) ?? 0) + 1)
  const ordersByVariant = new Set(orderItems.map(o => o.variantId))
  const reservedByVariant = new Set(reservations.map(r => r.variantId))

  type V = (typeof products)[number]['variants'][number]
  const blockersFor = (v: V): string[] => {
    const b: string[] = []
    if (ordersByVariant.has(v.id)) b.push('есть заказы (удалять нельзя, только скрыть)')
    if (reservedByVariant.has(v.id)) b.push('есть резерв')
    const al = aliasByVariant.get(v.id) ?? []
    if (al.length) b.push(`привязки прайса: ${al.map(a => `#${a.id} «${a.alias}»`).join(', ')} — перепривязать на живой вариант`)
    return b
  }
  /** Кто «живой» в паре: остаток → прайс кормит → есть привязка → свежий sku-префикс. */
  const score = (v: V, ownSkuPrefix: string): number =>
    (v.quantity > 0 ? 1000 : 0) + (v.inStock ? 500 : 0) +
    (priceByVariant.get(v.id) ?? 0) * 10 + (aliasByVariant.get(v.id)?.length ?? 0) * 5 +
    (v.sku.startsWith(ownSkuPrefix) ? 3 : 0) + (v.photos.length ? 1 : 0)

  // ── A + B: дубли вариантов внутри товара (iPad 11 / Air 11 / Air 13) ──────
  const VARIANT_SCOPE = [
    { id: 433, label: 'A. iPad 11 (#433)' },
    { id: 434, label: 'B. iPad Air 11 (#434)' },
    { id: 630, label: 'B. iPad Air 13 (#630)' },
  ]
  for (const scope of VARIANT_SCOPE) {
    const p = byId.get(scope.id)
    if (!p) { say(`  !! товар #${scope.id} не найден`); continue }
    const ownPrefix = p.sku
    say(`\n\n════ ${scope.label} «${p.name}» ════`)
    const groups = new Map<string, V[]>()
    for (const v of p.variants) {
      const k = configKey(v.attributes)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(v)
    }

    // Пары «с чипом ↔ без чипа»: дубль только если у товара ОДНО поколение чипа.
    // У iPad Air 11 их два (M3 и M4) — там такие пары не трогаем вовсе.
    const chipValues = new Set(p.variants.map(v => cleanAttrs(v.attributes)['чип']).filter(Boolean) as string[])
    const chipKeys = new Set(p.variants.flatMap(v => Object.keys(cleanAttrs(v.attributes)).filter(k => k.toLowerCase() === 'чип')))
    const distinctChips = new Set(
      p.variants.map(v => {
        const a = cleanAttrs(v.attributes)
        const key = Object.keys(a).find(k => k.toLowerCase() === 'чип')
        return key ? a[key] : null
      }).filter((x): x is string => !!x),
    )
    void chipValues; void chipKeys
    if (distinctChips.size === 1) {
      const withoutChip = p.variants.filter(v => !Object.keys(cleanAttrs(v.attributes)).some(k => k.toLowerCase() === 'чип'))
      for (const v of withoutChip) {
        const rest = configKey(v.attributes)
        // ключ такой же, но с добавленным чипом — единственным у этого товара
        const chip = [...distinctChips][0]!
        const withChipKey = configKey({ ...cleanAttrs(v.attributes), 'Чип': chip })
        const target = groups.get(withChipKey)
        if (!target?.length) continue
        groups.set(withChipKey, [...target, v])          // приклеиваем к их группе
        const g = groups.get(rest)
        if (g) groups.set(rest, g.filter(x => x.id !== v.id))
      }
      say(`  (у товара одно поколение чипа «${[...distinctChips][0]}» → пары «с чипом ↔ без чипа» считаются дублями: ${withoutChip.length} шт)`)
    } else if (distinctChips.size > 1) {
      say(`  (⚠ поколений чипа несколько: ${[...distinctChips].join(', ')} → пары «с чипом ↔ без чипа» НЕ трогаем)`)
    }

    const dupes = [...groups.entries()].filter(([, vs]) => vs.length > 1)

    say(`  вариантов ${p.variants.length} · конфигураций ${groups.size} · задвоенных ${dupes.length}`)
    if (!dupes.length) { say('  дублей нет'); continue }

    for (const [key, vs] of dupes) {
      const sorted = [...vs].sort((a, b) => score(b, ownPrefix) - score(a, ownPrefix) || a.id - b.id)
      const keep = sorted[0]!
      say(`\n  КОНФИГУРАЦИЯ: ${key}`)
      say(`    ОСТАВЛЯЕМ #${keep.id} · sku ${keep.sku} · остаток ${keep.quantity} · ${Number(keep.price)} ₽ · фото ${keep.photos.length}` +
        ` · прайс-строк ${priceByVariant.get(keep.id) ?? 0} · алиасов ${aliasByVariant.get(keep.id)?.length ?? 0}`)
      for (const loser of sorted.slice(1)) {
        const moveQty = keep.quantity === 0 && loser.quantity > 0 ? loser.quantity : 0
        const movePrice = Number(keep.price) === 0 && Number(loser.price) > 0 ? Number(loser.price) : 0
        const movePhotos = keep.photos.length === 0 && loser.photos.length > 0 ? loser.photos.length : 0
        const blockers = blockersFor(loser)
        say(`    СКРЫВАЕМ  #${loser.id} · sku ${loser.sku} · остаток ${loser.quantity} · ${Number(loser.price)} ₽ · фото ${loser.photos.length}` +
          ` · прайс-строк ${priceByVariant.get(loser.id) ?? 0} · алиасов ${aliasByVariant.get(loser.id)?.length ?? 0}`)
        const moves: string[] = []
        if (moveQty) moves.push(`остаток ${moveQty} → #${keep.id}`)
        if (movePrice) moves.push(`цена ${movePrice} ₽ → #${keep.id}`)
        if (movePhotos) moves.push(`фото ${movePhotos} шт → #${keep.id}`)
        say(`        перенос: ${moves.length ? moves.join(' · ') : '— (у живого всё своё)'}`)
        say(`        действие: inStock=false, quantity=0 (НЕ удаляем)`)
        if (blockers.length) for (const b of blockers) say(`        ⚠ ${b}`)
        plans.push({
          kind: 'variant-dupe', scope: scope.label,
          keepVariantId: keep.id, hideVariantId: loser.id,
          moveQuantity: moveQty, movePrice, movePhotos,
          note: key, blockers,
        })
      }
    }
  }

  // ── C: группы-призраки с вариантами ───────────────────────────────────────
  // Только те, что подтверждены аудитом; со стоп-листом по «+» и по листу.
  const GHOST_GROUPS: Array<{ label: string; ids: number[]; blockedBySheet?: string }> = [
    { label: 'Mac Mini M4 Pro', ids: [668, 634] },
    { label: 'iMac M4', ids: [671, 29] },
    { label: 'Poco F6', ids: [598, 232] },
    { label: 'Redmi Note 14S 4G NFC', ids: [576, 207] },
    { label: 'Яндекс Станция 3', ids: [506, 116] },
    { label: 'Яндекс Станция Макс', ids: [119, 509] },
    { label: 'iPad Air 11 ) — артефакт имени', ids: [434, 711], },
    { label: 'iPad Air 13 ) — артефакт имени', ids: [630, 712], },
  ]

  say(`\n\n════ C. ГРУППЫ-ПРИЗРАКИ С ВАРИАНТАМИ ════`)
  for (const g of GHOST_GROUPS) {
    const rows = g.ids.map(id => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x)
    if (rows.length < 2) { say(`\n  «${g.label}»: товары не найдены — пропуск`); continue }
    const names = rows.map(r => r.name)
    if (names.some((n, i) => names.some((m, j) => i !== j && isForbiddenPair(n, m)))) {
      say(`\n  «${g.label}»: СТОП — различие по «+», это разные модели. Пропуск.`)
      continue
    }
    const live = rows.find(r => r.isAvailable && r.variants.some(v => v.inStock && v.quantity > 0))
    const survivor = live ?? [...rows].sort((a, b) => b.variants.length - a.variants.length)[0]!
    say(`\n  «${g.label}»`)
    say(`    ОСТАВЛЯЕМ #${survivor.id} «${survivor.name}» · кат. ${survivor.category?.name ?? '—'} · вариантов ${survivor.variants.length}` +
      ` · остаток ${survivor.variants.reduce((s, v) => s + v.quantity, 0)}${live ? ' · ЖИВОЙ' : ' · (живого нет — оставляем самого полного)'}`)
    for (const ghost of rows.filter(r => r.id !== survivor.id)) {
      const qty = ghost.variants.reduce((s, v) => s + v.quantity, 0)
      const ordered = ghost.variants.filter(v => ordersByVariant.has(v.id)).length
      const aliased = ghost.variants.filter(v => (aliasByVariant.get(v.id)?.length ?? 0) > 0).length
      const priced = ghost.variants.filter(v => (priceByVariant.get(v.id) ?? 0) > 0).length
      say(`    СКРЫВАЕМ  #${ghost.id} «${ghost.name}» · кат. ${ghost.category?.name ?? '—'} · вариантов ${ghost.variants.length} · остаток ${qty}`)
      say(`        действие: isAvailable=false + все варианты inStock=false, quantity=0 (НЕ удаляем)`)
      const blockers: string[] = []
      if (ordered) blockers.push(`вариантов с заказами: ${ordered} — только скрытие`)
      if (aliased) blockers.push(`вариантов с привязками: ${aliased} — перепривязать на #${survivor.id}`)
      if (priced) blockers.push(`вариантов, куда ходит прайс: ${priced}`)
      if (g.blockedBySheet) blockers.push(`ЗАБЛОКИРОВАНО ЛИСТОМ: ${g.blockedBySheet}`)
      for (const b of blockers) say(`        ⚠ ${b}`)
      plans.push({
        kind: 'ghost-product', scope: g.label,
        hideProductId: ghost.id, keepVariantId: survivor.id,
        note: `${ghost.name} → ${survivor.name}`, blockers,
      })
    }
  }

  // ── D: Apple Watch, ТОЛЬКО регулируемые ремешки (Milanese / Link) ─────────
  //
  // Важно: у Apple Watch **Ultra** Milanese Loop выпускается в размерах S/M/L,
  // и размер стоит в НАЗВАНИИ, но ни в один атрибут не попадает. По атрибутам
  // такие варианты выглядят близнецами, хотя это разные товары. Поэтому пары
  // отобраны вручную (audit-watch-adjustable.ts) и здесь ПЕРЕПРОВЕРЯЮТСЯ:
  // ремешок обязан быть регулируемым, размер из имени — совпасть.
  // Sport Band / Sport Loop / Solo / Braided / Alpine — отдельный шаг, не здесь.
  const WATCH_ADJUSTABLE_PAIRS = [
    { keep: 1664, hide: 50, note: 'Ultra 3 · Black · Milanese Loop S' },
    { keep: 1656, hide: 44, note: 'Ultra 2 · Natural · Milanese Loop M' },
    { keep: 1657, hide: 45, note: 'Ultra 2 · Black · Milanese Loop M' },
  ]
  const ADJUSTABLE_RE = /\b(milanese|link\s*bracelet)\b/i
  const bandSize = (fullName: string): string | null => {
    const m = fullName.match(/\b(?:milanese|link\s*bracelet)(?:\s+loop)?\s+(S\/M|M\/L|S|M|L)\b/i)
    return m ? m[1]!.toUpperCase() : null
  }

  say(`\n\n════ D. APPLE WATCH — регулируемые ремешки (Milanese / Link) ════`)
  say(`  Sport Band / Sport Loop / Solo / Braided / Alpine в эту фазу НЕ входят: у них размер реальный.`)
  for (const pair of WATCH_ADJUSTABLE_PAIRS) {
    const [keep, hide] = await Promise.all([
      prisma.productVariant.findUnique({ where: { id: pair.keep }, select: { id: true, productId: true, attributes: true, quantity: true, inStock: true, price: true, photos: true } }),
      prisma.productVariant.findUnique({ where: { id: pair.hide }, select: { id: true, productId: true, attributes: true, quantity: true, inStock: true, price: true, photos: true } }),
    ])
    say(`\n  «${pair.note}»`)
    if (!keep || !hide) { say(`    ПРОПУСК: вариант не найден`); continue }
    const fnKeep = String((keep.attributes as Attrs)?.fullName ?? '')
    const fnHide = String((hide.attributes as Attrs)?.fullName ?? '')
    const aKeep = cleanAttrs(keep.attributes), aHide = cleanAttrs(hide.attributes)

    // Перепроверка №1: оба — регулируемый ремешок
    if (!ADJUSTABLE_RE.test(`${fnKeep} ${aKeep['ремешок'] ?? ''}`) || !ADJUSTABLE_RE.test(`${fnHide} ${aHide['ремешок'] ?? ''}`)) {
      say(`    ПРОПУСК: не Milanese/Link — правило неприменимо`); continue
    }
    // Перепроверка №2: размер ремешка из имени совпал (или отсутствует у обоих)
    const sKeep = bandSize(fnKeep), sHide = bandSize(fnHide)
    if (sKeep !== sHide) {
      say(`    ПРОПУСК: размеры ремешка различаются (${sKeep ?? '—'} ≠ ${sHide ?? '—'}) — это РАЗНЫЕ товары`); continue
    }
    // Перепроверка №3: корпус/цвет/страна совпали
    const same = ['размер', 'цвет', 'страна'].every(k => (aKeep[k] ?? '') === (aHide[k] ?? ''))
    if (!same) { say(`    ПРОПУСК: различаются корпус/цвет/страна`); continue }

    const moveQty = keep.quantity === 0 && hide.quantity > 0 ? hide.quantity : 0
    const movePhotos = keep.photos.length === 0 && hide.photos.length > 0 ? hide.photos.length : 0
    say(`    ОСТАВЛЯЕМ #${keep.id} · размер ремешка ${sKeep ?? '—'} · остаток ${keep.quantity} · ${Number(keep.price)} ₽`)
    say(`        ${fnKeep}`)
    say(`    СКРЫВАЕМ  #${hide.id} · размер ремешка ${sHide ?? '—'} · остаток ${hide.quantity} · ${Number(hide.price)} ₽`)
    say(`        ${fnHide}`)
    say(`        перенос: ${[moveQty && `остаток ${moveQty}`, movePhotos && `фото ${movePhotos}`].filter(Boolean).join(' · ') || '— (у живого всё своё)'}`)
    const blockers = blockersFor(hide as unknown as V)
    for (const b of blockers) say(`        ⚠ ${b}`)
    plans.push({
      kind: 'variant-dupe', scope: 'D. Apple Watch (регулируемый ремешок)',
      keepVariantId: keep.id, hideVariantId: hide.id,
      moveQuantity: moveQty, movePrice: 0, movePhotos,
      note: pair.note, blockers,
    })
  }

  // ── Итог ──────────────────────────────────────────────────────────────────
  const blocked = plans.filter(p => p.blockers.some(b => b.startsWith('ЗАБЛОКИРОВАНО')))
  const withAlias = plans.filter(p => p.blockers.some(b => b.includes('привязк')))
  say(`\n\n════ ИТОГО ════`)
  say(`  Действий в плане: ${plans.length}`)
  say(`    скрыть вариантов-дублей: ${plans.filter(p => p.kind === 'variant-dupe').length}`)
  say(`    скрыть товаров-призраков: ${plans.filter(p => p.kind === 'ghost-product').length}`)
  say(`  Заблокировано листом (не выполнять до правки листа/синка): ${blocked.length}`)
  say(`  Требуют перепривязки алиасов перед скрытием: ${withAlias.length}`)
  say(`  Удалений: 0 — фаза 1 только скрывает.`)

  // ── Снапшот ───────────────────────────────────────────────────────────────
  const touchedVariantIds = [...new Set(plans.flatMap(p => [p.keepVariantId, p.hideVariantId].filter((x): x is number => !!x)))]
  const touchedProductIds = [...new Set([
    ...plans.map(p => p.hideProductId).filter((x): x is number => !!x),
    ...VARIANT_SCOPE.map(s => s.id),
    ...GHOST_GROUPS.flatMap(g => g.ids),
  ])]
  const snapshot = {
    takenAt: new Date().toISOString(),
    reason: 'before collapse-dupes-phase1 (dry-run snapshot)',
    variants: await prisma.productVariant.findMany({ where: { id: { in: touchedVariantIds } } }),
    products: await prisma.product.findMany({ where: { id: { in: touchedProductIds } }, include: { variants: true } }),
    aliasesTouching: aliases.filter(a => a.variantId !== null && touchedVariantIds.includes(a.variantId)),
    plans,
  }
  const snapFile = path.resolve(__dirname, `../reports/collapse-phase1-snapshot-${STAMP}.json`)
  fs.writeFileSync(snapFile, JSON.stringify(snapshot, (_, v) => (typeof v === 'bigint' ? String(v) : v), 2))
  const planFile = path.resolve(__dirname, `../reports/collapse-phase1-plan-${STAMP}.txt`)

  if (!APPLY) {
    say(`\n  DRY-RUN: ничего не изменено.`)
    say(`  Снапшот: ${snapFile}`)
    fs.writeFileSync(planFile, out.join('\n'))
    console.log(`  План: ${planFile}`)
    return
  }

  // ── Применение (только после ревью) ───────────────────────────────────────
  say('\n  ПРИМЕНЯЮ…')
  const { logAdminAction } = await import('../lib/audit')
  for (const p of plans) {
    if (p.blockers.some(b => b.startsWith('ЗАБЛОКИРОВАНО'))) { say(`  пропуск (заблокировано): ${p.note}`); continue }
    if (p.kind === 'variant-dupe') {
      const keep = await prisma.productVariant.findUnique({ where: { id: p.keepVariantId! } })
      const hide = await prisma.productVariant.findUnique({ where: { id: p.hideVariantId! } })
      if (!keep || !hide) continue
      const data: Record<string, unknown> = {}
      if (p.moveQuantity) { data.quantity = keep.quantity + p.moveQuantity; data.inStock = true }
      if (p.movePrice) data.price = p.movePrice
      if (p.movePhotos) data.photos = hide.photos
      if (Object.keys(data).length) await prisma.productVariant.update({ where: { id: keep.id }, data })
      await prisma.productVariant.update({ where: { id: hide.id }, data: { inStock: false, quantity: 0, archivedAt: new Date() } })
      await logAdminAction({
        adminTelegramId: ACTOR, action: 'dupe_collapse', entity: 'ProductVariant', entityId: hide.id,
        before: { variant: hide, keepVariant: { id: keep.id, quantity: keep.quantity, price: keep.price } },
        after: { hidden: true, movedTo: keep.id, moved: { quantity: p.moveQuantity, price: p.movePrice, photos: p.movePhotos } },
      })
      say(`  ok: #${hide.id} скрыт → #${keep.id}`)
    } else {
      const ghost = await prisma.product.findUnique({ where: { id: p.hideProductId! }, include: { variants: true } })
      if (!ghost) continue
      await prisma.product.update({ where: { id: ghost.id }, data: { isAvailable: false } })
      for (const v of ghost.variants) await prisma.productVariant.update({ where: { id: v.id }, data: { inStock: false, quantity: 0, archivedAt: new Date() } })
      await logAdminAction({
        adminTelegramId: ACTOR, action: 'dupe_collapse', entity: 'Product', entityId: ghost.id,
        before: { name: ghost.name, isAvailable: ghost.isAvailable, variants: ghost.variants.map(v => ({ id: v.id, quantity: v.quantity, inStock: v.inStock })) },
        after: { hidden: true, survivor: p.keepVariantId },
      })
      say(`  ok: товар #${ghost.id} скрыт`)
    }
  }
  fs.writeFileSync(planFile, out.join('\n'))
}

main().finally(() => prisma.$disconnect())
