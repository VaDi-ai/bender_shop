/**
 * PR-5 — веб-CRUD поставщиков (реальная БД, INTEGRATION_DB=1).
 * Хендлеры зовутся напрямую с мок req/res (auth-слой покрыт admin-db.test.ts).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const RUN = process.env.INTEGRATION_DB === '1'

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any
let listSuppliers: any, createSupplier: any, updateSupplier: any, setSupplierActive: any

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
  const res = {
    status(c: number) { status = c; return this },
    json(b: any) { jsonBody = b; return this },
  }
  return handler(req, res).then(() => ({ status, body: jsonBody }))
}

describe.skipIf(!RUN)('suppliers CRUD (реальная БД)', () => {
  beforeAll(async () => {
    assertDisposableDb()
    ;({ prisma } = await import('../../lib/prisma'))
    ;({ listSuppliers, createSupplier, updateSupplier, setSupplierActive } = await import('../../api/admin'))
  })

  beforeEach(async () => {
    await prisma.supplierPrice.deleteMany()
    await prisma.supplier.deleteMany()
    await prisma.auditLog.deleteMany({ where: { entity: 'Supplier' } })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.supplierPrice.deleteMany()
    await prisma.supplier.deleteMany()
    await prisma.auditLog.deleteMany({ where: { entity: 'Supplier' } })
    await prisma.$disconnect()
  })

  it('полный цикл: create → list → update → deactivate → activate', async () => {
    const created = await call(createSupplier, { body: { name: 'Дубай-опт', markup: 12.5, priceTtlDays: 5 } })
    expect(created.status).toBe(201)
    expect(created.body.chatId).toMatch(/^web:[0-9a-f-]{36}$/) // сервер сгенерил сам
    expect(created.body.markup).toBe(12.5)

    const id = created.body.id
    const listed = await call(listSuppliers, {})
    expect(listed.body).toHaveLength(1)

    const updated = await call(updateSupplier, { params: { id: String(id) }, body: { markup: 20, notes: 'ок' } })
    expect(updated.status).toBe(200)
    expect(updated.body.markup).toBe(20)

    const off = await call(setSupplierActive(false), { params: { id: String(id) } })
    expect(off.body.ok).toBe(true)
    expect((await call(listSuppliers, {})).body).toHaveLength(0) // ушёл из списка по умолчанию
    expect((await call(listSuppliers, { query: { includeInactive: '1' } })).body).toHaveLength(1)

    const on = await call(setSupplierActive(true), { params: { id: String(id) } })
    expect(on.body.ok).toBe(true)
  })

  it('клиентский chatId игнорируется полностью — 422, а не подмена', async () => {
    const r = await call(createSupplier, { body: { name: 'X', chatId: '123456' } })
    expect(r.status).toBe(422)
    expect(r.body.fields.map((f: any) => f.field)).toContain('chatId')
  })

  it('дубль имени → 409 с полем из meta.target', async () => {
    await call(createSupplier, { body: { name: 'Гонконг-1' } })
    const dup = await call(createSupplier, { body: { name: 'Гонконг-1' } })
    expect(dup.status).toBe(409)
    expect(dup.body.field).toBe('name')
    expect(dup.body.error).toContain('именем')
  })

  it('AuditLog: create/update/deactivate пишут дельту', async () => {
    const created = await call(createSupplier, { body: { name: 'Ауди-тест', markup: 10 } })
    await call(updateSupplier, { params: { id: String(created.body.id) }, body: { markup: 15 } })
    await call(setSupplierActive(false), { params: { id: String(created.body.id) } })
    await new Promise(r => setTimeout(r, 300)) // logAdminAction — fire-and-forget
    const logs = await prisma.auditLog.findMany({ where: { entity: 'Supplier' }, orderBy: { id: 'asc' } })
    expect(logs.map((l: any) => l.action)).toEqual(['create', 'update', 'deactivate'])
    expect(logs[1].before).toEqual({ markup: 10 })
    expect(logs[1].after).toEqual({ markup: 15 })
  })

  it('деактивация не трогает SupplierPrice (история цен остаётся)', async () => {
    const created = await call(createSupplier, { body: { name: 'С историей' } })
    await prisma.supplierPrice.create({
      data: { supplierId: created.body.id, model: 'iPhone 17', price: 70000, rawMessage: 'test' },
    })
    await call(setSupplierActive(false), { params: { id: String(created.body.id) } })
    expect(await prisma.supplierPrice.count({ where: { supplierId: created.body.id } })).toBe(1)
  })

  it('несуществующий id → 404; пустой PUT → 422', async () => {
    expect((await call(updateSupplier, { params: { id: '99999' }, body: { name: 'x' } })).status).toBe(404)
    const created = await call(createSupplier, { body: { name: 'Пустой PUT' } })
    expect((await call(updateSupplier, { params: { id: String(created.body.id) }, body: {} })).status).toBe(422)
  })
})
