/**
 * Архивный статус варианта (Phase 2) + поиск пикера привязки.
 *
 * Исходная боль: при привязке строки прайса пикер показывал схлопнутые дубли —
 * одинаковые с виду строки одной конфигурации. Скрытия (inStock=false) для
 * этого мало: поиск отдаёт варианты независимо от наличия, и это правильно —
 * прайс чаще всего приходит именно на распроданный товар.
 *
 * Поэтому отдельный флаг archivedAt: он отличает «схлопнутый дубль/призрак»
 * от «живой, но закончился». Пикер прячет только первое.
 *
 * Вторая боль (MacBook Air 15): поиск шёл только по имени товара и SKU, а
 * размер живёт в имени варианта — «MacBook Air 15» не находил ничего, потому
 * что товар называется «Macbook Air M5». Поэтому в условие добавлен
 * attributes.fullName, а слова запроса соединяются через AND.
 */
import { describe, it, expect } from 'vitest'
import { variantSearchWhere, variantSearchTokens } from '../api/admin'

/** Ветки OR одного токена в удобном для проверок виде. */
function branchesOf(where: ReturnType<typeof variantSearchWhere>): any[][] {
  return (where.AND as any[]).map(cond => cond.OR)
}

describe('variantSearchWhere — фильтр пикера привязки', () => {
  it('архивные варианты в выдачу не попадают', () => {
    expect(variantSearchWhere('iPad 11').archivedAt).toBeNull()
  })

  it('ищет по названию товара и SKU — как было', () => {
    const [or] = branchesOf(variantSearchWhere('cl90o'))
    expect(or).toContainEqual({ product: { name: { contains: 'cl90o', mode: 'insensitive' } } })
    expect(or).toContainEqual({ sku: { contains: 'cl90o', mode: 'insensitive' } })
  })

  it('ищет и по имени варианта: размер живёт только там', () => {
    const [or] = branchesOf(variantSearchWhere('cl90o'))
    expect(or).toContainEqual({
      attributes: { path: ['fullName'], string_contains: 'cl90o', mode: 'insensitive' },
    })
  })

  it('регистр не важен на всех ветках', () => {
    for (const or of branchesOf(variantSearchWhere('MacBook'))) {
      for (const branch of or) {
        const leaf = 'sku' in branch ? branch.sku : 'product' in branch ? branch.product.name : branch.attributes
        expect(leaf.mode).toBe('insensitive')
      }
    }
  })

  it('слова запроса соединяются через AND — «macbook air 15 m5» сходится по двум полям', () => {
    const where = variantSearchWhere('macbook air 15 m5')
    expect(where.AND).toHaveLength(4)
    expect(branchesOf(where).map(or => or[0].product.name.contains)).toEqual(['macbook', 'air', '15', 'm5'])
  })

  it('фильтр по наличию НЕ добавлен: распроданный живой вариант остаётся видимым', () => {
    const where = variantSearchWhere('iPhone') as unknown as Record<string, unknown>
    expect(where.inStock).toBeUndefined()
    expect(where.quantity).toBeUndefined()
    // ровно два условия: архив и поиск
    expect(Object.keys(where).sort()).toEqual(['AND', 'archivedAt'])
  })
})

describe('variantSearchTokens', () => {
  it('режет по пробелам и выкидывает пустые', () => {
    expect(variantSearchTokens('  macbook   air 15 ')).toEqual(['macbook', 'air', '15'])
  })

  it('не пускает в запрос больше восьми слов', () => {
    expect(variantSearchTokens('a b c d e f g h i j')).toHaveLength(8)
  })
})
