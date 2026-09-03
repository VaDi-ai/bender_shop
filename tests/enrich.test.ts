/**
 * Обогащение карточки: раньше любая неудача возвращала false, и владелец видел
 * «попробуйте позже» одинаково на отозванном ключе и на «ничего не нашлось».
 * Тесты держат три вещи: причина отказа названа честно, гард specs пропускает
 * только без force, и кнопка в вебе доступна менеджеру (owner-гейта на ней нет).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } }
  },
}))
vi.mock('../lib/prisma', () => ({
  prisma: {
    product: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    productVariant: { findMany: vi.fn() },
  },
}))
vi.mock('../lib/api-key-store', () => ({ getApiKeyValue: vi.fn(), setApiKeyValue: vi.fn() }))
vi.mock('../lib/google-sheets', () => ({
  getProductSheetNames: vi.fn(async () => []),
  readSheet: vi.fn(async () => []),
  batchUpdate: vi.fn(async () => undefined),
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/security-log', () => ({ logSecurityEvent: vi.fn() }))
vi.mock('../lib/storefront-admin', () => ({ touchStorefrontCache: vi.fn(async () => undefined) }))

import { prisma } from '../lib/prisma'
import { getApiKeyValue } from '../lib/api-key-store'
import {
  enrichProductCard,
  enrichAllProducts,
  enrichScopeWhere,
  classifyEnrichError,
  reinitEnrichClient,
  EnrichKeyMissingError,
  ENRICH_FAIL_MESSAGE,
} from '../lib/enrich'
import { getProductSheetNames } from '../lib/google-sheets'
import {
  startCardEnrich, getCardJob, resetCardJobs,
  startBatchEnrich, getBatchJob, abortBatchEnrich, resetBatchJob,
} from '../lib/enrich-job'

/* eslint-disable @typescript-eslint/no-explicit-any */
const findUnique = prisma.product.findUnique as any
const update = prisma.product.update as any
const findMany = prisma.product.findMany as any
const count = prisma.product.count as any
const variants = prisma.productVariant.findMany as any
const dbKey = getApiKeyValue as any
const sheetNames = getProductSheetNames as any

const PRODUCT = { id: 1, name: 'Apple AirPods Pro 3', description: null, specs: {}, attributes: {} }

/** Ответ модели в том виде, в каком его отдаёт OpenRouter. */
const answer = (content: string) => ({ choices: [{ message: { content } }] })

const GOOD = answer(JSON.stringify({
  description: 'Наушники Apple с активным шумоподавлением.',
  specs: { 'Чип': 'H2', 'Автономность': 'до 8 часов' },
}))

/** Отказ в том виде, в каком его бросает SDK OpenAI: числовой status. */
const httpError = (status: number) => Object.assign(new Error('boom'), { status })

beforeEach(() => {
  ;[findUnique, update, findMany, count, variants, dbKey, createMock, sheetNames].forEach(f => f.mockReset())
  variants.mockResolvedValue([])
  update.mockResolvedValue({})
  findMany.mockResolvedValue([])
  count.mockResolvedValue(0)
  dbKey.mockResolvedValue('sk-or-test')
  sheetNames.mockResolvedValue([])
  delete process.env.OPENROUTER_API_KEY
  reinitEnrichClient(null)   // клиент кэшируется в модуле — между кейсами сбрасываем
  resetCardJobs()
  resetBatchJob()
})

