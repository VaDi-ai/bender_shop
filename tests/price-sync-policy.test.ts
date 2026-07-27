import { describe, it, expect } from 'vitest'
import { decidePriceSync } from '../lib/price-sync-policy'

describe('decidePriceSync — единственное место выбора действия с ценой в синке', () => {
  it('усиление №2: writebackFailed-батч → freeze, лист НЕ ревертит применённое', () => {
    // Ситуация после apply с упавшим writeback: в листе старые цифры,
    // в БД новые. Без freeze сработал бы respect_sheet_price → откат.
    expect(decidePriceSync({
      sheetCost: 80000, lastSyncedCost: 88500, // лист со старой закупкой
      dbPrice: 103490, sheetPrice: 95000,       // лист со старой розницей
      frozen: true,
    })).toBe('freeze')
  })

  it('усиление №4: овеаррайд переживает синк — после успешного writeback оба path молчат', () => {
    // apply записал в БД и лист согласованно: cost=88500, retail=103490,
    // lastSyncedCostPrice=88500 → sheetCost==lastSynced (path 1 молчит),
    // sheetPrice==dbPrice (path 2 молчит) → mirror, цена на месте.
    expect(decidePriceSync({
      sheetCost: 88500, lastSyncedCost: 88500,
      dbPrice: 103490, sheetPrice: 103490,
      frozen: false,
    })).toBe('mirror_sheet_price')
  })

  it('path 1: закупка в листе изменилась → пересчёт по правилам', () => {
    expect(decidePriceSync({ sheetCost: 90000, lastSyncedCost: 88500, dbPrice: 103490, sheetPrice: 103490, frozen: false }))
      .toBe('recalc_from_cost')
  })

  it('path 2: розницу поправили руками в листе → уважаем лист', () => {
    expect(decidePriceSync({ sheetCost: 88500, lastSyncedCost: 88500, dbPrice: 103490, sheetPrice: 99990, frozen: false }))
      .toBe('respect_sheet_price')
  })

  it('без закупки в листе поведение прежнее (нулевая/пустая закупка не триггерит пересчёт)', () => {
    expect(decidePriceSync({ sheetCost: null, lastSyncedCost: null, dbPrice: 100, sheetPrice: 100, frozen: false }))
      .toBe('mirror_sheet_price')
    expect(decidePriceSync({ sheetCost: 0, lastSyncedCost: null, dbPrice: 100, sheetPrice: 100, frozen: false }))
      .toBe('mirror_sheet_price')
  })

  it('freeze сильнее обоих path (приоритет заморозки)', () => {
    expect(decidePriceSync({ sheetCost: 12345, lastSyncedCost: 1, dbPrice: 2, sheetPrice: 3, frozen: true }))
      .toBe('freeze')
  })
})
