/**
 * eSIM-only рынки поколения B (17+) — стоп-гейт PR.
 *
 * Девять стран (MacRumors 2026-09-09 + CodeeSIM) получают «eSIM + eSIM» с 17-го
 * поколения. Инварианты: поколение A этих стран не изменилось, соседние страны
 * не задеты, на любом другом входе новый сид отвечает ровно как старый, а
 * существующий вариант на синке сохраняет своё значение (витрину двигает
 * только кнопка владельца после preview).
 */
import { describe, it, expect } from 'vitest'
import {
  resolveSimType, attributesForExistingVariant, SIM_SEED, ALIAS_SEED, norm,
  type SimRuleData, type AttrAliasData, type SimType,
} from '../lib/sim-rules'

type Seed = { country?: string; brand?: string; modelMatch?: string; modelGenFrom?: number; simType: SimType }

const toRules = (seed: Seed[]): SimRuleData[] => seed.map((r, i) => ({
  id: i + 1,
  country: r.country ?? null,
  countryNorm: norm(r.country),
  brandNorm: norm(r.brand),
  modelMatch: norm(r.modelMatch),
  modelGenFrom: r.modelGenFrom ?? 0,
  simType: r.simType,
  source: 'seed',
}))

/** SIM_SEED до этого PR (master 9b568cd) — эталон «ничего больше не задели». */
const OLD_SEED: Seed[] = [
  ...['Китай', 'Гонконг', 'Макао'].map(country => ({ country, brand: 'Apple', simType: '2 SIM' as SimType })),
  { country: 'США', brand: 'Apple', simType: 'eSIM + eSIM' },
  ...['ОАЭ', 'Япония', 'Катар', 'Европа', 'Южная Корея', 'Бразилия', 'Индия', 'Сингапур']
    .map(country => ({ country, brand: 'Apple', simType: 'SIM + eSIM' as SimType })),
  { country: 'Гонконг', brand: 'Apple', modelGenFrom: 17, simType: 'SIM + eSIM' },
  { country: 'ОАЭ', brand: 'Apple', modelGenFrom: 17, simType: 'eSIM + eSIM' },
  { country: 'Япония', brand: 'Apple', modelGenFrom: 17, simType: 'eSIM + eSIM' },
  { modelMatch: 'air', modelGenFrom: 17, simType: 'eSIM' },
  { brand: 'Samsung', simType: 'SIM + eSIM' },
]

const OLD = toRules(OLD_SEED)
const NEW = toRules(SIM_SEED)
const ALIASES: AttrAliasData[] = ALIAS_SEED.map(a => ({ attrKey: a.attrKey, rawNorm: a.raw, canonical: a.canonical }))

const NINE = ['Виргинские острова США', 'Гуам', 'Канада', 'Мексика', 'Катар', 'Саудовская Аравия', 'Бахрейн', 'Кувейт', 'Оман']

const sim = (rules: SimRuleData[], country: string | null, name: string, brand: string | null = null) =>
  resolveSimType({ country, brand, names: [name] }, rules, ALIASES).simType

describe('поколение B: девять eSIM-only стран', () => {
  for (const country of NINE) {
    it(country, () => {
      expect(sim(NEW, country, 'iPhone 18 Pro 256GB Cosmic Orange')).toBe('eSIM + eSIM')
      expect(sim(NEW, country, 'iPhone 17 Pro 256GB Deep Blue')).toBe('eSIM + eSIM')
      expect(sim(NEW, country, 'iPhone 18 Pro Max 1TB Silver', 'Apple')).toBe('eSIM + eSIM')
    })
  }

  it('Air остаётся eSIM во всём мире — модельный оверрайд сильнее страны', () => {
    for (const country of NINE) expect(sim(NEW, country, 'iPhone 17 Air 256GB Sky Blue')).toBe('eSIM')
  })

  it('андроид из этих стран страновое правило Apple не получает', () => {
    for (const country of ['Катар', 'Саудовская Аравия', 'Кувейт']) {
      expect(sim(NEW, country, 'Redmi Note 18 8/256GB Black', 'Xiaomi')).toBeNull()
      expect(sim(NEW, country, 'Samsung Galaxy S26 12/256GB Black', 'Samsung')).toBe('SIM + eSIM') // своё брендовое
    }
  })
})

describe('соседи не задеты', () => {
  it('«iPhone 18 Pro» + Гонконг / Европа — как раньше', () => {
    for (const country of ['Гонконг', 'Европа']) {
      expect(sim(NEW, country, 'iPhone 18 Pro 256GB Silver')).toBe('SIM + eSIM')
      expect(sim(NEW, country, 'iPhone 18 Pro 256GB Silver')).toBe(sim(OLD, country, 'iPhone 18 Pro 256GB Silver'))
    }
  })

  it('«iPhone 18 Pro» + Великобритания — не изменилось (правила нет → null)', () => {
    expect(sim(OLD, 'Великобритания', 'iPhone 18 Pro 256GB Silver')).toBeNull()
    expect(sim(NEW, 'Великобритания', 'iPhone 18 Pro 256GB Silver')).toBeNull()
  })

  it('поколение A (14/15/16) девяти стран не изменилось: Катар SIM + eSIM, остальные null', () => {
    for (const country of NINE) {
      for (const name of ['iPhone 14 128GB Midnight', 'iPhone 15 Pro 256GB Natural', 'iPhone 16 Pro Max 512GB Desert', 'iPhone 16e 128GB Black']) {
        const expected = country === 'Катар' ? 'SIM + eSIM' : null
        expect(sim(NEW, country, name), `${country} · ${name}`).toBe(expected)
        expect(sim(NEW, country, name), `${country} · ${name}`).toBe(sim(OLD, country, name))
      }
    }
  })
})

