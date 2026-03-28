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
  ram: string | null
  color: string | null
  country: string | null
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
    ram: z.string().nullable().optional().default(null),
    color: z.string().nullable(),
    country: z.string().nullable(),
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
      model: 'anthropic/claude-haiku-4.5',
      messages: [
        {
          role: 'user',
          content: `Распарси список товаров от поставщика техники. Верни ТОЛЬКО валидный JSON массив, без пояснений.

Текст:
${text}

Формат каждого элемента:
{
  "model": "точное название модели например iPhone 17 Pro или MacBook Air M4",
  "storage": "объём хранилища например 256GB или 1TB или null (только storage, НЕ RAM)",
  "ram": "объём оперативной памяти например 8GB или 24GB или null (для ноутбуков, десктопов, планшетов)",
  "color": "цвет на английском например Silver или null",
  "country": "код страны HK/EU/IN/CN/US/AE/TH/KZ/ID или null если не указан (определять по флагу 🇭🇰=HK, 🇪🇺=EU, 🇮🇳=IN, 🇨🇳=CN, 🇺🇸=US, 🇦🇪=AE, 🇹🇭=TH, 🇰🇿=KZ, 🇮🇩=ID)",
  "simType": "тип SIM например 1 Sim+eSim или null",
  "price": число без пробелов и символов валюты,
  "rawLine": "оригинальная строка"
}

Правила:
- Точки в числах это разделители тысяч: 122.000 = 122000
- Пробелы в числах тоже разделители тысяч: 112 800 = 112800
- "От 1 шт - 51 500" — цена = 51500
- Артикулы в скобках (SM-S948B) — не включать в model
- "24gb 1Tb" или "24/1TB" — ram="24GB", storage="1TB" (меньшее число = RAM, большее = storage)
- Для телефонов ram обычно null (если только одно число — это storage)
- 🏎️ и другие эмодзи кроме флагов стран — игнорировать
- Если строка не содержит товар и цену — пропустить
- Верни только JSON массив []`,
        },
      ],
      max_tokens: 4000,
    })

    const content = response.choices[0]?.message?.content ?? '[]'
    const clean = content.replace(/```json|```/g, '').trim()
    let jsonStr = clean
    if (!jsonStr.endsWith(']')) {
      const lastBrace = jsonStr.lastIndexOf('}')
      if (lastBrace > 0) {
        jsonStr = jsonStr.slice(0, lastBrace + 1) + ']'
      }
    }
    const result = JSON.parse(jsonStr)
    const parsed = AIParsedProductSchema.safeParse(result)
    if (!parsed.success) {
      console.error('AI parser: schema validation failed (products):', parsed.error.message)
      return []
    }
    return parsed.data
  } catch (err) {
    console.error('AI parser: parseSupplierMessage error:', err)
    notifyAdminsAboutApiError(err, 'Парсинг прайса поставщика').catch((e) => console.error('[ai-parser] notify error:', e))
    return []
  }
}

// ─── Парсинг курсов валют из произвольного текста ─────────────────────────────

export async function parseCurrencyRates(text: string): Promise<AIParsedRate[]> {
  try {
    const response = await client.chat.completions.create({
      model: 'anthropic/claude-haiku-4.5',
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
    notifyAdminsAboutApiError(err, 'Парсинг курсов валют').catch((e) => console.error('[ai-parser] notify error:', e))
    return []
  }
}
