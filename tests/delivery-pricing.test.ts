/**
 * Формула доставки (упрощённая): регион «Москва» (КЛАДР 77 — с Зеленоградом и
 * Новой Москвой) → фикс; любой другой регион (в т.ч. Подмосковье, КЛАДР 50),
 * сбой геокода, адрес без улицы → «оператор»; порог бесплатной; Decimal-округление до рубля.
 * Главный инвариант фолбэков: любая нехватка данных — mode:'operator', НИКОГДА не 0 ₽.
 */
import { describe, it, expect } from 'vitest'
import { Decimal } from '@prisma/client/runtime/client'
import {
  computeDeliveryCost,
  deliveryZoneOf,
  isMoscowRegion,
  parseDeliveryPricingConfig,
  DeliveryGeo,
  DeliveryPricingConfig,
} from '../lib/delivery-pricing'

const config = (over: Partial<DeliveryPricingConfig> = {}): DeliveryPricingConfig => ({
  moscowPrice: new Decimal(1000),
  freeThreshold: null,
  ...over,
})

// Реальные ответы Suggestions (живой токен, 2026-08-22): region_kladr_id у
// Москвы/Зеленограда/Коммунарки — 7700000000000, у Химок — 5000000000000.
const MOSCOW = '7700000000000'
const MO = '5000000000000'
const SPB = '7800000000000'

const geo = (over: Partial<DeliveryGeo> = {}): DeliveryGeo => ({
  regionKladrId: MOSCOW, fiasLevel: 8, ...over,
})

const items = new Decimal(50000)

describe('computeDeliveryCost', () => {
  it('Москва, дом (fias_level 8) → фикс 1000', () => {
    const q = computeDeliveryCost(geo(), config(), items)
    expect(q).toMatchObject({ mode: 'fixed', zone: 'MOSCOW', free: false })
    if (q.mode === 'fixed') expect(q.cost.toString()).toBe('1000')
  })

  it('Зеленоград и Новая Москва (Коммунарка, fias_level 7) — тот же регион 77 → фикс', () => {
    // Коммунарка: Suggestions отдал fias_level 7 (дом не в ФИАС) — улица есть, считаем
    for (const g of [geo({ fiasLevel: 8 }), geo({ fiasLevel: 7 })]) {
      const q = computeDeliveryCost(g, config(), items)
      if (q.mode !== 'fixed') throw new Error('ожидали fixed')
      expect(q.cost.toString()).toBe('1000')
    }
  })

  it('Подмосковье (регион 50) и другой регион → оператор', () => {
    expect(computeDeliveryCost(geo({ regionKladrId: MO }), config(), items).mode).toBe('operator')
    expect(computeDeliveryCost(geo({ regionKladrId: SPB }), config(), items).mode).toBe('operator')
  })

  it('сбой геокода (null) или нет региона → оператор', () => {
    expect(computeDeliveryCost(null, config(), items).mode).toBe('operator')
    expect(computeDeliveryCost(geo({ regionKladrId: null }), config(), items).mode).toBe('operator')
    expect(computeDeliveryCost(geo({ regionKladrId: '77' }), config(), items).mode).toBe('operator') // не 13 цифр
  })

  it('адрес не разобран до улицы (только регион/город/посёлок, fias_level 1/4/6/null) → оператор', () => {
    for (const fiasLevel of [null, -1, 0, 1, 3, 4, 5, 6]) {
      expect(computeDeliveryCost(geo({ fiasLevel }), config(), items).mode, String(fiasLevel)).toBe('operator')
    }
    for (const fiasLevel of [7, 8, 9, 65, 90, 91]) {
      expect(computeDeliveryCost(geo({ fiasLevel }), config(), items).mode, String(fiasLevel)).toBe('fixed')
    }
  })

  it('битый конфиг → оператор', () => {
    expect(computeDeliveryCost(geo(), null, items).mode).toBe('operator')
  })

  it('порог бесплатной: сумма ≥ порога → 0 ₽ (free), ниже — обычная цена', () => {
    const cfg = config({ freeThreshold: new Decimal(100000) })
    const rich = computeDeliveryCost(geo(), cfg, new Decimal(100000))
    if (rich.mode !== 'fixed') throw new Error('ожидали fixed')
    expect(rich.cost.isZero()).toBe(true)
    expect(rich.free).toBe(true)
    const poor = computeDeliveryCost(geo(), cfg, new Decimal(99999))
    if (poor.mode !== 'fixed') throw new Error('ожидали fixed')
    expect(poor.cost.toString()).toBe('1000')
    expect(poor.free).toBe(false)
  })

  it('порог не спасает Подмосковье: вне Москвы — оператор даже при большой сумме', () => {
    const cfg = config({ freeThreshold: new Decimal(100000) })
    expect(computeDeliveryCost(geo({ regionKladrId: MO }), cfg, new Decimal(500000)).mode).toBe('operator')
  })

  it('округление до рубля при дробной цене: 999.5 → 1000, 1000.4 → 1000', () => {
    const a = computeDeliveryCost(geo(), config({ moscowPrice: new Decimal('999.5') }), items)
    if (a.mode !== 'fixed') throw new Error('ожидали fixed')
    expect(a.cost.toString()).toBe('1000')
    const b = computeDeliveryCost(geo(), config({ moscowPrice: new Decimal('1000.4') }), items)
    if (b.mode !== 'fixed') throw new Error('ожидали fixed')
    expect(b.cost.toString()).toBe('1000')
  })
})

