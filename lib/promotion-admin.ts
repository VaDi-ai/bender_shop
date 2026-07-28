/**
 * Акции из веб-админки: черновик → предпросмотр → запуск → отмена.
 *
 * Правила проекта, которые тут важны:
 *   • Предпросмотр обязателен: акция двигает ЦЕНЫ, владелец должен увидеть
 *     список «было → стало» до того, как это увидит покупатель.
 *   • Запуск и отмена — owner (деньги). Черновик может завести и менеджер.
 *   • Каждая мутация в AuditLog, запуск/отмена — ещё и в SecurityLog.
 *   • Пока акция идёт, синк НЕ трогает цены её товаров (lib/price-sync-policy):
 *     иначе через час таблица вернула бы полную цену, а панель продолжала бы
 *     показывать «акция активна» — то есть врать.
 */
import { prisma } from './prisma'
import { log } from './logger'
import { logAdminAction } from './audit'
import { logSecurityEvent } from './security-log'
import { roundPrice } from './currency'
import { findVariantsByFilter, applyPromotion, cancelPromotion, filterLabel } from './promotions'

export type Discount = 'percent' | 'fixed'
export type Filter = 'category' | 'brand' | 'products' | 'attribute'

export interface Outcome<T = unknown> {
  ok: boolean
  status: number
  error?: string
  data?: T
}

const bad = (status: number, error: string): Outcome => ({ ok: false, status, error })

export interface PromotionView {
  id: number
  name: string
  discountType: Discount
  discountValue: number
  filterType: string
  filterValue: string
  filterLabel: string
  isActive: boolean
  createdAt: Date
  /** Сколько строк каталога сейчас держит акция (снимки старых цен) */
  affected: number
}

export async function listPromotions(): Promise<PromotionView[]> {
  const rows = await prisma.promotion.findMany({
    orderBy: [{ isActive: 'desc' }, { id: 'desc' }],
    include: { _count: { select: { prices: true } } },
  })
  return rows.map(p => ({
    id: p.id,
    name: p.name,
    discountType: p.discountType as Discount,
    discountValue: Number(p.discountValue),
    filterType: p.filterType,
    filterValue: p.filterValue,
    filterLabel: filterLabel(p.filterType, p.filterValue),
    isActive: p.isActive,
    createdAt: p.createdAt,
    affected: p._count.prices,
  }))
}

export interface PromoPreviewRow {
  variantId: number
  name: string
  oldPrice: number
  newPrice: number
  inStock: boolean
}

export interface PromoPreview {
  count: number
  inStockCount: number
  rows: PromoPreviewRow[]
  /** Средняя потеря на позиции — чтобы владелец видел цену решения */
  avgDrop: number
  warnings: string[]
}

function discounted(price: number, type: Discount, value: number): number {
  const raw = type === 'percent' ? price * (1 - value / 100) : price - value
  return Math.max(1, roundPrice(raw))
}

/** Что произойдёт, если запустить. Ничего не меняет. */
export async function previewPromotion(
  filterType: Filter, filterValue: string, discountType: Discount, discountValue: number,
): Promise<Outcome<PromoPreview>> {
  const v = validateDraft({ filterType, filterValue, discountType, discountValue, name: 'preview' })
  if (v) return bad(422, v) as Outcome<PromoPreview>

  const variants = await findVariantsByFilter(filterType, filterValue)
  const rows: PromoPreviewRow[] = variants.map(x => {
    const oldPrice = Number(x.price)
    return {
      variantId: x.id,
      name: String((x.attributes as Record<string, unknown> | null)?.fullName ?? x.product.name),
      oldPrice,
      newPrice: discounted(oldPrice, discountType, discountValue),
      inStock: x.inStock && x.quantity > 0,
    }
  })

  const warnings: string[] = []
  if (!rows.length) warnings.push('Под фильтр не попал ни один товар — акция ничего не изменит')
  const toOne = rows.filter(r => r.newPrice <= 1)
  if (toOne.length) warnings.push(`${toOne.length} ${toOne.length === 1 ? 'товар уйдёт' : 'товаров уйдут'} в цену 1 ₽ — скидка больше самой цены`)
  const inStockCount = rows.filter(r => r.inStock).length
  if (rows.length && !inStockCount) warnings.push('Все товары под фильтром сейчас не в наличии — покупатель скидку не увидит')

  const avgDrop = rows.length ? Math.round(rows.reduce((s, r) => s + (r.oldPrice - r.newPrice), 0) / rows.length) : 0
  return {
    ok: true, status: 200,
    data: { count: rows.length, inStockCount, rows: rows.slice(0, 100), avgDrop, warnings },
  }
}

interface DraftInput { name: string; filterType: Filter; filterValue: string; discountType: Discount; discountValue: number }

function validateDraft(d: DraftInput): string | null {
  if (!d.name || !d.name.trim()) return 'Название акции пустое — покупатель увидит его в списке акций'
  if (d.name.length > 120) return 'Название длиннее 120 символов'
  if (!['category', 'brand', 'products', 'attribute'].includes(d.filterType)) return 'Не понял, к каким товарам применять'
  if (!d.filterValue || !String(d.filterValue).trim()) return 'Не выбрано, к каким товарам применять'
  if (!['percent', 'fixed'].includes(d.discountType)) return 'Скидка бывает в процентах или в рублях'
  if (!Number.isFinite(d.discountValue) || d.discountValue <= 0) return 'Размер скидки — число больше нуля'
  if (d.discountType === 'percent' && d.discountValue > 90) return 'Скидка больше 90% — это почти даром, проверьте число'
  if (d.discountType === 'fixed' && d.discountValue > 1_000_000) return 'Скидка больше миллиона рублей — проверьте число'
  return null
}

