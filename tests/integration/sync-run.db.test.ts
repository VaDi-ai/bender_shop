/**
 * Интеграционные тесты SyncRun-хелперов (первый писатель в новую таблицу, PR-4).
 * Гейт и предохранитель — те же, что в admin-db.test.ts.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const RUN = process.env.INTEGRATION_DB === '1'

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any
let syncRunStart: any
let syncRunFinish: any

function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try { host = new URL(url).hostname } catch { /* noop */ }
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
    throw new Error(`INTEGRATION_DB=1 с не-локальной БД (host="${host}") — отказ.`)
  }
}

describe.skipIf(!RUN)('syncRunStart / syncRunFinish (реальная БД)', () => {
  beforeAll(async () => {
    assertDisposableDb()
    ;({ prisma } = await import('../../lib/prisma'))
    ;({ syncRunStart, syncRunFinish } = await import('../../lib/sync-run'))
  })

  beforeEach(async () => { await prisma.syncRun.deleteMany() })
  afterAll(async () => {
    if (!prisma) return
    await prisma.syncRun.deleteMany()
    await prisma.$disconnect()
  })

  it('start → finish: полный жизненный цикл прогона', async () => {
    const id = await syncRunStart({ trigger: 'cron' })
    expect(id).toBeTypeOf('number')
    await syncRunFinish(id, { ok: true, rowsRead: 845, created: 0, updated: 146, disabled: 945, writebacks: 3, errors: [] })
    const run = await prisma.syncRun.findUnique({ where: { id } })
    expect(run.ok).toBe(true)
    expect(run.trigger).toBe('cron')
    expect(run.rowsRead).toBe(845)
    expect(run.finishedAt).not.toBeNull()
    expect(run.errors).toBeNull() // пустой список ошибок не пишем
  })

  it('manual-прогон хранит startedBy; ошибки обрезаются до 100 + хвост-счётчик', async () => {
    const id = await syncRunStart({ trigger: 'manual', startedBy: '924498094' })
    const manyErrors = Array.from({ length: 150 }, (_, i) => `err ${i}`)
    await syncRunFinish(id, { ok: false, errors: manyErrors })
    const run = await prisma.syncRun.findUnique({ where: { id } })
    expect(run.startedBy).toBe('924498094')
    expect(run.ok).toBe(false)
    expect(run.errors).toHaveLength(101)
    expect(run.errors[100]).toContain('ещё 50')
  })

  it('finish(null) — no-op (журнал недоступен при старте → синк не падает)', async () => {
    await expect(syncRunFinish(null, { ok: true })).resolves.toBeUndefined()
    expect(await prisma.syncRun.count()).toBe(0)
  })
})
