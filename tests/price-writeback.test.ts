import { describe, it, expect } from 'vitest'
import { buildWritebackUpdates } from '../lib/price-apply'

const sheets = [
  {
    name: 'Айфоны',
    data: [
      ['Бренд', 'Кат', 'Линейка', 'Модель', 'Полное имя', 'Цвет'],
      ['Apple', 'Телефоны', 'iPhone', 'iPhone 17', 'iPhone 17 256 Black', 'Black'],
      ['Apple', 'Телефоны', 'iPhone', 'iPhone 17', 'iPhone 17 256 White', 'White'],
    ],
  },
]

describe('buildWritebackUpdates (блокер #31: null-cost чистит L)', () => {
  it('cost=null → в колонку L пишется пустая строка, розница в M', () => {
    const { updates, missing } = buildWritebackUpdates(
      [{ fullName: 'iPhone 17 256 White', cost: null, price: 140000 }],
      sheets,
    )
    expect(missing).toEqual([])
    expect(updates).toEqual([
      { range: "'Айфоны'!L3", values: [['']] },
      { range: "'Айфоны'!M3", values: [[140000]] },
    ])
  })

  it('число пишется как число; матч по fullName регистронезависимый; строка не из листа → missing', () => {
    const { updates, missing } = buildWritebackUpdates(
      [
        { fullName: 'IPHONE 17 256 black', cost: 88500, price: 103490 },
        { fullName: 'Нет такой строки', cost: 1, price: 2 },
      ],
      sheets,
    )
    expect(updates).toEqual([
      { range: "'Айфоны'!L2", values: [[88500]] },
      { range: "'Айфоны'!M2", values: [[103490]] },
    ])
    expect(missing).toEqual(['нет такой строки'])
  })
})

describe('writeback O (поставщик) + P (дата и время)', () => {
  it('supplier/updatedAt заданы → уходят в O и P вместе с L/M', () => {
    const { updates } = buildWritebackUpdates(
      [{ fullName: 'iPhone 17 256 Black', cost: 88500, price: 103500, supplier: 'Дубай-опт', updatedAt: '06.08.2026 15:04' }],
      sheets,
    )
    expect(updates).toEqual([
      { range: "'Айфоны'!L2", values: [[88500]] },
      { range: "'Айфоны'!M2", values: [[103500]] },
      { range: "'Айфоны'!O2", values: [['Дубай-опт']] },
      { range: "'Айфоны'!P2", values: [['06.08.2026 15:04']] },
    ])
  })

  it('undefined → O/P не трогаем (совместимость со старыми вызовами)', () => {
    const { updates } = buildWritebackUpdates(
      [{ fullName: 'iPhone 17 256 Black', cost: 88500, price: 103500 }],
      sheets,
    )
    expect(updates.map(u => u.range)).toEqual(["'Айфоны'!L2", "'Айфоны'!M2"])
  })

  it('null/пустой supplier очищает O — откат снимает имя поставщика', () => {
    const { updates } = buildWritebackUpdates(
      [{ fullName: 'iPhone 17 256 White', cost: null, price: 140000, supplier: null, updatedAt: '06.08.2026 15:04' }],
      sheets,
    )
    expect(updates).toContainEqual({ range: "'Айфоны'!O3", values: [['']] })
    expect(updates).toContainEqual({ range: "'Айфоны'!P3", values: [['06.08.2026 15:04']] })
  })
})
