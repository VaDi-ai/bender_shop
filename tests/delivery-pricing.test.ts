/**
 * Формула доставки (Москва/МКАД): фикс внутри МКАД, фикс + ₽/км×⌈км⌉ за МКАД,
 * отсечка → «оператор», порог бесплатной, Decimal-округление до рубля.
 * Главный инвариант фолбэков: любая нехватка данных — mode:'operator', НИКОГДА не 0 ₽.
 */
import { describe, it, expect } from 'vitest'
import { Decimal } from '@prisma/client/runtime/client'
import {
  computeDeliveryCost,
  parseDeliveryPricingConfig,
  DeliveryGeo,
  DeliveryPricingConfig,
} from '../lib/delivery-pricing'

const config = (over: Partial<DeliveryPricingConfig> = {}): DeliveryPricingConfig => ({
  baseMkad: new Decimal(1000),
  perKm: new Decimal(40),
  cutoffKm: 50,
  freeThreshold: null,
  ...over,
})

const geo = (over: Partial<DeliveryGeo> = {}): DeliveryGeo => ({
  beltwayHit: 'IN_MKAD', beltwayDistanceKm: null, qcGeo: 0, qc: 0, ...over,
})

const items = new Decimal(50000)

describe('computeDeliveryCost', () => {
  it('внутри МКАД → фикс', () => {
    const q = computeDeliveryCost(geo(), config(), items)
    expect(q).toMatchObject({ mode: 'fixed', zone: 'IN_MKAD', distanceKm: null, free: false })
    if (q.mode === 'fixed') expect(q.cost.toString()).toBe('1000')
  })

  it('за МКАД 6 км → 1000 + 40×6 = 1240', () => {
    const q = computeDeliveryCost(geo({ beltwayHit: 'OUT_MKAD', beltwayDistanceKm: 6 }), config(), items)
    if (q.mode !== 'fixed') throw new Error('ожидали fixed')
    expect(q.cost.toString()).toBe('1240')
    expect(q.zone).toBe('OUT_MKAD')
    expect(q.distanceKm).toBe(6)
  })

  it('дробные км округляются ВВЕРХ: 6.2 км → считаем как 7', () => {
    const q = computeDeliveryCost(geo({ beltwayHit: 'OUT_MKAD', beltwayDistanceKm: 6.2 }), config(), items)
    if (q.mode !== 'fixed') throw new Error('ожидали fixed')
    expect(q.distanceKm).toBe(7)
    expect(q.cost.toString()).toBe('1280')
  })

  it('отсечка: ровно 50 км ещё считается, 50.1 (⌈51⌉) и 74 — оператор', () => {
    const at = computeDeliveryCost(geo({ beltwayHit: 'OUT_MKAD', beltwayDistanceKm: 50 }), config(), items)
    if (at.mode !== 'fixed') throw new Error('ожидали fixed')
    expect(at.cost.toString()).toBe('3000')
    expect(computeDeliveryCost(geo({ beltwayHit: 'OUT_MKAD', beltwayDistanceKm: 50.1 }), config(), items).mode).toBe('operator')
    expect(computeDeliveryCost(geo({ beltwayHit: 'OUT_MKAD', beltwayDistanceKm: 74 }), config(), items).mode).toBe('operator')
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

  it('округление до рубля при дробных тарифах: 1000 + 40.5×3 = 1121.5 → 1122', () => {
    const q = computeDeliveryCost(
      geo({ beltwayHit: 'OUT_MKAD', beltwayDistanceKm: 3 }),
      config({ perKm: new Decimal('40.5') }),
      items,
    )
    if (q.mode !== 'fixed') throw new Error('ожидали fixed')
    expect(q.cost.toString()).toBe('1122')
  })

  it('фолбэки → оператор (не ноль): нет геокода, битый конфиг, плохой qc/qc_geo, КАД, нет км', () => {
    expect(computeDeliveryCost(null, config(), items).mode).toBe('operator')
    expect(computeDeliveryCost(geo(), null, items).mode).toBe('operator')
    expect(computeDeliveryCost(geo({ qc: 1 }), config(), items).mode).toBe('operator')
    expect(computeDeliveryCost(geo({ qcGeo: 3 }), config(), items).mode).toBe('operator')
    expect(computeDeliveryCost(geo({ qcGeo: null }), config(), items).mode).toBe('operator')
    expect(computeDeliveryCost(geo({ beltwayHit: 'IN_KAD' }), config(), items).mode).toBe('operator')
    expect(computeDeliveryCost(geo({ beltwayHit: null }), config(), items).mode).toBe('operator')
    expect(computeDeliveryCost(geo({ beltwayHit: 'OUT_MKAD', beltwayDistanceKm: null }), config(), items).mode).toBe('operator')
  })
})

describe('parseDeliveryPricingConfig', () => {
  it('null/пустая строка (не сохраняли) → согласованные дефолты 1000/40/50, порог выкл', () => {
    for (const raw of [null, '', '  ']) {
      const cfg = parseDeliveryPricingConfig(raw)
      expect(cfg).not.toBeNull()
      expect(cfg!.baseMkad.toString()).toBe('1000')
      expect(cfg!.perKm.toString()).toBe('40')
      expect(cfg!.cutoffKm).toBe(50)
      expect(cfg!.freeThreshold).toBeNull()
    }
  })

  it('валидный JSON с порогом', () => {
    const cfg = parseDeliveryPricingConfig(JSON.stringify({ baseMkad: '1500', perKm: '35', cutoffKm: 30, freeThreshold: '200000' }))
    expect(cfg!.baseMkad.toString()).toBe('1500')
    expect(cfg!.freeThreshold!.toString()).toBe('200000')
  })

  it('пустой freeThreshold ("") = порог выключен', () => {
    const cfg = parseDeliveryPricingConfig(JSON.stringify({ baseMkad: '1000', perKm: '40', cutoffKm: 50, freeThreshold: '' }))
    expect(cfg).not.toBeNull()
    expect(cfg!.freeThreshold).toBeNull()
  })

  it('битые данные → null (расчёт уйдёт в оператора): кривой JSON, отрицательные, нулевой порог, кривая отсечка', () => {
    for (const raw of [
      '{oops',
      '[]',
      JSON.stringify({ baseMkad: '-5', perKm: '40', cutoffKm: 50 }),
      JSON.stringify({ baseMkad: '1000', perKm: 'abc', cutoffKm: 50 }),
      JSON.stringify({ baseMkad: '1000', perKm: '40', cutoffKm: 0 }),
      JSON.stringify({ baseMkad: '1000', perKm: '40', cutoffKm: 5.5 }),
      JSON.stringify({ baseMkad: '1000', perKm: '40', cutoffKm: 50, freeThreshold: '0' }),
      JSON.stringify({ baseMkad: '1000', perKm: '40', cutoffKm: 50, freeThreshold: 'много' }),
    ]) {
      expect(parseDeliveryPricingConfig(raw), raw).toBeNull()
    }
  })
})
