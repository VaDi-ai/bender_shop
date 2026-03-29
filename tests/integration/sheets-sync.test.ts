import { describe, it, expect } from 'vitest'
import { mapHeaders } from '../../lib/sheets-sync'

describe('Sheets sync logic', () => {
  it('maps column headers correctly', () => {
    const headers = ['', 'Бренд', 'Категория', 'Общая категория', 'Название модели', 'Цвет', 'Память', 'Размер']
    const COL = mapHeaders(headers)

    expect(COL.brand).toBe(1)
    expect(COL.category).toBe(3) // "Общая категория", not "Категория"
    expect(COL.fullName).toBe(4)
    expect(COL.color).toBe(5)
    expect(COL.memory).toBe(6)
    expect(COL.size).toBe(7)
  })

  it('general category preferred over subcategory', () => {
    const headers = ['', 'Бренд', 'Категория', 'Общая категория', 'Название модели']
    const COL = mapHeaders(headers)
    // "Общая категория" at idx 3, "Категория" at idx 2
    // mapHeaders should pick 3 (Общая категория)
    expect(COL.category).toBe(3)
  })

  it('memory split handles 16GB/1TB format', () => {
    const memStr = '16GB/1TB'
    const match = memStr.match(/^(\d+)\s*(GB|gb)?\s*\/\s*(\d+)\s*(GB|TB|gb|tb)?$/i)

    expect(match).toBeTruthy()
    expect(match![1]).toBe('16')  // RAM
    expect(match![3]).toBe('1')   // Storage
    expect(match![4]!.toUpperCase()).toBe('TB')
  })

  it('memory split handles 12/256 format', () => {
    const memStr = '12/256'
    const match = memStr.match(/^(\d+)\s*(GB|gb)?\s*\/\s*(\d+)\s*(GB|TB|gb|tb)?$/i)

    expect(match).toBeTruthy()
    expect(match![1]).toBe('12')  // RAM
    expect(match![3]).toBe('256') // Storage
  })

  it('falls back to hardcoded indices when headers not found', () => {
    const headers = ['', 'X', 'Y', 'Z', 'W', 'V']
    // price header not found → fallback to index 11
    const COL = mapHeaders(headers)
    expect(COL.price).toBe(11)
  })
})
