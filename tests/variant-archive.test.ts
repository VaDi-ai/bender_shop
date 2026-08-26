/**
 * Архивный статус варианта (Phase 2).
 *
 * Исходная боль: при привязке строки прайса пикер показывал схлопнутые дубли —
 * одинаковые с виду строки одной конфигурации. Скрытия (inStock=false) для
 * этого мало: поиск отдаёт варианты независимо от наличия, и это правильно —
 * прайс чаще всего приходит именно на распроданный товар.
 *
 * Поэтому отдельный флаг archivedAt: он отличает «схлопнутый дубль/призрак»
 * от «живой, но закончился». Пикер прячет только первое.
 */
import { describe, it, expect } from 'vitest'
import { variantSearchWhere } from '../api/admin'

describe('variantSearchWhere — фильтр пикера привязки', () => {
  it('архивные варианты в выдачу не попадают', () => {
    expect(variantSearchWhere('iPad 11').archivedAt).toBeNull()
  })

  it('ищет и по названию товара, и по SKU — как было', () => {
    const where = variantSearchWhere('cl90o')
    expect(where.OR).toEqual([
      { product: { name: { contains: 'cl90o', mode: 'insensitive' } } },
      { sku: { contains: 'cl90o', mode: 'insensitive' } },
    ])
  })

  it('регистр не важен (mode: insensitive на обоих ветках)', () => {
    const where = variantSearchWhere('MacBook')
    for (const branch of where.OR) {
      const leaf = 'sku' in branch ? branch.sku : branch.product.name
      expect(leaf.mode).toBe('insensitive')
    }
  })

  it('фильтр по наличию НЕ добавлен: распроданный живой вариант остаётся видимым', () => {
    const where = variantSearchWhere('iPhone') as unknown as Record<string, unknown>
    expect(where.inStock).toBeUndefined()
    expect(where.quantity).toBeUndefined()
    // ровно два условия: архив и поиск
    expect(Object.keys(where).sort()).toEqual(['OR', 'archivedAt'])
  })
})
