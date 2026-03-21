/**
 * lib/enrich.ts
 *
 * Автообогащение карточек товаров: description + specs из интернета.
 * Использует Perplexity/Sonar через OpenRouter для поиска характеристик.
 */

import OpenAI from 'openai'
import { prisma } from './prisma'
import { getApiKeyValue } from './api-key-store'

let _enrichClient: OpenAI | null = null

async function getEnrichClient(): Promise<OpenAI> {
  if (_enrichClient) return _enrichClient
  const dbKey = await getApiKeyValue('openrouter_key')
  const apiKey = dbKey || process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set')
  _enrichClient = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey })
  return _enrichClient
}

/**
 * Обогащает одну карточку товара.
 * Заполняет description и specs если они пустые.
 * Возвращает true если данные были обновлены.
 */
export async function enrichProductCard(productId: number, force = false): Promise<boolean> {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) return false

  if (!force && product.description && product.specs) {
    console.log(`[Enrich] ${product.name}: already enriched, skipping`)
    return false
  }

  console.log(`[Enrich] Fetching specs for "${product.name}"...`)

  try {
    const client = await getEnrichClient()

    const specsResponse = await client.chat.completions.create({
      model: 'perplexity/sonar',
      messages: [{
        role: 'user',
        content: `Найди полные технические характеристики для: ${product.name}.
Верни ТОЛЬКО JSON без пояснений и markdown. Формат:
{
  "description": "Краткое описание товара на русском, 2-3 предложения для интернет-магазина, без рекламы",
  "specs": {
    "Процессор": "значение",
    "Экран": "значение",
    "Оперативная память": "значение",
    "Встроенная память": "значение",
    "Основная камера": "значение",
    "Фронтальная камера": "значение",
    "Аккумулятор": "значение",
    "ОС": "значение",
    "Размеры": "значение",
    "Вес": "значение",
    "Разъём": "значение",
    "Защита": "значение"
  }
}
Если характеристика неизвестна — не включай её. Для не-телефонов адаптируй поля (ноутбуки — CPU/GPU/RAM/SSD/Экран/Вес, наушники — тип/драйверы/автономность, часы — экран/чипсет/автономность/водозащита и т.д.).
Описание пиши как для карточки товара — коротко, информативно, по-русски.`,
      }],
      max_tokens: 2000,
    })

    const rawText = specsResponse.choices[0]?.message?.content?.trim() ?? ''
    if (!rawText) {
      console.warn(`[Enrich] ${product.name}: empty response from Perplexity`)
      return false
    }

    let parsed: { description?: string; specs?: Record<string, string> }
    let cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    // Fix truncated JSON — trim to last closing brace
    if (!cleaned.endsWith('}')) {
      const lastBrace = cleaned.lastIndexOf('}')
      if (lastBrace > 0) {
        cleaned = cleaned.slice(0, lastBrace + 1)
      }
    }

    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.warn(`[Enrich] ${product.name}: failed to parse JSON, raw: ${rawText.slice(0, 300)}`)
      // Try to extract at least description
      const descMatch = cleaned.match(/"description"\s*:\s*"([^"]+)/)
      if (descMatch) {
        parsed = { description: descMatch[1] }
      } else {
        return false
      }
    }

    const description = typeof parsed.description === 'string' ? parsed.description.slice(0, 1000) : null
    const specs = parsed.specs && typeof parsed.specs === 'object' ? parsed.specs : null

    if (!description && !specs) {
      console.warn(`[Enrich] ${product.name}: no usable data in response`)
      return false
    }

    const updateData: Record<string, any> = {}
    if (description && (force || !product.description)) {
      updateData.description = description
    }
    if (specs && (force || !product.specs)) {
      const cleanSpecs: Record<string, string> = {}
      for (const [key, val] of Object.entries(specs)) {
        if (val && typeof val === 'string' && val.trim().length > 0) {
          cleanSpecs[key] = val.trim()
        }
      }
      if (Object.keys(cleanSpecs).length > 0) {
        updateData.specs = cleanSpecs
      }
    }

    if (Object.keys(updateData).length === 0) {
      console.log(`[Enrich] ${product.name}: nothing to update`)
      return false
    }

    await prisma.product.update({
      where: { id: productId },
      data: updateData,
    })

    const specCount = updateData.specs ? Object.keys(updateData.specs as object).length : 0
    console.log(`[Enrich] ${product.name}: updated (description: ${!!updateData.description}, specs: ${specCount} fields)`)
    return true
  } catch (err) {
    console.error(`[Enrich] ${product.name}: error:`, err)
    return false
  }
}

/**
 * Обогащает все товары без description или specs.
 * Обрабатывает батчами с паузой чтобы не перегрузить API.
 */
export async function enrichAllProducts(force = false): Promise<{ total: number; enriched: number; failed: number }> {
  const where = force
    ? {}
    : { OR: [{ description: null }, { description: '' }, { specs: { equals: null as any } }] }

  const products = await prisma.product.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`[Enrich] Found ${products.length} products to enrich`)

  let enriched = 0
  let failed = 0

  for (const product of products) {
    try {
      const success = await enrichProductCard(product.id, force)
      if (success) enriched++
      else failed++
    } catch {
      failed++
    }

    // Пауза 2 секунды между запросами (rate limit Perplexity)
    await new Promise(r => setTimeout(r, 2000))
  }

  console.log(`[Enrich] Done: ${enriched} enriched, ${failed} failed out of ${products.length}`)
  return { total: products.length, enriched, failed }
}
