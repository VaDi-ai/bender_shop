import { describe, it, expect, beforeEach } from 'vitest'
import {
  extractProductName,
  parsePhotoUrls,
  mergeVariantPhotoUrls,
  filterPlaceholderPhotoUrls,
  sanitizeSyncedPhotoUrls,
  aggregateProductAttributes,
  getAttributes,
  simCtx,
  SheetRow,
} from '../lib/sheets-sync'
import { SIM_SEED, ALIAS_SEED, SimRuleData, AttrAliasData, attributesForExistingVariant } from '../lib/sim-rules'

describe('extractProductName', () => {
  it('iPhone: removes color, memory, country', () => {
    expect(extractProductName('iPhone 16 Pro 256GB Desert', 'Apple'))
      .toBe('Iphone 16 Pro')
  })

  it('Samsung: removes article, memory, SIM', () => {
    expect(extractProductName('Samsung Galaxy S26 Ultra 12/256GB Black', 'Samsung'))
      .toBe('Samsung Galaxy S26 Ultra')
  })

  it('iPad: removes chip, connectivity, memory', () => {
    expect(extractProductName('iPad Air 11 128GB Space Gray Wi-Fi M3', 'Apple'))
      .toBe('Ipad Air 11')
  })

  it('MacBook: removes screen size, config', () => {
    expect(extractProductName('MacBook Air 13 M5 16GB 512GB Midnight', 'Apple'))
      .toBe('Macbook Air M5')
  })

  it('MacBook NEO: does not include chip in name', () => {
    expect(extractProductName('MacBook NEO 256Gb Silver', 'Apple'))
      .toBe('Macbook NEO')
  })

  it('Apple Watch: removes size, band, material', () => {
    expect(extractProductName('Apple Watch Ultra 2 49 Black Ti Black Ocean Band', 'Apple'))
      .toBe('Apple Watch Ultra 2')
  })
})

describe('parsePhotoUrls', () => {
  it('парсит одну URL', () => {
    expect(parsePhotoUrls('https://example.com/photo.jpg'))
      .toEqual(['https://example.com/photo.jpg'])
  })

  it('парсит несколько URL через запятую', () => {
    expect(parsePhotoUrls('https://a.com/1.jpg, https://b.com/2.jpg, https://c.com/3.jpg'))
      .toEqual(['https://a.com/1.jpg', 'https://b.com/2.jpg', 'https://c.com/3.jpg'])
  })

  it('обрабатывает URL с query string содержащим запятую', () => {
    expect(parsePhotoUrls('https://a.com/photo?size=100,200'))
      .toEqual(['https://a.com/photo?size=100,200'])
  })

  it('возвращает пустой массив для пустой строки', () => {
    expect(parsePhotoUrls('')).toEqual([])
    expect(parsePhotoUrls('   ')).toEqual([])
  })

  it('фильтрует невалидные значения', () => {
    expect(parsePhotoUrls('not-a-url, https://valid.com/photo.jpg'))
      .toEqual(['https://valid.com/photo.jpg'])
  })

  it('обрезает пробелы', () => {
    expect(parsePhotoUrls('  https://a.com/1.jpg ,  https://b.com/2.jpg  '))
      .toEqual(['https://a.com/1.jpg', 'https://b.com/2.jpg'])
  })

  it('принимает относительные пути CDN', () => {
    expect(parsePhotoUrls('/photos/item.webp')).toEqual(['/photos/item.webp'])
    expect(parsePhotoUrls('/photos/a.webp, /photos/b.webp')).toEqual(['/photos/a.webp', '/photos/b.webp'])
  })

  it('снимает обрамляющие кавычки (вставка из таблиц)', () => {
    expect(parsePhotoUrls('"https://a.com/a.webp"')).toEqual(['https://a.com/a.webp'])
  })

  it('поддерживает http (без s)', () => {
    expect(parsePhotoUrls('http://insecure.com/photo.jpg'))
      .toEqual(['http://insecure.com/photo.jpg'])
  })
})

