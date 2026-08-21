/**
 * Стоимость доставки (Москва/МКАД) — согласованная с владельцем модель:
 *   • внутри МКАД — фикс (baseMkad, по умолчанию 1000 ₽);
 *   • за МКАД — baseMkad + perKm × ⌈км от МКАД⌉ (км — beltway_distance из DaData Clean);
 *   • ⌈км⌉ больше отсечки (cutoffKm, по умолчанию 50) → авто-расчёта нет,
 *     «стоимость уточнит оператор» (mode:'operator', deliveryCost=null — НЕ ноль);
 *   • порог бесплатной доставки freeThreshold: по умолчанию ВЫКЛ (null); если
 *     задан и сумма товаров ≥ порога — доставка 0 ₽.
 *
 * Деньги — Decimal, итог округляется до рубля. Все параметры редактируются
 * владельцем в админке (ApiKey setting_delivery_pricing, JSON). Битый конфиг —
 * это тоже фолбэк в «оператора»: лучше не посчитать, чем посчитать неправильно.
 */
import { Decimal } from '@prisma/client/runtime/client'
import { getApiKeyValue } from './api-key-store'
import log from './logger'

export const DELIVERY_PRICING_SETTING = 'setting_delivery_pricing'

export interface DeliveryPricingConfig {
  baseMkad: Decimal
  perKm: Decimal
  cutoffKm: number
  /** null = порог бесплатной доставки выключен */
  freeThreshold: Decimal | null
}

/** Дефолты, согласованные владельцем; действуют, пока настройка не сохранена. */
export const DEFAULT_DELIVERY_PRICING = { baseMkad: '1000', perKm: '40', cutoffKm: 50, freeThreshold: null as string | null }

const decOrNull = (v: unknown): Decimal | null => {
  if (v === null || v === undefined || v === '') return null
  try {
    const d = new Decimal(String(v))
    return d.isFinite() && !d.isNegative() ? d : null
  } catch {
    return null
  }
}

/**
 * Разбор JSON-конфига. null/пустая строка (настройку ещё не сохраняли) →
 * дефолты; кривой JSON или значения → null (расчёт уходит в «оператора»).
 */
export function parseDeliveryPricingConfig(raw: string | null): DeliveryPricingConfig | null {
  let src: Record<string, unknown>
  if (raw === null || raw.trim() === '') {
    src = DEFAULT_DELIVERY_PRICING as unknown as Record<string, unknown>
  } else {
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      src = parsed as Record<string, unknown>
    } catch {
      return null
    }
  }
  const baseMkad = decOrNull(src.baseMkad)
  const perKm = decOrNull(src.perKm)
  const cutoff = Number(src.cutoffKm)
  const freeRaw = src.freeThreshold
  const freeThreshold = freeRaw === null || freeRaw === undefined || freeRaw === '' ? null : decOrNull(freeRaw)
  if (!baseMkad || !perKm) return null
  if (!Number.isInteger(cutoff) || cutoff < 1 || cutoff > 1000) return null
  if (freeRaw !== null && freeRaw !== undefined && freeRaw !== '' && (freeThreshold === null || freeThreshold.isZero())) return null
  return { baseMkad, perKm, cutoffKm: cutoff, freeThreshold }
}

/** Конфиг из админ-настроек (с дефолтами); ошибка чтения → null → «оператор». */
export async function loadDeliveryPricingConfig(): Promise<DeliveryPricingConfig | null> {
  try {
    return parseDeliveryPricingConfig(await getApiKeyValue(DELIVERY_PRICING_SETTING))
  } catch (e) {
    log.warn('Delivery pricing config read failed', { error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

/** Что нужно формуле от геокода (подмножество VerifiedAddress из lib/dadata). */
export interface DeliveryGeo {
  beltwayHit: string | null
  beltwayDistanceKm: number | null
  qcGeo: number | null
  qc: number | null
}

export type DeliveryQuote =
  | { mode: 'fixed'; cost: Decimal; zone: 'IN_MKAD' | 'OUT_MKAD'; distanceKm: number | null; free: boolean }
  | { mode: 'operator' }

const OPERATOR: DeliveryQuote = { mode: 'operator' }

// Порог доверия геокоду: qc=0 (адрес разобран уверенно) и qc_geo ≤ 2
// (координаты не грубее улицы). Хуже — пусть смотрит человек.
const QC_GEO_MAX = 2

/**
 * Чистая функция расчёта. Любая нехватка данных → «оператор», никогда не 0 ₽.
 * itemsTotal — сумма товаров ИЗ БД (для порога бесплатной доставки).
 */
export function computeDeliveryCost(
  geo: DeliveryGeo | null,
  config: DeliveryPricingConfig | null,
  itemsTotal: Decimal,
): DeliveryQuote {
  if (!config || !geo) return OPERATOR
  if (geo.qc !== 0 || geo.qcGeo === null || geo.qcGeo > QC_GEO_MAX) return OPERATOR
  if (geo.beltwayHit !== 'IN_MKAD' && geo.beltwayHit !== 'OUT_MKAD') return OPERATOR

  let distanceKm: number | null = null
  let cost: Decimal
  if (geo.beltwayHit === 'IN_MKAD') {
    cost = config.baseMkad
  } else {
    if (geo.beltwayDistanceKm === null || geo.beltwayDistanceKm < 0) return OPERATOR
    distanceKm = Math.ceil(geo.beltwayDistanceKm)
    if (distanceKm > config.cutoffKm) return OPERATOR
    cost = config.baseMkad.plus(config.perKm.times(distanceKm))
  }

  const free = config.freeThreshold !== null && itemsTotal.gte(config.freeThreshold)
  if (free) cost = new Decimal(0)

  return {
    mode: 'fixed',
    cost: cost.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    zone: geo.beltwayHit,
    distanceKm,
    free,
  }
}
