/**
 * Карточка товара в админке: что видит покупатель и что можно поправить.
 *
 * Кто чем владеет (ADMIN-DESIGN §1.2):
 *   • цены, остатки, атрибуты, страна — таблица, админка их не трогает;
 *   • описание и фото — общие, пишутся и в БД, и в таблицу (последняя правка
 *     побеждает), поэтому описание уходит писбэком в колонку J, а фото — в Q;
 *   • «скрыть с витрины» — админка: это Product.isAvailable, синк его не
 *     перетирает.
 */
import { prisma } from './prisma'
import { log } from './logger'
import { logAdminAction } from './audit'
import { WRITEBACK_COLS } from './sheets-sync'
import type { PhotoWritebackFn } from './photo-writeback'

export interface OfferView {
  variantId: number
  fullName: string
  attrs: Record<string, string>
  country: string | null
  sim: string | null
  price: number
  quantity: number
  inStock: boolean
  photoUrl: string | null
  /** Атрибуты, поправленные руками — словарь их не трогает */
  overrides: string[]
  /** Видит ли это предложение покупатель прямо сейчас */
  visible: boolean
}

export interface ProductCard {
  id: number
  name: string
  sku: string
  brand: string | null
  category: string | null
  description: string
  isAvailable: boolean
  isFeatured: boolean
  mainPhoto: string | null
  photos: string[]
  offers: OfferView[]
  /** Сводка «4 предложения: США, ОАЭ, Гонконг» — как в мокапе */
  countries: string[]
  inStockCount: number
  priceFrom: number | null
}

export interface Outcome<T = unknown> {
  ok: boolean
  status: number
  error?: string
  data?: T
}

const bad = (status: number, error: string): Outcome => ({ ok: false, status, error })

export async function getProductCard(productId: number): Promise<ProductCard | null> {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true, name: true, sku: true, brand: true, description: true,
      isAvailable: true, isFeatured: true, photoUrl: true, photos: true,
      category: { select: { name: true } },
      variants: {
        orderBy: { id: 'asc' },
        select: { id: true, price: true, quantity: true, inStock: true, photoUrls: true, attributes: true },
      },
    },
  })
  if (!p) return null

  const offers: OfferView[] = p.variants.map(v => {
    const attrs = (v.attributes ?? {}) as Record<string, string>
    const visible = p.isAvailable && v.inStock && v.quantity > 0
    return {
      variantId: v.id,
      fullName: attrs.fullName ?? p.name,
      attrs: Object.fromEntries(Object.entries(attrs).filter(([k]) => k !== 'fullName' && k !== 'attrOverrides')),
      country: attrs['Страна'] ?? null,
      sim: attrs.SIM ?? null,
      price: Number(v.price),
      quantity: v.quantity,
      inStock: v.inStock,
      photoUrl: v.photoUrls[0] ?? null,
      overrides: Object.keys((attrs as unknown as { attrOverrides?: object }).attrOverrides ?? {}),
      visible,
    }
  })

  const inStockOffers = offers.filter(o => o.inStock && o.quantity > 0)
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    brand: p.brand,
    category: p.category?.name ?? null,
    description: p.description ?? '',
    isAvailable: p.isAvailable,
    isFeatured: p.isFeatured,
    mainPhoto: p.photoUrl || null,
    photos: p.photos ?? [],
    offers,
    countries: [...new Set(offers.map(o => o.country).filter((c): c is string => !!c))],
    inStockCount: inStockOffers.length,
    priceFrom: inStockOffers.length ? Math.min(...inStockOffers.map(o => o.price)) : null,
  }
}

/**
 * Скрыть/вернуть товар на витрину. Это единственное поле карточки, которым
 * владеет админка целиком: синк его не трогает, значит скрытие держится.
 */
export async function setProductVisible(actor: string, productId: number, visible: boolean): Promise<Outcome> {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, isAvailable: true },
  })
  if (!p) return bad(404, 'Товар не найден')
  if (p.isAvailable === visible) return { ok: true, status: 200, data: { unchanged: true } }

  await prisma.product.update({ where: { id: productId }, data: { isAvailable: visible } })
  void logAdminAction({
    adminTelegramId: actor, action: 'update', entity: 'Product', entityId: productId,
    before: { isAvailable: p.isAvailable }, after: { isAvailable: visible },
  })
  log.info('Product visibility changed from web admin', { productId, visible })
  return { ok: true, status: 200 }
}

/**
 * Описание товара. Пишем и в БД, и в таблицу (колонка J) — иначе ближайший
 * синк вернёт старый текст из листа. Если строки в листе нет, честно говорим
 * и в БД не пишем: текст-призрак хуже, чем отказ.
 */
