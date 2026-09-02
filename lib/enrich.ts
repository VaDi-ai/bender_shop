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

/** Ключа нет нигде: ни в ApiKey.openrouter_key, ни в env. Отдельный класс —
 *  чтобы отличить «некуда идти» от «сходили и получили отказ». */
export class EnrichKeyMissingError extends Error {
  constructor() {
    super('OPENROUTER_API_KEY not set')
    this.name = 'EnrichKeyMissingError'
  }
}

/** Почему обогащение не дало результата. Наружу уходит вместе с текстом. */
export type EnrichFailReason =
  | 'no_key'        // ключ не задан ни в БД, ни в env
  | 'unauthorized'  // 401/403 — ключ отозван или протух
  | 'rate_limit'    // 429 — упёрлись в лимит OpenRouter/провайдера
  | 'provider'      // прочий отказ провайдера
  | 'network'       // не дозвонились
  | 'empty'         // модель ответила пустотой
  | 'parse'         // ответ не разобрался в JSON
  | 'nothing'       // разобрали, но заполнять нечего
  | 'not_found'     // товара нет
  | 'skipped'       // force=false и характеристики уже стоят

export interface EnrichResult {
  ok: boolean
  /** Что реально записали: описание и сколько характеристик. */
  filled: { description: boolean; specs: number }
  reason?: EnrichFailReason
  /** Готовый текст для админа — один и тот же в боте и в вебе. */
  message?: string
}

/** Тексты причин: показываются владельцу как есть, поэтому живут рядом с кодом. */
export const ENRICH_FAIL_MESSAGE: Record<EnrichFailReason, string> = {
  no_key: 'Не задан ключ OpenRouter — «Ещё» → «AI Агент» → «Ключ OpenRouter»',
  unauthorized: 'OpenRouter не принял ключ — он отозван или истёк. Замените его в «AI Агент»',
  rate_limit: 'OpenRouter временно ограничил запросы — попробуйте через пару минут',
  provider: 'Поиск характеристик сейчас недоступен — попробуйте позже',
  network: 'Не дозвонились до OpenRouter — проверьте связь и попробуйте позже',
  empty: 'В интернете ничего не нашлось по этому названию — заполните вручную',
  parse: 'Ответ пришёл в непонятном виде — попробуйте ещё раз или заполните вручную',
  nothing: 'Новых данных не нашлось — в карточке уже стоит всё, что нашли',
  not_found: 'Товар не найден',
  skipped: 'Характеристики уже заполнены — обогащение пропущено',
}

const fail = (reason: EnrichFailReason): EnrichResult => ({
  ok: false,
  filled: { description: false, specs: 0 },
  reason,
  message: ENRICH_FAIL_MESSAGE[reason],
})

/**
 * Разбирает отказ в понятную причину. Чистая функция: тестируется без сети и
 * без SDK — SDK-ошибки OpenAI несут числовой `status`, всё прочее считаем сетью.
 */
export function classifyEnrichError(err: unknown): EnrichFailReason {
  if (err instanceof EnrichKeyMissingError) return 'no_key'
  const status = (err as { status?: unknown } | null)?.status
  if (typeof status === 'number') {
    if (status === 401 || status === 403) return 'unauthorized'
    if (status === 429) return 'rate_limit'
    if (status >= 400) return 'provider'
  }
  return 'network'
}

/**
 * Сбрасывает кэш клиента после смены ключа. Без этого процесс до самого
 * рестарта ходит со старым ключом: агент и парсер свои клиенты пересоздают,
 * а обогащение раньше — нет, и «ключ заменили, а всё равно 401».
 * Без аргумента — просто забыть клиента, ключ перечитается из БД при следующем
 * обращении.
 */
export function reinitEnrichClient(key?: string | null): void {
  _enrichClient = key
    ? new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: key })
    : null
}

async function getEnrichClient(): Promise<OpenAI> {
  if (_enrichClient) return _enrichClient
  const dbKey = await getApiKeyValue('openrouter_key')
  const apiKey = dbKey || process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new EnrichKeyMissingError()
  _enrichClient = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey })
  return _enrichClient
}

/**
 * Обогащает одну карточку товара.
 * Заполняет description и specs если они пустые (force — перезаписывает).
 * Возвращает, что именно записали, а при неудаче — почему: вызывающему коду
 * нужно отличать «ключ отозвали» от «в интернете ничего не нашлось».
 */
export async function enrichProductCard(productId: number, force = false, preloaded?: { id: number; name: string; description: string | null; specs: any; attributes: any }): Promise<EnrichResult> {
  const product = preloaded ?? await prisma.product.findUnique({ where: { id: productId } })
  if (!product) return fail('not_found')

  const hasSpecs = product.specs && typeof product.specs === 'object' && Object.keys(product.specs as object).length > 0
  if (!force && hasSpecs) {
    log.debug('Enrich skipped, specs already filled', { product: product.name })
    return fail('skipped')
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
      return fail('empty')
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
        return fail('parse')
      }
    }

    const description = typeof parsed.description === 'string' ? parsed.description.slice(0, 1000) : null
    const specs = parsed.specs && typeof parsed.specs === 'object' ? parsed.specs : null

    if (!description && !specs) {
      log.warn('Enrich no usable data in response', { product: product.name })
      return fail('empty')
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
      return fail('nothing')
    }

    await prisma.product.update({
      where: { id: productId },
      data: updateData,
    })

    const specCount = updateData.specs ? Object.keys(updateData.specs as object).length : 0
    log.info('Enrich updated product', { product: product.name, hasDescription: !!updateData.description, specCount })

    // Write to Google Sheets (all variant rows)
    await writeEnrichToSheets(product.id, updateData.description as string | undefined, updateData.specs as Record<string, string> | undefined)

    return { ok: true, filled: { description: !!updateData.description, specs: specCount } }
  } catch (err) {
    const reason = classifyEnrichError(err)
    log.error('Enrich error', { product: product.name, reason, error: err instanceof Error ? err.message : String(err) })
    return fail(reason)
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
      const r = await enrichProductCard(product.id, force, product)
      if (r.ok) enriched++
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
    const { readSheet, getProductSheetNames, batchUpdate } = await import('./google-sheets')

    const sheetNames = await getProductSheetNames()
    if (sheetNames.length === 0) return 0

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

    const specsText = specs
      ? Object.entries(specs).map(([k, v]) => `${k}: ${v}`).join('\n')
      : ''

    // Полистовой поиск совпадающих строк по всем листам товарного учёта
    const batchData: { range: string; values: (string | number)[][] }[] = []
    let matchCount = 0

    for (const sheetName of sheetNames) {
      let data: string[][]
      try {
        data = await readSheet(sheetName)
      } catch (err) {
        log.warn('Enrich failed to read sheet', { sheetName, error: err instanceof Error ? err.message : String(err) })
        continue
      }

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
