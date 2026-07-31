/**
 * Ручная правка атрибутов сильнее словаря: синк её не пересчитывает,
 * обновление по словарю не трогает, снятие возвращает ключ разбору.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({ prisma: { productVariant: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/api-key-store', () => ({ getApiKeyValue: vi.fn(), setApiKeyValue: vi.fn() }))

import { prisma } from '../lib/prisma'
import { setApiKeyValue } from '../lib/api-key-store'
import { setVariantAttributes, overriddenKeys } from '../lib/product-admin'
import { attributesForExistingVariant } from '../lib/sim-rules'
import { buildPreview } from '../lib/sim-recalc'

/* eslint-disable @typescript-eslint/no-explicit-any */
const pv = prisma.productVariant as any
const ACTOR = '900'
const ALIASES = [{ attrKey: 'SIM', rawNorm: '2sim', canonical: '2 SIM' }]
const RULES = [{ id: 1, country: 'Индия', countryNorm: 'индия', brandNorm: 'apple', modelMatch: '', modelGenFrom: 0, simType: 'SIM + eSIM', source: 'seed' }]

beforeEach(() => {
  pv.findUnique.mockReset(); pv.update.mockReset()
  pv.update.mockResolvedValue({})
  pv.findUnique.mockResolvedValue({ id: 7, productId: 3, attributes: { fullName: 'iPhone 17 Pro (Индия)', SIM: 'eSIM' } })
})

describe('правка атрибута', () => {
  it('пишет значение и отметку override', async () => {
    const r = await setVariantAttributes(ACTOR, 7, { SIM: '2 SIM' })
    expect(r.ok).toBe(true)
    const saved = pv.update.mock.calls[0][0].data.attributes
    expect(saved.SIM).toBe('2 SIM')
    expect(saved.attrOverrides.SIM).toMatchObject({ value: '2 SIM', by: ACTOR })
    expect(overriddenKeys(saved)).toEqual(['SIM'])
    expect(setApiKeyValue).toHaveBeenCalledWith('cache_version', expect.any(String))
  })

  it('пустая строка снимает ручную правку, значение остаётся разбору', async () => {
    pv.findUnique.mockResolvedValue({ id: 7, productId: 3, attributes: { SIM: '2 SIM', attrOverrides: { SIM: { value: '2 SIM', by: ACTOR, at: 'x' } } } })
    await setVariantAttributes(ACTOR, 7, { SIM: '' })
    const saved = pv.update.mock.calls[0][0].data.attributes
    expect(saved.attrOverrides.SIM).toBeUndefined()
    expect(saved.SIM).toBe('2 SIM')
  })

  it('мусор не проходит: служебные ключи, пустое тело, длинное значение', async () => {
    expect((await setVariantAttributes(ACTOR, 7, { fullName: 'подмена' })).status).toBe(422)
    expect((await setVariantAttributes(ACTOR, 7, {})).status).toBe(422)
    expect((await setVariantAttributes(ACTOR, 7, { SIM: 'x'.repeat(101) })).status).toBe(422)
    pv.findUnique.mockResolvedValue(null)
    expect((await setVariantAttributes(ACTOR, 999, { SIM: '2 SIM' })).status).toBe(404)
  })
})

describe('синк уважает override', () => {
  it('поправленный руками SIM переживает разбор', () => {
    const existing = { SIM: '2 SIM', attrOverrides: { SIM: { value: '2 SIM', by: ACTOR, at: 'x' } } }
    const out = attributesForExistingVariant({ SIM: 'SIM + eSIM', 'Цвет': 'Blue' }, existing, ALIASES as never)
    expect(out.SIM).toBe('2 SIM')
  })

  it('без override поведение прежнее — канонизация метки', () => {
    const out = attributesForExistingVariant({ SIM: 'SIM + eSIM' }, { SIM: '2Sim' }, ALIASES as never)
    expect(out.SIM).toBe('2 SIM')
  })
})

describe('обновление по словарю не трогает ручное', () => {
  const variant = (attrs: Record<string, unknown>) => ({
    id: 1, attributes: attrs,
    product: { name: 'Iphone 17 Pro', brand: 'Apple', category: { name: 'Телефоны' } },
  })

  it('строка с override уезжает в отдельный раздел «поправлено руками»', () => {
    const p = buildPreview([
      variant({ fullName: 'iPhone 17 Pro (Индия)', 'Страна': 'Индия', SIM: 'eSIM',
                attrOverrides: { SIM: { value: 'eSIM', by: ACTOR, at: 'x' } } }),
    ], RULES as never, ALIASES as never)
    expect(p.counts).toMatchObject({ manual: 1, semantic: 0 })
    expect(p.manual[0]).toMatchObject({ variantId: 1, current: 'eSIM' })
  })

  it('без override та же строка была бы сменой значения', () => {
    const p = buildPreview([
      variant({ fullName: 'iPhone 17 Pro (Индия)', 'Страна': 'Индия', SIM: 'eSIM' }),
    ], RULES as never, ALIASES as never)
    expect(p.counts).toMatchObject({ manual: 0, semantic: 1 })
  })
})
