/**
 * Этап 2 / PR-A — словарь SIM на реальной БД: сид, обучение из очереди,
 * идемпотентность, и ассерт влияния на снимке каталога (12 канонизаций,
 * 64 смены, из них Индия 60).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const RUN = process.env.INTEGRATION_DB === '1'

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any
let seedSimDictionary: any, loadSimRules: any, loadAttrAliases: any, resolveSimType: any, canonicalizeSim: any, detectGeneration: any, attributesForExistingVariant: any

function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try { host = new URL(url).hostname } catch { /* noop */ }
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
    throw new Error(`INTEGRATION_DB=1 с не-локальной БД (host="${host}") — отказ.`)
  }
}

/**
 * Реальное влияние полного сида, посчитанное на живом каталоге (28.07.2026):
 * 12 канонизаций метки + 65 смен значения, из них Индия 60.
 * Строки снимка — (страна, текущая метка, поколение, кол-во).
 */
const CATALOG_SNAPSHOT: Array<[string, string, number, number]> = [
  ['Индия', 'eSIM', 17, 60], ['Япония', 'eSIM', 17, 48], ['Япония', 'eSIM', 16, 1],
  ['ОАЭ', 'SIM + eSIM', 16, 23], ['Гонконг', '2 SIM', 17, 21], ['Россия', 'SIM + eSIM', 17, 16],
  ['Казахстан', 'SIM + eSIM', 17, 12], ['США', 'eSIM', 17, 9], ['Китай', '2Sim', 17, 8],
  ['Панама', 'SIM + eSIM', 17, 4], ['Индия', 'SIM + eSIM', 17, 4], ['Гонконг', '2Sim', 17, 3],
  ['Европа', 'SIM + eSIM', 17, 3], ['Таиланд', 'SIM + eSIM', 17, 2], ['Сингапур', 'SIM + eSIM', 17, 2],
  ['ОАЭ', 'eSIM', 16, 2], ['ЮАР', 'SIM + eSIM', 17, 2], ['Малайзия', 'SIM + eSIM', 17, 2],
  ['Европа', 'eSIM', 17, 1], ['Южная Корея', 'eSIM', 17, 1], ['Япония', 'eSim', 17, 1],
]