describe('filterPlaceholderPhotoUrls / sanitizeSyncedPhotoUrls', () => {
  it('убирает no-photo заглушки (относительные и абсолютные URL)', () => {
    expect(
      filterPlaceholderPhotoUrls([
        '/photos/item.webp',
        '/no-photo.webp',
        'https://bendershop.store/no-photo.png',
      ]),
    ).toEqual(['/photos/item.webp'])
  })

  it('sanitizeSyncedPhotoUrls: парсинг + фильтрация через запятую', () => {
    expect(sanitizeSyncedPhotoUrls('https://x/a.webp, /no-photo.webp, https://bendershop.store/no-photo.png'))
      .toEqual(['https://x/a.webp'])
  })

  it('parsePhotoUrls: убирает хвост « ,» после расширения', () => {
    expect(parsePhotoUrls('https://bendershop.store/photos/foo.png ,'))
      .toEqual(['https://bendershop.store/photos/foo.png'])
  })
})

describe('mergeVariantPhotoUrls', () => {
  it('склеивает уникальные URL в порядке встречи', () => {
    expect(mergeVariantPhotoUrls([
      { photoUrls: ['https://a/1.webp', 'https://a/2.webp'] },
      { photoUrls: ['https://a/1.webp', 'https://a/3.webp'] },
    ])).toEqual(['https://a/1.webp', 'https://a/2.webp', 'https://a/3.webp'])
  })

  it('пустые варианты не ломают', () => {
    expect(mergeVariantPhotoUrls([{ photoUrls: [] }, { photoUrls: ['https://x/y'] }])).toEqual(['https://x/y'])
  })

  it('не тащит no-photo в карусель', () => {
    expect(
      mergeVariantPhotoUrls([
        { photoUrls: ['/no-photo.webp', 'https://a.com/ok.webp'] },
        { photoUrls: ['https://bendershop.store/no-photo.png'] },
      ]),
    ).toEqual(['https://a.com/ok.webp'])
  })
})

// ─── Фикс «серые SIM-кнопки»: агрегат из финальных атрибутов + isPhone-гейт ──

const norm = (s: string) => s.trim().toLowerCase()

const RULES: SimRuleData[] = SIM_SEED.map((r, i) => ({
  id: i + 1,
  country: r.country ?? null,
  countryNorm: r.country ? norm(r.country) : '',
  brandNorm: r.brand ? norm(r.brand) : '',
  modelMatch: r.modelMatch ?? '',
  modelGenFrom: r.modelGenFrom ?? 0,
  simType: r.simType,
  source: 'seed',
}))

const ALIASES: AttrAliasData[] = ALIAS_SEED.map(a => ({
  attrKey: a.attrKey, rawNorm: norm(a.raw), canonical: a.canonical,
}))

describe('aggregateProductAttributes — агрегат из ФИНАЛЬНЫХ атрибутов вариантов', () => {
  it('после смены словаря агрегат совпадает с вариантным SIM, а не со свежим разбором', () => {
    // Сырой разбор листа по новому словарю даёт «SIM + eSIM», но у существующего
    // варианта в БД стоит старое «eSIM» — граница PR-A его сохраняет.
    const raw = { fullName: 'iPhone 17 Pro 256 (Индия)', 'Страна': 'Индия', SIM: 'SIM + eSIM', 'Память': '256GB' }
    const final = attributesForExistingVariant(raw, { SIM: 'eSIM' }, ALIASES)
    expect(final.SIM).toBe('eSIM')                       // граница PR-A работает
    const agg = aggregateProductAttributes([final])
    expect(agg['SIM']).toEqual(['eSIM'])                 // агрегат = вариант, кнопка активна
  })

  it('ручной оверрайд владельца попадает в агрегат, служебный ключ attrOverrides — нет', () => {
    const raw = { fullName: 'iPhone 17 Pro 256', SIM: 'eSIM' }
    const final = attributesForExistingVariant(raw, { SIM: 'eSIM', attrOverrides: { SIM: { value: '2 SIM' } } }, ALIASES)
    const agg = aggregateProductAttributes([final])
    expect(agg['SIM']).toEqual(['2 SIM'])
    expect(agg['attrOverrides']).toBeUndefined()
  })

  it('fullName и Страна в чипы не попадают', () => {
    const agg = aggregateProductAttributes([
      { fullName: 'iPhone 17 256 Black', 'Страна': 'Индия', 'Память': '256GB' },
      { fullName: 'iPhone 17 512 White', 'Страна': 'Япония', 'Память': '512GB' },
    ])
    expect(agg['fullName']).toBeUndefined()
    expect(agg['Страна']).toBeUndefined()
    expect(agg['Память']).toEqual(['256GB', '512GB'])
  })

  it('одно значение: ALWAYS_SHOW показывается, прочие ключи скрыты', () => {
    const agg = aggregateProductAttributes([
      { SIM: 'eSIM', 'Цвет': 'Black' },
      { SIM: 'eSIM', 'Цвет': 'Black' },
    ])
    expect(agg['SIM']).toEqual(['eSIM'])
    expect(agg['Цвет']).toBeUndefined()
  })

  it('дубль Экран/Размер схлопывается', () => {
    const agg = aggregateProductAttributes([
      { 'Экран': '13', 'Размер': '13' },
      { 'Экран': '15', 'Размер': '15' },
    ])
    expect(agg['Экран']).toEqual(['13', '15'])
    expect(agg['Размер']).toBeUndefined()
  })
})

