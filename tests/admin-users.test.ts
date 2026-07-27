import { describe, it, expect } from 'vitest'
import { parseAdminIds } from '../lib/admin-users'

describe('parseAdminIds', () => {
  it('парсит список с пробелами', () => {
    expect(parseAdminIds('924498094, 855980059 ,316627454')).toEqual([
      '924498094', '855980059', '316627454',
    ])
  })

  it('отбрасывает пустые и нечисловые элементы', () => {
    expect(parseAdminIds('123,,abc, 45x6 ,789')).toEqual(['123', '789'])
  })

  it('пустой/отсутствующий env → пустой список (сид не бежит)', () => {
    expect(parseAdminIds(undefined)).toEqual([])
    expect(parseAdminIds('')).toEqual([])
    expect(parseAdminIds(' , ,')).toEqual([])
  })

  it('не теряет ведущие нули и длинные ID (string, не Number)', () => {
    expect(parseAdminIds('7461166995')).toEqual(['7461166995'])
  })
})