export async function setProductDescription(
  actor: string,
  productId: number,
  raw: unknown,
  writeback?: (rows: Array<{ fullName: string; description: string }>) => Promise<{ missing: string[] }>,
): Promise<Outcome> {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true, description: true,
      variants: { orderBy: { id: 'asc' }, select: { attributes: true } },
    },
  })
  if (!p) return bad(404, 'Товар не найден')

  const text = String(raw ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim()
  if (text.length > 2000) return bad(422, 'Описание длиннее 2000 символов — покупатель столько не читает')

  const fullNames = p.variants
    .map(v => String((v.attributes as Record<string, unknown> | null)?.fullName ?? '').trim())
    .filter(Boolean)
  if (!fullNames.length) return bad(422, 'У товара нет строк в таблице — описание записать некуда')

  const fn = writeback ?? sheetDescriptionWriteback
  let missing: string[]
  try {
    ;({ missing } = await fn(fullNames.map(fullName => ({ fullName, description: text }))))
  } catch (e) {
    log.error('Description writeback failed', { productId, error: e instanceof Error ? e.message : String(e) })
    return bad(503, 'Не получилось записать описание в таблицу — попробуйте позже. В каталоге ничего не меняли')
  }
  if (missing.length === fullNames.length) {
    return bad(409, 'Строки товара не найдены в таблице — синк вернул бы старый текст. Проверьте названия в таблице')
  }

  await prisma.product.update({ where: { id: productId }, data: { description: text } })
  void logAdminAction({
    adminTelegramId: actor, action: 'update', entity: 'Product', entityId: productId,
    before: { description: p.description }, after: { description: text, sheetCell: WRITEBACK_COLS.description },
  })
  return { ok: true, status: 200, data: { missing } }
}

/** Описание в колонку J всех строк товара; адресация по fullName. */
export async function sheetDescriptionWriteback(
  rows: Array<{ fullName: string; description: string }>,
): Promise<{ missing: string[] }> {
  const { readSheet, getProductSheetNames, batchUpdate } = await import('./google-sheets')
  const wanted = new Map(rows.map(r => [r.fullName.trim().toLowerCase(), r]))
  const updates: Array<{ range: string; values: string[][] }> = []
  const found = new Set<string>()

  for (const name of await getProductSheetNames()) {
    const data = await readSheet(name)
    for (let i = 1; i < data.length; i++) {
      const key = String(data[i]?.[4] ?? '').trim().toLowerCase()
      if (!key || !wanted.has(key) || found.has(key)) continue
      updates.push({ range: `'${name}'!${WRITEBACK_COLS.description}${i + 1}`, values: [[wanted.get(key)!.description]] })
      found.add(key)
    }
  }
  if (updates.length) await batchUpdate(updates)
  return { missing: [...wanted.keys()].filter(k => !found.has(k)) }
}

/** Тип писбэка фото прокидываем наружу, чтобы роут не импортировал два модуля. */
export type { PhotoWritebackFn }

// ─── Ошибки в товарах (шаг 2) ────────────────────────────────────────────────

export type IssueKind = 'no_photo' | 'no_sim' | 'no_description' | 'no_stock' | 'bad_photo'

export interface IssueRow { productId: number; name: string; category: string | null; detail: string }

export interface IssuesView {
  counts: Record<IssueKind, number>
  groups: Array<{ kind: IssueKind; title: string; hint: string; count: number; rows: IssueRow[] }>
  /** Сколько товаров вообще видит покупатель — знаменатель для честности */
  visibleProducts: number
}

const ISSUE_TITLES: Record<IssueKind, [string, string]> = {
  no_photo:       ['Без фото', 'в каталоге пустая карточка — покупатель проходит мимо'],
  no_sim:         ['Без типа SIM', 'телефон на витрине, а какая SIM — непонятно'],
  no_description: ['Без описания', 'нечего прочитать перед покупкой'],
  no_stock:       ['Показывается, но купить нельзя', 'товар на витрине, а остатков нет'],
  bad_photo:      ['Битая ссылка на фото', 'картинка не с нашего домена — у покупателя не откроется'],
}

/**
 * Ошибки считаем ТОЛЬКО по тому, что видит покупатель: в каталоге 800+ скрытых
 * дублей, и «проблемы» по ним утопили бы раздел. Скрытый товар — не ошибка,
 * это решение владельца.
 */
