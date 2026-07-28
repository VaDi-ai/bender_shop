/**
 * Этап 2 / PR-A — словарь SIM на реальной БД: сид, обучение из очереди,
 * идемпотентность, и ассерт влияния на снимке каталога (12 канонизаций,
 * 64 смены, из них Индия 60).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const RUN = process.env.INTEGRATION_DB === '1'

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any
let seedSimDictionary: any, loadSimRules: any, loadAttrAliases: any, resolveSimType: any, canonicalizeSim: any, detectGeneration: any

function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try { host = new URL(url).hostname } catch { /* noop */ }
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
    throw new Error(`INTEGRATION_DB=1 с не-локальной БД (host="${host}") — отказ.`)
  }
}

/** Снимок живого каталога на момент планирования (страна × метка × кол-во). */
const CATALOG_SNAPSHOT: Array<[string, string, number]> = [
  ['Индия', 'eSIM', 60], ['Япония', 'eSIM', 49], ['ОАЭ', 'SIM + eSIM', 23],
  ['Гонконг', '2 SIM', 21], ['Россия', 'SIM + eSIM', 16], ['Казахстан', 'SIM + eSIM', 12],
  ['США', 'eSIM', 9], ['Китай', '2Sim', 8], ['Панама', 'SIM + eSIM', 4],
  ['Индия', 'SIM + eSIM', 4], ['Гонконг', '2Sim', 3], ['Европа', 'SIM + eSIM', 3],
  ['Таиланд', 'SIM + eSIM', 2], ['Сингапур', 'SIM + eSIM', 2], ['ОАЭ', 'eSIM', 2],
  ['ЮАР', 'SIM + eSIM', 2], ['Малайзия', 'SIM + eSIM', 2], ['Европа', 'eSIM', 1],
  ['Южная Корея', 'eSIM', 1], ['Япония', 'eSim', 1],
]

describe.skipIf(!RUN)('SIM dictionary (реальная БД)', () => {
  beforeAll(async () => {
    assertDisposableDb()
    ;({ prisma } = await import('../../lib/prisma'))
    ;({ seedSimDictionary, loadSimRules, loadAttrAliases, resolveSimType, canonicalizeSim, detectGeneration } = await import('../../lib/sim-rules'))
  })

  beforeEach(async () => {
    await prisma.simRule.deleteMany()
    await prisma.attrValueAlias.deleteMany()
    await prisma.auditLog.deleteMany({ where: { entity: 'SimRule' } })
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.simRule.deleteMany()
    await prisma.attrValueAlias.deleteMany()
    await prisma.$disconnect()
  })

  it('сид идемпотентен и не перетирает learned', async () => {
    const first = await seedSimDictionary()
    expect(first.rules).toBeGreaterThan(20)
    const countAfterFirst = await prisma.simRule.count()
    await seedSimDictionary()
    expect(await prisma.simRule.count()).toBe(countAfterFirst)   // дублей нет

    // владелец поправил правило под себя → сид его не трогает
    const india = await prisma.simRule.findFirst({ where: { countryNorm: 'индия', modelGenFrom: 0 } })
    await prisma.simRule.update({ where: { id: india.id }, data: { simType: 'eSIM', source: 'learned' } })
    await seedSimDictionary()
    expect((await prisma.simRule.findUnique({ where: { id: india.id } })).simType).toBe('eSIM')
  })

  it('обучение из очереди: неизвестная страна → правило → резолвится', async () => {
    await seedSimDictionary()
    let rules = await loadSimRules()
    const aliases = await loadAttrAliases('SIM')
    const input = { country: 'Гонконг/США', names: ['iPhone 17 Pro 256 (Гонконг/США)'] }
    expect(resolveSimType(input, rules, aliases)).toMatchObject({ simType: null, reason: 'unknown', missingKey: 'Гонконг/США' })

    await prisma.simRule.create({ data: { country: 'Гонконг/США', countryNorm: 'гонконг/сша', simType: '2 SIM', source: 'learned' } })
    rules = await loadSimRules()
    expect(resolveSimType(input, rules, aliases)).toMatchObject({ simType: '2 SIM', reason: 'country' })
  })

  it('обучение нового значения атрибута: сырьё → канон', async () => {
    await seedSimDictionary()
    let aliases = await loadAttrAliases('SIM')
    expect(canonicalizeSim('две симки', aliases)).toBeNull()
    await prisma.attrValueAlias.create({ data: { attrKey: 'SIM', rawNorm: 'две симки', canonical: '2 SIM', source: 'learned' } })
    aliases = await loadAttrAliases('SIM')
    expect(canonicalizeSim('Две Симки', aliases)).toBe('2 SIM')
  })

  it('ассерт влияния на снимке каталога: 12 канонизаций, 64 смены, Индия 60', async () => {
    await seedSimDictionary()
    const rules = await loadSimRules()
    const aliases = await loadAttrAliases('SIM')

    let canon = 0, changed = 0
    const byCountry: Record<string, number> = {}
    for (const [country, label, count] of CATALOG_SNAPSHOT) {
      // все строки снимка — iPhone 17-го поколения, кроме явно японских 16-х
      const name = `iPhone 17 Pro 256 (${country})`
      const curCanon = canonicalizeSim(label, aliases) ?? label
      if (curCanon !== label) canon += count
      const want = resolveSimType({ country, names: [name] }, rules, aliases)
      if (want.simType && want.simType !== curCanon) {
        changed += count
        byCountry[country] = (byCountry[country] ?? 0) + count
      }
    }
    expect(canon).toBe(12)                 // 2Sim ×11 + eSim ×1
    expect(byCountry['Индия']).toBe(60)    // главное изменение витрины
    expect(changed).toBe(64)               // Индия 60 + ОАЭ 2 + Европа 1 + Япония 1
  })

  it('фильтр аксессуаров на живой выборке имён', async () => {
    await seedSimDictionary()
    const rules = await loadSimRules()
    const aliases = await loadAttrAliases('SIM')
    for (const n of ['Защитное стекло Remax для iPhone', 'Чехол Apple для iPhone 17 Pro', 'Кабель USB-C для iPhone']) {
      expect(resolveSimType({ country: 'Китай', names: [n] }, rules, aliases).simType).toBeNull()
    }
    expect(detectGeneration('Защитное стекло Remax для iPhone')).toBeNull()
  })
})
