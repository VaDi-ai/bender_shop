/**
 * DaData: автоподсказки адреса (Suggestions, бесплатный лимит) и геокод
 * с полями МКАД (Clean, платный — 20 коп./адрес, нужен секретный ключ).
 *
 * Правила модуля:
 *   • Токены ТОЛЬКО из env (DADATA_TOKEN, DADATA_SECRET) — на фронт не уходят,
 *     фронт ходит через наш прокси /api/delivery/suggest.
 *   • Любая ошибка сети/статуса/парсинга → null, не исключение: недоступность
 *     DaData не должна ронять checkout (заказ уходит в «уточнит оператор»).
 *   • Suggestions НЕ отдаёт beltway_* (проверено живым токеном) — км от МКАД
 *     даёт только Clean, поэтому verifyAddress ходит именно туда.
 */
import log from './logger'

const SUGGEST_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address'
const CLEAN_URL = 'https://cleaner.dadata.ru/api/v1/clean/address'
const TIMEOUT_MS = 3000

export function dadataConfigured(): boolean {
  return Boolean(process.env.DADATA_TOKEN)
}

export function dadataCleanConfigured(): boolean {
  return Boolean(process.env.DADATA_TOKEN && process.env.DADATA_SECRET)
}

async function dadataPost(url: string, body: unknown, secret: boolean): Promise<unknown | null> {
  const token = process.env.DADATA_TOKEN
  if (!token || (secret && !process.env.DADATA_SECRET)) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Token ${token}`,
        ...(secret ? { 'X-Secret': process.env.DADATA_SECRET as string } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      log.warn('DaData non-OK response', { url, status: res.status })
      return null
    }
    return await res.json()
  } catch (e) {
    log.warn('DaData request failed', { url, error: e instanceof Error ? e.message : String(e) })
    return null
  } finally {
    clearTimeout(timer)
  }
}

export interface AddressSuggestion {
  value: string
  unrestrictedValue: string
}

/** Автоподсказки для прокси. Ошибка → null (фронт покажет пустой список). */
export async function suggestAddress(query: string, count = 5): Promise<AddressSuggestion[] | null> {
  const q = query.trim()
  if (q.length < 3) return []
  const json = await dadataPost(SUGGEST_URL, { query: q.slice(0, 300), count }, false)
  if (!json || typeof json !== 'object') return null
  const list = (json as { suggestions?: Array<{ value?: unknown; unrestricted_value?: unknown }> }).suggestions
  if (!Array.isArray(list)) return null
  return list
    .filter((s) => typeof s?.value === 'string')
    .map((s) => ({ value: s.value as string, unrestrictedValue: String(s.unrestricted_value ?? s.value) }))
}

export interface VerifiedAddress {
  /** Стандартизованный адрес из Clean */
  result: string | null
  geoLat: number | null
  geoLon: number | null
  /** IN_MKAD | OUT_MKAD | IN_KAD | OUT_KAD | null */
  beltwayHit: string | null
  /** Км от кольцевой (только при OUT_*), может быть дробным */
  beltwayDistanceKm: number | null
  /** 0 — точные координаты дома … 5 — не определены */
  qcGeo: number | null
  /** Качество разбора адреса: 0 — уверенно, 1+ — с допущениями */
  qc: number | null
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Серверный геокод поданного адреса через Clean. Ошибка/не настроено → null. */
export async function verifyAddress(address: string): Promise<VerifiedAddress | null> {
  const a = address.trim()
  if (!a) return null
  const json = await dadataPost(CLEAN_URL, [a.slice(0, 500)], true)
  if (!Array.isArray(json) || !json[0] || typeof json[0] !== 'object') return null
  const d = json[0] as Record<string, unknown>
  return {
    result: typeof d.result === 'string' ? d.result : null,
    geoLat: numOrNull(d.geo_lat),
    geoLon: numOrNull(d.geo_lon),
    beltwayHit: typeof d.beltway_hit === 'string' && d.beltway_hit ? d.beltway_hit : null,
    beltwayDistanceKm: numOrNull(d.beltway_distance),
    qcGeo: numOrNull(d.qc_geo),
    qc: numOrNull(d.qc),
  }
}
