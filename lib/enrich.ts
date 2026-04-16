/**
 * lib/enrich.ts
 *
 * Автообогащение карточек товаров: description + specs из интернета.
 * Использует Perplexity/Sonar через OpenRouter для поиска характеристик.
 */

import OpenAI from 'openai'
import { prisma } from './prisma'
import { getApiKeyValue } from './api-key-store'
import log from './logger'

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
export async function enrichProductCard(productId: number, force = false, preloaded?: { id: number; name: string; description: string | null; specs: any; attributes: any }): Promise<boolean> {
  const product = preloaded ?? await prisma.product.findUnique({ where: { id: productId } })
  if (!product) return false

  const hasDescription = !!product.description
  const hasSpecs = product.specs && typeof product.specs === 'object' && Object.keys(product.specs as object).length > 0
  if (!force && hasSpecs) {
    log.debug('Enrich skipped, specs already filled', { product: product.name })
    return false
  }

  log.info('Fetching specs', { product: product.name })

  try {
    const client = await getEnrichClient()

    const existingAttrKeys = product.attributes ? Object.keys(product.attributes as Record<string, any>) : []
    const attrHint = existingAttrKeys.length > 0
      ? `\nНЕ включай в specs характеристики которые уже есть как атрибуты выбора: ${existingAttrKeys.join(', ')}.`
      : ''

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
Описание пиши как для карточки товара — коротко, информативно, по-русски.${attrHint}`,
      }],
      max_tokens: 2000,
    })

    const rawText = specsResponse.choices[0]?.message?.content?.trim() ?? ''
    if (!rawText) {
      log.warn('Enrich empty response from Perplexity', { product: product.name })
      return false
    }

    let parsed: { description?: string; specs?: Record<string, string> }
    let cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    // Fix truncated JSON — trim to last value end and close braces
    if (!cleaned.endsWith('}')) {
      // Remove trailing incomplete key-value (after last comma or quote)
      const lastQuote = cleaned.lastIndexOf('"')
      const lastComma = cleaned.lastIndexOf(',')
      const cutAt = Math.max(lastQuote, lastComma)
      if (cutAt > 0) {
        // Find the last complete key:value pair
        let trimmed = cleaned.slice(0, cutAt)
        // Remove trailing comma if present
        trimmed = trimmed.replace(/,\s*$/, '')
        // Count open vs close braces and add missing ones
        const openBraces = (trimmed.match(/{/g) || []).length
        const closeBraces = (trimmed.match(/}/g) || []).length
        const missing = openBraces - closeBraces
        cleaned = trimmed + '}'.repeat(Math.max(0, missing))
      }
    }

    try {
      parsed = JSON.parse(cleaned)
    } catch {
      log.warn('Enrich failed to parse JSON', { product: product.name, rawPreview: rawText.slice(0, 300) })
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
      log.warn('Enrich no usable data in response', { product: product.name })
      return false
    }

    const updateData: Record<string, any> = {}
    if (description && (force || !product.description)) {
      updateData.description = description
    }
    if (specs && (force || !hasSpecs)) {
      const cleanSpecs: Record<string, string> = {}
      for (const [key, val] of Object.entries(specs)) {
        if (val && typeof val === 'string' && val.trim().length > 0) {
          cleanSpecs[key] = val.trim()
        }
      }

      // Remove specs that overlap with existing product attributes
      const ATTR_OVERLAP: Record<string, string[]> = {
        'Оперативная память': ['RAM', 'Память'],
        'Встроенная память': ['Память'],
        'Память': ['Память', 'RAM'],
        'Цвет': ['Цвет'],
        'Размер': ['Размер'],
        'Размер экрана': ['Размер', 'Экран', 'Диагональ'],
        'Экран': ['Экран', 'Размер'],
        'Диагональ': ['Диагональ', 'Размер'],
        'Связь': ['Связь'],
        'SIM': ['SIM'],
        'Дисплей': ['Дисплей'],
        'Материал': ['Материал'],
      }
      const filteredSpecs: Record<string, string> = {}
      for (const [key, val] of Object.entries(cleanSpecs)) {
        const overlaps = ATTR_OVERLAP[key] || []
        const isDuplicate = overlaps.some(attrKey => existingAttrKeys.includes(attrKey))
        if (!isDuplicate) filteredSpecs[key] = val
      }

      if (Object.keys(filteredSpecs).length > 0) {
        updateData.specs = filteredSpecs
      }
    }

    if (Object.keys(updateData).length === 0) {
      log.debug('Enrich nothing to update', { product: product.name })
      return false
    }

    await prisma.product.update({
      where: { id: productId },
      data: updateData,
    })

    const specCount = updateData.specs ? Object.keys(updateData.specs as object).length : 0
    log.info('Enrich updated product', { product: product.name, hasDescription: !!updateData.description, specCount })

    // Write to Google Sheets (all variant rows)
    await writeEnrichToSheets(product.id, updateData.description as string | undefined, updateData.specs as Record<string, string> | undefined)

    return true
  } catch (err) {
    log.error('Enrich error', { product: product.name, error: err instanceof Error ? err.message : String(err) })
    return false
  }
}

/**
 * Обогащает все товары без description или specs.
 * Обрабатывает батчами с паузой чтобы не перегрузить API.
 */
export async function enrichAllProducts(shouldAbort?: () => boolean, force = false): Promise<{ total: number; enriched: number; failed: number }> {
  const where = force
    ? {}
    : { OR: [
        { specs: { equals: null as unknown as undefined } },
        { specs: { equals: {} } },
        { description: null },
        { description: '' },
      ] }

  const products = await prisma.product.findMany({
    where,
    select: { id: true, name: true, description: true, specs: true, attributes: true },
    orderBy: { createdAt: 'desc' },
  })

  log.info('Enrich starting batch', { count: products.length })

  let enriched = 0
  let failed = 0

  for (const product of products) {
    if (shouldAbort?.()) {
      log.info('Enrich aborted by user')
      break
    }
    try {
      const success = await enrichProductCard(product.id, force, product)
      if (success) enriched++
      else failed++
    } catch {
      failed++
    }

    // Пауза 2 секунды между запросами (rate limit Perplexity)
    await new Promise(r => setTimeout(r, 2000))
  }

  log.info('Enrich batch complete', { enriched, failed, total: products.length })
  return { total: products.length, enriched, failed }
}

/**
 * Записывает description и specs во ВСЕ строки продукта в Google Sheets.
 * Находит строки по fullName из variant attributes, пишет batch-update.
 */
async function writeEnrichToSheets(
  productId: number,
  description: string | undefined,
  specs: Record<string, string> | undefined,
): Promise<number> {
  if (!description && !specs) return 0

  try {
    const { readSheet, getSheetNames, batchUpdate } = await import('./google-sheets')

    const PRODUCT_SHEET_NAME = process.env.PRODUCT_SHEET_NAME || 'Лист1'
    const allSheets = await getSheetNames()
    const sheetName = allSheets.includes(PRODUCT_SHEET_NAME) ? PRODUCT_SHEET_NAME : allSheets[0]
    if (!sheetName) return 0

    // Collect all fullNames from product variants
    const variants = await prisma.productVariant.findMany({
      where: { productId },
      select: { attributes: true },
    })
    const fullNames = new Set<string>()
    for (const v of variants) {
      const a = v.attributes as Record<string, unknown> | null
      if (a && typeof a.fullName === 'string') fullNames.add(a.fullName)
    }
    if (fullNames.size === 0) return 0

    // Read sheet and find matching rows (skip already-filled cells)
    const data = await readSheet(sheetName)
    const specsText = specs
      ? Object.entries(specs).map(([k, v]) => `${k}: ${v}`).join('\n')
      : ''

    const batchData: { range: string; values: (string | number)[][] }[] = []
    let matchCount = 0

    for (let i = 1; i < data.length; i++) {
      const sheetFullName = (data[i]?.[4] ?? '').toString().trim()  // Column E (index 4)
      if (!fullNames.has(sheetFullName)) continue

      matchCount++
      const row = i + 1  // 1-indexed for Sheets API
      const existingDesc = (data[i]?.[9] ?? '').toString().trim()   // Column J (index 9)
      const existingSpecs = (data[i]?.[10] ?? '').toString().trim() // Column K (index 10)

      if (description && !existingDesc) {
        batchData.push({ range: `'${sheetName}'!J${row}`, values: [[description]] })
      }
      if (specsText && !existingSpecs) {
        batchData.push({ range: `'${sheetName}'!K${row}`, values: [[specsText]] })
      }
    }
    if (matchCount === 0) return 0

    if (batchData.length > 0) {
      await batchUpdate(batchData)
    }

    log.debug('Enrich wrote to Sheets', { matchCount, cellsWritten: batchData.length })
    return matchCount
  } catch (err) {
    log.warn('Enrich failed to write to Sheets', { error: err instanceof Error ? err.message : String(err) })
    return 0
  }
}
