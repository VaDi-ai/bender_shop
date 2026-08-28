/**
 * Композитный ключ алиаса и RAM.
 *
 * Была дыра: композит строился как «model storage color», а у MacBook Air одна
 * связка память+цвет живёт в трёх конфигурациях RAM — ключ
 * «macbook air 13 m5 1tb midnight» одинаково подходил вариантам 16/24/32 GB.
 * Привязка ложилась на тот, что привязали последним, и следующий прайс с
 * другой RAM молча уезжал не туда. На живом каталоге таких ключей было 8.
 *
 * Правило после фикса:
 *   • RAM в строке есть → она в ключе, конфигурации разведены;
 *   • RAM нет, а у целевого варианта ось RAM ЕСТЬ → композит не пишем вовсе
 *     (остаётся точный rawMessage-ключ, неоднозначность идёт к человеку);
 *   • RAM нет и оси RAM у варианта нет (планшеты, часы, телефоны) → ключ
 *     по-старому, без RAM. Иначе мы осиротили бы 36 живых ключей: rawMessage
 *     содержит цену и живёт ровно одно сообщение, композит для них —
 *     единственная память системы.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: { productVariant: { findUnique: vi.fn() } },
}))

import { prisma } from '../lib/prisma'
import { compositeAliasKey, aliasKeysToWrite } from '../lib/price-alias'

/* eslint-disable @typescript-eslint/no-explicit-any */
const findVariant = prisma.productVariant.findUnique as any

const ROW = {
  rawMessage: 'MacBook MDHE4 Air 13 Midnight (M5, 16GB, 512GB) 2026 117000',
  model: 'MacBook Air 13 M5', storage: '512GB', ram: '16GB' as string | null, color: 'Midnight',
}

describe('compositeAliasKey', () => {
  it('RAM входит в ключ и разводит конфигурации одной памяти и цвета', () => {
    const base = { model: 'MacBook Air 13 M5', storage: '1TB', color: 'Midnight' }
    expect(compositeAliasKey({ ...base, ram: '16GB' })).toBe('macbook air 13 m5 1tb 16gb midnight')
    expect(compositeAliasKey({ ...base, ram: '24GB' })).toBe('macbook air 13 m5 1tb 24gb midnight')
  })

  it('без RAM ключ прежнего формата — ключи планшетов и часов не осиротели', () => {
    expect(compositeAliasKey({ model: 'iPad 11', storage: '128GB', ram: null, color: 'Silver' }))
      .toBe('ipad 11 128gb silver')
    expect(compositeAliasKey({ model: 'Apple Watch S11 42', ram: null, color: 'Silver' }))
      .toBe('apple watch s11 42 silver')
  })

  it('порядок полей стабилен: model → storage → ram → color', () => {
    expect(compositeAliasKey({ model: 'M', storage: 'S', ram: 'R', color: 'C' })).toBe('m s r c')
  })

  it('пустая модель без прочих полей ключа не даёт', () => {
    expect(compositeAliasKey({ model: '   ' })).toBeNull()
  })
})

describe('aliasKeysToWrite — гейт двусмысленности на записи', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('RAM известна → пишем оба ключа, композит с RAM', async () => {
    findVariant.mockResolvedValue({ attributes: { RAM: '16GB' } })
    const r = await aliasKeysToWrite(ROW, 394)
    expect(r.keys).toEqual([ROW.rawMessage.toLowerCase(), 'macbook air 13 m5 512gb 16gb midnight'])
    expect(r.skippedComposite).toBeNull()
  })

  it('RAM в строке нет, а у варианта ось RAM есть → композит НЕ пишем', async () => {
    findVariant.mockResolvedValue({ attributes: { RAM: '24GB', 'Память': '1TB' } })
    const r = await aliasKeysToWrite({ ...ROW, ram: null }, 410)
    expect(r.keys).toEqual([ROW.rawMessage.toLowerCase()])
    expect(r.skippedComposite).toBe('macbook air 13 m5 512gb midnight')
  })

  it('оси RAM у варианта нет → композит пишем как раньше', async () => {
    findVariant.mockResolvedValue({ attributes: { 'Память': '128GB', 'Цвет': 'Silver' } })
    const r = await aliasKeysToWrite(
      { rawMessage: 'iPad 11 128 Silver 44000', model: 'iPad 11', storage: '128GB', ram: null, color: 'Silver' }, 1756)
    expect(r.keys).toEqual(['ipad 11 128 silver 44000', 'ipad 11 128gb silver'])
    expect(r.skippedComposite).toBeNull()
  })

  it('«не наш товар» (варианта нет) — ключи как есть, в БД не ходим', async () => {
    const r = await aliasKeysToWrite({ ...ROW, ram: null }, null)
    expect(r.keys).toContain('macbook air 13 m5 512gb midnight')
    expect(findVariant).not.toHaveBeenCalled()
  })
})
