/**
 * Блок «Рекомендуем» в карточке товара: авто-подбор и ручные замены владельца.
 *
 * ВАЖНО про две копии алгоритма. Живой подбор для покупателя считает витрина —
 * `getRecommendations()` в webapp/index.html, инлайн-скриптом по уже загруженному
 * каталогу. Здесь лежит его порт 1:1: он нужен админке, чтобы владелец видел
 * ровно то, что видит покупатель, и понимал, откуда взялась каждая позиция.
 * Сборщика между webapp/ и lib/ в проекте нет, поэтому копии две, и они
 * обязаны совпадать — это проверяет tests/recommendations-parity.test.ts на
 * общей фикстуре. Правите правила здесь — правьте и там, и наоборот.
 *
 * Хранится в БД только РУЧНОЕ: Product.recommendedIds — массив по слотам, где
 * 0 значит «этот слот считает алгоритм». Пустой массив = поведение ровно то же,
 * что было до появления поля.
 */
import { prisma } from './prisma'
import {
  loadPreorderDefaults, isProductVisible,
  STOCK_OR_PREORDER_WHERE, VISIBLE_VARIANT_WHERE,
} from './preorder'

/** Сколько позиций в ленте. Столько же стоит в renderModalRecs() на витрине. */
export const REC_SLOTS = 4

/** Откуда взялась позиция: три корзины алгоритма плюс ручная замена. */
export type RecSource = 'manual' | 'accessory' | 'related' | 'similar'

/** Товар в том виде, в каком его читает алгоритм — и на сервере, и на витрине. */
export interface RecCandidate {
  id: number
  name: string
  brand: string | null
  category: string | null
  /** Минимальная цена по покупаемым предложениям; без них — цена товара */
  price: number
}

export interface AutoRec {
  productId: number
  source: Exclude<RecSource, 'manual'>
}

/**
 * Авто-подбор. Порт `getRecommendations()` из webapp/index.html — порядок
 * корзин, регулярки и сортировки повторены дословно.
 *
 * 1. Комплектные аксессуары: категория «Аксессуары», тот же бренд, набор
 *    ключевых слов зависит от типа товара. Не больше двух — иначе лента
 *    превращается в витрину чехлов.
 * 2. Сопутствующие: тот же бренд, другая категория, по одной на категорию.
 * 3. Похожие: та же категория, ближайшие по цене.
 */
export function autoRecommendations(
  product: RecCandidate,
  all: RecCandidate[],
  limit = REC_SLOTS,
): AutoRec[] {
  const recs: AutoRec[] = []
  const used: Record<number, true> = { [product.id]: true }
  const brand = (product.brand ?? '').trim()
  const cat = product.category ?? ''
  const pName = (product.name ?? '').toLowerCase()
  const price = product.price
  const byPrice = (a: RecCandidate, b: RecCandidate) =>
    Math.abs(a.price - price) - Math.abs(b.price - price)

  // 1. Комплектные аксессуары (релевантные для типа товара)
  const acc = all.filter(p => {
    if (used[p.id] || p.category !== 'Аксессуары') return false
    const n = (p.name ?? '').toLowerCase()
    const sameBrand = (p.brand ?? '').trim() === brand
    if (/iphone/i.test(pName)) return /airpods|earpods|стекло|чехол|case|magsafe|airtag/i.test(n) && sameBrand
    if (/ipad/i.test(pName)) return /pencil|keyboard.*ipad|keyboard.*pad|стекло|чехол|case/i.test(n) && sameBrand
    if (/macbook|mac mini|mac studio|imac/i.test(pName)) return /mouse|trackpad|keyboard(?!.*ipad)|sleeve|hub|адаптер/i.test(n) && sameBrand
    if (/watch/i.test(pName)) return /band|ремешок|strap/i.test(n) && sameBrand
    return sameBrand
  }).sort(byPrice)
  for (const c of acc) {
    if (recs.length >= 2 || recs.length >= limit) break
    recs.push({ productId: c.id, source: 'accessory' })
    used[c.id] = true
  }

  // 2. Сопутствующие: тот же бренд, другая категория
  const usedCats: Record<string, true> = { [cat]: true, 'Аксессуары': true }
  const rel = all
    .filter(p => !used[p.id] && (p.brand ?? '').trim() === brand && p.category !== cat && p.category !== 'Аксессуары')
    .sort(byPrice)
  for (const r of rel) {
    if (recs.length >= limit) break
    const c = r.category ?? ''
    if (usedCats[c]) continue
    usedCats[c] = true
    recs.push({ productId: r.id, source: 'related' })
    used[r.id] = true
  }

  // 3. Похожие: та же категория, ближайшие по цене
  const sim = all.filter(p => !used[p.id] && p.category === cat).sort(byPrice)
  for (const c of sim) {
    if (recs.length >= limit) break
    recs.push({ productId: c.id, source: 'similar' })
    used[c.id] = true
  }

  return recs
}

