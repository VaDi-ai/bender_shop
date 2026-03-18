/**
 * lib/currency.ts — Курсы валют и привязка регион → валюта
 */

import { prisma } from './prisma'

/** Статические флаги для UI (дополняются данными из БД) */
export const CURRENCY_FLAGS: Record<string, string> = {
  HKD: '🇭🇰', EUR: '🇪🇺', INR: '🇮🇳', RUB: '🇷🇺', USD: '🇺🇸', CNY: '🇨🇳',
  GBP: '🇬🇧', JPY: '🇯🇵', AUD: '🇦🇺', TRY: '🇹🇷', AED: '🇦🇪', KZT: '🇰🇿',
  AZN: '🇦🇿', THB: '🇹🇭', SGD: '🇸🇬',
}

const CURRENCY_NAMES: Record<string, string> = {
  HKD: 'Гонконгский доллар', EUR: 'Евро', INR: 'Индийская рупия',
  RUB: 'Российский рубль', USD: 'Доллар США', CNY: 'Юань',
  GBP: 'Фунт стерлингов', JPY: 'Японская иена', AED: 'Дирхам ОАЭ',
}

/** Популярные валюты для быстрого выбора при ручном добавлении */
export const POPULAR_CURRENCIES = [
  { code: 'USD', flag: '🇺🇸', name: 'Доллар США' },
  { code: 'EUR', flag: '🇪🇺', name: 'Евро' },
  { code: 'CNY', flag: '🇨🇳', name: 'Юань' },
  { code: 'HKD', flag: '🇭🇰', name: 'Гонконгский доллар' },
  { code: 'GBP', flag: '🇬🇧', name: 'Фунт стерлингов' },
  { code: 'JPY', flag: '🇯🇵', name: 'Японская иена' },
  { code: 'KRW', flag: '🇰🇷', name: 'Вон' },
  { code: 'INR', flag: '🇮🇳', name: 'Индийская рупия' },
  { code: 'TRY', flag: '🇹🇷', name: 'Турецкая лира' },
  { code: 'AED', flag: '🇦🇪', name: 'Дирхам ОАЭ' },
  { code: 'THB', flag: '🇹🇭', name: 'Тайский бат' },
  { code: 'SGD', flag: '🇸🇬', name: 'Сингапурский доллар' },
  { code: 'KZT', flag: '🇰🇿', name: 'Тенге' },
  { code: 'AZN', flag: '🇦🇿', name: 'Манат' },
  { code: 'GEL', flag: '🇬🇪', name: 'Лари' },
  { code: 'BRL', flag: '🇧🇷', name: 'Бразильский реал' },
] as const

/** Известные коды валют для валидации ручного ввода */
export const KNOWN_CURRENCY_CODES = new Set([
  'USD','EUR','GBP','JPY','CNY','HKD','INR','TRY','AED','THB',
  'SGD','KZT','AZN','GEL','BRL','KRW','CHF','CAD','AUD','NZD',
  'PLN','CZK','SEK','NOK','DKK','HUF','RON','BGN','IDR','MYR',
  'PHP','VND','EGP','ZAR','UAH','BYN','UZS','AMD','MDL','TJS',
])

/** Загружает уникальные коды валют из активных регионов БД. */
export async function getActiveCurrencies(): Promise<string[]> {
  try {
    const regions = await prisma.region.findMany({ where: { isActive: true } })
    const codes = [...new Set(regions.map((r) => r.currency))]
    return codes.length ? codes : ['HKD', 'EUR', 'CNY', 'USD', 'INR']
  } catch { /* ignore: fallback to defaults if DB unavailable */
    return ['HKD', 'EUR', 'CNY', 'USD', 'INR']
  }
}

/** Загружает маппинг регион → валюта из БД. */
export async function getRegionCurrencyMap(): Promise<Record<string, string>> {
  try {
    const regions = await prisma.region.findMany({ where: { isActive: true } })
    return Object.fromEntries(regions.map((r) => [r.code, r.currency]))
  } catch { /* ignore: fallback to defaults if DB unavailable */
    return { HK: 'HKD', EU: 'EUR', IN: 'INR', RU: 'RUB', US: 'USD', CN: 'CNY' }
  }
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

/** Округление цены вверх до ближайшего круглого числа */
export function roundPrice(price: number): number {
  if (price < 10000) return Math.ceil(price / 100) * 100
  if (price < 50000) return Math.ceil(price / 500) * 500
  return Math.ceil(price / 1000) * 1000
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
 * Обновляет курсы валют активных регионов в БД (модель CurrencyRate).
 * Сохраняет предыдущий курс в previousRate.
 * Возвращает массив изменений по каждой валюте.
 */
export async function updateCurrencyRates(): Promise<CurrencyChange[]> {
  let allRates: Record<string, number>
  try {
    allRates = await fetchCurrencyRates()
  } catch (err) {
    console.error('[currency] fetchCurrencyRates failed:', err)
    return []
  }

  const currencies = await getActiveCurrencies()
  const activeCurrencies = currencies.filter((c) => c !== 'RUB')

  // Pre-fetch all existing rates in one query — O(1) lookup
  const existingRates = await prisma.currencyRate.findMany({
    where: { currency: { in: activeCurrencies } },
  })
  const existingMap = new Map(existingRates.map((r) => [r.currency, r]))

  const changes: CurrencyChange[] = []

  // Execute all upserts in a single transaction
  await prisma.$transaction(async (tx) => {
    const ops: Promise<unknown>[] = []

    for (const currency of activeCurrencies) {
      const newRate = allRates[currency]
      if (!newRate) continue

      const existing = existingMap.get(currency)
      const previousRate = existing ? Number(existing.rate) : newRate

      ops.push(
        tx.currencyRate.upsert({
          where: { currency },
          create: { currency, rate: newRate, previousRate: null },
          update: { previousRate: previousRate, rate: newRate },
        }),
      )

      const diff = newRate - previousRate
      const changePercent = previousRate !== 0
        ? ((diff / previousRate) * 100).toFixed(2)
        : '0.00'
      const direction: 'up' | 'down' | 'same' =
        diff > 0.001 ? 'up' : diff < -0.001 ? 'down' : 'same'

      changes.push({
        currency,
        flag: CURRENCY_FLAGS[currency] ?? '',
        name: CURRENCY_NAMES[currency] ?? currency,
        previousRate,
        newRate,
        changePercent,
        direction,
      })
    }

    await Promise.all(ops)
  })

  return changes
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
