/**
 * Рубильники фоновых задач (lib/jobs-switches.ts) — стоп-гейт PR.
 *
 * Главное: каждый тумблер гасит СВОЮ задачу и не задевает соседние (матрица
 * 5×5), курс доллара шлётся при любом наборе флагов, отсутствующая или битая
 * настройка = всё включено (мерж невидим), а переключать может только владелец.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  process.env.ADMIN_IDS = '1'
  process.env.CRM_GROUP_ID = '-100123'
  return {
    store: new Map<string, string | null>(),
    getAvitoChats: vi.fn(async () => [] as unknown[]),
    sendDailyCurrencyRates: vi.fn(async (send: (t: string, k: object) => Promise<void>) => { await send('КУРС ВАЛЮТ', {}); return null }),
  }
})

vi.mock('../lib/sentry', () => ({ Sentry: { captureException: vi.fn() } }))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/api-key-store', () => ({
  getApiKeyValue: vi.fn(async (k: string) => h.store.get(k) ?? null),
  setApiKeyValue: vi.fn(async (k: string, v: string) => { h.store.set(k, v) }),
}))
vi.mock('../lib/prisma', () => ({
  prisma: {
    task: { findMany: vi.fn(), update: vi.fn() },
    message: { findMany: vi.fn() },
    supplierPrice: { findMany: vi.fn(), updateMany: vi.fn() },
    product: { findMany: vi.fn(), count: vi.fn() },
    securityLog: { create: vi.fn() },
    adminUser: { findUnique: vi.fn() },
    supplier: { findUnique: vi.fn(), update: vi.fn() },
    currencyRate: { findUnique: vi.fn() },
  },
}))
vi.mock('../lib/avito', () => ({
  isAvitoConfigured: () => true,
  getAvitoChats: h.getAvitoChats,
  getAvitoUserId: vi.fn(async () => 1),
  sendAvitoMessage: vi.fn(),
  extractAvitoImages: () => [],
}))
vi.mock('../bot/ai/agent', () => ({
  getAIMode: vi.fn(), generateAIResponse: vi.fn(), storeSuggestion: vi.fn(), incrementStat: vi.fn(),
}))
vi.mock('../webhooks/telegram', () => ({ moderateAIOutput: (t: string) => t }))
vi.mock('../bot/admin/pricing', () => ({ sendDailyCurrencyRates: h.sendDailyCurrencyRates, lastCurrencyChanges: [] }))
vi.mock('../lib/sheets-sync', () => ({
  syncProductsFromSheets: vi.fn(async () => ({ created: 1, updated: 0, disabled: 0 })),
  checkStalePrices: vi.fn(async () => [{ name: 'x' }]),
  formatStaleSupplierMessage: () => 'список устаревших',
}))
vi.mock('../lib/trends', () => ({ fetchTrendsFromAI: vi.fn(async () => null) }))
vi.mock('../lib/price-batch', () => ({
  createPriceBatch: vi.fn(async () => ({ batchId: 7, reused: false, stats: { rows: 3, matchedRows: 2, unmatchedRows: 1, outOfCorridor: 1 } })),
}))

import { prisma } from '../lib/prisma'
import {
  JOBS_SETTING, JOB_NAMES, parseJobsConfig, loadJobs, setJobs, isAvitoCommandBlocked, type JobName,
} from '../lib/jobs-switches'
import { pollAvitoMessages, runTick } from '../bot/scheduler'
import { runCurrencyNotify, runMorningSummary, runSheetsAutoSync } from '../bot/cron-jobs'
import { logSecurityEvent, initSecurityAlerts, _resetAlertWindows } from '../lib/security-log'
import { handleSupplierMessage } from '../webhooks/supplier'

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any
const ADMIN = 1
const MANAGER = 777
const CLIENT_TG = '555'

const tg = {
  sendMessage: vi.fn(async () => ({})),
  sendDocument: vi.fn(async () => ({})),
  sendPhoto: vi.fn(async () => ({})),
  createForumTopic: vi.fn(async () => ({ message_thread_id: 1 })),
}
const bot = { telegram: tg } as any

/** Тексты, ушедшие получателю. */
const sentTo = (chat: number | string) =>
  tg.sendMessage.mock.calls.filter((c: any[]) => String(c[0]) === String(chat)).map((c: any[]) => String(c[1]))
const sentAny = (chat: number | string, needle: string) => sentTo(chat).some(t => t.includes(needle))

