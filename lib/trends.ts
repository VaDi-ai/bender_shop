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
  const modelSet = new Set<string>()
  for (const p of products) {
    modelSet.add(p.name)
  }
  const modelsList = [...modelSet].sort().slice(0, 200).join('\n')

  try {
    const response = await client.chat.completions.create({
      model: 'perplexity/sonar',
      messages: [{
        role: 'user',
        content: `Проанализируй текущие тренды продаж электроники в России.

Наши категории: ${ourCategories.join(', ')}
Наши бренды: ${ourBrands.join(', ')}

Наши модели:
${modelsList}

Задачи:
1. Отсортируй категории по актуальному спросу в России
2. Отсортируй бренды по актуальной популярности в России (по выручке, не по количеству)
3. Выбери 10 самых востребованных моделей из НАШЕГО списка для блока "Хит продаж" — флагманы и бестселлеры

Ответь СТРОГО в JSON без markdown:
{"categories": [...все наши категории в порядке популярности...], "brands": [...все наши бренды...], "featuredProducts": ["точное название модели 1", ...], "reasoning": "краткое объяснение на русском"}`,
      }],
      max_tokens: 800,
    })

    const text = response.choices[0]?.message?.content?.trim() ?? ''
    const jsonStr = text.replace(/```json\s*|```/g, '').trim()
    const parsed = JSON.parse(jsonStr)

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