describe('getAttributes — SIM только телефонам (isPhone-гейт)', () => {
  const sheetRow = (over: Partial<SheetRow>): SheetRow => ({
    brand: 'Apple', category: 'iPhone', line: 'iPhone', model: '', sortOrder: 0,
    fullName: '', color: '', memory: '', size: '', country: '', description: '',
    specs: '', costPrice: null, price: 0, quantity: 0, supplier: '', photo: '',
    badge: '', hit: false, badgeColPresent: false, hitColPresent: false,
    sheetName: 'Test', rowIndex: 2, ...over,
  })

  beforeEach(() => {
    simCtx.rules = RULES
    simCtx.aliases = ALIASES
    simCtx.unknown = new Map()
  })

  it('iPhone со страной получает SIM по словарю', () => {
    const attrs = getAttributes(sheetRow({ fullName: 'iPhone 17 Pro 256GB Desert', country: 'США' }))
    expect(attrs['SIM']).toBe('eSIM + eSIM')
  })

  it('Samsung Galaxy с явной меткой в имени получает канонический SIM', () => {
    const attrs = getAttributes(sheetRow({
      brand: 'Samsung', category: 'Galaxy S',
      fullName: 'Samsung Galaxy S26 Ultra 12/256 2Sim Black',
    }))
    expect(attrs['SIM']).toBe('2 SIM')
  })

  it('AirPods не получают SIM, даже с Apple-страной', () => {
    const attrs = getAttributes(sheetRow({ category: 'AirPods', fullName: 'AirPods Pro 3', country: 'США' }))
    expect(attrs['SIM']).toBeUndefined()
  })

  it('Apple Watch не получают SIM', () => {
    const attrs = getAttributes(sheetRow({ category: 'Apple Watch', fullName: 'Apple Watch S11 46 Black', country: 'Индия' }))
    expect(attrs['SIM']).toBeUndefined()
  })

  it('MacBook не получает SIM', () => {
    const attrs = getAttributes(sheetRow({ category: 'Ноутбуки', fullName: 'MacBook Air 13 M5 16GB 512GB Midnight', country: 'США' }))
    expect(attrs['SIM']).toBeUndefined()
  })

  it('не-телефон не шумит в очередь «не узнал»', () => {
    getAttributes(sheetRow({ category: 'Apple Watch', fullName: 'Apple Watch S11 46 Black', country: 'Марс' }))
    expect(simCtx.unknown.size).toBe(0)
  })

  it('iPhone с неизвестной страной попадает в очередь «не узнал» (без SIM)', () => {
    const attrs = getAttributes(sheetRow({ fullName: 'iPhone 17 Pro 256GB Desert', country: 'Марс' }))
    expect(attrs['SIM']).toBeUndefined()
    expect(simCtx.unknown.size).toBe(1)
  })
})
