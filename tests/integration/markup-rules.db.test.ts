/**
 * PR-9 — веб-CRUD правил наценки (реальная БД, INTEGRATION_DB=1).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const RUN = process.env.INTEGRATION_DB === '1'

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any
let listMarkupRules: any, createMarkupRule: any, updateMarkupRule: any, setMarkupRuleEnabled: any

function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try { host = new URL(url).hostname } catch { /* noop */ }
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
    throw new Error(`INTEGRATION_DB=1 с не-локальной БД (host="${host}") — отказ.`)
  }
}

function call(handler: any, { body = {}, params = {}, query = {}, role = 'owner' }: any = {}) {
  const req = { body, params, query, admin: { telegramId: '111', name: null, role }, ip: 't' }
  let status = 200
  let jsonBody: any = null
  const res = { status(c: number) { status = c; return this }, json(b: any) { jsonBody = b; return this } }
  return handler(req, res).then(() => ({ status, body: jsonBody }))
}

describe.skipIf(!RUN)('markup rules CRUD (реальная БД)', () => {
  beforeAll(async () => {
    assertDisposableDb()
    ;({ prisma } = await import('../../lib/prisma'))
    ;({ listMarkupRules, createMarkupRule, updateMarkupRule, setMarkupRuleEnabled } = await import('../../api/admin'))
  })

  beforeEach(async () => {
    await prisma.markupRule.deleteMany()
    await prisma.auditLog.deleteMany({ where: { entity: 'MarkupRule' } })
    await prisma.securityLog.deleteMany({ where: { event: 'markup_rule_changed' } })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.markupRule.deleteMany()
    await prisma.$disconnect()
  })

  it('CRUD-цикл: create ×2 (цепочка) → list → update → аудит с дельтой', async () => {
    const r1 = await call(createMarkupRule, { body: { minCost: 0, maxCost: 100000, mode: 'fixed', value: 15000, channel: 'site' } })
    expect(r1.status).toBe(201)
    expect(r1.body.integrityWarning).toBeTruthy() // цепочка ещё не до бесконечности — warning, не блок
    const r2 = await call(createMarkupRule, { body: { minCost: 100000, maxCost: null, mode: 'percent', value: 12, channel: 'site' } })
    expect(r2.status).toBe(201)
    expect(r2.body.integrityWarning).toBeNull() // набор замкнулся

    const list = await call(listMarkupRules, {})
    expect(list.body).toHaveLength(2)
    expect(list.body[0]).toMatchObject({ minCost: 0, maxCost: 100000, value: 15000, channel: 'site', enabled: true })

    const upd = await call(updateMarkupRule, { params: { id: String(r1.body.id) }, body: { value: 16000 } })
    expect(upd.status).toBe(200)
    expect(upd.body.value).toBe(16000)

    await new Promise(r => setTimeout(r, 300))
    const logs = await prisma.auditLog.findMany({ where: { entity: 'MarkupRule' }, orderBy: { id: 'asc' } })
    expect(logs.map((l: any) => l.action)).toEqual(['create', 'create', 'update'])
    expect(logs[2].before).toEqual({ value: 15000 })
    expect(logs[2].after).toEqual({ value: 16000 })
    expect(await prisma.securityLog.count({ where: { event: 'markup_rule_changed' } })).toBe(3)
  })

  it('целостность набора: правка с дырой → 422, набор в БД не тронут', async () => {
    const a = await call(createMarkupRule, { body: { minCost: 0, maxCost: 100000, mode: 'fixed', value: 15000 } })
    await call(createMarkupRule, { body: { minCost: 100000, maxCost: null, mode: 'percent', value: 12 } })
    const bad = await call(updateMarkupRule, { params: { id: String(a.body.id) }, body: { maxCost: 90000 } })
    expect(bad.status).toBe(422)
    expect(bad.body.error).toContain('ломается')
    expect(Number((await prisma.markupRule.findUnique({ where: { id: a.body.id } })).maxCost)).toBe(100000)
  })

  it('enable в PUT запрещён; disable рвущий валидную цепочку → 422; опустошение канала валидно', async () => {
    const a = await call(createMarkupRule, { body: { minCost: 0, maxCost: null, mode: 'fixed', value: 15000 } })
    expect((await call(updateMarkupRule, { params: { id: String(a.body.id) }, body: { enabled: false } })).status).toBe(422)

    // цепочка из двух: выключение любого звена рвёт валидный набор → 422
    await prisma.markupRule.update({ where: { id: a.body.id }, data: { maxCost: 100000 } })
    const b = await call(createMarkupRule, { body: { minCost: 100000, maxCost: null, mode: 'percent', value: 12 } })
    expect((await call(setMarkupRuleEnabled(false), { params: { id: String(a.body.id) } })).status).toBe(422)
    expect((await call(setMarkupRuleEnabled(false), { params: { id: String(b.body.id) } })).status).toBe(422)

    // опустошение канала валидно из одиночного правила {0..∞}: осознанный
    // трейдофф — многозвенный валидный набор нельзя погасить по одному
    // (каждый шаг оставлял бы дыру в ценах); вопрос UX-послаблений — владельцу
    const single = await prisma.markupRule.create({ data: { minCost: 0, maxCost: null, mode: 'fixed', value: 1, channel: 'avito', enabled: true } })
    expect((await call(setMarkupRuleEnabled(false), { params: { id: String(single.id) } })).body.ok).toBe(true)
  })

  it('avito-канал живёт отдельно: правило avito не ломает целостность site', async () => {
    await call(createMarkupRule, { body: { minCost: 0, maxCost: null, mode: 'fixed', value: 15000, channel: 'site' } })
    const av = await call(createMarkupRule, { body: { minCost: 0, maxCost: null, mode: 'percent', value: 40, channel: 'avito' } })
    expect(av.status).toBe(201)
    expect((await call(listMarkupRules, {})).body).toHaveLength(2)
  })
})
