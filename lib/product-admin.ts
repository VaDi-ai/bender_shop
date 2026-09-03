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
import { touchStorefrontCache } from './storefront-admin'
import type { PhotoWritebackFn } from './photo-writeback'
import {
  loadPreorderDefaults, resolvePreorder, computePrepayment, renderPreorderTerms,
  asPositiveDecimal, PREORDER_GAP_LABEL, type PreorderReadiness,
} from './preorder'
import { Decimal } from '@prisma/client/runtime/client'

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
  /** Характеристики карточки: их заполняет обогащение, карточка показывает результат */
  specs: Record<string, string>
  /** Предзаказ: что стоит у товара, что подставилось из дефолтов и готово ли это к витрине */
  preorder: PreorderCardView
  isAvailable: boolean
  isFeatured: boolean
  /** Что покупатель видит в каталоге: coverPhoto, а без неё — авто (первый вариант) */
  mainPhoto: string | null
  /** Ручная обложка (DB-only, переживает синк); null = превью авто */
  coverPhoto: string | null
  photos: string[]
  offers: OfferView[]
  /** Сводка «4 предложения: США, ОАЭ, Гонконг» — как в мокапе */
  countries: string[]
  inStockCount: number
  priceFrom: number | null
}

/**
 * Блок предзаказа для карточки админки. Показываем и «своё» значение товара,
 * и итоговое (после дефолтов) — иначе владелец не поймёт, почему у товара без
 * заполненных полей всё равно есть предоплата.
 */
export interface PreorderCardView {
  isPreorder: boolean
  /** ready — можно выпускать; incomplete — флаг есть, условий нет; off — обычный товар */
  status: PreorderReadiness['kind']
  /** Чего не хватает, словами владельца */
  gaps: string[]
  /** Значения самого товара (null = «взять из дефолтов магазина») */
  own: {
    mode: string | null
    kind: string | null
    value: string | null
    eta: string | null
    terms: string | null
  }
  /** Итог после наложения дефолтов, null если предзаказ не готов */
  effective: {
    mode: string
    kind: string | null
    value: string | null
    eta: string | null
    terms: string | null
  } | null
  /** Пример на минимальной цене товара — чтобы сумма была видна до продажи */
  example: { price: string; prepayment: string; remaining: string } | null
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
      id: true, name: true, sku: true, brand: true, description: true, specs: true,
      isAvailable: true, isFeatured: true, photoUrl: true, coverPhoto: true, photos: true,
      isPreorder: true, preorderMode: true, prepaymentKind: true,
      prepaymentValue: true, preorderEta: true, preorderTerms: true,
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
    specs: (p.specs ?? {}) as Record<string, string>,
    isAvailable: p.isAvailable,
    isFeatured: p.isFeatured,
    mainPhoto: p.coverPhoto || p.photoUrl || null,
    coverPhoto: p.coverPhoto || null,
    photos: p.photos ?? [],
    offers,
    countries: [...new Set(offers.map(o => o.country).filter((c): c is string => !!c))],
    inStockCount: inStockOffers.length,
    priceFrom: inStockOffers.length ? Math.min(...inStockOffers.map(o => o.price)) : null,
    preorder: await buildPreorderCardView(p, offers),
  }
}

/**
 * Собирает блок предзаказа карточки. Пример суммы считаем на минимальной цене
 * предложений: владелец должен увидеть «возьмём 30 000 ₽ вперёд» глазами, а не
 * пересчитывать процент в голове.
 */
