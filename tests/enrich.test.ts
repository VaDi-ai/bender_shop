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
    product: { findUnique: vi.fn(), update: vi.fn() },
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
  classifyEnrichError,
  reinitEnrichClient,
  EnrichKeyMissingError,
  ENRICH_FAIL_MESSAGE,
} from '../lib/enrich'
import { startCardEnrich, getCardJob, resetCardJobs } from '../lib/enrich-job'

/* eslint-disable @typescript-eslint/no-explicit-any */
const findUnique = prisma.product.findUnique as any
const update = prisma.product.update as any
const variants = prisma.productVariant.findMany as any
const dbKey = getApiKeyValue as any

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
  ;[findUnique, update, variants, dbKey, createMock].forEach(f => f.mockReset())
  variants.mockResolvedValue([])
  update.mockResolvedValue({})
  dbKey.mockResolvedValue('sk-or-test')
  delete process.env.OPENROUTER_API_KEY
  reinitEnrichClient(null)   // клиент кэшируется в модуле — между кейсами сбрасываем
  resetCardJobs()
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

  it('без force и с заполненными specs — skipped, платный запрос не делаем', async () => {
    findUnique.mockResolvedValue(withSpecs)

    const r = await enrichProductCard(1, false)

    expect(r).toMatchObject({ ok: false, reason: 'skipped' })
    expect(createMock).not.toHaveBeenCalled()
  })

  it('с force — идём в интернет даже поверх заполненных specs', async () => {
    findUnique.mockResolvedValue(withSpecs)
    createMock.mockResolvedValue(GOOD)

    const r = await enrichProductCard(1, true)

    expect(r.ok).toBe(true)
    expect(createMock).toHaveBeenCalledTimes(1)
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
