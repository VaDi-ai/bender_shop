/**
 * lib/trends.ts — AI-анализ трендов для обновления фильтрации и хитов
 */
import OpenAI from 'openai'
import { prisma } from './prisma'
import { getApiKeyValue, setApiKeyValue } from './api-key-store'

export interface TrendsData {
  categories: string[]
  brands: string[]
  featuredProducts: string[]
  updatedAt: string
  reasoning: string
}

export async function getCurrentTrends(): Promise<TrendsData | null> {
  const raw = await getApiKeyValue('trends_data')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export async function saveTrends(data: TrendsData): Promise<void> {
  await setApiKeyValue('trends_data', JSON.stringify(data))
}

/**
 * Apply featured products from AI trends to DB with fuzzy matching + fallback.
 * Returns the number of products marked as featured.
 */
export async function applyFeaturedProducts(names: string[]): Promise<number> {
  await prisma.product.updateMany({ where: { isFeatured: true }, data: { isFeatured: false } })

  let count = 0
  for (const name of names.slice(0, 10)) {
    // Exact match
    let p = await prisma.product.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, isAvailable: true },
    })
    // Partial match
    if (!p) {
      p = await prisma.product.findFirst({
        where: { name: { contains: name, mode: 'insensitive' }, isAvailable: true },
      })
    }
    // First 3 words match
    if (!p) {
      const shortName = name.split(' ').slice(0, 3).join(' ')
      if (shortName.length >= 5) {
        p = await prisma.product.findFirst({
          where: { name: { contains: shortName, mode: 'insensitive' }, isAvailable: true },
        })
      }
    }
    if (p) {
      await prisma.product.update({ where: { id: p.id }, data: { isFeatured: true } })
      count++
    }
  }

  // Fallback: if fewer than 5 matched, fill from popular product names
  if (count < 5) {
    const FALLBACK_HITS = [
      'Iphone 17 Pro Max', 'Samsung Galaxy S26 Ultra', 'Macbook Air M5',
      'Airpods Pro 3', 'Apple Watch Ultra', 'Ipad Pro',
      'Sony Playstation 5', 'Samsung Galaxy S26', 'Iphone 17 Pro', 'Mac Mini M4',
    ]
    for (const name of FALLBACK_HITS) {
      if (count >= 10) break
      const p = await prisma.product.findFirst({
        where: { name: { contains: name, mode: 'insensitive' }, isFeatured: false, isAvailable: true },
      })
      if (p) {
        await prisma.product.update({ where: { id: p.id }, data: { isFeatured: true } })
        count++
      }
    }
  }

  return count
}

export async function fetchTrendsFromAI(): Promise<TrendsData | null> {
  const dbKey = await getApiKeyValue('openrouter_key')
  const apiKey = dbKey || process.env.OPENROUTER_API_KEY
  if (!apiKey) return null

  const client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey })

  const ourCategories = ['Телефоны', 'Планшеты', 'Ноутбуки', 'Аудио', 'Телевизоры', 'Часы', 'Desktop', 'Игровые консоли', 'Умный дом', 'Гаджеты', 'Аксессуары', 'Красота и уход', 'Фототехника', 'Экшн-камеры', 'Дисплеи', 'Дроны']
  const ourBrands = ['Apple', 'Samsung', 'Sony', 'Xiaomi', 'JBL', 'Dyson', 'LG', 'Garmin', 'DJI', 'Google', 'Huawei', 'Beats', 'Marshall', 'Honor', 'Poco', 'OnePlus', 'Yandex', 'Ray-Ban', 'Nintendo', 'Fujifilm', 'Hisense', 'Insta360', 'Oakley', 'Canon', 'GoPro', 'Meta', 'Bowers & Wilkins', 'Medicube', 'Plaud', 'Whoop', 'Microsoft', 'Valve', 'Asus']

  // Краткий список моделей (без дублей цветов)
  const products = await prisma.product.findMany({
    where: { isAvailable: true },
    select: { name: true },
  })
  // Группируем по модели с количеством вариантов
  const modelCount = new Map<string, number>()
  for (const p of products) {
    modelCount.set(p.name, (modelCount.get(p.name) || 0) + 1)
  }
  const modelsList = [...modelCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 150)
    .map(([name, count]) => `${name} (${count} вариантов)`)
    .join('\n')

  const promptText = `Вот модели в нашем магазине электроники Bender Shop (Москва, ТЦ Горбушка) с количеством вариантов:
${modelsList}

Наши категории: ${ourCategories.join(', ')}
Наши бренды: ${ourBrands.join(', ')}

Задачи:
1. Отсортируй категории по актуальному спросу в России
2. Отсортируй бренды по актуальной популярности в России (по выручке)
3. Выбери РОВНО 10 самых востребованных моделей для блока "Хит продаж"

ПРАВИЛА:
- Выбирай ТОЛЬКО из нашего списка выше — не придумывай модели
- Предпочитай НОВЕЙШИЕ версии: iPhone 17 Pro Max вместо iPhone 16, AirPods Pro 3 вместо Pro 2, Galaxy S26 вместо S25
- Выбирай ФЛАГМАНЫ и БЕСТСЕЛЛЕРЫ — то что люди чаще всего ищут
- Разнообразие: не больше 3 товаров одного бренда
- Названия ТОЧНО как в нашем списке (без добавления цвета/памяти)

Ответь СТРОГО в JSON без markdown:
{"categories": [...все наши категории в порядке популярности...], "brands": [...все наши бренды...], "featuredProducts": ["точное название модели 1", ...], "reasoning": "краткое объяснение на русском"}`

  const systemMsg = 'You are a JSON API. You MUST respond with valid JSON only. No markdown, no explanations, no preamble. Only a JSON object.'

  function parseResponse(text: string) {
    const jsonStr = text.replace(/```json\s*|```/g, '').trim()
    return JSON.parse(jsonStr)
  }

  try {
    // Attempt 1: Perplexity Sonar
    const response = await client.chat.completions.create({
      model: 'perplexity/sonar',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: promptText },
      ],
      max_tokens: 800,
    })

    const text = response.choices[0]?.message?.content?.trim() ?? ''
    let parsed: { categories?: string[]; brands?: string[]; featuredProducts?: string[]; reasoning?: string }

    try {
      parsed = parseResponse(text)
    } catch {
      console.warn('[Trends] Perplexity returned non-JSON, retrying with Claude:', text.slice(0, 100))

      // Attempt 2: Claude Sonnet (more reliable for JSON)
      const retryResponse = await client.chat.completions.create({
        model: 'anthropic/claude-sonnet-4',
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: promptText },
        ],
        max_tokens: 800,
      })
      const retryText = retryResponse.choices[0]?.message?.content?.trim() ?? ''
      parsed = parseResponse(retryText)
    }

    return {
      categories: parsed.categories || ourCategories,
      brands: parsed.brands || ourBrands,
      featuredProducts: parsed.featuredProducts || [],
      updatedAt: new Date().toISOString(),
      reasoning: parsed.reasoning || '',
    }
  } catch (err) {
    console.error('[Trends] AI fetch error:', err)
    return null
  }
}