/** Слот ленты после наложения ручных замен на авто-подбор. */
export interface RecSlot {
  /** Номер позиции, 1..REC_SLOTS — им же адресуется замена */
  position: number
  productId: number
  source: RecSource
}

/**
 * Накладывает ручные замены на авто-подбор.
 *
 * Закреплённый товар стоит на СВОЁМ слоте: заменить третью позицию и получить
 * товар на первой — не то, что просил владелец. Незакреплённые слоты добивает
 * алгоритм, из его выдачи закреплённые вычитаются, чтобы не задвоиться.
 *
 * Пустой `manual` отдаёт чистый авто-подбор — ровно то же, что и без поля.
 * Ту же логику повторяет `resolveRecs()` на витрине (webapp/index.html).
 */
export function resolveRecSlots(
  manual: number[],
  auto: AutoRec[],
  limit = REC_SLOTS,
  exists: (id: number) => boolean = () => true,
): RecSlot[] {
  const pinned = new Map<number, number>() // position → productId
  manual.slice(0, limit).forEach((id, i) => {
    // 0 = слот на авто; висячий id (товар удалён или ушёл с витрины) — тоже:
    // показать покупателю то, чего он не может открыть, хуже, чем подобрать
    if (id > 0 && exists(id)) pinned.set(i + 1, id)
  })
  const taken = new Set(pinned.values())
  const rest = auto.filter(a => !taken.has(a.productId))

  const slots: RecSlot[] = []
  for (let i = 1; i <= limit; i++) {
    const manualId = pinned.get(i)
    if (manualId) { slots.push({ position: i, productId: manualId, source: 'manual' }); continue }
    const next = rest.shift()
    if (next) slots.push({ position: i, productId: next.productId, source: next.source })
  }
  return slots
}

/**
 * Нормализует массив замен к хранимому виду: обрезает по числу слотов и
 * снимает ХВОСТОВЫЕ нули. Нули в середине и в начале значимы — это «слот 1 и 2
 * на авто, слот 3 закреплён», и трогать их нельзя.
 */
export function trimManual(ids: number[]): number[] {
  const out = ids.slice(0, REC_SLOTS)
  while (out.length && out[out.length - 1] === 0) out.pop()
  return out
}

/** Читаемая метка источника для админки. */
export const REC_SOURCE_LABEL: Record<RecSource, string> = {
  manual: 'вручную',
  accessory: 'авто · аксессуар',
  related: 'авто · сопутствующий',
  similar: 'авто · похожий по цене',
}

/**
 * Каталог глазами витрины: те же фильтры видимости, что у GET /api/products,
 * включая досев полузаполненных предзаказов. Без этого превью в админке
 * разойдётся с лентой покупателя на предзаказных товарах.
 */
export async function loadVisibleCatalog(): Promise<RecCandidate[]> {
  const defaults = await loadPreorderDefaults()
  const products = await prisma.product.findMany({
    where: { isAvailable: true, ...STOCK_OR_PREORDER_WHERE },
    select: {
      id: true, name: true, brand: true, price: true,
      isPreorder: true, preorderMode: true, prepaymentKind: true,
      prepaymentValue: true, preorderEta: true, preorderTerms: true,
      category: { select: { name: true } },
      variants: {
        where: VISIBLE_VARIANT_WHERE,
        select: { price: true, quantity: true, inStock: true, isPreorder: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  return products
    .filter(p => isProductVisible({
      ...p,
      preorderMode: p.preorderMode as never,
      prepaymentKind: p.prepaymentKind as never,
      hasLiveVariants: p.variants.some(v => v.inStock && v.quantity > 0),
    }, defaults))
    .map(p => {
      // Цена как на витрине: минимум по покупаемым предложениям (живым и
      // предзаказным), а если таких нет — цена самого товара
      const buyable = p.variants.filter(v => v.inStock || v.isPreorder).map(v => Number(v.price))
      return {
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.category?.name ?? '',
        price: buyable.length ? Math.min(...buyable) : Number(p.price),
      }
    })
}