export async function listProductIssues(limitPerKind = 20): Promise<IssuesView> {
  const { isPhone } = await import('./sim-recalc')
  const products = await prisma.product.findMany({
    where: { isAvailable: true },
    select: {
      id: true, name: true, description: true, photoUrl: true, photos: true,
      category: { select: { name: true } },
      variants: { select: { id: true, inStock: true, quantity: true, attributes: true, photoUrls: true } },
    },
  })

  const buckets: Record<IssueKind, IssueRow[]> = {
    no_photo: [], no_sim: [], no_description: [], no_stock: [], bad_photo: [],
  }
  let visibleProducts = 0

  for (const p of products) {
    const live = p.variants.filter(v => v.inStock && v.quantity > 0)
    const base = { productId: p.id, name: p.name, category: p.category?.name ?? null }

    if (!live.length) {
      // Товар помечен доступным, но купить нечего — витрина его и не покажет,
      // зато владелец думает, что он продаётся.
      buckets.no_stock.push({ ...base, detail: `${p.variants.length} ${p.variants.length === 1 ? 'предложение' : 'предложений'}, все с нулевым остатком` })
      continue
    }
    visibleProducts++

    const photos = [p.photoUrl, ...(p.photos ?? [])].filter(Boolean) as string[]
    if (!photos.length) buckets.no_photo.push({ ...base, detail: 'ни у одного предложения нет фото' })
    else {
      const bad = photos.filter(u => !u.startsWith('/photos/') && !u.startsWith('https://'))
      if (bad.length) buckets.bad_photo.push({ ...base, detail: bad[0]!.slice(0, 60) })
    }

    if (!p.description || !p.description.trim()) buckets.no_description.push({ ...base, detail: 'описание пустое' })

    const noSim = live.filter(v => {
      const attrs = (v.attributes ?? {}) as Record<string, string>
      return isPhone({ id: v.id, attributes: attrs, product: { name: p.name, brand: null, category: p.category } }) && !attrs.SIM
    })
    if (noSim.length) {
      buckets.no_sim.push({ ...base, detail: `${noSim.length} из ${live.length} предложений без типа SIM` })
    }
  }

  const counts = Object.fromEntries(
    (Object.keys(buckets) as IssueKind[]).map(k => [k, buckets[k].length]),
  ) as Record<IssueKind, number>

  return {
    counts,
    visibleProducts,
    groups: (Object.keys(buckets) as IssueKind[])
      .filter(k => buckets[k].length)
      .sort((a, b) => buckets[b].length - buckets[a].length)
      .map(kind => ({
        kind,
        title: ISSUE_TITLES[kind][0],
        hint: ISSUE_TITLES[kind][1],
        count: buckets[kind].length,
        rows: buckets[kind].slice(0, limitPerKind),
      })),
  }
}


// ─── Ручная правка атрибутов предложения (шаг 3) ─────────────────────────────

/** Отметка «поправлено руками»: живёт в том же JSON, схему не меняем. */
export interface AttrOverride { value: string; by: string; at: string }

const SYSTEM_KEYS = new Set(['fullName', 'attrOverrides'])

/**
 * Правит атрибуты одного предложения и помечает их как override.
 *
 * Override всегда сильнее словаря: синк не пересчитывает такие ключи, а
 * обновление по словарю их пропускает. Значение null снимает ручную правку —
 * ключ возвращается под управление разбора.
 */
export async function setVariantAttributes(
  actor: string,
  variantId: number,
  changes: Record<string, unknown>,
): Promise<Outcome> {
  const v = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, attributes: true, productId: true },
  })
  if (!v) return bad(404, 'Предложение не найдено')

  const entries = Object.entries(changes ?? {}).filter(([k]) => !SYSTEM_KEYS.has(k))
  if (!entries.length) return bad(422, 'Нечего менять')
  for (const [k, val] of entries) {
    if (!k.trim() || k.length > 40) return bad(422, `Странное название атрибута: «${k.slice(0, 20)}»`)
    if (val !== null && String(val).length > 100) return bad(422, `Значение «${k}» длиннее 100 символов`)
  }

  const attrs = { ...((v.attributes ?? {}) as Record<string, unknown>) }
  const overrides = { ...((attrs.attrOverrides ?? {}) as Record<string, AttrOverride>) }
  const before: Record<string, unknown> = {}
  const at = new Date().toISOString()

  for (const [key, raw] of entries) {
    before[key] = attrs[key] ?? null
    if (raw === null || String(raw).trim() === '') {
      // снятие ручной правки: значение остаётся, но им снова управляет разбор
      delete overrides[key]
      if (raw === null) delete attrs[key]
    } else {
      const value = String(raw).trim()
      attrs[key] = value
      overrides[key] = { value, by: actor, at }
    }
  }
  attrs.attrOverrides = overrides

  await prisma.productVariant.update({ where: { id: variantId }, data: { attributes: attrs as object } })
  void logAdminAction({
    adminTelegramId: actor, action: 'variant_attrs', entity: 'ProductVariant', entityId: variantId,
    before, after: { ...Object.fromEntries(entries.map(([k]) => [k, attrs[k] ?? null])), overrides: Object.keys(overrides) },
  })
  log.info('Variant attributes edited', { variantId, keys: entries.map(([k]) => k) })
  return { ok: true, status: 200, data: { attributes: attrs, overrides: Object.keys(overrides) } }
}

/** Ключи, которые владелец поправил руками — их не трогают ни синк, ни словарь. */
export function overriddenKeys(attributes: unknown): string[] {
  const o = ((attributes ?? {}) as Record<string, unknown>).attrOverrides
  return o && typeof o === 'object' ? Object.keys(o as object) : []
}
