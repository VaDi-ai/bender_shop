/**
 * Пока акция идёт, синк не должен трогать цены её товаров — иначе скидка
 * живёт до первого прогона, а панель продолжает показывать «акция активна».
 */
import { describe, it, expect } from 'vitest'
import { getFrozenVariantIds, decidePriceSync } from '../lib/price-sync-policy'

/* eslint-disable @typescript-eslint/no-explicit-any */
function db(opts: { batches?: any[]; supplierRows?: any[]; promoRows?: any[] }) {
  return {
    priceApplyBatch: { findMany: async () => opts.batches ?? [] },
    supplierPrice: { findMany: async () => opts.supplierRows ?? [] },
    promotionPrice: { findMany: async () => opts.promoRows ?? [] },
  }
}

describe('заморозка цен на время акции', () => {
  it('варианты под идущей акцией попадают в заморозку', async () => {
    const frozen = await getFrozenVariantIds(db({ promoRows: [{ variantId: 10 }, { variantId: 11 }] }))
    expect([...frozen].sort()).toEqual([10, 11])
  })

  it('складывается с заморозкой непроехавшего писбэка, без дублей', async () => {
    const frozen = await getFrozenVariantIds(db({
      batches: [{ id: 1 }],
      supplierRows: [{ variantId: 10 }, { variantId: 20 }],
      promoRows: [{ variantId: 10 }, { variantId: 30 }],
    }))
    expect([...frozen].sort((a, b) => a - b)).toEqual([10, 20, 30])
  })

  it('без акций и батчей заморозки нет', async () => {
    expect((await getFrozenVariantIds(db({}))).size).toBe(0)
  })

  it('замороженная цена не пересчитывается ни по одной ветке', () => {
    expect(decidePriceSync({ frozen: true, sheetCost: 90000, lastSyncedCost: 80000, dbPrice: 100000, sheetPrice: 130000 })).toBe('freeze')
  })

  it('без заморозки поведение прежнее', () => {
    expect(decidePriceSync({ frozen: false, sheetCost: 90000, lastSyncedCost: 80000, dbPrice: 100000, sheetPrice: 130000 })).toBe('recalc_from_cost')
    expect(decidePriceSync({ frozen: false, sheetCost: null, lastSyncedCost: null, dbPrice: 100000, sheetPrice: 130000 })).toBe('respect_sheet_price')
    expect(decidePriceSync({ frozen: false, sheetCost: null, lastSyncedCost: null, dbPrice: 130000, sheetPrice: 130000 })).toBe('mirror_sheet_price')
  })
})
