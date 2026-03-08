/**
 * lib/currency.ts — Курсы валют и привязка регион → валюта
 */

import https from 'https'
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

/** Загружает уникальные коды валют из активных регионов БД. */
export async function getActiveCurrencies(): Promise<string[]> {
  try {
    const regions = await prisma.region.findMany({ where: { isActive: true } })
    const codes = [...new Set(regions.map((r) => r.currency))]
    return codes.length ? codes : ['HKD', 'EUR', 'CNY', 'USD', 'INR']
  } catch {
    return ['HKD', 'EUR', 'CNY', 'USD', 'INR']
  }
}

/** Загружает маппинг регион → валюта из БД. */
export async function getRegionCurrencyMap(): Promise<Record<string, string>> {
  try {
    const regions = await prisma.region.findMany({ where: { isActive: true } })
    return Object.fromEntries(regions.map((r) => [r.code, r.currency]))
  } catch {
    return { HK: 'HKD', EU: 'EUR', IN: 'INR', RU: 'RUB', US: 'USD', CN: 'CNY' }
  }
}

/** Курсы валют с ЦБ РФ. Ключ — ISO-код, значение — рублей за 1 единицу. */
export async function fetchCurrencyRates(): Promise<Record<string, number>> {
  return new Promise((resolve, reject) => {
    https.get('https://www.cbr-xml-daily.ru/daily_json.js', (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try {
          const data = JSON.parse(body)
          const rates: Record<string, number> = { RUB: 1 }
          const valute = data.Valute as Record<string, { Value: number; Nominal: number }>
          for (const [code, info] of Object.entries(valute)) {
            rates[code] = info.Value / info.Nominal
          }
          resolve(rates)
        } catch (e) {
          reject(e)
        }
      })
      res.on('error', reject)
    }).on('error', reject)
  })
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
  const allRates = await fetchCurrencyRates()
  const currencies = await getActiveCurrencies()
  const changes: CurrencyChange[] = []

  for (const currency of currencies) {
    if (currency === 'RUB') continue
    const newRate = allRates[currency]
    if (!newRate) continue

    const existing = await prisma.currencyRate.findUnique({ where: { currency } })
    const previousRate = existing ? Number(existing.rate) : newRate

    await prisma.currencyRate.upsert({
      where: { currency },
      create: { currency, rate: newRate, previousRate: null },
      update: { previousRate: previousRate, rate: newRate },
    })

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
