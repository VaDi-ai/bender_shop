/**
 * Витрина из веб-админки: баннеры, фото категорий, бегущая строка, хиты.
 *
 * Что тут важно по архитектуре проекта:
 *   • Баннеры и фото категорий раньше заводились только из бота и хранили
 *     telegram file_id. Веб кладёт ССЫЛКУ (наш /photos/... или https://),
 *     поэтому imageFile теперь «file_id ИЛИ ссылка», а витрина умеет оба
 *     варианта (publicImageUrl). Схема не менялась — чистый аддитив.
 *   • Хиты: Product.isFeatured. Если владелец заведёт в таблице колонку
 *     «В хиты», синк начнёт её применять и переедет поверх ручного выбора —
 *     это честно сказано в UI, а не спрятано.
 *   • Бегущая строка живёт в настройках (ApiKey setting_marquee), её же
 *     читает витрина через /api/settings?key=marquee.
 */
import { prisma } from './prisma'
import { log } from './logger'
import { logAdminAction } from './audit'
import { getApiKeyValue, setApiKeyValue } from './api-key-store'
import { logSecurityEvent } from './security-log'
import { normalizePhotoLink } from './photo-store'

export const MARQUEE_MAX = 200

/** Ссылка для витрины: web кладёт URL, бот — telegram file_id. */
export function publicImageUrl(imageFile: string | null): string | null {
  if (!imageFile) return null
  const s = imageFile.trim()
  if (/^https?:\/\//i.test(s) || s.startsWith('/photos/')) return s
  return '/api/banner/' + s
}

export interface Outcome<T = unknown> {
  ok: boolean
  status: number
  error?: string
  data?: T
}

const bad = (status: number, error: string): Outcome => ({ ok: false, status, error })

// ─── Баннеры ─────────────────────────────────────────────────────────────────

export interface BannerView {
  id: number
  imageUrl: string | null
  title: string | null
  subtitle: string | null
  order: number
  isActive: boolean
  /** Позиция в показе покупателю: 1-я, 2-я… (только среди включённых) */
  slot: number | null
}

function cleanText(raw: unknown, max: number): string | null {
  const s = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return s ? s.slice(0, max) : null
}

export async function listBanners(): Promise<BannerView[]> {
  const rows = await prisma.heroBanner.findMany({ orderBy: [{ order: 'asc' }, { id: 'asc' }] })
  let slot = 0
  return rows.map(b => ({
    id: b.id,
    imageUrl: publicImageUrl(b.imageFile),
    title: b.title,
    subtitle: b.subtitle,
    order: b.order,
    isActive: b.isActive,
    slot: b.isActive ? ++slot : null,
  }))
}

export async function createBanner(actor: string, body: Record<string, unknown>): Promise<Outcome<BannerView>> {
  const link = normalizePhotoLink(body.imageUrl)
  if (!link.ok) return bad(422, link.error) as Outcome<BannerView>
  const title = cleanText(body.title, 120)
  const subtitle = cleanText(body.subtitle, 160)

  const last = await prisma.heroBanner.findFirst({ orderBy: { order: 'desc' }, select: { order: true } })
  const created = await prisma.heroBanner.create({
    data: { imageFile: link.url, title, subtitle, order: (last?.order ?? -1) + 1, isActive: true },
  })
  void logAdminAction({
    adminTelegramId: actor, action: 'create', entity: 'HeroBanner', entityId: created.id,
    after: { imageFile: link.url, title, subtitle, isActive: true },
  })
  log.info('Banner created from web admin', { id: created.id })
  return {
    ok: true, status: 201,
    data: { id: created.id, imageUrl: publicImageUrl(created.imageFile), title, subtitle, order: created.order, isActive: true, slot: null },
  }
}

export async function updateBanner(actor: string, id: number, body: Record<string, unknown>): Promise<Outcome> {
  const existing = await prisma.heroBanner.findUnique({ where: { id } })
  if (!existing) return bad(404, 'Баннер не найден')

  const data: Record<string, unknown> = {}
  if (body.imageUrl !== undefined) {
    const link = normalizePhotoLink(body.imageUrl)
    if (!link.ok) return bad(422, link.error)
    data.imageFile = link.url
  }
  if (body.title !== undefined) data.title = cleanText(body.title, 120)
  if (body.subtitle !== undefined) data.subtitle = cleanText(body.subtitle, 160)
  if (body.isActive !== undefined) data.isActive = body.isActive === true

  if (!Object.keys(data).length) return bad(422, 'Нечего менять')

  // Гейт «пустой витрины»: последний включённый баннер выключать можно (слайдер
  // просто скроется), но скажем об этом честно в ответе.
  let warning: string | undefined
  if (data.isActive === false) {
    const activeLeft = await prisma.heroBanner.count({ where: { isActive: true, id: { not: id } } })
    if (activeLeft === 0) warning = 'Это был последний включённый баннер — на главной останется логотип магазина'
  }

  await prisma.heroBanner.update({ where: { id }, data })
  void logAdminAction({
    adminTelegramId: actor, action: 'update', entity: 'HeroBanner', entityId: id,
    before: { imageFile: existing.imageFile, title: existing.title, subtitle: existing.subtitle, isActive: existing.isActive },
    after: data,
  })
  return { ok: true, status: 200, data: { warning: warning ?? null } }
}

/** Сдвиг баннера в показе. dir: -1 вверх, +1 вниз. */
export async function moveBanner(actor: string, id: number, dir: -1 | 1): Promise<Outcome> {
  const rows = await prisma.heroBanner.findMany({ orderBy: [{ order: 'asc' }, { id: 'asc' }] })
  const idx = rows.findIndex(r => r.id === id)
  if (idx === -1) return bad(404, 'Баннер не найден')
  const swapIdx = idx + dir
  if (swapIdx < 0 || swapIdx >= rows.length) return bad(422, 'Баннер уже с краю')

  const a = rows[idx]!, b = rows[swapIdx]!
  // Порядок нормализуем по позиции в списке: у старых баннеров order мог
  // совпадать (бот не следил за уникальностью), и обмен значениями был бы no-op.
  await prisma.$transaction([
    prisma.heroBanner.update({ where: { id: a.id }, data: { order: swapIdx } }),
    prisma.heroBanner.update({ where: { id: b.id }, data: { order: idx } }),
  ])
  void logAdminAction({
    adminTelegramId: actor, action: 'update', entity: 'HeroBanner', entityId: id,
    before: { order: a.order }, after: { order: swapIdx, swappedWith: b.id },
  })
  return { ok: true, status: 200 }
}

export async function deleteBanner(actor: string, id: number): Promise<Outcome> {
  const existing = await prisma.heroBanner.findUnique({ where: { id } })
  if (!existing) return bad(404, 'Баннер не найден')
  await prisma.heroBanner.delete({ where: { id } })
  void logAdminAction({
    adminTelegramId: actor, action: 'delete', entity: 'HeroBanner', entityId: id,
    before: { imageFile: existing.imageFile, title: existing.title, subtitle: existing.subtitle, isActive: existing.isActive },
  })
  log.info('Banner deleted from web admin', { id })
  return { ok: true, status: 200 }
}

// ─── Категории: фото ─────────────────────────────────────────────────────────

export interface CategoryView {
  id: number
  name: string
  productCount: number
  /** Показывается ли категория покупателю (есть товар в наличии) */
  visible: boolean
  /** Своё фото категории (если владелец поставил) */
  customImageUrl: string | null
  /** Что реально увидит покупатель: своё фото или авто с новейшей модели */
  effectiveImageUrl: string | null
  source: 'custom' | 'auto' | 'none'
}

/**
 * Категории с фото. «Авто» — фото самой новой модели в наличии: ровно то же
 * правило, по которому витрина рисует обложку линейки.
 *
 * Возвращаем ВСЕ, помечая visible: в каталоге 90+ категорий, но покупателю
 * видны единицы (у остальных нет товара в наличии). Показывать владельцу
 * простыню из невидимых — шум, поэтому UI прячет их за «показать все», а
 * не мы решаем за него, что их не существует.
 */
export async function listCategories(): Promise<CategoryView[]> {
  const cats = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, imageFile: true,
      products: {
        where: { isAvailable: true, variants: { some: { quantity: { gt: 0 }, inStock: true } } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        select: { photoUrl: true, variants: { select: { photoUrls: true }, take: 3 } },
        take: 10,
      },
      _count: {
        select: {
          // Счётчик = видимые на витрине товары (фильтр тот же, что у products
          // выше) — а не все записи категории с латентными без остатка
          products: {
            where: { isAvailable: true, variants: { some: { quantity: { gt: 0 }, inStock: true } } },
          },
        },
      },
    },
  })

  return cats.map(c => {
    const auto = c.products
      .map(p => p.photoUrl || p.variants.flatMap(v => v.photoUrls)[0] || '')
      .find(u => !!u) || null
    const custom = publicImageUrl(c.imageFile)
    return {
      id: c.id,
      name: c.name,
      productCount: c._count.products,
      visible: c.products.length > 0,
      customImageUrl: custom,
      effectiveImageUrl: custom ?? auto,
      source: custom ? 'custom' : auto ? 'auto' : 'none',
    }
  })
}