function setFlags(off: JobName[]) {
  h.store.clear()
  const cfg: Record<string, boolean> = {}
  for (const n of JOB_NAMES) cfg[n] = !off.includes(n)
  h.store.set(JOBS_SETTING, JSON.stringify(cfg))
}

const PRICE = { model: 'iPhone 16', storage: '128', color: 'Black', country: null, price: 70000, supplierId: 1, supplier: { name: 'S', markup: 5 } }

function primeDb() {
  const nightMsg = { clientId: 3, client: { id: 3, name: 'Покупатель', source: 'telegram', externalId: CLIENT_TG } }
  db.message.findMany.mockResolvedValue([nightMsg])
  db.task.findMany.mockImplementation(async (args: any) => args?.where?.status === 'pending'
    ? [{ id: 9, clientId: 3, action: 'remind_client', payload: { text: 'Актуален ли вопрос?' }, attemptCount: 0,
        client: { id: 3, source: 'telegram', externalId: CLIENT_TG } }]
    : [])
  db.task.update.mockResolvedValue({})
  // Цены есть: без них 11:00-блок выходит до клиентского «доброго утра» (так было и до рубильников)
  db.supplierPrice.findMany.mockResolvedValue([PRICE])
  db.supplierPrice.updateMany.mockResolvedValue({ count: 0 })
  db.product.count.mockResolvedValue(10)
  db.securityLog.create.mockResolvedValue({})
  db.adminUser.findUnique.mockResolvedValue({ telegramId: String(MANAGER) })
  db.supplier.findUnique.mockResolvedValue({ id: 1, name: 'Поставщик', isActive: true })
  db.supplier.update.mockResolvedValue({})
  db.currencyRate.findUnique.mockResolvedValue({ rate: 100, previousRate: 90 })
}

/**
 * Прогоняет все гейтируемые задачи + курс и отвечает, какие из них «сработали».
 * Время подставляется под окно каждой задачи (10:05 и 11:05 МСК).
 */
async function runAll(off: JobName[]) {
  setFlags(off)
  tg.sendMessage.mockClear(); tg.sendDocument.mockClear()
  h.getAvitoChats.mockClear(); h.sendDailyCurrencyRates.mockClear()
  db.task.update.mockClear(); db.securityLog.create.mockClear()
  primeDb()
  _resetAlertWindows()
  initSecurityAlerts(bot, [ADMIN])

  vi.setSystemTime(new Date('2026-09-22T07:05:00Z')) // 10:05 МСК
  await runCurrencyNotify(tg as any, [ADMIN])
  const currency = sentAny(ADMIN, 'КУРС ВАЛЮТ') && sentAny(ADMIN, 'Курс доллара изменился')

  vi.setSystemTime(new Date('2026-09-22T08:05:00Z')) // 11:05 МСК
  await pollAvitoMessages(tg as any)
  const avitoChats = h.getAvitoChats.mock.calls.length > 0

  const avitoCommands = !(await isAvitoCommandBlocked('sync')) && !(await isAvitoCommandBlocked('map'))

  await runMorningSummary(tg as any, [ADMIN])
  const morningSummary = sentAny(ADMIN, 'Утренняя сводка')
  const nightBrief = sentAny(ADMIN, 'НОЧНАЯ СВОДКА')
  const morningClient = sentAny(CLIENT_TG, 'Доброе утро')

  await runTick(bot)
  const taskSent = sentAny(CLIENT_TG, 'Актуален ли вопрос?')
  const taskCancelled = db.task.update.mock.calls.some((c: any[]) => c[0].data?.status === 'cancelled')

  await logSecurityEvent('price_out_of_corridor_applied', { batchId: 7, count: 1 }, ADMIN)
  const corridor = sentAny(ADMIN, 'ВНЕ коридора')
  await logSecurityEvent('price_batch_applied', { batchId: 7, applied: 3 }, MANAGER)
  const batch = sentAny(MANAGER, 'Применён батч')
  await logSecurityEvent('price_changed', { variantId: 1 }, MANAGER)
  const priceChanged = sentAny(MANAGER, 'Изменена цена')
  await handleSupplierMessage({ chat: { id: 42 }, message: { text: 'iPhone 16 128 Black — 75.000 ₽ в наличии' } } as any, bot)
  const supplierCard = sentAny(ADMIN, 'Новый прайс')
  await runSheetsAutoSync(tg as any, [ADMIN])
  const syncNote = sentAny(ADMIN, 'Авто-синхронизация')
  const staleNote = sentAny(ADMIN, 'устаревшими ценами')

  return {
    currency, nightBrief, taskCancelled,
    securityLogWrites: db.securityLog.create.mock.calls.length,
    flags: {
      avitoChats,
      avitoCommands,
      morningSummary,
      clientAuto: morningClient && taskSent,
      priceAlerts: corridor && batch && priceChanged && supplierCard && syncNote && staleNote,
    } as Record<JobName, boolean>,
    anyClient: morningClient || taskSent,
    anyPrice: corridor || batch || priceChanged || supplierCard || syncNote || staleNote,
  }
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }) })
afterEach(() => { vi.useRealTimers() })