describe.skipIf(!RUN)('SIM dictionary (реальная БД)', () => {
  beforeAll(async () => {
    assertDisposableDb()
    ;({ prisma } = await import('../../lib/prisma'))
    ;({ seedSimDictionary, loadSimRules, loadAttrAliases, resolveSimType, canonicalizeSim, detectGeneration, attributesForExistingVariant } = await import('../../lib/sim-rules'))
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
    expect(first.rules).toBeGreaterThan(15)   // матрица владельца: 17 правил
    const countAfterFirst = await prisma.simRule.count()
    await seedSimDictionary()
    expect(await prisma.simRule.count()).toBe(countAfterFirst)   // дублей нет

    // владелец поправил правило под себя → сид его не трогает
    const india = await prisma.simRule.findFirst({ where: { countryNorm: 'индия', modelGenFrom: 0 } })
    await prisma.simRule.update({ where: { id: india.id }, data: { simType: 'eSIM', source: 'learned' } })
    await seedSimDictionary()
    expect((await prisma.simRule.findUnique({ where: { id: india.id } })).simType).toBe('eSIM')
  })

  it('миграция сида: устаревшие seed-правила уходят (бесбрендовые и выпавшие из матрицы), learned остаются', async () => {
    // как выглядел словарь до привязки к бренду
    await prisma.simRule.create({ data: { country: 'Индия', countryNorm: 'индия', brandNorm: '', modelMatch: '', modelGenFrom: 0, simType: 'SIM + eSIM', source: 'seed' } })
    await prisma.simRule.create({ data: { country: 'Зимбабве', countryNorm: 'зимбабве', brandNorm: '', modelMatch: '', modelGenFrom: 0, simType: '2 SIM', source: 'learned' } })
    // seed-правило страны, выпавшей из матрицы владельца (Канада была в старом сиде)
    await prisma.simRule.create({ data: { country: 'Канада', countryNorm: 'канада', brandNorm: 'apple', modelMatch: '', modelGenFrom: 0, simType: 'SIM + eSIM', source: 'seed' } })

    await seedSimDictionary()

    expect(await prisma.simRule.findFirst({ where: { countryNorm: 'индия', brandNorm: '' } })).toBeNull()
    expect((await prisma.simRule.findFirst({ where: { countryNorm: 'индия', brandNorm: 'apple', modelGenFrom: 0 } })).simType).toBe('SIM + eSIM')
    // выпавшая из матрицы страна отозвана — её связки вернутся в очередь
    expect(await prisma.simRule.findFirst({ where: { countryNorm: 'канада' } })).toBeNull()
    // правило владельца не тронуто
    expect((await prisma.simRule.findFirst({ where: { countryNorm: 'зимбабве' } })).source).toBe('learned')

    // и на живом резолве: iPhone — как раньше, Redmi — в очередь
    const rules = await loadSimRules()
    const aliases = await loadAttrAliases('SIM')
    expect(resolveSimType({ country: 'Индия', brand: 'Apple', names: ['iPhone 17 Pro (Индия)'] }, rules, aliases).simType).toBe('SIM + eSIM')
    expect(resolveSimType({ country: 'Индия', brand: 'Redmi', names: ['Redmi Note 15 Pro'] }, rules, aliases))
      .toMatchObject({ simType: null, reason: 'unknown', missingBrand: 'Redmi' })
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
    for (const [country, label, gen, count] of CATALOG_SNAPSHOT) {
      const name = `iPhone ${gen} Pro 256 (${country})`
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
    expect(changed).toBe(65)               // Индия 60 + ОАЭ 2 + Европа 1 + Япония 1 + Корея 1
    // ОАЭ 16-го поколения (23 шт) НЕ меняются: правило «с 17-го → eSIM» их не задевает
    expect(byCountry['ОАЭ']).toBe(2)
  })

  it('путь синка: существующие варианты каталога не меняют смысл SIM, только метку', async () => {
    await seedSimDictionary()
    const rules = await loadSimRules()
    const aliases = await loadAttrAliases('SIM')

    // Эмулируем то, что делает buildPrismaOp для существующих вариантов:
    // v.attrs посчитан словарём, existing.attributes — то, что уже в каталоге.
    const catalog = [
      { name: 'существующий индийский', existing: { SIM: 'eSIM', 'Страна': 'Индия' }, country: 'Индия', expect: 'eSIM' },
      { name: 'существующий китайский 2Sim', existing: { SIM: '2Sim', 'Страна': 'Китай' }, country: 'Китай', expect: '2 SIM' },
      { name: 'существующий японский', existing: { SIM: 'eSIM', 'Страна': 'Япония' }, country: 'Япония', expect: 'eSIM' },
    ]
    let semanticChanges = 0, labelChanges = 0
    for (const c of catalog) {
      const dictAttrs = { ...c.existing } as Record<string, string>
      const want = resolveSimType({ country: c.country, names: [`iPhone 17 Pro (${c.country})`] }, rules, aliases)
      if (want.simType) dictAttrs.SIM = want.simType          // как посчитал бы парсер
      const merged = attributesForExistingVariant(dictAttrs, c.existing, aliases)
      expect(merged.SIM).toBe(c.expect)
      if (merged.SIM !== c.existing.SIM) labelChanges++
      if (merged.SIM !== (canonicalizeSim(c.existing.SIM, aliases) ?? c.existing.SIM)) semanticChanges++
    }
    expect(semanticChanges).toBe(0)   // ни одной смены смысла на синке
    expect(labelChanges).toBe(1)      // ровно канонизация «2Sim» → «2 SIM»
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