/** imageUrl=null снимает своё фото и возвращает авто-подбор. */
export async function setCategoryPhoto(actor: string, id: number, imageUrl: unknown): Promise<Outcome> {
  const existing = await prisma.category.findUnique({ where: { id }, select: { id: true, name: true, imageFile: true } })
  if (!existing) return bad(404, 'Категория не найдена')

  let value: string | null = null
  if (imageUrl !== null && imageUrl !== '') {
    const link = normalizePhotoLink(imageUrl)
    if (!link.ok) return bad(422, link.error)
    value = link.url
  }
  await prisma.category.update({ where: { id }, data: { imageFile: value } })
  void logAdminAction({
    adminTelegramId: actor, action: value ? 'update' : 'delete', entity: 'Category', entityId: id,
    before: { imageFile: existing.imageFile }, after: { imageFile: value },
  })
  await touchStorefrontCache('category_photo')
  return { ok: true, status: 200 }
}

// ─── Бренды: логотипы ────────────────────────────────────────────────────────

export interface BrandView {
  brand: string
  productCount: number
  /** Свой логотип; null = покупатель видит название текстом */
  imageUrl: string | null
}

/** Ключ бренда для BrandImage: регистр и пробелы не должны плодить дубли. */
export function normalizeBrandKey(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Бренды из товаров в наличии — та же логика, что публичный /api/brands. */
async function availableBrands(): Promise<Map<string, number>> {
  const products = await prisma.product.findMany({
    // Как публичный /api/brands: считаем только видимые на витрине товары
    // (с in-stock вариантами), а не все isAvailable-записи
    where: {
      isAvailable: true,
      variants: { some: { quantity: { gt: 0 }, inStock: true } },
    },
    select: { name: true, brand: true },
  })
  const map = new Map<string, number>()
  for (const p of products) {
    const b = p.brand?.trim() || p.name.split(' ')[0]
    if (!b) continue
    map.set(b, (map.get(b) ?? 0) + 1)
  }
  return map
}

export async function listBrandPhotos(): Promise<BrandView[]> {
  const [brands, images] = await Promise.all([
    availableBrands(),
    prisma.brandImage.findMany(),
  ])
  const byNorm = new Map(images.map(i => [i.brandNorm, i.imageFile]))
  return [...brands.entries()]
    .map(([brand, count]) => ({
      brand,
      productCount: count,
      imageUrl: publicImageUrl(byNorm.get(normalizeBrandKey(brand)) ?? null),
    }))
    .sort((a, b) => b.productCount - a.productCount || a.brand.localeCompare(b.brand, 'ru'))
}

/** imageUrl=null снимает логотип — бренд снова показывается текстом. */
export async function setBrandPhoto(actor: string, brandRaw: unknown, imageUrl: unknown): Promise<Outcome> {
  const brand = String(brandRaw ?? '').trim()
  if (!brand) return bad(422, 'Не указан бренд')
  const brandNorm = normalizeBrandKey(brand)

  // Бренд не сущность: чтобы не копить логотипы опечаток, пишем только для
  // брендов, которые реально видны покупателю (есть товар в наличии).
  const known = [...(await availableBrands()).keys()].find(b => normalizeBrandKey(b) === brandNorm)
  if (!known) return bad(404, 'Такого бренда нет среди товаров в наличии')

  let value: string | null = null
  if (imageUrl !== null && imageUrl !== '') {
    const link = normalizePhotoLink(imageUrl)
    if (!link.ok) return bad(422, link.error)
    value = link.url
  }
  const existing = await prisma.brandImage.findUnique({ where: { brandNorm } })
  await prisma.brandImage.upsert({
    where: { brandNorm },
    update: { imageFile: value, brand: known },
    create: { brandNorm, brand: known, imageFile: value },
  })
  void logAdminAction({
    adminTelegramId: actor, action: value ? 'update' : 'delete', entity: 'Brand', entityId: brandNorm,
    before: { imageFile: existing?.imageFile ?? null }, after: { imageFile: value },
  })
  await touchStorefrontCache('brand_photo')
  return { ok: true, status: 200 }
}

// ─── Бегущая строка ──────────────────────────────────────────────────────────

export async function getMarquee(): Promise<string> {
  return (await getApiKeyValue('setting_marquee')) ?? ''
}

export async function setMarquee(actor: string, raw: unknown): Promise<Outcome> {
  const before = await getMarquee()
  const text = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (text.length > MARQUEE_MAX) return bad(422, `Текст длиннее ${MARQUEE_MAX} символов — покупатель не успеет прочитать`)
  await setApiKeyValue('setting_marquee', text)
  void logAdminAction({
    adminTelegramId: actor, action: 'update', entity: 'Setting', entityId: 'marquee',
    before: { value: before }, after: { value: text },
  })
  return { ok: true, status: 200, data: { value: text } }
}

// ─── Хиты продаж ─────────────────────────────────────────────────────────────

export interface HitsView {
  manual: Array<{ id: number; name: string; category: string | null; photoUrl: string | null; inStock: boolean }>
  /** Что показывается само, когда ручных нет: топ-новинка каждой линейки */
  autoNote: string
  /** Колонка «В хиты» в таблице: если появится — синк начнёт перетирать ручной выбор */
  sheetColumnWarning: boolean
}

export async function listHits(): Promise<HitsView> {
  const manual = await prisma.product.findMany({
    where: { isFeatured: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true, name: true, photoUrl: true, isAvailable: true,
      category: { select: { name: true } },
      variants: { where: { inStock: true, quantity: { gt: 0 } }, select: { id: true }, take: 1 },
    },
  })
  return {
    manual: manual.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category?.name ?? null,
      photoUrl: p.photoUrl || null,
      inStock: p.isAvailable && p.variants.length > 0,
    })),
    autoNote: 'по самой новой модели из каждой линейки',
    sheetColumnWarning: false,
  }
}

