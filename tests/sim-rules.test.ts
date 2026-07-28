import { describe, it, expect } from 'vitest'
import { resolveSimType, detectGeneration, isAccessory, canonicalizeSim, SIM_SEED, ALIAS_SEED, norm, SimRuleData, AttrAliasData } from '../lib/sim-rules'

// Словарь как после сида (id проставляем синтетически)
const RULES: SimRuleData[] = SIM_SEED.map((r, i) => ({
  id: i + 1,
  country: r.country ?? null,
  countryNorm: norm(r.country),
  brand: r.brand ?? null,
  modelMatch: r.modelMatch ?? null,
  modelGenFrom: r.modelGenFrom ?? null,
  simType: r.simType,
  source: 'seed',
}))
const ALIASES: AttrAliasData[] = ALIAS_SEED.map(a => ({ attrKey: a.attrKey, rawNorm: a.raw, canonical: a.canonical }))

const sim = (country: string | null, name: string, extra: Record<string, unknown> = {}) =>
  resolveSimType({ country, names: [name], ...extra }, RULES, ALIASES)

describe('detectGeneration', () => {
  it('читает поколение из полного имени и имени товара', () => {
    expect(detectGeneration('iPhone 17 Pro Max 256GB Black (Индия)')).toBe(17)
    expect(detectGeneration(null, 'Iphone 16e')).toBe(16)
    expect(detectGeneration('Apple iPhone SE 3 64GB')).toBe(3 <= 4 ? null : 3) // SE вне диапазона → null
  })
  it('не принимает мусор за поколение', () => {
    expect(detectGeneration('iPhone 128GB Black')).toBeNull()
    expect(detectGeneration('MacBook Air M5')).toBeNull()
  })
})

describe('канонизация меток', () => {
  it('сырьё приводится к трём каноническим', () => {
    expect(canonicalizeSim('2Sim', ALIASES)).toBe('2 SIM')
    expect(canonicalizeSim('eSim', ALIASES)).toBe('eSIM')
    expect(canonicalizeSim('e-SIM', ALIASES)).toBe('eSIM')
    expect(canonicalizeSim('1Sim+eSim', ALIASES)).toBe('SIM + eSIM')
    expect(canonicalizeSim('Dual SIM', ALIASES)).toBe('2 SIM')
  })
  it('незнакомое значение канона не получает (пойдёт в обучение)', () => {
    expect(canonicalizeSim('триSIM', ALIASES)).toBeNull()
  })
})

describe('лукап по странам сида', () => {
  it('две физические — Китай, Гонконг, Макао (любое поколение)', () => {
    for (const c of ['Китай', 'Гонконг', 'Макао']) {
      expect(sim(c, `iPhone 17 Pro 256 (${c})`).simType).toBe('2 SIM')
      expect(sim(c, `iPhone 15 128 (${c})`).simType).toBe('2 SIM')
    }
  })
  it('США — eSIM во всех поколениях каталога', () => {
    expect(sim('США', 'iPhone 15 128 (США)').simType).toBe('eSIM')
    expect(sim('США', 'iPhone 17 Pro (США)').simType).toBe('eSIM')
  })
  it('гибридные рынки — SIM + eSIM в любом поколении', () => {
    for (const c of ['Европа', 'Индия', 'Таиланд', 'Казахстан', 'Индонезия', 'Россия', 'Панама', 'Малайзия', 'Сингапур', 'ЮАР']) {
      expect(sim(c, `iPhone 17 Pro (${c})`).simType).toBe('SIM + eSIM')
    }
  })
})

describe('generation-переезд (17+ → eSIM-only)', () => {
  it('Япония: 16 → SIM + eSIM, 17 → eSIM', () => {
    expect(sim('Япония', 'iPhone 16 Pro 256 (Япония)').simType).toBe('SIM + eSIM')
    expect(sim('Япония', 'iPhone 17 Pro 256 (Япония)').simType).toBe('eSIM')
  })
  it('ОАЭ и остальные рынки Залива/Америк — так же', () => {
    for (const c of ['ОАЭ', 'Канада', 'Мексика', 'Саудовская Аравия', 'Бахрейн', 'Кувейт', 'Оман', 'Катар', 'Гуам']) {
      expect(sim(c, `iPhone 16 (${c})`).simType).toBe('SIM + eSIM')
      expect(sim(c, `iPhone 17 (${c})`).simType).toBe('eSIM')
    }
  })
})

describe('модельный оверрайд Air', () => {
  it('iPhone 17 Air → eSIM в любой стране, включая 2-SIM рынки', () => {
    expect(sim('Китай', 'iPhone 17 Air 256 (Китай)')).toMatchObject({ simType: 'eSIM', reason: 'model' })
    expect(sim('Индия', 'Iphone 17 Air 512 (Индия)')).toMatchObject({ simType: 'eSIM', reason: 'model' })
  })
  it('обычный 17 в Китае остаётся 2 SIM (оверрайд не задевает)', () => {
    expect(sim('Китай', 'iPhone 17 Pro Max (Китай)').simType).toBe('2 SIM')
  })
})

describe('приоритеты и границы', () => {
  it('явная метка перебивает словарь', () => {
    const r = resolveSimType({ explicit: '2Sim', country: 'Индия', names: ['iPhone 17 (Индия)'] }, RULES, ALIASES)
    expect(r).toMatchObject({ simType: '2 SIM', reason: 'explicit' })
  })
  it('нет правила → не угадываем, отдаём ключ в очередь', () => {
    const r = sim('Зимбабве', 'iPhone 17 Pro (Зимбабве)')
    expect(r.simType).toBeNull()
    expect(r).toMatchObject({ reason: 'unknown', missingKey: 'Зимбабве' })
  })
  it('составная страна — отдельный ключ обучения, «первая» не выигрывает', () => {
    const r = sim('Гонконг/США', 'iPhone 17 (Гонконг/США)')
    expect(r.simType).toBeNull()
    expect(r.missingKey).toBe('Гонконг/США')
  })
  it('аксессуар «для iPhone» SIM не получает', () => {
    expect(sim('Китай', 'Защитное стекло Remax для iPhone (Китай)')).toMatchObject({ simType: null, reason: 'accessory' })
    expect(sim('США', 'Чехол для iPhone 17 Pro (США)').simType).toBeNull()
  })
  it('Samsung без страны — брендовое правило из бывшего хардкода', () => {
    const r = resolveSimType({ brand: 'Samsung', country: null, names: ['Samsung Galaxy S26 Ultra'] }, RULES, ALIASES)
    expect(r.simType).toBe('SIM + eSIM')
  })
})

describe('целостность сида', () => {
  it('все simType — из трёх канонических', () => {
    for (const r of SIM_SEED) expect(['2 SIM', 'eSIM', 'SIM + eSIM']).toContain(r.simType)
  })
  it('ключ (country, brand, modelMatch, gen) уникален — upsert не конфликтует', () => {
    const keys = SIM_SEED.map(r => `${norm(r.country)}|${r.brand ?? ''}|${r.modelMatch ?? ''}|${r.modelGenFrom ?? ''}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
