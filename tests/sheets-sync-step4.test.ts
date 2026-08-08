/**
 * Прайм-директива Step 4: синк не гасит каталог по неполному прогону —
 * пустое/частичное/прерванное чтение листа пропускает гашение.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/google-sheets', () => ({
  readSheet: vi.fn(),
  getProductSheetNames: vi.fn(),
  writeCell: vi.fn(),
  writeRange: vi.fn(),
  appendRows: vi.fn(),
  batchUpdate: vi.fn(),
  getSheetNames: vi.fn(),
  isExcludedSheet: vi.fn(),
  createSheetIfNotExists: vi.fn(),
}))

import { readAllProducts, disableStepSkipReason } from '../lib/sheets-sync'
import { readSheet, getProductSheetNames } from '../lib/google-sheets'

/* eslint-disable @typescript-eslint/no-explicit-any */
const names = getProductSheetNames as any
const read = readSheet as any

const HEADER = ['Порядок', 'Бренд', 'Категория', 'Модель', 'Название модели', 'Цвет', 'Память', 'Размер', 'Страна', 'Описание', 'Характеристики', 'Закупочная цена', 'Рекомендованная стоимость', 'В наличии', 'Лучший поставщик', 'Дата обновления', 'Фото']
const ROW = ['1', 'Apple', 'iPhone', 'iPhone 17', 'iPhone 17 256GB Black (Индия)', 'Black', '256GB', '', 'Индия', '', '', '', '73500', '3', '', '', '']

describe('readAllProducts — учёт упавших листов', () => {
  beforeEach(() => { names.mockReset(); read.mockReset() })

  it('нормальное чтение: sheetsFailed=0, строки на месте', async () => {
    names.mockResolvedValue(['Лист1'])
    read.mockResolvedValue([HEADER, ROW])
    const r = await readAllProducts()
    expect(r.sheetsRead).toBe(1)
    expect(r.sheetsFailed).toBe(0)
    expect(r.rows.length).toBe(1)
  })

  it('частичный провал: упавший лист посчитан, строки уцелевших на месте', async () => {
    names.mockResolvedValue(['Лист1', 'Лист2'])
    read.mockImplementation(async (n: string) => {
      if (n === 'Лист2') throw new Error('Google API down')
      return [HEADER, ROW]
    })
    const r = await readAllProducts()
    expect(r.sheetsRead).toBe(1)
    expect(r.sheetsFailed).toBe(1)
    expect(r.rows.length).toBe(1)
  })

  it('упали ВСЕ листы → throw (прогон завершается ошибкой, не пустым каталогом)', async () => {
    names.mockResolvedValue(['Лист1', 'Лист2'])
    read.mockRejectedValue(new Error('Google API down'))
    await expect(readAllProducts()).rejects.toThrow('Не прочитан ни один лист')
  })

  it('листов нет вовсе — не ошибка (пустая таблица)', async () => {
    names.mockResolvedValue([])
    const r = await readAllProducts()
    expect(r).toMatchObject({ rows: [], sheetsRead: 0, sheetsFailed: 0 })
  })
})

describe('disableStepSkipReason — гейт Step 4', () => {
  it('пустое чтение → гашение пропускается', () => {
    expect(disableStepSkipReason({ interrupted: false, rowsCount: 0, sheetsFailed: 0 })).toContain('пустое')
  })

  it('частичный провал чтения → гашение пропускается', () => {
    expect(disableStepSkipReason({ interrupted: false, rowsCount: 500, sheetsFailed: 1 })).toContain('не прочитано')
  })

  it('прерванный прогон (стоп/таймаут) → гашение пропускается', () => {
    expect(disableStepSkipReason({ interrupted: true, rowsCount: 500, sheetsFailed: 0 })).toContain('прерван')
  })

  it('нормальный полный прогон → гасим как раньше', () => {
    expect(disableStepSkipReason({ interrupted: false, rowsCount: 847, sheetsFailed: 0 })).toBeNull()
  })
})