describe('isMoscowRegion / deliveryZoneOf', () => {
  it('77… → Москва, 50… → нет, мусор → нет', () => {
    expect(isMoscowRegion(MOSCOW)).toBe(true)
    expect(isMoscowRegion(MO)).toBe(false)
    expect(isMoscowRegion(null)).toBe(false)
    expect(isMoscowRegion('77abc')).toBe(false)
  })

  it('зона для заказа: MOSCOW / OUTSIDE / null при сбое геокода', () => {
    expect(deliveryZoneOf(geo())).toBe('MOSCOW')
    expect(deliveryZoneOf(geo({ regionKladrId: MO }))).toBe('OUTSIDE')
    expect(deliveryZoneOf(geo({ regionKladrId: null }))).toBeNull()
    expect(deliveryZoneOf(null)).toBeNull()
  })
})

describe('parseDeliveryPricingConfig', () => {
  it('null/пустая строка (не сохраняли) → дефолт 1000, порог выкл', () => {
    for (const raw of [null, '', '  ']) {
      const cfg = parseDeliveryPricingConfig(raw)
      expect(cfg).not.toBeNull()
      expect(cfg!.moscowPrice.toString()).toBe('1000')
      expect(cfg!.freeThreshold).toBeNull()
    }
  })

  it('валидный JSON с порогом', () => {
    const cfg = parseDeliveryPricingConfig(JSON.stringify({ moscowPrice: '1500', freeThreshold: '200000' }))
    expect(cfg!.moscowPrice.toString()).toBe('1500')
    expect(cfg!.freeThreshold!.toString()).toBe('200000')
  })

  it('старый JSON модели МКАД (baseMkad/perKm/cutoffKm) читается: baseMkad → moscowPrice, лишнее игнорируется', () => {
    const cfg = parseDeliveryPricingConfig(JSON.stringify({ baseMkad: '1200', perKm: '40', cutoffKm: 50, freeThreshold: null }))
    expect(cfg).not.toBeNull()
    expect(cfg!.moscowPrice.toString()).toBe('1200')
    expect(cfg!.freeThreshold).toBeNull()
  })

  it('пустой freeThreshold ("") = порог выключен', () => {
    const cfg = parseDeliveryPricingConfig(JSON.stringify({ moscowPrice: '1000', freeThreshold: '' }))
    expect(cfg).not.toBeNull()
    expect(cfg!.freeThreshold).toBeNull()
  })

  it('битые данные → null (расчёт уйдёт в оператора): кривой JSON, отрицательная/нечисловая цена, нулевой порог', () => {
    for (const raw of [
      '{oops',
      '[]',
      '{}',
      JSON.stringify({ moscowPrice: '-5' }),
      JSON.stringify({ moscowPrice: 'abc' }),
      JSON.stringify({ moscowPrice: '1000', freeThreshold: '0' }),
      JSON.stringify({ moscowPrice: '1000', freeThreshold: 'много' }),
    ]) {
      expect(parseDeliveryPricingConfig(raw), raw).toBeNull()
    }
  })
})