describe('classifyEnrichError — отказ переводится в понятную причину', () => {
  it('ключа нет нигде', () => {
    expect(classifyEnrichError(new EnrichKeyMissingError())).toBe('no_key')
  })

  it('401 и 403 — ключ отозван, а не «попробуйте позже»', () => {
    expect(classifyEnrichError(httpError(401))).toBe('unauthorized')
    expect(classifyEnrichError(httpError(403))).toBe('unauthorized')
  })

  it('429 — лимит запросов', () => {
    expect(classifyEnrichError(httpError(429))).toBe('rate_limit')
  })

  it('прочий отказ провайдера', () => {
    expect(classifyEnrichError(httpError(500))).toBe('provider')
    expect(classifyEnrichError(httpError(400))).toBe('provider')
  })

  it('без status — не дозвонились', () => {
    expect(classifyEnrichError(new Error('socket hang up'))).toBe('network')
    expect(classifyEnrichError(null)).toBe('network')
  })

  it('у каждой причины есть текст для админа', () => {
    for (const text of Object.values(ENRICH_FAIL_MESSAGE)) {
      expect(text.length).toBeGreaterThan(10)
    }
  })
})

describe('enrichProductCard — что вернули и что записали', () => {
  it('успех: пишет описание и характеристики, отчитывается количеством', async () => {
    findUnique.mockResolvedValue(PRODUCT)
    createMock.mockResolvedValue(GOOD)

    const r = await enrichProductCard(1, true)

    expect(r.ok).toBe(true)
    expect(r.filled).toEqual({ description: true, specs: 2 })
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0][0].data.description).toContain('шумоподавлением')
  })

  it('товара нет — not_found, к OpenRouter не ходим', async () => {
    findUnique.mockResolvedValue(null)

    const r = await enrichProductCard(999)

    expect(r).toMatchObject({ ok: false, reason: 'not_found' })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('ключа нет ни в БД, ни в env — no_key, а не «недоступно»', async () => {
    findUnique.mockResolvedValue(PRODUCT)
    dbKey.mockResolvedValue(null)

    const r = await enrichProductCard(1, true)

    expect(r).toMatchObject({ ok: false, reason: 'no_key' })
    expect(r.message).toBe(ENRICH_FAIL_MESSAGE.no_key)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('ключ есть только в env — фолбэк работает', async () => {
    findUnique.mockResolvedValue(PRODUCT)
    dbKey.mockResolvedValue(null)
    process.env.OPENROUTER_API_KEY = 'sk-or-from-env'
    createMock.mockResolvedValue(GOOD)

    const r = await enrichProductCard(1, true)

    expect(r.ok).toBe(true)
  })

  it('OpenRouter ответил 401 — unauthorized, в БД ничего не пишем', async () => {
    findUnique.mockResolvedValue(PRODUCT)
    createMock.mockRejectedValue(httpError(401))

    const r = await enrichProductCard(1, true)

    expect(r).toMatchObject({ ok: false, reason: 'unauthorized' })
    expect(update).not.toHaveBeenCalled()
  })

  it('пустой ответ модели — empty', async () => {
    findUnique.mockResolvedValue(PRODUCT)
    createMock.mockResolvedValue(answer(''))

    expect(await enrichProductCard(1, true)).toMatchObject({ ok: false, reason: 'empty' })
  })

  it('ответ не разбирается и описания в нём не видно — parse', async () => {
    findUnique.mockResolvedValue(PRODUCT)
    createMock.mockResolvedValue(answer('Извините, не нашёл такой товар.'))

    expect(await enrichProductCard(1, true)).toMatchObject({ ok: false, reason: 'parse' })
  })
})

describe('гард specs: force решает, перезаписываем или нет', () => {
  const withSpecs = { ...PRODUCT, specs: { 'Чип': 'H2' } }

  it('с force — идём в интернет даже поверх заполненных specs', async () => {
    findUnique.mockResolvedValue(withSpecs)
    createMock.mockResolvedValue(GOOD)

    const r = await enrichProductCard(1, true)

    expect(r.ok).toBe(true)
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('есть характеристики, но нет описания — раньше молча пропускали, теперь заполняем', async () => {
    findUnique.mockResolvedValue({ ...withSpecs, description: null })
    createMock.mockResolvedValue(GOOD)

    const r = await enrichProductCard(1, false)

    expect(r.ok).toBe(true)
    expect(r.filled).toEqual({ description: true, specs: 0 })   // specs не трогаем, они уже стоят
    expect(update.mock.calls[0][0].data.specs).toBeUndefined()
  })

  it('и описание, и характеристики на месте — вот теперь skipped', async () => {
    findUnique.mockResolvedValue({ ...withSpecs, description: 'Уже написано' })

    expect(await enrichProductCard(1, false)).toMatchObject({ ok: false, reason: 'skipped' })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('без force непустое описание не перезаписывается', async () => {
    findUnique.mockResolvedValue({ ...PRODUCT, description: 'Текст, написанный руками' })
    createMock.mockResolvedValue(GOOD)

    const r = await enrichProductCard(1, false)

    expect(r.ok).toBe(true)
    expect(update.mock.calls[0][0].data.description).toBeUndefined()
    expect(r.filled).toEqual({ description: false, specs: 2 })
  })
})

describe('фоновый прогон карточки', () => {
  const done = { ok: true, filled: { description: true, specs: 3 } }

  it('запуск отдаёт running сразу, результат приходит потом', async () => {
    let release: (v: typeof done) => void = () => {}
    const run = vi.fn(() => new Promise<any>(res => { release = res }))

    const { started } = startCardEnrich(1, '900', { run })
    expect(started).toBe(true)
    expect(getCardJob(1)?.status).toBe('running')

    release(done)
    await vi.waitFor(() => expect(getCardJob(1)?.status).toBe('done'))
    expect(getCardJob(1)?.filled).toEqual({ description: true, specs: 3 })
  })

  it('второй запуск по тому же товару не платит второй раз', async () => {
    const run = vi.fn(() => new Promise<any>(() => {}))

    startCardEnrich(1, '900', { run })
    const second = startCardEnrich(1, '900', { run })

    expect(second.started).toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('неудача сохраняет причину и текст для админа', async () => {
    const run = vi.fn(async () => ({
      ok: false,
      filled: { description: false, specs: 0 },
      reason: 'unauthorized' as const,
      message: ENRICH_FAIL_MESSAGE.unauthorized,
    }))

    startCardEnrich(2, '900', { run })

    await vi.waitFor(() => expect(getCardJob(2)?.status).toBe('failed'))
    expect(getCardJob(2)?.message).toBe(ENRICH_FAIL_MESSAGE.unauthorized)
  })

  it('падение внутри прогона не всплывает наружу — процесс с ботом переживает', async () => {
    const run = vi.fn(async () => { throw new Error('внезапно') })

    expect(() => startCardEnrich(3, '900', { run })).not.toThrow()

    await vi.waitFor(() => expect(getCardJob(3)?.status).toBe('failed'))
    expect(getCardJob(3)?.reason).toBe('network')
  })
})

describe('гейт ручек обогащения', () => {
  /** Слои маршрута в express: [ownerOnly?, safe(handler)]. */
  function handlersOf(router: any, method: string, path: string): string[] {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method])
    if (!layer) throw new Error(`Маршрут ${method.toUpperCase()} ${path} не зарегистрирован`)
    return layer.route.stack.map((h: any) => h.name || h.handle?.name || '')
  }

  it('обогащение карточки доступно менеджеру — ownerOnly на нём нет', async () => {
    const { adminApiRouter } = await import('../api/admin')
    const router = adminApiRouter() as any

    expect(handlersOf(router, 'post', '/products/:id/enrich')).not.toContain('ownerOnly')
    expect(handlersOf(router, 'get', '/products/:id/enrich-status')).not.toContain('ownerOnly')
  })

  it('для сравнения: скрытие товара по-прежнему только владельцу', async () => {
    const { adminApiRouter } = await import('../api/admin')
    const router = adminApiRouter() as any

    expect(handlersOf(router, 'post', '/products/:id/visibility')).toContain('ownerOnly')
  })
})

describe('выборка массового прогона', () => {
  it('«без описания» не тянет товары с пустыми характеристиками', () => {
    const w = JSON.stringify(enrichScopeWhere('empty_description', false))
    expect(w).toContain('description')
    expect(w).not.toContain('specs')
  })

  it('«хоть что-то пусто» берёт оба условия — историческое поведение бота', () => {
    const w = JSON.stringify(enrichScopeWhere('either', false))
    expect(w).toContain('description')
    expect(w).toContain('specs')
  })

  it('onlyWithVariants добавляет условие «есть предложения» — призраков не обогащаем', () => {
    expect(JSON.stringify(enrichScopeWhere('empty_description', true))).toContain('variants')
    expect(JSON.stringify(enrichScopeWhere('empty_description', false))).not.toContain('variants')
  })

  it('«весь каталог» — пустое условие, но призраки всё равно отсекаются', () => {
    expect(enrichScopeWhere('all', false)).toEqual({})
    expect(enrichScopeWhere('all', true)).toEqual({ variants: { some: {} } })
  })

  it('легаси-вызов enrichAllProducts(abort, true) означает перебор всего каталога', async () => {
    count.mockResolvedValue(0)
    findMany.mockResolvedValue([])

    await enrichAllProducts(undefined, true)

    expect(findMany.mock.calls[0][0].where).toEqual({ variants: { some: {} } })
  })
})

describe('enrichAllProducts — лимит, пауза, кэш листа', () => {
  const products = (n: number) => Array.from({ length: n }, (_, i) => ({
    id: i + 1, name: `Товар ${i + 1}`, description: null, specs: {}, attributes: {},
  }))

  it('берёт не больше maxItems и честно говорит, сколько осталось', async () => {
    count.mockResolvedValue(120)
    findMany.mockResolvedValue(products(50))
    createMock.mockResolvedValue(GOOD)

    const r = await enrichAllProducts(undefined, { maxItems: 50, pauseMs: 0 })

    expect(findMany.mock.calls[0][0].take).toBe(50)
    expect(r.total).toBe(50)
    expect(r.candidates).toBe(120)      // остаток виден: 120 - 50
    expect(r.enriched).toBe(50)
  })

  it('по умолчанию — 50 товаров, только с предложениями, без перезаписи', async () => {
    count.mockResolvedValue(3)
    findMany.mockResolvedValue(products(3))
    createMock.mockResolvedValue(GOOD)

    await enrichAllProducts()

    expect(findMany.mock.calls[0][0].take).toBe(50)
    expect(JSON.stringify(findMany.mock.calls[0][0].where)).toContain('variants')
  })

  it('листы таблицы читаются один раз на прогон, а не на каждый товар', async () => {
    count.mockResolvedValue(4)
    findMany.mockResolvedValue(products(4))
    createMock.mockResolvedValue(GOOD)

    await enrichAllProducts(undefined, { pauseMs: 0 })

    expect(sheetNames).toHaveBeenCalledTimes(1)
  })

  it('пустая выборка не трогает таблицу вовсе', async () => {
    count.mockResolvedValue(0)
    findMany.mockResolvedValue([])

    const r = await enrichAllProducts(undefined, { pauseMs: 0 })

    expect(r.total).toBe(0)
    expect(sheetNames).not.toHaveBeenCalled()
  })

  it('стоп-флаг обрывает прогон и помечает его прерванным', async () => {
    count.mockResolvedValue(10)
    findMany.mockResolvedValue(products(10))
    createMock.mockResolvedValue(GOOD)
    let processed = 0

    const r = await enrichAllProducts(undefined, {
      pauseMs: 0,
      shouldAbort: () => processed++ >= 3,
    })

    expect(r.aborted).toBe(true)
    expect(r.enriched).toBeLessThan(10)
  })

  it('пропуски и ошибки считаются раздельно', async () => {
    count.mockResolvedValue(3)
    findMany.mockResolvedValue([
      { id: 1, name: 'Заполнится', description: null, specs: {}, attributes: {} },
      { id: 2, name: 'Уже всё есть', description: 'текст', specs: { 'Чип': 'H2' }, attributes: {} },
      { id: 3, name: 'Отвалится', description: null, specs: {}, attributes: {} },
    ])
    createMock
      .mockResolvedValueOnce(GOOD)
      .mockRejectedValueOnce(httpError(429))

    const r = await enrichAllProducts(undefined, { pauseMs: 0 })

    expect(r).toMatchObject({ enriched: 1, skipped: 1, failed: 1 })
    expect(r.lastError).toBe(ENRICH_FAIL_MESSAGE.rate_limit)
  })
})

describe('массовый прогон как фоновая задача', () => {
  const result = {
    total: 5, candidates: 12, enriched: 4, failed: 1, skipped: 0, aborted: false,
  }

  it('идёт в фоне, прогресс виден по опросу', async () => {
    let release: (v: any) => void = () => {}
    const run = vi.fn((o: any) => {
      o.onProgress?.({ done: 2, total: 5, name: 'Товар 2', ok: true })
      return new Promise(res => { release = res })
    })

    const { started } = startBatchEnrich('900', { run: run as any })

    expect(started).toBe(true)
    expect(getBatchJob()).toMatchObject({ status: 'running', done: 2, total: 5, current: 'Товар 2' })

    release(result)
    await vi.waitFor(() => expect(getBatchJob()?.status).toBe('done'))
    expect(getBatchJob()).toMatchObject({ enriched: 4, failed: 1, candidates: 12 })
  })

  it('второй запуск не удваивает счёт', () => {
    const run = vi.fn(() => new Promise<any>(() => {}))

    startBatchEnrich('900', { run: run as any })
    expect(startBatchEnrich('900', { run: run as any }).started).toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('массовое никогда не перезаписывает: force в прогон уходит выключенным', () => {
    const run = vi.fn(() => new Promise<any>(() => {}))

    startBatchEnrich('900', { run: run as any })

    expect(run.mock.calls[0][0]).toMatchObject({ force: false, onlyWithVariants: true, maxItems: 50, scope: 'empty_description' })
  })

  it('«Остановить» доходит до прогона и помечает результат прерванным', async () => {
    let seen = false
    const run = vi.fn(async (o: any) => {
      await vi.waitFor(() => expect(o.shouldAbort()).toBe(true))
      seen = true
      return { ...result, aborted: true }
    })

    startBatchEnrich('900', { run: run as any })
    expect(abortBatchEnrich()).toBe(true)

    await vi.waitFor(() => expect(getBatchJob()?.status).toBe('aborted'))
    expect(seen).toBe(true)
  })

  it('падение прогона не роняет процесс', async () => {
    const run = vi.fn(async () => { throw new Error('всё сломалось') })

    expect(() => startBatchEnrich('900', { run: run as any })).not.toThrow()

    await vi.waitFor(() => expect(getBatchJob()?.status).toBe('failed'))
    expect(getBatchJob()?.lastError).toBe('всё сломалось')
  })
})

describe('гейт массового обогащения', () => {
  function handlersOf(router: any, method: string, path: string): string[] {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method])
    if (!layer) throw new Error(`Маршрут ${method.toUpperCase()} ${path} не зарегистрирован`)
    return layer.route.stack.map((h: any) => h.name || h.handle?.name || '')
  }

  it('все ручки массового обогащения — только владельцу: это деньги', async () => {
    const { adminApiRouter } = await import('../api/admin')
    const router = adminApiRouter() as any

    const routes = [
      ['get', '/enrich/preview'], ['post', '/enrich/run'],
      ['get', '/enrich/status'], ['post', '/enrich/abort'],
      // тумблер авто-после-синка — тоже деньги, только регулярные
      ['get', '/enrich/after-sync'], ['put', '/enrich/after-sync'],
    ] as const
    for (const [m, path] of routes) {
      expect(handlersOf(router, m, path), `${m} ${path}`).toContain('ownerOnly')
    }
  })
})
