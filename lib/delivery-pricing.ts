/**
 * Стоимость доставки — упрощённая модель, согласованная с владельцем:
 *   • адрес в регионе «Москва» (КЛАДР 77 — включая Зеленоград и Новую Москву/
 *     ТиНАО) — фикс (moscowPrice, по умолчанию 1000 ₽);
 *   • любой другой регион (в т.ч. Московская обл, КЛАДР 50), сбой геокода или
 *     адрес, не разобранный хотя бы до улицы → «стоимость уточнит оператор»
 *     (mode:'operator', deliveryCost=null — НЕ ноль);
 *   • порог бесплатной доставки freeThreshold: по умолчанию ВЫКЛ (null); если
 *     задан и сумма товаров ≥ порога — доставка 0 ₽.
 * Габариты и «км от метро» не автоматизируются — это ручная работа оператора.
 *
 * Зона определяется по РЕГИОНУ, а не по city == «Москва»: у Зеленограда city
 * «Зеленоград», у Коммунарки — settlement; регион у всех «Москва».
 *
 * Деньги — Decimal, итог округляется до рубля. Параметры редактируются
 * владельцем в админке (ApiKey setting_delivery_pricing, JSON). Битый конфиг —
 * это тоже фолбэк в «оператора»: лучше не посчитать, чем посчитать неправильно.
 */
import { Decimal } from '@prisma/client/runtime/client'
import { getApiKeyValue } from './api-key-store'
import log from './logger'

export const DELIVERY_PRICING_SETTING = 'setting_delivery_pricing'

/** Первые две цифры КЛАДР-кода региона «Москва». */
export const MOSCOW_REGION_KLADR_PREFIX = '77'

export interface DeliveryPricingConfig {
  moscowPrice: Decimal
  /** null = порог бесплатной доставки выключен */
  freeThreshold: Decimal | null
}

/** Дефолты, согласованные владельцем; действуют, пока настройка не сохранена. */
export const DEFAULT_DELIVERY_PRICING = { moscowPrice: '1000', freeThreshold: null as string | null }

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
 * Старый ключ baseMkad (модель МКАД до 2026-08-22) читается как moscowPrice.
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
  const moscowPrice = decOrNull(src.moscowPrice ?? src.baseMkad)
  const freeRaw = src.freeThreshold
  const freeThreshold = freeRaw === null || freeRaw === undefined || freeRaw === '' ? null : decOrNull(freeRaw)
  if (!moscowPrice) return null
  if (freeRaw !== null && freeRaw !== undefined && freeRaw !== '' && (freeThreshold === null || freeThreshold.isZero())) return null
  return { moscowPrice, freeThreshold }
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
  regionKladrId: string | null
  fiasLevel: number | null
}

export type DeliveryZone = 'MOSCOW' | 'OUTSIDE'

export type DeliveryQuote =
  | { mode: 'fixed'; cost: Decimal; zone: 'MOSCOW'; free: boolean }
  | { mode: 'operator' }

const OPERATOR: DeliveryQuote = { mode: 'operator' }

/**
 * Адрес разобран хотя бы до улицы (fias_level 7 — улица, 8 — дом, 9 —
 * помещение, 65 — планировочная структура, 90/91 — доп. территория/улица в ней).
 * «Москва» без улицы (fias_level 1/4/6) — пусть смотрит человек.
 * Suggestions не отдаёт qc, поэтому качество гейтим именно так.
 */
export function isAddressResolved(fiasLevel: number | null): boolean {
  return fiasLevel !== null && ((fiasLevel >= 7 && fiasLevel <= 9) || fiasLevel >= 65)
}

/** Регион «Москва» (КЛАДР 77…): Москва, Зеленоград, Новая Москва (ТиНАО). */
export function isMoscowRegion(regionKladrId: string | null): boolean {
  return typeof regionKladrId === 'string' && /^\d{13}$/.test(regionKladrId)
    && regionKladrId.startsWith(MOSCOW_REGION_KLADR_PREFIX)
}

/** Зона для записи в заказ: null, если геокод не дал региона. */
export function deliveryZoneOf(geo: DeliveryGeo | null): DeliveryZone | null {
  if (!geo || !geo.regionKladrId) return null
  return isMoscowRegion(geo.regionKladrId) ? 'MOSCOW' : 'OUTSIDE'
}

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
  if (!isAddressResolved(geo.fiasLevel)) return OPERATOR
  if (!isMoscowRegion(geo.regionKladrId)) return OPERATOR

  const free = config.freeThreshold !== null && itemsTotal.gte(config.freeThreshold)
  const cost = free ? new Decimal(0) : config.moscowPrice

  return {
    mode: 'fixed',
    cost: cost.toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
    zone: 'MOSCOW',
    free,
  }
}
