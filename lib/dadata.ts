/**
 * DaData Suggestions: автоподсказки адреса для чекаута и серверный геокод
 * поданного адреса (регион + координаты). Только бесплатный Suggestions —
 * платный Clean (beltway_* / км от МКАД) упрощённой модели доставки не нужен.
 *
 * Правила модуля:
 *   • Токен ТОЛЬКО из env (DADATA_TOKEN) — на фронт не уходит, фронт ходит
 *     через наш прокси /api/delivery/suggest. Секретный ключ не требуется.
 *   • Любая ошибка сети/статуса/парсинга → null, не исключение: недоступность
 *     DaData не должна ронять checkout (заказ уходит в «уточнит оператор»).
 *   • Suggestions отдаёт регион (region_kladr_id), fias_level, координаты и
 *     qc_geo, но НЕ отдаёт qc и beltway_* — проверено живым токеном 2026-08-22.
 */
import log from './logger'

const SUGGEST_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address'
const TIMEOUT_MS = 3000

export function dadataConfigured(): boolean {
  return Boolean(process.env.DADATA_TOKEN)
}

async function dadataPost(url: string, body: unknown): Promise<unknown | null> {
  const token = process.env.DADATA_TOKEN
  if (!token) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Token ${token}`,
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

interface RawSuggestion {
  value?: unknown
  unrestricted_value?: unknown
  data?: Record<string, unknown>
}

/** Сырой список подсказок; ошибка → null. */
async function fetchSuggestions(query: string, count: number): Promise<RawSuggestion[] | null> {
  const json = await dadataPost(SUGGEST_URL, { query: query.slice(0, 300), count })
  if (!json || typeof json !== 'object') return null
  const list = (json as { suggestions?: unknown }).suggestions
  if (!Array.isArray(list)) return null
  return list.filter((s): s is RawSuggestion => Boolean(s) && typeof s === 'object' && typeof s.value === 'string')
}

export interface AddressSuggestion {
  value: string
  unrestrictedValue: string
}

/** Автоподсказки для прокси. Ошибка → null (фронт покажет пустой список). */
export async function suggestAddress(query: string, count = 5): Promise<AddressSuggestion[] | null> {
  const q = query.trim()
  if (q.length < 3) return []
  const list = await fetchSuggestions(q, count)
  if (!list) return null
  return list.map((s) => ({ value: s.value as string, unrestrictedValue: String(s.unrestricted_value ?? s.value) }))
}

export interface VerifiedAddress {
  /** Стандартизованный адрес (value первой подсказки) */
  result: string | null
  /** КЛАДР-код региона, 13 цифр: «77…» — Москва (с Зеленоградом и ТиНАО), «50…» — Московская обл. */
  regionKladrId: string | null
  /** «г Москва», «Московская обл» — для уведомлений оператору */
  regionWithType: string | null
  /** Уровень детализации ФИАС: 7 — улица, 8 — дом, 1 — только регион … null — не разобран */
  fiasLevel: number | null
  geoLat: number | null
  geoLon: number | null
  /** 0 — точные координаты дома … 5 — не определены */
  qcGeo: number | null
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/**
 * Серверный геокод поданного адреса: первая подсказка Suggestions.
 * Ошибка/не настроено/подсказок нет → null.
 */
export async function verifyAddress(address: string): Promise<VerifiedAddress | null> {
  const a = address.trim()
  if (!a) return null
  const list = await fetchSuggestions(a.slice(0, 500), 1)
  if (!list || !list[0]) return null
  const d = (list[0].data && typeof list[0].data === 'object' ? list[0].data : {}) as Record<string, unknown>
  return {
    result: strOrNull(list[0].value),
    regionKladrId: strOrNull(d.region_kladr_id),
    regionWithType: strOrNull(d.region_with_type),
    fiasLevel: numOrNull(d.fias_level),
    geoLat: numOrNull(d.geo_lat),
    geoLon: numOrNull(d.geo_lon),
    qcGeo: numOrNull(d.qc_geo),
  }
}
