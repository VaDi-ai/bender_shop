/**
 * lib/ai-parser.ts — AI-парсинг через OpenRouter (Claude)
 */

import OpenAI from 'openai'
import { z } from 'zod'
import { notifyAdminsAboutApiError } from './notify-admins'

let client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})

export function reinitClient(newKey: string): void {
  client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: newKey })
}

export type AIParsedProduct = {
  model: string
  storage: string | null
  color: string | null
  region: string | null
  simType: string | null
  price: number
  rawLine: string
}

export type AIParsedRate = {
  currency: string
  rate: number
  rawLine: string
}

const AIParsedProductSchema = z.array(
  z.object({
    model: z.string(),
    storage: z.string().nullable(),
    color: z.string().nullable(),
    region: z.string().nullable(),
    simType: z.string().nullable(),
    price: z.number(),
    rawLine: z.string(),
  }),
)

const AIParsedRateSchema = z.array(
  z.object({
    currency: z.string(),
    rate: z.number(),
    rawLine: z.string(),
  }),
)

// ─── Парсинг сообщения поставщика ─────────────────────────────────────────────

export async function parseSupplierMessage(text: string): Promise<AIParsedProduct[]> {
  try {
    const response = await client.chat.completions.create({
      model: 'anthropic/claude-sonnet-4-5',
      messages: [
        {
          role: 'user',
          content: `Распарси список товаров от поставщика техники. Верни ТОЛЬКО валидный JSON массив, без пояснений.

Текст:
${text}

Формат каждого элемента:
{
  "model": "точное название модели например iPhone 17 Pro или MacBook Air M4",
  "storage": "объём памяти например 256 ГБ или 1 ТБ или null",
  "color": "цвет на английском например Silver или null",
  "region": "регион HK/EU/IN/RU/CN или null если не указан",
  "simType": "тип SIM например 1 Sim+eSim или null",
  "price": число без пробелов и символов валюты,
  "rawLine": "оригинальная строка"
}

Правила:
- Точки в числах это разделители тысяч: 122.000 = 122000
- Флаги эмодзи: 🇭🇰=HK, 🇪🇺=EU, 🇮🇳=IN, 🇷🇺=RU, 🇨🇳=CN
- Если строка не содержит товар и цену — пропустить
- Верни только JSON массив []`,
        },
      ],
      max_tokens: 2000,
    })

    const content = response.choices[0]?.message?.content ?? '[]'
    const clean = content.replace(/```json|```/g, '').trim()
    const result = JSON.parse(clean)
    const parsed = AIParsedProductSchema.safeParse(result)
    if (!parsed.success) {
      console.error('AI parser: schema validation failed (products):', parsed.error.message)
      return []
    }
    return parsed.data
  } catch (err) {
    console.error('AI parser: parseSupplierMessage error:', err)
    notifyAdminsAboutApiError(err, 'Парсинг прайса поставщика').catch(() => {})
    return []
  }
}

// ─── Парсинг курсов валют из произвольного текста ─────────────────────────────

export async function parseCurrencyRates(text: string): Promise<AIParsedRate[]> {
  try {
    const response = await client.chat.completions.create({
      model: 'anthropic/claude-sonnet-4-5',
      messages: [
        {
          role: 'user',
          content: `Извлеки курсы валют из текста. Верни ТОЛЬКО валидный JSON массив.

Текст:
${text}

Формат:
{
  "currency": "код валюты USD/EUR/CNY/HKD/INR/etc",
  "rate": курс к рублю как число,
  "rawLine": "оригинальная строка"
}

Правила:
- Если написано "1 USD = 92.5 руб" → rate: 92.5
- Если написано "100 INR = 108 руб" → rate: 1.08 (делить на номинал)
- Если просто число после названия валюты — это курс к рублю
- Верни только JSON массив []`,
        },
      ],
      max_tokens: 500,
    })

    const content = response.choices[0]?.message?.content ?? '[]'
    const clean = content.replace(/```json|```/g, '').trim()
    const result = JSON.parse(clean)
    const parsed = AIParsedRateSchema.safeParse(result)
    if (!parsed.success) {
      console.error('AI parser: schema validation failed (rates):', parsed.error.message)
      return []
    }
    return parsed.data
  } catch (err) {
    console.error('AI parser: parseCurrencyRates error:', err)
    notifyAdminsAboutApiError(err, 'Парсинг курсов валют').catch(() => {})
    return []
  }
}
