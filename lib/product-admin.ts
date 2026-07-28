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
      attrs: Object.fromEntries(Object.entries(attrs).filter(([k]) => k !== 'fullName')),
      country: attrs['Страна'] ?? null,
      sim: attrs.SIM ?? null,
      price: Number(v.price),
      quantity: v.quantity,
      inStock: v.inStock,
      photoUrl: v.photoUrls[0] ?? null,
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
