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

/**
 * Цена одного обогащения: perplexity/sonar берёт $0.005 за веб-поиск плюс
 * токены (промпт ~300, ответ до 2000 при $1/M). Константа нужна, чтобы
 * владелец видел сумму ДО запуска массового прогона, а не в счёте.
 */
export const ENRICH_COST_USD = 0.007

/** Прочитанные листы товарного учёта: один проход на весь прогон, не на товар. */
export type SheetCache = Array<{ name: string; data: string[][] }>

/**
 * Читает все листы товарного учёта один раз. Раньше писбэк читал их заново на
 * КАЖДЫЙ товар — на прогоне в полсотни карточек это полсотни полных чтений
 * таблицы и лишние минуты под квотой Google.
 */
export async function loadSheetCache(): Promise<SheetCache> {
  const { readSheet, getProductSheetNames } = await import('./google-sheets')
  const out: SheetCache = []
  for (const name of await getProductSheetNames()) {
    try {
      out.push({ name, data: await readSheet(name) })
    } catch (err) {
      log.warn('Enrich failed to read sheet', { sheetName: name, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return out
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
export async function enrichProductCard(productId: number, force = false, preloaded?: { id: number; name: string; description: string | null; specs: any; attributes: any }, sheets?: SheetCache): Promise<EnrichResult> {
  const product = preloaded ?? await prisma.product.findUnique({ where: { id: productId } })
  if (!product) return fail('not_found')

  const hasSpecs = product.specs && typeof product.specs === 'object' && Object.keys(product.specs as object).length > 0
  // Пропускаем, только когда заполнять нечего вообще. Раньше выход был по
  // одним specs, и товар с характеристиками, но БЕЗ описания, не обогащался
  // никогда: платный запрос не делался, описание так и оставалось пустым.
  if (!force && hasSpecs && product.description) {
    log.debug('Enrich skipped, nothing empty to fill', { product: product.name })
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
    await writeEnrichToSheets(product.id, updateData.description as string | undefined, updateData.specs as Record<string, string> | undefined, sheets)

    return { ok: true, filled: { description: !!updateData.description, specs: specCount } }
  } catch (err) {
    const reason = classifyEnrichError(err)
    log.error('Enrich error', { product: product.name, reason, error: err instanceof Error ? err.message : String(err) })
    return fail(reason)
  }
}

/** Какие товары берём в массовый прогон. */
export type EnrichScope =
  | 'empty_description'  // нет описания (характеристики могут быть)
  | 'empty_specs'        // нет характеристик
  | 'either'             // пусто хоть что-то — историческое поведение бота
  | 'all'                // весь каталог: только вместе с force, это перезапись

export interface EnrichBatchOptions {
  scope?: EnrichScope
  /** Ограничить прогон конкретными товарами (авто-обогащение новых после синка). */
  productIds?: number[]
  /** Товары без вариантов — «призраки» от смены категории: покупателю их не
   *  видно, строк в таблице у них нет, а платный запрос стоит столько же. */
  onlyWithVariants?: boolean
  /** Потолок на один прогон — страховка от неожиданной пачки новых товаров. */
  maxItems?: number
  /** Пауза между запросами: rate limit Perplexity. */
  pauseMs?: number
  force?: boolean
  shouldAbort?: () => boolean
  onProgress?: (p: { done: number; total: number; name: string; ok: boolean }) => void
}

export interface EnrichBatchResult {
  /** Сколько товаров реально взяли в работу (после лимита). */
  total: number
  /** Сколько подходит под условие всего — без потолка maxItems. */
  candidates: number
  enriched: number
  failed: number
  skipped: number
  aborted: boolean
  lastError?: string
}

/** Условие выборки для scope — одно и то же в превью и в прогоне. */
export function enrichScopeWhere(scope: EnrichScope, onlyWithVariants: boolean): Record<string, unknown> {
  const emptyDescription = [{ description: null }, { description: '' }]
  const emptySpecs = [{ specs: { equals: null as unknown as undefined } }, { specs: { equals: {} } }]
  const byScope =
    scope === 'all' ? {}
      : scope === 'empty_description' ? { OR: emptyDescription }
        : scope === 'empty_specs' ? { OR: emptySpecs }
          : { OR: [...emptySpecs, ...emptyDescription] }
  if (!onlyWithVariants) return byScope
  return scope === 'all' ? { variants: { some: {} } } : { AND: [byScope, { variants: { some: {} } }] }
}

/** Сколько товаров попадёт в прогон — для превью «N товаров, примерно X ₽». */
export async function countEnrichCandidates(opts?: Pick<EnrichBatchOptions, 'scope' | 'onlyWithVariants'>): Promise<number> {
  const where = enrichScopeWhere(opts?.scope ?? 'either', opts?.onlyWithVariants ?? true)
  return prisma.product.count({ where })
}

/**
 * Массовое обогащение. По умолчанию ничего не перезаписывает (force=false):
 * заполняются только пустые поля, ручной текст остаётся на месте.
 *
 * Листы таблицы читаются ОДИН раз на весь прогон и переиспользуются писбэком.
 */
export async function enrichAllProducts(
  shouldAbort?: () => boolean,
  forceOrOptions: boolean | EnrichBatchOptions = false,
): Promise<EnrichBatchResult> {
  // Легаси-сигнатура (shouldAbort, force): `true` означало «перебрать весь
  // каталог с перезаписью» — сохраняем этот смысл через scope 'all'.
  const opts: EnrichBatchOptions = typeof forceOrOptions === 'boolean'
    ? { force: forceOrOptions, ...(forceOrOptions ? { scope: 'all' as const } : {}) }
    : forceOrOptions
  const force = opts.force ?? false
  const scope = opts.scope ?? 'either'
  const onlyWithVariants = opts.onlyWithVariants ?? true
  const maxItems = opts.maxItems ?? 50
  const pauseMs = opts.pauseMs ?? 2000
  const abort = opts.shouldAbort ?? shouldAbort

  const scopeWhere = enrichScopeWhere(scope, onlyWithVariants)
  const where = opts.productIds
    ? { AND: [scopeWhere, { id: { in: opts.productIds } }] }
    : scopeWhere
  const candidates = await prisma.product.count({ where })

  const products = await prisma.product.findMany({
    where,
    select: { id: true, name: true, description: true, specs: true, attributes: true },
    orderBy: { createdAt: 'desc' },
    take: maxItems,
  })

  log.info('Enrich starting batch', { count: products.length, candidates, scope, onlyWithVariants, force })

  let enriched = 0
  let failed = 0
  let skipped = 0
  let aborted = false
  let lastError: string | undefined
  let done = 0

  // Один проход по таблице на весь прогон вместо чтения на каждый товар.
  const sheets = products.length > 0 ? await loadSheetCache() : []

  for (const product of products) {
    if (abort?.()) {
      aborted = true
      log.info('Enrich aborted by user')
      break
    }
    let ok = false
    try {
      const r = await enrichProductCard(product.id, force, product, sheets)
      ok = r.ok
      if (r.ok) enriched++
      else if (r.reason === 'skipped' || r.reason === 'nothing') skipped++
      else { failed++; lastError = r.message }
    } catch (e) {
      failed++
      lastError = e instanceof Error ? e.message : String(e)
    }
    done++
    opts.onProgress?.({ done, total: products.length, name: product.name, ok })

    // Пауза между запросами (rate limit Perplexity) — после последнего не ждём
    if (done < products.length && pauseMs > 0) await new Promise(r => setTimeout(r, pauseMs))
  }

  log.info('Enrich batch complete', { enriched, failed, skipped, total: products.length, candidates, aborted })
  return { total: products.length, candidates, enriched, failed, skipped, aborted, lastError }
}

/**
 * Записывает description и specs во ВСЕ строки продукта в Google Sheets.
 * Находит строки по fullName из variant attributes, пишет batch-update.
 */
async function writeEnrichToSheets(
  productId: number,
  description: string | undefined,
  specs: Record<string, string> | undefined,
  cache?: SheetCache,
): Promise<number> {
  if (!description && !specs) return 0

  try {
    const { batchUpdate } = await import('./google-sheets')

    // На массовом прогоне листы уже прочитаны один раз и приходят кэшем.
    const sheets = cache ?? await loadSheetCache()
    if (sheets.length === 0) return 0

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

    for (const { name: sheetName, data } of sheets) {
      for (let i = 1; i < data.length; i++) {
        const cells = data[i]
        const sheetFullName = (cells?.[4] ?? '').toString().trim()  // Column E (index 4)
        if (!cells || !fullNames.has(sheetFullName)) continue

        matchCount++
        const row = i + 1  // 1-indexed for Sheets API
        const existingDesc = (cells[9] ?? '').toString().trim()   // Column J (index 9)
        const existingSpecs = (cells[10] ?? '').toString().trim() // Column K (index 10)

        if (description && !existingDesc) {
          batchData.push({ range: `'${sheetName}'!J${row}`, values: [[description]] })
          cells[9] = description   // кэш живёт весь прогон — держим его в согласии с листом
        }
        if (specsText && !existingSpecs) {
          batchData.push({ range: `'${sheetName}'!K${row}`, values: [[specsText]] })
          cells[10] = specsText
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
