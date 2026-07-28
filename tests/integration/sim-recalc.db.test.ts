/**
 * PR-B — пересчёт SIM по каталогу: preview (три раздела), apply, откат.
 * Реальная БД (INTEGRATION_DB=1).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const RUN = process.env.INTEGRATION_DB === '1'

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any
let seedSimDictionary: any, previewRecalc: any, applyRecalc: any, rollbackRecalc: any, lastRecalcState: any

function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try { host = new URL(url).hostname } catch { /* noop */ }
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
    throw new Error(`INTEGRATION_DB=1 с не-локальной БД (host="${host}") — отказ.`)
  }
}

const OWNER = '900'

describe.skipIf(!RUN)('SIM recalc (PR-B)', () => {
  let ids: Record<string, number> = {}

  beforeAll(async () => {
    assertDisposableDb()
    ;({ prisma } = await import('../../lib/prisma'))
    ;({ seedSimDictionary } = await import('../../lib/sim-rules'))
    ;({ previewRecalc, applyRecalc, rollbackRecalc, lastRecalcState } = await import('../../lib/sim-recalc'))
  })

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({ where: { entity: { in: ['SimRecalc', 'ProductVariant'] } } })
    await prisma.productVariant.deleteMany()
    await prisma.product.deleteMany()
    await prisma.simRule.deleteMany()
    await prisma.attrValueAlias.deleteMany()
    await prisma.category.deleteMany({ where: { name: 'iPhone' } })
    await seedSimDictionary()

    const cat = await prisma.category.create({ data: { name: 'iPhone' } })
    const p = await prisma.product.create({ data: { sku: 'rb-1', name: 'Iphone 17 Pro', price: 100000, categoryId: cat.id, attributes: {} } })
    const mk = async (key: string, attrs: Record<string, string>) => {
      const v = await prisma.productVariant.create({
        data: { productId: p.id, sku: 'rb-' + key, price: 100000, quantity: 1, inStock: true, attributes: attrs },
      })
      ids[key] = v.id
      return v.id
    }
    // семантика: Индия eSIM → SIM + eSIM
    await mk('india', { fullName: 'iPhone 17 Pro 256 (Индия)', 'Страна': 'Индия', SIM: 'eSIM' })
    // косметика: 2Sim → 2 SIM
    await mk('china', { fullName: 'iPhone 17 Pro 256 (Китай)', 'Страна': 'Китай', SIM: '2Sim' })
    // наследие: правила нет, значение стоит
    await mk('mixed', { fullName: 'iPhone 15 128 (Индия/Япония)', 'Страна': 'Индия/Япония', SIM: 'eSIM' })
    // уже верное — не должно попасть никуда
    await mk('hk', { fullName: 'iPhone 17 Pro 256 (Гонконг)', 'Страна': 'Гонконг', SIM: '2 SIM' })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.auditLog.deleteMany({ where: { entity: { in: ['SimRecalc', 'ProductVariant'] } } })
    await prisma.productVariant.deleteMany()
    await prisma.product.deleteMany()
    await prisma.simRule.deleteMany()
    await prisma.attrValueAlias.deleteMany()
    await prisma.$disconnect()
  })

  const simOf = async (key: string) =>
    ((await prisma.productVariant.findUnique({ where: { id: ids[key] } })).attributes as any).SIM

  it('preview даёт три РАЗДЕЛЬНЫХ блока: смысл / метка / наследие', async () => {
    const p = await previewRecalc()
    expect(p.counts).toEqual({ semantic: 1, canonical: 1, inherited: 1 })
    expect(p.semantic[0]).toMatchObject({ variantId: ids.india, from: 'eSIM', to: 'SIM + eSIM', country: 'Индия' })
    expect(p.canonical[0]).toMatchObject({ variantId: ids.china, from: '2Sim', to: '2 SIM' })
    expect(p.inherited[0]).toMatchObject({ variantId: ids.mixed, current: 'eSIM', country: 'Индия/Япония' })
    expect(p.byCountry).toEqual({ 'Индия': 1 })
    // уже верный вариант не попал ни в один раздел
    const all = [...p.semantic, ...p.canonical, ...p.inherited].map(r => r.variantId)
    expect(all).not.toContain(ids.hk)
  })

  it('apply меняет смысл+метку, пишет старые значения в AuditLog, наследие не трогает', async () => {
    const r = await applyRecalc(OWNER)
    expect(r).toMatchObject({ ok: true, changed: 2, semantic: 1, canonical: 1, inheritedUntouched: 1 })

    expect(await simOf('india')).toBe('SIM + eSIM')
    expect(await simOf('china')).toBe('2 SIM')
    expect(await simOf('mixed')).toBe('eSIM')     // наследие нетронуто
    expect(await simOf('hk')).toBe('2 SIM')

    const logs = await prisma.auditLog.findMany({ where: { action: 'sim_recalc' }, orderBy: { id: 'asc' } })
    expect(logs).toHaveLength(2)
    const indiaLog = logs.find((l: any) => l.entityId === String(ids.india))
    expect(indiaLog.before).toEqual({ SIM: 'eSIM' })          // источник отката
    expect(indiaLog.after).toMatchObject({ SIM: 'SIM + eSIM', recalcId: r.recalcId })
  })

  it('идемпотентность: повторный apply — no-op «менять нечего»', async () => {
    await applyRecalc(OWNER)
    const again = await applyRecalc(OWNER)
    expect(again).toMatchObject({ ok: true, noop: true, changed: 0 })
    expect(await prisma.auditLog.count({ where: { action: 'sim_recalc' } })).toBe(2)
  })

  it('откат возвращает значения 1-в-1 и помечает пачку', async () => {
    const applied = await applyRecalc(OWNER)
    const rb = await rollbackRecalc(OWNER)
    expect(rb).toMatchObject({ ok: true, restored: 2, recalcId: applied.recalcId })
    expect(rb.conflicts).toHaveLength(0)
    expect(await simOf('india')).toBe('eSIM')   // вернулось
    expect(await simOf('china')).toBe('2Sim')
    const state = await lastRecalcState()
    expect(state).toMatchObject({ recalcId: applied.recalcId, rolledBack: true })
    // повторный откат той же пачки — 409
    expect((await rollbackRecalc(OWNER)).status).toBe(409)
  })

  it('конфликт-защита: строку, изменённую после apply, откат не перетирает', async () => {
    await applyRecalc(OWNER)
    // кто-то (синк/владелец) поменял значение уже после пересчёта
    const v = await prisma.productVariant.findUnique({ where: { id: ids.india } })
    await prisma.productVariant.update({
      where: { id: ids.india },
      data: { attributes: { ...(v.attributes as any), SIM: '2 SIM' } },
    })
    const rb = await rollbackRecalc(OWNER)
    expect(rb.restored).toBe(1)                       // откатился только «китайский»
    expect(rb.conflicts).toHaveLength(1)
    expect(rb.conflicts![0]).toMatchObject({ variantId: ids.india, expected: 'SIM + eSIM', actual: '2 SIM' })
    expect(await simOf('india')).toBe('2 SIM')        // чужая правка цела
  })

  it('обучение правила переводит наследие в семантические смены', async () => {
    await prisma.simRule.create({ data: { country: 'Индия/Япония', countryNorm: 'индия/япония', simType: 'SIM + eSIM', source: 'learned' } })
    const p = await previewRecalc()
    expect(p.counts.inherited).toBe(0)
    expect(p.semantic.map((r: any) => r.variantId)).toContain(ids.mixed)
  })

  it('откат без пересчёта — 404', async () => {
    expect((await rollbackRecalc(OWNER)).status).toBe(404)
  })
})