export async function createPromotion(actor: string, body: Record<string, unknown>): Promise<Outcome> {
  const draft: DraftInput = {
    name: String(body.name ?? '').trim(),
    filterType: body.filterType as Filter,
    filterValue: String(body.filterValue ?? '').trim(),
    discountType: body.discountType as Discount,
    discountValue: Number(body.discountValue),
  }
  const err = validateDraft(draft)
  if (err) return bad(422, err)

  const created = await prisma.promotion.create({
    data: {
      name: draft.name,
      discountType: draft.discountType,
      discountValue: draft.discountValue,
      filterType: draft.filterType,
      filterValue: draft.filterValue,
      isActive: false,          // черновик: цены двигает только явный запуск
    },
  })
  void logAdminAction({
    adminTelegramId: actor, action: 'create', entity: 'Promotion', entityId: created.id,
    after: { ...draft, isActive: false },
  })
  return { ok: true, status: 201, data: { id: created.id } }
}

export async function launchPromotion(actor: string, id: number): Promise<Outcome> {
  const promo = await prisma.promotion.findUnique({ where: { id } })
  if (!promo) return bad(404, 'Акция не найдена')
  if (promo.isActive) return bad(409, 'Акция уже идёт')

  let count: number
  try {
    count = await applyPromotion(id)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('Promotion launch failed', { id, error: msg })
    return bad(409, msg.includes('параллельно') ? 'Акцию только что меняли — откройте заново и повторите' : 'Не получилось запустить акцию')
  }
  if (count === 0) {
    return bad(422, 'Под фильтр не попал ни один товар — цены не тронуты, акция осталась черновиком')
  }

  void logAdminAction({
    adminTelegramId: actor, action: 'promotion_launch', entity: 'Promotion', entityId: id,
    before: { isActive: false }, after: { isActive: true, variants: count },
  })
  void logSecurityEvent('promotion_created', { promotionId: id, name: promo.name, variants: count, via: 'web' }, actor)
  return { ok: true, status: 200, data: { variants: count } }
}

export async function stopPromotion(actor: string, id: number): Promise<Outcome> {
  const promo = await prisma.promotion.findUnique({ where: { id }, include: { _count: { select: { prices: true } } } })
  if (!promo) return bad(404, 'Акция не найдена')
  if (!promo.isActive) return bad(409, 'Акция и так не идёт')

  const restored = promo._count.prices
  await cancelPromotion(id)
  void logAdminAction({
    adminTelegramId: actor, action: 'promotion_cancel', entity: 'Promotion', entityId: id,
    before: { isActive: true, variants: restored }, after: { isActive: false },
  })
  void logSecurityEvent('promotion_cancelled', { promotionId: id, name: promo.name, restored, via: 'web' }, actor)
  return { ok: true, status: 200, data: { restored } }
}

/** Опасная зона: вернуть прежние цены сразу по всем идущим акциям. */
export async function stopAllPromotions(actor: string): Promise<Outcome> {
  const active = await prisma.promotion.findMany({ where: { isActive: true }, select: { id: true, name: true } })
  if (!active.length) return { ok: true, status: 200, data: { stopped: 0 } }
  for (const p of active) await cancelPromotion(p.id)
  void logAdminAction({
    adminTelegramId: actor, action: 'promotion_cancel_all', entity: 'Promotion',
    before: { active: active.map(a => a.name) }, after: { active: [] },
  })
  void logSecurityEvent('promotion_cancelled', { all: true, count: active.length, via: 'web' }, actor)
  return { ok: true, status: 200, data: { stopped: active.length } }
}

/** Черновик можно удалить: цен он не двигал. Идущую акцию — только остановить. */
export async function deleteDraft(actor: string, id: number): Promise<Outcome> {
  const promo = await prisma.promotion.findUnique({ where: { id }, include: { _count: { select: { prices: true } } } })
  if (!promo) return bad(404, 'Акция не найдена')
  if (promo.isActive) return bad(409, 'Акция идёт — сначала остановите её, цены вернутся сами')
  if (promo._count.prices > 0) return bad(409, 'У акции остались сохранённые цены — остановите её, чтобы вернуть их товарам')

  await prisma.promotion.delete({ where: { id } })
  void logAdminAction({
    adminTelegramId: actor, action: 'delete', entity: 'Promotion', entityId: id,
    before: { name: promo.name, discountValue: Number(promo.discountValue), filterValue: promo.filterValue },
  })
  return { ok: true, status: 200 }
}

/** Значения фильтров для формы: что вообще есть в каталоге. */
export async function filterOptions(): Promise<{ categories: string[]; brands: string[] }> {
  const [cats, brands] = await Promise.all([
    prisma.category.findMany({
      where: { products: { some: { isAvailable: true, variants: { some: { inStock: true, quantity: { gt: 0 } } } } } },
      select: { name: true }, orderBy: { name: 'asc' },
    }),
    prisma.product.findMany({
      where: { isAvailable: true, brand: { not: null } },
      select: { brand: true }, distinct: ['brand'], orderBy: { brand: 'asc' },
    }),
  ])
  return {
    categories: cats.map(c => c.name),
    brands: brands.map(b => b.brand!).filter(Boolean),
  }
}
