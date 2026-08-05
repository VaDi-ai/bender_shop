/**
 * Фото товара из админки — с обязательной записью в ТАБЛИЦУ.
 *
 * Инвариант проекта: фото — зеркало таблицы. Синк каждый прогон перезаписывает
 * variant.photoUrls из колонки Q, а пустая ячейка сбрасывает фото. Значит
 * поставить фото «только в базе» нельзя: через час его сотрёт синк. Поэтому
 * порядок такой:
 *   1) пишем ссылку в ячейку Q нужной строки (адресация по fullName, как в
 *      ценовом писбэке — rowIndex листа нестабилен);
 *   2) сразу отражаем в БД, чтобы фото появилось у покупателя не дожидаясь
 *      синка;
 *   3) если лист недоступен или строка не найдена — НЕ пишем в БД вовсе,
 *      иначе получилось бы фото-призрак, живущее до ближайшего синка.
 *
 * Пустая ссылка = снять фото: чистим ячейку и чистим БД. Это ровно то же, что
 * делает синк с пустой ячейкой, — поведение таблицы мы не ломаем.
 */
import { prisma } from './prisma'
import { log } from './logger'
import { logAdminAction } from './audit'
import { WRITEBACK_COLS, mergeVariantPhotoUrls } from './sheets-sync'
import { normalizePhotoLink } from './photo-store'
import { touchStorefrontCache } from './storefront-admin'

export interface PhotoWritebackRow { fullName: string; photo: string }

/**
 * Чистый билдер: находит строку по fullName (колонка E, индекс 4) и пишет в
 * колонку фото. Юнит-тестируется без Google.
 */
export function buildPhotoUpdates(
  rows: PhotoWritebackRow[],
  sheets: Array<{ name: string; data: string[][] }>,
): { updates: Array<{ range: string; values: string[][] }>; missing: string[] } {
  const wanted = new Map(rows.map(r => [r.fullName.trim().toLowerCase(), r]))
  const updates: Array<{ range: string; values: string[][] }> = []
  const found = new Set<string>()

  for (const sheet of sheets) {
    if (!wanted.size || found.size === wanted.size) break
    for (let i = 1; i < sheet.data.length; i++) {
      const key = String(sheet.data[i]?.[4] ?? '').trim().toLowerCase()
      if (!key || !wanted.has(key) || found.has(key)) continue
      updates.push({
        range: `'${sheet.name}'!${WRITEBACK_COLS.photo}${i + 1}`,
        values: [[wanted.get(key)!.photo]],
      })
      found.add(key)
    }
  }
  return { updates, missing: [...wanted.keys()].filter(k => !found.has(k)) }
}

export type PhotoWritebackFn = (rows: PhotoWritebackRow[]) => Promise<{ missing: string[] }>

/** Реальная запись в Google Sheets. */
export async function sheetPhotoWriteback(rows: PhotoWritebackRow[]): Promise<{ missing: string[] }> {
  const { readSheet, getProductSheetNames, batchUpdate } = await import('./google-sheets')
  const sheets: Array<{ name: string; data: string[][] }> = []
  for (const name of await getProductSheetNames()) {
    sheets.push({ name, data: await readSheet(name) })
  }
  const { updates, missing } = buildPhotoUpdates(rows, sheets)
  if (updates.length) await batchUpdate(updates)
  return { missing }
}

export interface PhotoOutcome {
  ok: boolean
  status: number
  error?: string
  /** Что теперь видит покупатель */
  photoUrl?: string | null
  productPhotos?: string[]
  fullName?: string
}

const bad = (status: number, error: string): PhotoOutcome => ({ ok: false, status, error })

/**
 * Ставит (или снимает при url=null) фото ОДНОМУ предложению — строке таблицы.
 * Возвращает то, что реально стало у покупателя.
 */