describe('матрица 5×5: каждый флаг гасит своё и не трогает соседей', () => {
  it('всё включено — срабатывает всё', async () => {
    const r = await runAll([])
    for (const n of JOB_NAMES) expect(r.flags[n], n).toBe(true)
    expect(r.currency).toBe(true)
    expect(r.taskCancelled).toBe(false)
  })

  for (const offFlag of JOB_NAMES) {
    it(`выключен ${offFlag}`, async () => {
      const r = await runAll([offFlag])
      for (const n of JOB_NAMES) {
        expect(r.flags[n], `${n} при выключенном ${offFlag}`).toBe(n !== offFlag)
      }
      // «Выключенное не шлётся» — ни одна из отправок задачи, а не только их конъюнкция
      if (offFlag === 'clientAuto') expect(r.anyClient).toBe(false)
      if (offFlag === 'priceAlerts') expect(r.anyPrice).toBe(false)
      expect(r.currency, 'курс доллара').toBe(true)
      expect(r.nightBrief, 'ночная сводка не гейтится').toBe(true)
    })
  }

  it('всё выключено — курс доллара и ночная сводка всё равно приходят', async () => {
    const r = await runAll([...JOB_NAMES])
    for (const n of JOB_NAMES) expect(r.flags[n], n).toBe(false)
    expect(r.anyClient).toBe(false)
    expect(r.anyPrice).toBe(false)
    expect(r.currency).toBe(true)
    expect(r.nightBrief).toBe(true)
  })
})

describe('детали гейтов', () => {
  it('clientAuto выкл: подошедшая задача → cancelled, клиенту ничего', async () => {
    const r = await runAll(['clientAuto'])
    expect(r.taskCancelled).toBe(true)
    expect(db.task.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { status: 'cancelled' } })
    expect(sentTo(CLIENT_TG)).toEqual([])
  })

  it('priceAlerts выкл: SecurityLog пишется как раньше (аудит не режем)', async () => {
    const on = await runAll([])
    const off = await runAll(['priceAlerts'])
    expect(off.securityLogWrites).toBe(on.securityLogWrites)
    expect(off.securityLogWrites).toBeGreaterThanOrEqual(3)
  })

  it('priceAlerts выкл не глушит не-ценовые critical-алерты', async () => {
    setFlags(['priceAlerts']); primeDb(); _resetAlertWindows(); initSecurityAlerts(bot, [ADMIN]); tg.sendMessage.mockClear()
    await logSecurityEvent('price_manipulation_attempt', { ip: '1.2.3.4' })
    expect(sentAny(ADMIN, 'подмены цены')).toBe(true)
  })

  it('старый supplier_notify=false глушит карточку прайса и при включённом priceAlerts', async () => {
    setFlags([]); h.store.set('supplier_notify', 'false'); primeDb(); tg.sendMessage.mockClear()
    await handleSupplierMessage({ chat: { id: 42 }, message: { text: 'iPhone 16 128 Black — 75.000 ₽ в наличии' } } as any, bot)
    expect(sentAny(ADMIN, 'Новый прайс')).toBe(false)
  })

  it('morningSummary выкл: сводка с ценами не уходит, клиентское «доброе утро» — уходит', async () => {
    setFlags(['morningSummary']); primeDb(); tg.sendMessage.mockClear()
    vi.setSystemTime(new Date('2026-09-22T08:05:00Z'))
    await runMorningSummary(tg as any, [ADMIN])
    expect(sentAny(ADMIN, 'Утренняя сводка')).toBe(false)
    expect(sentAny(CLIENT_TG, 'Доброе утро')).toBe(true) // clientAuto включён — своё шлёт
  })

  it('«пока нет новых цен»: вкл — уходит, morningSummary выкл — нет', async () => {
    vi.setSystemTime(new Date('2026-09-22T08:05:00Z'))
    for (const [off, expected] of [[[], true], [['morningSummary'], false]] as [JobName[], boolean][]) {
      setFlags(off); primeDb(); db.supplierPrice.findMany.mockResolvedValue([]); tg.sendMessage.mockClear()
      await runMorningSummary(tg as any, [ADMIN])
      expect(sentAny(ADMIN, 'пока нет новых цен'), off.join()).toBe(expected)
    }
  })

  it('/avito: гасятся только map и sync, остальные подкоманды работают', async () => {
    setFlags(['avitoCommands'])
    expect(await isAvitoCommandBlocked('map')).toBe(true)
    expect(await isAvitoCommandBlocked('sync')).toBe(true)
    for (const sub of [undefined, 'stats', 'list', 'enable_cat', 'disable_cat', 'clear_sales']) {
      expect(await isAvitoCommandBlocked(sub), String(sub)).toBe(false)
    }
  })
})