export async function setHit(actor: string, productId: number, featured: boolean): Promise<Outcome> {
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, isFeatured: true } })
  if (!p) return bad(404, 'Товар не найден')
  if (p.isFeatured === featured) return { ok: true, status: 200, data: { unchanged: true } }
  await prisma.product.update({ where: { id: productId }, data: { isFeatured: featured } })
  void logAdminAction({
    adminTelegramId: actor, action: 'update', entity: 'Product', entityId: productId,
    before: { isFeatured: p.isFeatured }, after: { isFeatured: featured },
  })
  await touchStorefrontCache('hit')
  return { ok: true, status: 200 }
}

// ─── Пауза приёма заказов ────────────────────────────────────────────────────

export interface MaintenanceState { enabled: boolean; note: string }

export async function getMaintenance(): Promise<MaintenanceState> {
  const [flag, note] = await Promise.all([
    getApiKeyValue('setting_maintenance'),
    getApiKeyValue('setting_maintenance_note'),
  ])
  return { enabled: flag === '1', note: note ?? '' }
}

/**
 * Пауза — не «сайт выключен»: каталог и цены остаются видимыми, перестаёт
 * работать оформление заказа. Гейт стоит и на сервере (POST /api/orders), и
 * в витрине, чтобы покупатель не заполнял форму впустую.
 */