export async function setVariantPhoto(
  actor: string,
  variantId: number,
  url: string | null,
  writeback: PhotoWritebackFn = sheetPhotoWriteback,
): Promise<PhotoOutcome> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, attributes: true, photoUrls: true, productId: true },
  })
  if (!variant) return bad(404, 'Предложение не найдено')

  let value = ''
  if (url !== null && url !== '') {
    const link = normalizePhotoLink(url)
    if (!link.ok) return bad(422, link.error)
    value = link.url
  }

  const fullName = String((variant.attributes as Record<string, unknown> | null)?.fullName ?? '').trim()
  if (!fullName) {
    return bad(422, 'У предложения нет названия строки в таблице — фото прописать некуда. Поправьте строку в таблице и запустите синк')
  }

  // Сначала таблица: если не получилось — в БД не лезем вовсе
  let missing: string[]
  try {
    ;({ missing } = await writeback([{ fullName, photo: value }]))
  } catch (e) {
    log.error('Photo writeback failed', { variantId, error: e instanceof Error ? e.message : String(e) })
    return bad(503, 'Не получилось записать фото в таблицу — попробуйте позже. В каталоге ничего не меняли')
  }
  if (missing.length) {
    return bad(409, `Строка «${fullName}» не найдена в таблице — синк всё равно стёр бы фото. Проверьте название в таблице`)
  }

  const before = variant.photoUrls
  await prisma.productVariant.update({
    where: { id: variantId },
    data: { photoUrls: value ? [value] : [] },
  })
  const productPhotos = await recomputeProductPhotos(variant.productId)
  await touchStorefrontCache('variant_photo')

  void logAdminAction({
    adminTelegramId: actor, action: 'update', entity: 'ProductVariant', entityId: variantId,
    before: { photoUrls: before }, after: { photoUrls: value ? [value] : [], sheetCell: WRITEBACK_COLS.photo, fullName },
  })
  log.info('Variant photo set from web admin', { variantId, value: value || '(снято)' })
  return { ok: true, status: 200, photoUrl: value || null, productPhotos, fullName }
}

/**
 * Главное фото товара — обложка в каталоге и поиске (Product.coverPhoto).
 *
 * Это НЕ фото предложения: обложка не зависит от порядка офферов и живёт
 * только в БД — тот же паттерн, что фото категорий и логотипы брендов.
 * Писбэка в таблицу нет, синк и recomputeProductPhotos её не перезаписывают.
 * url=null — снять обложку: превью снова считается авто (первый вариант).
 */
export async function setProductMainPhoto(
  actor: string,
  productId: number,
  url: string | null,
): Promise<PhotoOutcome> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, coverPhoto: true, photoUrl: true, photos: true },
  })
  if (!product) return bad(404, 'Товар не найден')

  let value: string | null = null
  if (url !== null && url !== '') {
    const link = normalizePhotoLink(url)
    if (!link.ok) return bad(422, link.error)
    value = link.url
  }

  await prisma.product.update({ where: { id: productId }, data: { coverPhoto: value } })
  await touchStorefrontCache('product_cover_photo')

  void logAdminAction({
    adminTelegramId: actor, action: 'update', entity: 'Product', entityId: productId,
    before: { coverPhoto: product.coverPhoto }, after: { coverPhoto: value },
  })
  log.info('Product cover photo set from web admin', { productId, value: value ?? '(снята — авто)' })
  // photoUrl — что покупатель видит теперь: обложка, а без неё — авто-превью
  return { ok: true, status: 200, photoUrl: value ?? product.photoUrl ?? null, productPhotos: product.photos }
}

/**
 * Пересобирает фото товара из предложений — тем же правилом, что и синк.
 * Пишет только photos/photoUrl; coverPhoto — ручная обложка, её не трогаем.
 */
export async function recomputeProductPhotos(productId: number): Promise<string[]> {
  const variants = await prisma.productVariant.findMany({
    where: { productId },
    orderBy: { id: 'asc' },
    select: { photoUrls: true },
  })
  const merged = mergeVariantPhotoUrls(variants.map(v => ({ photoUrls: v.photoUrls })))
  await prisma.product.update({
    where: { id: productId },
    data: merged.length ? { photos: merged, photoUrl: merged[0]! } : { photos: [], photoUrl: null },
  })
  return merged
}