async function buildPreorderCardView(
  p: {
    isPreorder?: boolean
    preorderMode?: string | null
    prepaymentKind?: string | null
    prepaymentValue?: Decimal | null
    preorderEta?: string | null
    preorderTerms?: string | null
  },
  offers: OfferView[],
): Promise<PreorderCardView> {
  const defaults = await loadPreorderDefaults()
  const readiness = resolvePreorder(p as never, defaults)
  const own = {
    mode: p.preorderMode ?? null,
    kind: p.prepaymentKind ?? null,
    // `!= null` намеренно, не `!== null`: у вызывающего select может не быть
    // этих полей вовсе, и падать из-за undefined карточка товара не должна
    value: p.prepaymentValue != null ? p.prepaymentValue.toString() : null,
    eta: p.preorderEta ?? null,
    terms: p.preorderTerms ?? null,
  }
  if (readiness.kind !== 'ready') {
    return {
      isPreorder: p.isPreorder === true,
      status: readiness.kind,
      gaps: readiness.kind === 'incomplete' ? readiness.gaps.map(g => PREORDER_GAP_LABEL[g]) : [],
      own,
      effective: null,
      example: null,
    }
  }

  const pol = readiness.policy
  const prices = offers.map(o => o.price).filter(v => v > 0)
  const base = prices.length ? new Decimal(Math.min(...prices)) : null
  const split = base ? computePrepayment(base, pol) : null

  return {
    isPreorder: true,
    status: 'ready',
    gaps: [],
    own,
    effective: {
      mode: pol.mode,
      kind: pol.kind,
      value: pol.value ? pol.value.toString() : null,
      eta: pol.eta,
      terms: split
        ? renderPreorderTerms(pol.terms, { prepayment: split.prepayment, remaining: split.remaining, eta: pol.eta })
        : pol.terms,
    },
    example: base && split
      ? { price: base.toFixed(0), prepayment: split.prepayment.toFixed(0), remaining: split.remaining.toFixed(0) }
      : null,
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
  await touchStorefrontCache('product_visibility')
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
  await touchStorefrontCache('product_description')
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

export type IssueKind = 'no_photo' | 'no_sim' | 'no_description' | 'no_stock' | 'bad_photo' | 'preorder_incomplete'

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
  no_stock:       ['Числятся в продаже, но без остатка', 'покупатель их не видит — витрина такие скрывает; вернутся сами, когда в таблице появится остаток'],
  bad_photo:      ['Битая ссылка на фото', 'картинка не с нашего домена — у покупателя не откроется'],
  preorder_incomplete: ['Предзаказ не дозаполнен', 'флаг в таблице стоит, а условий предоплаты нет — на витрину такой товар не выпускаем'],
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
      isPreorder: true, preorderMode: true, prepaymentKind: true,
      prepaymentValue: true, preorderEta: true, preorderTerms: true,
      category: { select: { name: true } },
      variants: { select: { id: true, inStock: true, quantity: true, attributes: true, photoUrls: true } },
    },
  })

  const buckets: Record<IssueKind, IssueRow[]> = {
    no_photo: [], no_sim: [], no_description: [], no_stock: [], bad_photo: [], preorder_incomplete: [],
  }
  // Дефолты магазина читаем один раз: полнота предзаказа считается «товар
  // поверх дефолтов», и без них помеченный товар честно «не дозаполнен».
  const preorderDefaults = await loadPreorderDefaults()
  let visibleProducts = 0

  for (const p of products) {
    const live = p.variants.filter(v => v.inStock && v.quantity > 0)
    const base = { productId: p.id, name: p.name, category: p.category?.name ?? null }

    // ВАЖНО: проверка предзаказа стоит ДО выхода по «нет живых вариантов».
    // У предзаказного товара живых вариантов нет по определению, и без этой
    // ветки он падал бы в no_stock, а полузаполненность владелец не увидел бы
    // никогда — а именно она и держит товар вне витрины.
    const readiness = resolvePreorder(p, preorderDefaults)
    if (readiness.kind === 'incomplete') {
      buckets.preorder_incomplete.push({
        ...base,
        detail: readiness.gaps.map(g => PREORDER_GAP_LABEL[g]).join('; '),
      })
      continue
    }

    if (!live.length) {
      // Готовый предзаказ — не «ошибка без остатка»: нулевой склад у него норма.
      if (readiness.kind === 'ready') continue
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
  await touchStorefrontCache('variant_attributes')
  return { ok: true, status: 200, data: { attributes: attrs, overrides: Object.keys(overrides) } }
}

/** Ключи, которые владелец поправил руками — их не трогают ни синк, ни словарь. */
export function overriddenKeys(attributes: unknown): string[] {
  const o = ((attributes ?? {}) as Record<string, unknown>).attrOverrides
  return o && typeof o === 'object' ? Object.keys(o as object) : []
}

// ─── Правка условий предзаказа (owner) ───────────────────────────────────────

/**
 * Пишет поля предзаказа товара. Это DB-only правка: синк её не трогает (в лист
 * ездит только сам флаг «Предзаказ»), поэтому писбэка здесь нет — в отличие от
 * описания и фото.
 *
 * Пустая строка означает «убрать своё значение и взять из дефолтов магазина» —
 * тот же смысл, что у снятия attrOverrides пустым PUT.
 */
export async function setProductPreorder(
  actor: string,
  productId: number,
  raw: unknown,
): Promise<Outcome> {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true, isPreorder: true, preorderMode: true, prepaymentKind: true,
      prepaymentValue: true, preorderEta: true, preorderTerms: true,
    },
  })
  if (!p) return bad(404, 'Товар не найден')

  const b = (raw ?? {}) as Record<string, unknown>
  const data: Record<string, unknown> = {}

  if ('mode' in b) {
    const v = String(b.mode ?? '')
    if (v === '') data.preorderMode = null
    else if (v === 'full' || v === 'partial') data.preorderMode = v
    else return bad(422, 'Тип предоплаты — «full» или «partial»')
  }
  if ('kind' in b) {
    const v = String(b.kind ?? '')
    if (v === '') data.prepaymentKind = null
    else if (v === 'percent' || v === 'fixed') data.prepaymentKind = v
    else return bad(422, 'Вид предоплаты — «percent» или «fixed»')
  }
  if ('value' in b) {
    const rawV = b.value
    if (rawV === null || rawV === '' || rawV === undefined) data.prepaymentValue = null
    else {
      const dec = asPositiveDecimal(rawV)
      if (!dec) return bad(422, 'Размер предоплаты — положительное число')
      const kind = (data.prepaymentKind as string | null | undefined) ?? p.prepaymentKind
      if (kind === 'percent' && dec.greaterThan(100)) return bad(422, 'Процент предоплаты — от 1 до 100')
      data.prepaymentValue = dec
    }
  }
  if ('eta' in b) {
    const v = String(b.eta ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim()
    if (v.length > 120) return bad(422, 'Срок длиннее 120 символов — напишите короче')
    data.preorderEta = v || null
  }
  if ('terms' in b) {
    const v = String(b.terms ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim()
    if (v.length > 2000) return bad(422, 'Условия длиннее 2000 символов — покупатель столько не читает')
    data.preorderTerms = v || null
  }

  if (!Object.keys(data).length) return bad(422, 'Нечего менять')

  await prisma.product.update({ where: { id: productId }, data })
  void logAdminAction({
    adminTelegramId: actor, action: 'update', entity: 'Product', entityId: productId,
    before: {
      preorderMode: p.preorderMode, prepaymentKind: p.prepaymentKind,
      prepaymentValue: p.prepaymentValue?.toString() ?? null,
      preorderEta: p.preorderEta, preorderTerms: p.preorderTerms,
    },
    after: data,
  })
  // Условия и суммы видны покупателю на карточке — открытые вкладки должны узнать
  await touchStorefrontCache('product_preorder')
  return { ok: true, status: 200 }
}