export async function setMaintenance(actor: string, enabled: boolean, rawNote: unknown): Promise<Outcome<MaintenanceState>> {
  const before = await getMaintenance()
  const note = String(rawNote ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200)
  await setApiKeyValue('setting_maintenance', enabled ? '1' : '0')
  await setApiKeyValue('setting_maintenance_note', note)
  void logAdminAction({
    adminTelegramId: actor, action: 'update', entity: 'Setting', entityId: 'maintenance',
    before, after: { enabled, note },
  })
  void logSecurityEvent('maintenance_mode_toggled', { enabled, via: 'web' }, actor)
  log.info('Maintenance mode changed from web admin', { enabled })
  return { ok: true, status: 200, data: { enabled, note } }
}

// ─── Обновить сайт (сброс кэша витрины) ──────────────────────────────────────

/**
 * Тихий бамп версии после админ-правки, которая меняет видимое покупателю
 * (фото, описание, скрытие, хиты, атрибуты). Открытая витрина опрашивает
 * /api/cache-version раз в 30 секунд и перезагружает данные при смене версии —
 * без бампа владелец вынужден жать «Обновить сайт» руками.
 *
 * Никогда не кидает: к этому моменту правка уже записана в лист и БД, и
 * падение бампа не должно превращать успех в ошибку — витрина догонит по
 * следующему бампу или ручному сбросу.
 */
export async function touchStorefrontCache(reason: string): Promise<void> {
  try {
    await setApiKeyValue('cache_version', String(Date.now()))
    log.info('Storefront cache version bumped', { reason })
  } catch (e) {
    log.warn('Storefront cache bump failed', { reason, error: e instanceof Error ? e.message : String(e) })
  }
}

export async function bumpCacheVersion(actor: string): Promise<Outcome> {
  const version = String(Date.now())
  await setApiKeyValue('cache_version', version)
  void logAdminAction({ adminTelegramId: actor, action: 'update', entity: 'Setting', entityId: 'cache_version', after: { value: version } })
  return { ok: true, status: 200, data: { version } }
}
