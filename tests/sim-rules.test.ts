import { describe, it, expect } from 'vitest'
import { resolveSimType, detectGeneration, isAccessory, canonicalizeSim, attributesForExistingVariant, SIM_SEED, ALIAS_SEED, norm, SimRuleData, AttrAliasData } from '../lib/sim-rules'

// Словарь как после сида (id проставляем синтетически)
const RULES: SimRuleData[] = SIM_SEED.map((r, i) => ({
  id: i + 1,
  country: r.country ?? null,
  countryNorm: norm(r.country),
  brandNorm: norm(r.brand),
  modelMatch: norm(r.modelMatch),
  modelGenFrom: r.modelGenFrom ?? 0,
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
  it('сырьё приводится к каноническим', () => {
    expect(canonicalizeSim('2Sim', ALIASES)).toBe('2 SIM')
    expect(canonicalizeSim('eSim', ALIASES)).toBe('eSIM')
    expect(canonicalizeSim('e-SIM', ALIASES)).toBe('eSIM')
    expect(canonicalizeSim('1Sim+eSim', ALIASES)).toBe('SIM + eSIM')
    expect(canonicalizeSim('Dual SIM', ALIASES)).toBe('2 SIM')
  })
  it('новое значение «eSIM + eSIM» узнаётся во всех написаниях', () => {
    expect(canonicalizeSim('eSim+eSim', ALIASES)).toBe('eSIM + eSIM')
    expect(canonicalizeSim('esim + esim', ALIASES)).toBe('eSIM + eSIM')
    expect(canonicalizeSim('2 eSim', ALIASES)).toBe('eSIM + eSIM')
    expect(canonicalizeSim('Две виртуальные', ALIASES)).toBe('eSIM + eSIM')
    expect(canonicalizeSim('two eSIM', ALIASES)).toBe('eSIM + eSIM')
  })
  it('незнакомое значение канона не получает (пойдёт в обучение)', () => {
    expect(canonicalizeSim('триSIM', ALIASES)).toBeNull()
  })
})

describe('лукап по матрице владельца (база)', () => {
  it('две физические — Китай, Гонконг, Макао (любое поколение до оверрайдов)', () => {
    for (const c of ['Китай', 'Гонконг', 'Макао']) {
      expect(sim(c, `iPhone 15 128 (${c})`).simType).toBe('2 SIM')
      expect(sim(c, `iPhone 16 Pro (${c})`).simType).toBe('2 SIM')
    }
  })
  it('США — две виртуальные (eSIM + eSIM) во всех поколениях', () => {
    expect(sim('США', 'iPhone 15 128 (США)').simType).toBe('eSIM + eSIM')
    expect(sim('США', 'iPhone 17 Pro (США)').simType).toBe('eSIM + eSIM')
  })
  it('гибридные рынки — SIM + eSIM в базе', () => {
    for (const c of ['ОАЭ', 'Япония', 'Катар', 'Европа', 'Южная Корея', 'Бразилия', 'Индия', 'Сингапур']) {
      expect(sim(c, `iPhone 16 Pro (${c})`).simType).toBe('SIM + eSIM')
    }
  })
  it('страны, выпавшие из матрицы, честно уходят в очередь', () => {
    for (const c of ['Таиланд', 'Россия', 'Канада', 'Мексика']) {
      const r = sim(c, `iPhone 16 (${c})`)
      expect(r.simType).toBeNull()
      expect(r.reason).toBe('unknown')
    }
  })
})

describe('оверрайды с 17-го поколения (правило с поколением сильнее базы)', () => {
  it('Гонконг: до 17 → 2 SIM, с 17 → SIM + eSIM', () => {
    expect(sim('Гонконг', 'iPhone 16 Pro 256 (Гонконг)').simType).toBe('2 SIM')
    expect(sim('Гонконг', 'iPhone 17 Pro 256 (Гонконг)').simType).toBe('SIM + eSIM')
  })
  it('ОАЭ: до 17 → SIM + eSIM, с 17 → eSIM + eSIM', () => {
    expect(sim('ОАЭ', 'iPhone 16 (ОАЭ)').simType).toBe('SIM + eSIM')
    expect(sim('ОАЭ', 'iPhone 17 (ОАЭ)').simType).toBe('eSIM + eSIM')
  })
  it('Япония: до 17 → SIM + eSIM, с 17 → eSIM + eSIM', () => {
    expect(sim('Япония', 'iPhone 16 Pro 256 (Япония)').simType).toBe('SIM + eSIM')
    expect(sim('Япония', 'iPhone 17 Pro 256 (Япония)').simType).toBe('eSIM + eSIM')
  })
  it('Катар и Китай оверрайдов не имеют — база работает и на 17-м', () => {
    expect(sim('Катар', 'iPhone 17 (Катар)').simType).toBe('SIM + eSIM')
    expect(sim('Китай', 'iPhone 17 Pro Max (Китай)').simType).toBe('2 SIM')
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

describe('страновые правила принадлежат Apple, а не всем подряд', () => {
  it('iPhone в Индии — как раньше, SIM + eSIM', () => {
    expect(sim('Индия', 'iPhone 17 Pro 256 (Индия)', { brand: 'Apple' })).toMatchObject({ simType: 'SIM + eSIM', reason: 'country' })
  })

  it('iPhone без заполненного бренда всё равно резолвится (бренд из имени)', () => {
    expect(sim('Индия', 'iPhone 17 Pro 256 (Индия)').simType).toBe('SIM + eSIM')
  })

  it('Redmi в Индии — НЕ получает Apple-страновой SIM, уходит в очередь', () => {
    const r = sim('Индия', 'Redmi Note 15 Pro 4G 12/512 Black', { brand: 'Redmi' })
    expect(r.simType).toBeNull()
    expect(r).toMatchObject({ reason: 'unknown', missingKey: 'Индия', missingBrand: 'Redmi' })
  })

  it('и остальные андроид-бренды каталога тоже', () => {
    for (const [brand, name, country] of [
      ['Poco', 'Poco X7 Pro 5G 8/256 Yellow', 'Европа'],
      ['Google', 'Google Pixel 9a 8/256 iris', 'США'],
      ['Honor', 'Honor X8d 8/128 Gray', 'Россия'],
      ['Xiaomi', 'Xiaomi Mi 17 12/512Gb Black Leica', 'Европа'],
      ['OnePlus', 'OnePlus 13s 12/512Gb Silk Green', 'Индия'],
      ['Huawei', 'Huawei Pura 80 Pro 12/512 Black', 'Россия'],
    ] as Array<[string, string, string]>) {
      const r = sim(country, name, { brand })
      expect(r.simType).toBeNull()
      expect(r.reason).toBe('unknown')
      expect(r.missingBrand).toBe(brand)
    }
  })

  it('заведённое правило под бренд+страну начинает работать и Apple не задевает', () => {
    const learned: SimRuleData[] = [...RULES, {
      id: 999, country: 'Индия', countryNorm: 'индия', brandNorm: 'redmi',
      modelMatch: '', modelGenFrom: 0, simType: '2 SIM', source: 'learned',
    }]
    expect(resolveSimType({ country: 'Индия', brand: 'Redmi', names: ['Redmi Note 15 Pro'] }, learned, ALIASES))
      .toMatchObject({ simType: '2 SIM', reason: 'country' })
    expect(resolveSimType({ country: 'Индия', brand: 'Apple', names: ['iPhone 17 Pro (Индия)'] }, learned, ALIASES))
      .toMatchObject({ simType: 'SIM + eSIM', reason: 'country' })
  })

  it('Samsung живёт своим брендовым правилом', () => {
    expect(resolveSimType({ brand: 'Samsung', country: 'Индия', names: ['Samsung Galaxy S26 Ultra'] }, RULES, ALIASES))
      .toMatchObject({ simType: 'SIM + eSIM' })
  })

  it('модельный оверрайд Air жив', () => {
    expect(sim('Индия', 'iPhone 17 Air 256 (Индия)', { brand: 'Apple' })).toMatchObject({ simType: 'eSIM', reason: 'model' })
  })
})

describe('целостность сида', () => {
  it('все simType — из четырёх канонических', () => {
    for (const r of SIM_SEED) expect(['2 SIM', 'eSIM', 'SIM + eSIM', 'eSIM + eSIM']).toContain(r.simType)
  })
  it('у всех страновых правил проставлен бренд — иначе они накроют андроид', () => {
    for (const r of SIM_SEED) {
      if (r.country) expect(norm(r.brand)).not.toBe('')
    }
  })
  it('ключ (country, brand, modelMatch, gen) уникален — upsert не конфликтует', () => {
    const keys = SIM_SEED.map(r => `${norm(r.country)}|${norm(r.brand)}|${norm(r.modelMatch)}|${r.modelGenFrom ?? 0}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('граница PR-A: существующие варианты не переписываются словарём', () => {
  // v.attrs — то, что насчитал парсер по словарю для этой строки листа
  const dictAttrs = { 'Цвет': 'Black', 'Память': '256GB', SIM: 'SIM + eSIM' }

  it('существующий индийский eSIM остаётся eSIM (смысл не меняется на синке)', () => {
    const out = attributesForExistingVariant(dictAttrs, { SIM: 'eSIM', 'Цвет': 'Black' }, ALIASES)
    expect(out.SIM).toBe('eSIM')          // НЕ 'SIM + eSIM' — это делает только PR-B
    expect(out['Память']).toBe('256GB')   // остальные атрибуты обновляются как раньше
  })

  it('существующий «2Sim» канонизируется в «2 SIM» (метка, не смысл)', () => {
    const out = attributesForExistingVariant({ ...dictAttrs, SIM: 'eSIM' }, { SIM: '2Sim' }, ALIASES)
    expect(out.SIM).toBe('2 SIM')
  })

  it('у существующего варианта не было SIM — словарём не добавляем (это тоже правка витрины)', () => {
    const out = attributesForExistingVariant(dictAttrs, { 'Цвет': 'Black' }, ALIASES)
    expect('SIM' in out).toBe(false)
  })

  it('незнакомая существующая метка сохраняется как есть, а не заменяется словарём', () => {
    const out = attributesForExistingVariant(dictAttrs, { SIM: 'три симки' }, ALIASES)
    expect(out.SIM).toBe('три симки')
  })

  it('НОВЫЙ вариант получает значение словаря (ради этого PR-A и делался)', () => {
    // для нового варианта attributesForExistingVariant не вызывается — идут v.attrs
    expect(sim('Индия', 'iPhone 17 Pro 256 (Индия)').simType).toBe('SIM + eSIM')
  })

  it('новый iPhone с неизвестной/составной страной: SIM не ставим и не угадываем eSIM', () => {
    for (const c of ['Гонконг/США', 'Италия/США', 'Зимбабве']) {
      const r = sim(c, `iPhone 17 Pro 256 (${c})`)
      expect(r.simType).toBeNull()
      expect(r.reason).toBe('unknown')
      expect(r.missingKey).toBe(c)
    }
  })
})
