/**
 * lib/currency.ts — Курс USD и корректировка цен
 */

import { prisma } from './prisma'
import log from './logger'

/** Статические флаги для UI */
export const CURRENCY_FLAGS: Record<string, string> = { USD: '🇺🇸' }

const CURRENCY_NAMES: Record<string, string> = { USD: 'Доллар США' }

/** Возвращает список отслеживаемых валют (только USD). */
export async function getActiveCurrencies(): Promise<string[]> {
  return ['USD']
}

/** Курсы валют с ЦБ РФ. Ключ — ISO-код, значение — рублей за 1 единицу. */
export async function fetchCurrencyRates(): Promise<Record<string, number>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch('https://www.cbr-xml-daily.ru/daily_json.js', {
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`CBR HTTP ${res.status}`)
    const data = (await res.json()) as { Valute: Record<string, { Value: number; Nominal: number }> }
    const rates: Record<string, number> = { RUB: 1 }
    for (const [code, info] of Object.entries(data.Valute)) {
      rates[code] = info.Value / info.Nominal
    }
    return rates
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Округление цены: ВВЕРХ до 100 — единое для всех цен (решение владельца,
 * 2026-08). Ступени 500/1000 и стиль «…90» убраны: 122 550 → 122 600,
 * 9 990 → 10 000. Вверх — чтобы не занижать розницу.
 */
export function roundPrice(price: number): number {
  if (price <= 0) return 0
  return Math.ceil(price / 100) * 100
}

export type CurrencyChange = {
  currency: string
  flag: string
  name: string
  previousRate: number
  newRate: number
  changePercent: string
  direction: 'up' | 'down' | 'same'
}

/**
 * Обновляет курс USD в БД (модель CurrencyRate).
 * Сохраняет предыдущий курс в previousRate.
 * Возвращает массив изменений.
 */
export async function updateCurrencyRates(): Promise<CurrencyChange[]> {
  let allRates: Record<string, number>
  try {
    allRates = await fetchCurrencyRates()
  } catch (err) {
    log.error('[currency] fetchCurrencyRates failed', { err: err instanceof Error ? err.message : String(err) })
    return []
  }

  const usdRate = allRates['USD']
  if (!usdRate) return []

  const existing = await prisma.currencyRate.findUnique({ where: { currency: 'USD' } })
  const previousRate = existing ? Number(existing.rate) : usdRate

  await prisma.currencyRate.upsert({
    where: { currency: 'USD' },
    create: { currency: 'USD', rate: usdRate },
    update: { previousRate, rate: usdRate },
  })

  const diff = usdRate - previousRate
  const changePercent = previousRate !== 0
    ? ((diff / previousRate) * 100).toFixed(2)
    : '0.00'
  const direction: 'up' | 'down' | 'same' =
    diff > 0.001 ? 'up' : diff < -0.001 ? 'down' : 'same'

  return [{
    currency: 'USD',
    flag: '🇺🇸',
    name: 'Доллар США',
    previousRate,
    newRate: usdRate,
    changePercent,
    direction,
  }]
}

/** Загружает сохранённые курсы из БД */
export async function getSavedRates(): Promise<CurrencyChange[]> {
  const records = await prisma.currencyRate.findMany({ orderBy: { currency: 'asc' } })
  return records.map((r) => {
    const prev = r.previousRate ? Number(r.previousRate) : Number(r.rate)
    const curr = Number(r.rate)
    const diff = curr - prev
    const changePercent = prev !== 0 ? ((diff / prev) * 100).toFixed(2) : '0.00'
    const direction: 'up' | 'down' | 'same' =
      diff > 0.001 ? 'up' : diff < -0.001 ? 'down' : 'same'
    return {
      currency: r.currency,
      flag: CURRENCY_FLAGS[r.currency] ?? '',
      name: CURRENCY_NAMES[r.currency] ?? r.currency,
      previousRate: prev,
      newRate: curr,
      changePercent,
      direction,
    }
  })
}
