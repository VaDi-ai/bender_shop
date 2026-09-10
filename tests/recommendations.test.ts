/**
 * «Рекомендуем»: авто-подбор, ручные замены слотов и нормализация массива.
 *
 * Главный инвариант всего этого куска: пока замен нет, лента обязана быть той
 * же, что была до появления поля.
 */
import { describe, it, expect } from 'vitest'
import {
  autoRecommendations, resolveRecSlots, trimManual, REC_SLOTS,
  type RecCandidate,
} from '../lib/recommendations'

const P = (id: number, name: string, category: string, price: number, brand = 'Apple'): RecCandidate =>
  ({ id, name, brand, category, price })

// Каталог с запасом по каждой корзине: аксессуары того же бренда, соседние
// категории и одноклассники по цене
const CATALOG: RecCandidate[] = [
  P(1, 'iPhone 17 Pro', 'iPhone', 120000),
  P(2, 'AirPods Pro 3', 'Аксессуары', 22000),
  P(3, 'Чехол MagSafe', 'Аксессуары', 5000),
  P(4, 'AirTag', 'Аксессуары', 3000),
  P(5, 'MacBook Air M5', 'MacBook', 130000),
  P(6, 'Apple Watch S11', 'Watch', 45000),
  P(7, 'iPhone 17', 'iPhone', 90000),
  P(8, 'iPhone Air', 'iPhone', 110000),
  P(9, 'Galaxy S26', 'Galaxy S', 95000, 'Samsung'),
]
const SELF = CATALOG[0]!

describe('авто-подбор', () => {
  it('идёт корзинами: два аксессуара, потом сопутствующие, потом похожие по цене', () => {
    const auto = autoRecommendations(SELF, CATALOG)
    expect(auto).toEqual([
      // аксессуары того же бренда, ближайшие по цене к 120 000
      { productId: 2, source: 'accessory' },
      { productId: 3, source: 'accessory' },
      // тот же бренд, другая категория, по одной на категорию: MacBook ближе Watch
      { productId: 5, source: 'related' },
      { productId: 6, source: 'related' },
    ])
  })

  it('сам товар в ленту не попадает и повторов нет', () => {
    const auto = autoRecommendations(SELF, CATALOG)
    const ids = auto.map(a => a.productId)
    expect(ids).not.toContain(SELF.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('чужой бренд не подмешивается', () => {
    const auto = autoRecommendations(SELF, CATALOG)
    expect(auto.map(a => a.productId)).not.toContain(9)
  })

  it('добивает похожими по цене, когда бренду больше нечего предложить', () => {
    const thin = [SELF, P(7, 'iPhone 17', 'iPhone', 90000), P(8, 'iPhone Air', 'iPhone', 110000)]
    const auto = autoRecommendations(SELF, thin)
    // 110 000 ближе к 120 000, чем 90 000 — порядок по расстоянию до цены
    expect(auto).toEqual([
      { productId: 8, source: 'similar' },
      { productId: 7, source: 'similar' },
    ])
  })
})

describe('ручные замены поверх авто', () => {
  const auto = autoRecommendations(SELF, CATALOG)

  it('без замен отдаёт ровно авто-подбор — инвариант «ничего не поехало»', () => {
    const slots = resolveRecSlots([], auto)
    expect(slots.map(s => s.productId)).toEqual(auto.map(a => a.productId))
    expect(slots.every(s => s.source !== 'manual')).toBe(true)
  })

  it('массив из одних нулей — тоже чистое авто', () => {
    const slots = resolveRecSlots([0, 0, 0, 0], auto)
    expect(slots.map(s => s.productId)).toEqual(auto.map(a => a.productId))
  })

  it('замена встаёт на СВОЙ слот, соседние остаются на авто', () => {
    const slots = resolveRecSlots([0, 0, 7, 0], auto)
    expect(slots.map(s => ({ position: s.position, productId: s.productId, source: s.source }))).toEqual([
      { position: 1, productId: 2, source: 'accessory' },
      { position: 2, productId: 3, source: 'accessory' },
      { position: 3, productId: 7, source: 'manual' },
      { position: 4, productId: 5, source: 'related' },
    ])
  })

  it('закреплённый не задваивается, если алгоритм и сам его подобрал', () => {
    const slots = resolveRecSlots([0, 0, 0, 2], auto)   // 2 стоял у авто первым
    const ids = slots.map(s => s.productId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[3]).toBe(2)
    expect(slots[3]!.source).toBe('manual')
  })

  it('лента не укорачивается из-за замены: слотов столько же', () => {
    expect(resolveRecSlots([0, 0, 7, 0], auto)).toHaveLength(REC_SLOTS)
  })

  it('висячий id (товар удалён или ушёл с витрины) уходит на авто', () => {
    const slots = resolveRecSlots([999, 0, 0, 0], auto, REC_SLOTS, id => id !== 999)
    expect(slots[0]).toMatchObject({ position: 1, productId: 2, source: 'accessory' })
    expect(slots.map(s => s.productId)).not.toContain(999)
  })

  it('пустой авто-подбор: закреплённое всё равно показывается', () => {
    const slots = resolveRecSlots([0, 7, 0, 0], [])
    expect(slots).toEqual([{ position: 2, productId: 7, source: 'manual' }])
  })
})

describe('нормализация массива замен', () => {
  it('снимает хвостовые нули', () => {
    expect(trimManual([7, 0, 0, 0])).toEqual([7])
    expect(trimManual([0, 0, 0, 0])).toEqual([])
  })

  it('нули в начале и в середине значимы — их не трогаем', () => {
    expect(trimManual([0, 0, 7, 0])).toEqual([0, 0, 7])
    expect(trimManual([0, 7, 0, 8])).toEqual([0, 7, 0, 8])
  })

  it('режет по числу слотов', () => {
    expect(trimManual([1, 2, 3, 4, 5, 6])).toHaveLength(REC_SLOTS)
  })
})