describe('fail-open: нет/битый ключ → всё включено', () => {
  it('ключа нет', async () => {
    h.store.clear()
    expect(Object.values(await loadJobs()).every(Boolean)).toBe(true)
    expect(await isAvitoCommandBlocked('map')).toBe(false)
  })

  it('разбор: выключает только явный false', () => {
    for (const raw of [null, '', '{not json', '[]', '"str"', '42', 'null',
      '{"avitoChats":"false"}', '{"avitoChats":0}', '{"avitoChats":null}', '{"unknown":false}']) {
      expect(Object.values(parseJobsConfig(raw)).every(Boolean), String(raw)).toBe(true)
    }
    expect(parseJobsConfig('{"avitoChats":false}')).toMatchObject({ avitoChats: false, avitoCommands: true, priceAlerts: true })
  })

  it('битое значение в базе → задачи работают', async () => {
    h.store.clear(); h.store.set(JOBS_SETTING, '{broken')
    expect(Object.values(await loadJobs()).every(Boolean)).toBe(true)
    expect(await isAvitoCommandBlocked('sync')).toBe(false)
  })
})

describe('запись настройки', () => {
  it('частичное тело не трогает соседей', async () => {
    setFlags(['priceAlerts'])
    const r = await setJobs('900', { avitoChats: false })
    expect(r.ok).toBe(true)
    expect(JSON.parse(h.store.get(JOBS_SETTING)!)).toEqual({
      avitoChats: false, avitoCommands: true, morningSummary: true, clientAuto: true, priceAlerts: false,
    })
  })

  it('не-булево → 422 и ничего не пишется', async () => {
    setFlags([])
    const before = h.store.get(JOBS_SETTING)
    for (const v of ['false', 0, null, 'off']) {
      const r = await setJobs('900', { clientAuto: v })
      expect(r, String(v)).toMatchObject({ ok: false, status: 422 })
    }
    expect(h.store.get(JOBS_SETTING)).toBe(before)
  })
})

describe('права: менеджер read-only', () => {
  /** Слои маршрута в express: [ownerOnly?, safe(handler)]. */
  const handlersOf = (router: any, method: string, path: string): string[] => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method])
    return layer ? layer.route.stack.map((s: any) => s.name) : []
  }

  it('PUT закрыт ownerOnly, GET — нет', async () => {
    const { adminApiRouter } = await import('../api/admin')
    const router = adminApiRouter() as any
    expect(handlersOf(router, 'put', '/settings/jobs')).toContain('ownerOnly')
    expect(handlersOf(router, 'get', '/settings/jobs')).not.toContain('ownerOnly')
  })

  it('ownerOnly: менеджер → 403, владелец → дальше (200)', async () => {
    const { ownerOnly } = await import('../api/admin')
    const mkRes = () => { const res: any = {}; res.status = vi.fn(() => res); res.json = vi.fn(() => res); return res }

    const r1 = mkRes(); const n1 = vi.fn()
    ownerOnly({ admin: { role: 'manager', telegramId: '777' }, ip: '1' } as any, r1, n1)
    expect(r1.status).toHaveBeenCalledWith(403)
    expect(n1).not.toHaveBeenCalled()

    const r2 = mkRes(); const n2 = vi.fn()
    ownerOnly({ admin: { role: 'owner', telegramId: '900' }, ip: '1' } as any, r2, n2)
    expect(n2).toHaveBeenCalled()
    expect(r2.status).not.toHaveBeenCalled()
  })
})