describe('старый и новый сид одинаковы на всех прочих входах', () => {
  const COUNTRIES = [
    null, '', 'США', 'Япония', 'Гонконг', 'Индия', 'Китай', 'Макао', 'Европа', 'ОАЭ', 'Южная Корея', 'Бразилия',
    'Сингапур', 'Великобритания', 'Казахстан', 'Россия', 'Малайзия', 'Австралия', 'Таиланд', 'Гонконг/Сингапур',
    'Япония/Индия', 'КСА', 'Saudi', 'Qatar', 'катар ', ...NINE,
  ]
  const NAMES = [
    'iPhone 14 128GB Midnight', 'iPhone 15 Pro 256GB', 'iPhone 16 Pro 128GB', 'iPhone 16e 128GB',
    'iPhone 17 256GB Lavender', 'iPhone 17 Pro 256GB', 'iPhone 17 Air 256GB', 'iPhone 18 Pro 256GB', 'iPhone 18 Pro Max 1TB',
    'Samsung Galaxy S26 Ultra 12/512GB', 'Redmi Note 18 8/256GB', 'AirPods Pro 3', 'Чехол для iPhone 18 Pro', 'Apple Watch S11 46mm',
  ]
  const BRANDS = [null, 'Apple', 'Samsung', 'Xiaomi']

  it('разница только там, где страна — одна из девяти, поколение ≥ 17 и бренд Apple', () => {
    let changed = 0, total = 0
    for (const country of COUNTRIES) for (const name of NAMES) for (const brand of BRANDS) {
      total++
      const o = resolveSimType({ country, brand, names: [name] }, OLD, ALIASES)
      const n = resolveSimType({ country, brand, names: [name] }, NEW, ALIASES)
      const isNewCase = NINE.map(norm).includes(norm(country)) && /iphone 1[78]/i.test(name)
        && !/air|чехол/i.test(name) && (brand === null || brand === 'Apple')
      if (isNewCase) {
        changed++
        expect(n.simType, `${country} · ${name} · ${brand}`).toBe('eSIM + eSIM')
      } else {
        expect(n, `${country} · ${name} · ${brand}`).toEqual(o)
      }
    }
    expect(total).toBeGreaterThan(1000)
    expect(changed).toBeGreaterThan(0)
  })

  it('алиасы стран не влияют на резолв из листа: «КСА» и «Qatar» по-прежнему не узнаются', () => {
    expect(sim(NEW, 'КСА', 'iPhone 18 Pro 256GB')).toBeNull()
    expect(sim(NEW, 'Qatar', 'iPhone 18 Pro 256GB')).toBeNull()
  })
})

describe('алиасы стран для матчера прайса', () => {
  const canon = (raw: string) => ALIASES.find(a => a.attrKey === 'Страна' && a.rawNorm === norm(raw))?.canonical ?? null
  it('флаг, код, английское и русское имя → канон правила', () => {
    expect(canon('🇸🇦')).toBe('Саудовская Аравия')
    expect(canon('SA')).toBe('Саудовская Аравия')
    expect(canon('KSA')).toBe('Саудовская Аравия')
    expect(canon('Qatar')).toBe('Катар')
    expect(canon('🇻🇮')).toBe('Виргинские острова США')
    expect(canon('USVI')).toBe('Виргинские острова США')
    expect(canon('ca')).toBe('Канада')
    expect(canon('MX')).toBe('Мексика')
  })
  it('каждый канон алиаса — ровно страна правила', () => {
    for (const c of NINE) expect(ALIASES.some(a => a.attrKey === 'Страна' && a.canonical === c), c).toBe(true)
  })
  it('сырьё алиасов не пересекается (один raw — одна страна)', () => {
    const raws = ALIASES.filter(a => a.attrKey === 'Страна').map(a => a.rawNorm)
    expect(new Set(raws).size).toBe(raws.length)
  })
})

describe('мерж не двигает существующий каталог', () => {
  it('существующий Катар-18 с «SIM + eSIM» после синка по новым правилам сохраняет своё значение', () => {
    const newAttrs = { fullName: 'iPhone 18 Pro 256GB Silver (Катар)', 'Страна': 'Катар', SIM: sim(NEW, 'Катар', 'iPhone 18 Pro 256GB Silver')! }
    expect(newAttrs.SIM).toBe('eSIM + eSIM') // новый разбор посчитал бы по-новому…
    const out = attributesForExistingVariant(newAttrs, { 'Страна': 'Катар', SIM: 'SIM + eSIM' }, ALIASES)
    expect(out.SIM).toBe('SIM + eSIM')         // …но существующий вариант остаётся как был
  })

  it('существующий вариант без SIM синк не заполняет', () => {
    const out = attributesForExistingVariant({ 'Страна': 'Оман', SIM: 'eSIM + eSIM' }, { 'Страна': 'Оман' }, ALIASES)
    expect(out.SIM).toBeUndefined()
  })
})
