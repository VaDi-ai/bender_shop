/**
 * Аудит №2: чекаут отклоняет скрытые/черновые товары — всегда, независимо
 * от STOCK_WRITEOFF_ENABLED (перебор variantId ≠ покупка).
 */
import { describe, it, expect } from 'vitest'
import { assertOrderableVariant, OrderableVariant } from '../lib/order-checks'

const variant = (over: Partial<OrderableVariant> = {}): OrderableVariant => ({
  price: '73500', inStock: true, quantity: 3, product: { isAvailable: true }, ...over,
})

const conflictOf = (fn: () => void): unknown => {
  try { fn(); return null } catch (e) { return e }
}

describe('assertOrderableVariant', () => {
  it('заказ скрытого товара → отказ isStockConflict, флаг списания не важен', () => {
    for (const stockCheck of [false, true]) {
      const err = conflictOf(() => assertOrderableVariant(variant({ product: { isAvailable: false } }), 1, stockCheck, 42)) as Error & { isStockConflict?: boolean }
      expect(err).toBeTruthy()
      expect(err.isStockConflict).toBe(true)
      expect(err.message).toBe('Товар недоступен для заказа')
    }
  })

  it('черновик price=0 (и отрицательная) → отказ', () => {
    for (const price of ['0', 0, '-1']) {
      const err = conflictOf(() => assertOrderableVariant(variant({ price }), 1, false)) as Error & { isStockConflict?: boolean }
      expect(err).toBeTruthy()
      expect(err.isStockConflict).toBe(true)
    }
  })

  it('вариант исчез → «Товар не найден»', () => {
    const err = conflictOf(() => assertOrderableVariant(null, 1, false)) as Error
    expect(err).toBeTruthy()
    expect((err as Error).message).toBe('Товар не найден')
  })

  it('нормальный видимый товар → проходит как раньше', () => {
    expect(conflictOf(() => assertOrderableVariant(variant(), 1, false))).toBeNull()
    expect(conflictOf(() => assertOrderableVariant(variant(), 1, true))).toBeNull()
  })

  it('остаток проверяется только при включённом списании (поведение не изменилось)', () => {
    const low = variant({ quantity: 1 })
    // выключено — просит 5 при остатке 1, но проходит (как раньше)
    expect(conflictOf(() => assertOrderableVariant(low, 5, false))).toBeNull()
    // включено — отказ
    const err = conflictOf(() => assertOrderableVariant(low, 5, true)) as Error
    expect(err).toBeTruthy()
    expect(err.message).toBe('Товар закончился или недоступен')
    // включено и не в наличии — отказ
    expect(conflictOf(() => assertOrderableVariant(variant({ inStock: false }), 1, true))).toBeTruthy()
  })
})
