/**
 * Закреплённая VPN-карточка в блоке «Рекомендуем» — вторая поверхность того же
 * промо.
 *
 * Главное, что здесь прибивается: поверхности НЕЗАВИСИМЫ в обе стороны.
 * Выключенная кнопка не гасит карточку, сломанный адрес одной не выключает
 * другую, а старое значение настройки (времён #137, без ключа `recs`) читается
 * как «карточка выключена» и разбор кнопки не меняет.
 *
 * Второй блок — условие видимости секции: при выключенной поверхности оно
 * обязано вырождаться в прежнее `!recs.length`. Это проверяется не чтением
 * исходника, а исполнением живого renderModalRecs() из webapp/index.html.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('../lib/prisma', () => ({
  prisma: { promoSeen: { findUnique: vi.fn(), upsert: vi.fn() } },
}))
vi.mock('../lib/api-key-store', () => ({ getApiKeyValue: vi.fn(), setApiKeyValue: vi.fn() }))

import { prisma } from '../lib/prisma'
import { getApiKeyValue } from '../lib/api-key-store'
import {
  parsePromoVpnConfig, parsePromoVpnRecs, getPromoVpnForUser,
  DEFAULT_PROMO_VPN, DEFAULT_PROMO_VPN_RECS,
} from '../lib/promo-vpn'

/* eslint-disable @typescript-eslint/no-explicit-any */
const ps = prisma.promoSeen as any
const getKey = getApiKeyValue as any

const BTN_LINK = 'https://t.me/Bender_KVN_bot?start=ref_bs_home'
const RECS_LINK = 'https://t.me/Bender_KVN_bot?start=ref_bs_recs'

/** Значение настройки как оно лежит в ApiKey. */
const setting = (o: Record<string, unknown>) => JSON.stringify(o)

beforeEach(() => {
  ps.findUnique.mockReset(); ps.upsert.mockReset(); getKey.mockReset()
  ps.findUnique.mockResolvedValue(null)
  getKey.mockResolvedValue(null)
})

describe('разбор настройки карточки', () => {
  it('настройки нет вовсе → карточка выключена, адрес дефолтный', () => {
    expect(parsePromoVpnRecs(null)).toEqual({ recs: { ...DEFAULT_PROMO_VPN_RECS }, flaw: null })
    expect(DEFAULT_PROMO_VPN_RECS.enabled).toBe(false)
  })

  it('старое значение без ключа recs (#137) → карточка выключена', () => {
    const old = setting({ enabled: true, link: BTN_LINK, offerText: '2 недели VPN бесплатно' })
    expect(parsePromoVpnRecs(old)).toEqual({ recs: { ...DEFAULT_PROMO_VPN_RECS }, flaw: null })
  })

  it('старое значение разбирается кнопкой РОВНО как раньше', () => {
    // Регрессия на surface кнопки: расширение ключа не должно менять её разбор
    const old = setting({ enabled: true, link: BTN_LINK, offerText: 'месяц VPN' })
    expect(parsePromoVpnConfig(old)).toEqual({
      config: { enabled: true, link: BTN_LINK, offerText: 'месяц VPN' },
      flaw: null,
    })
  })

  it('нормальная настройка карточки читается как есть', () => {
    const raw = setting({ enabled: false, link: BTN_LINK, recs: { enabled: true, link: RECS_LINK } })
    expect(parsePromoVpnRecs(raw)).toEqual({ recs: { enabled: true, link: RECS_LINK }, flaw: null })
  })

  it('enabled карточки принимается только строгим true', () => {
    const mk = (v: unknown) => parsePromoVpnRecs(setting({ recs: { enabled: v, link: RECS_LINK } })).recs.enabled
    expect(mk(true)).toBe(true)
    expect(mk('true')).toBe(false)
    expect(mk(1)).toBe(false)
  })

  it('адреса в объекте нет → берём дефолтный, это не поломка', () => {
    const raw = setting({ recs: { enabled: true } })
    expect(parsePromoVpnRecs(raw)).toEqual({ recs: { enabled: true, link: DEFAULT_PROMO_VPN_RECS.link }, flaw: null })
  })

  it('чужой хост в адресе карточки → выключена и адрес НЕ отдаётся', () => {
    for (const link of ['https://evil.com/x', 'http://t.me/x', 'https://t.me.evil.com/x', 'https://t.me@evil.com/x', 'https://telegram.me/x', '']) {
      const raw = setting({ enabled: true, link: BTN_LINK, recs: { enabled: true, link } })
      expect(parsePromoVpnRecs(raw), link).toEqual({ recs: { enabled: false, link: '' }, flaw: 'bad_link' })
    }
  })

  it('recs не объект → карточка выключена, не падаем', () => {
    for (const node of ['строка', 42, [], true]) {
      const raw = setting({ enabled: true, link: BTN_LINK, recs: node })
      expect(parsePromoVpnRecs(raw).recs.enabled, JSON.stringify(node)).toBe(false)
    }
  })

  it('битый JSON → обе поверхности выключены', () => {
    for (const raw of ['{не json', '[]', 'null', '"строка"']) {
      expect(parsePromoVpnRecs(raw).recs.enabled, raw).toBe(false)
      expect(parsePromoVpnConfig(raw).config.enabled, raw).toBe(false)
    }
  })
})

describe('поверхности независимы в обе стороны', () => {
  it('сломанный адрес КНОПКИ не гасит карточку', () => {
    const raw = setting({ enabled: true, link: 'https://evil.com/x', recs: { enabled: true, link: RECS_LINK } })
    expect(parsePromoVpnConfig(raw).config.enabled).toBe(false)   // кнопка легла
    expect(parsePromoVpnRecs(raw).recs).toEqual({ enabled: true, link: RECS_LINK })
  })

  it('сломанный адрес КАРТОЧКИ не гасит кнопку', () => {
    const raw = setting({ enabled: true, link: BTN_LINK, recs: { enabled: true, link: 'https://evil.com/x' } })
    expect(parsePromoVpnRecs(raw).recs.enabled).toBe(false)       // карточка легла
    expect(parsePromoVpnConfig(raw).config).toEqual({ enabled: true, link: BTN_LINK, offerText: DEFAULT_PROMO_VPN.offerText })
  })
})

describe('что уходит витрине', () => {
  /**
   * Мина, из-за которой стоит отдельный тест: getPromoVpnForUser() при
   * выключенной кнопке уходит РАННИМ возвратом. Если положить recs только в
   * финальный return, выключенная кнопка молча потушит карточку — ровно в том
   * состоянии, в котором релиз едет на прод.
   */
  it('кнопка выключена, карточка включена → в ответе recs.enabled: true', async () => {
    getKey.mockResolvedValue(setting({ enabled: false, link: BTN_LINK, recs: { enabled: true, link: RECS_LINK } }))
    const view = await getPromoVpnForUser('42')
    expect(view.enabled).toBe(false)
    expect(view.link).toBe('')
    expect(view.recs).toEqual({ enabled: true, link: RECS_LINK })
  })

  it('настройки нет вовсе → обе поверхности выключены и адресов нет', async () => {
    const view = await getPromoVpnForUser('42')
    expect(view).toMatchObject({ enabled: false, link: '', recs: { enabled: false, link: '' } })
  })

  it('карточка выключена → адрес наружу не уходит', async () => {
    getKey.mockResolvedValue(setting({ enabled: true, link: BTN_LINK, recs: { enabled: false, link: RECS_LINK } }))
    const view = await getPromoVpnForUser('42')
    expect(view.enabled).toBe(true)
    expect(view.recs).toEqual({ enabled: false, link: '' })
  })

  it('карточка не смотрит на seen: нажимал кнопку — карточка всё равно живая', async () => {
    getKey.mockResolvedValue(setting({ enabled: true, link: BTN_LINK, recs: { enabled: true, link: RECS_LINK } }))
    ps.findUnique.mockResolvedValue({ id: 1 })
    const view = await getPromoVpnForUser('42')
    expect(view.seen).toBe(true)
    expect(view.recs).toEqual({ enabled: true, link: RECS_LINK })
  })

  it('аноним получает карточку так же', async () => {
    getKey.mockResolvedValue(setting({ enabled: false, link: BTN_LINK, recs: { enabled: true, link: RECS_LINK } }))
    const view = await getPromoVpnForUser(null)
    expect(view.recs).toEqual({ enabled: true, link: RECS_LINK })
    expect(ps.findUnique).not.toHaveBeenCalled()
  })

  it('ключ читается ОДИН раз на запрос — обе поверхности за одно чтение', async () => {
    getKey.mockResolvedValue(setting({ enabled: true, link: BTN_LINK, recs: { enabled: true, link: RECS_LINK } }))
    await getPromoVpnForUser('42')
    expect(getKey).toHaveBeenCalledTimes(1)
  })

  it('сбой чтения настройки → обе поверхности выключены, витрина жива', async () => {
    getKey.mockRejectedValue(new Error('БД моргнула'))
    const view = await getPromoVpnForUser('42')
    expect(view).toMatchObject({ enabled: false, recs: { enabled: false, link: '' } })
  })
})

// ── Условие видимости секции — на живом коде витрины ─────────────────────────
//
// Берём renderModalRecs() прямо из webapp/index.html и исполняем на подставном
// DOM. Проверяется не текст исходника, а поведение: при выключенной поверхности
// ветка обязана совпасть с прежней («лента пуста → секция спрятана»).

interface FakeNode {
  id: string
  style: Record<string, string>
  innerHTML: string
  insertedBefore: string[]
}

function extractFunction(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`)
  if (start === -1) throw new Error(`webapp/index.html: не нашли function ${name}()`)
  let depth = 0
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1)
  }
  throw new Error(`webapp/index.html: не сошлись скобки у ${name}()`)
}

/** Подставной DOM ровно под то, что трогает renderModalRecs/mountVpnRecCard. */
function makeSandbox() {
  const section: FakeNode = { id: 'modalRecs', style: {}, innerHTML: '', insertedBefore: [] }
  const grid: FakeNode = { id: 'modalRecsGrid', style: {}, innerHTML: '', insertedBefore: [] }
  let card: Record<string, unknown> | null = null

  const cardStub = () => ({ id: 'vpnRecCard', addEventListener: () => {}, remove: () => { card = null } })
  const tpl = {
    id: 'vpnRecTpl',
    content: {
      cloneNode: () => ({ __frag: true, querySelector: (sel: string) => (sel === '#vpnRecCard' ? cardStub() : null) }),
    },
  }
  const document = {
    getElementById(id: string) {
      if (id === 'modalRecs') return section
      if (id === 'modalRecsGrid') return grid
      if (id === 'vpnRecTpl') return tpl
      if (id === 'vpnRecCard') return card
      return null
    },
  }
  ;(section as unknown as Record<string, unknown>).insertBefore = (frag: { querySelector: (s: string) => unknown }, before: FakeNode) => {
    card = cardStub()
    section.insertedBefore.push(before.id)
    void frag
  }

  const src = readFileSync(join(__dirname, '..', 'webapp', 'index.html'), 'utf8')
  const parts = ['vpnRecsOn', 'mountVpnRecCard', 'vpnRecClaim', 'renderModalRecs']
    .map(n => extractFunction(src, n)).join('\n')
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const make = new Function('document', `
    let vpnPromo = null, modalProduct = { id: 1 }, allProducts = [], recsResult = []
    function resolveRecs() { return recsResult }
    function getProductPhotos() { return ['/p.webp'] }
    function minVariantPrice() { return 1000 }
    function fmt(n) { return String(n) }
    function esc(s) { return String(s) }
    ${parts}
    return {
      setPromo: v => { vpnPromo = v },
      setRecs: v => { recsResult = v },
      vpnRecsOn, renderModalRecs,
    }
  `)
  return { api: make(document), section, grid, hasCard: () => card !== null }
}

describe('секция «Рекомендуем»: видимость', () => {
  const OFF_SHAPES: Array<[string, unknown]> = [
    ['промо не загрузилось', null],
    ['старый сервер без поля recs', { enabled: true, link: BTN_LINK }],
    ['карточка выключена', { enabled: true, link: BTN_LINK, recs: { enabled: false, link: '' } }],
    ['карточка включена, но адреса нет', { enabled: true, link: BTN_LINK, recs: { enabled: true, link: '' } }],
  ]

  it('vpnRecsOn() === false на всех выключенных состояниях', () => {
    const { api } = makeSandbox()
    for (const [label, promo] of OFF_SHAPES) {
      api.setPromo(promo)
      expect(api.vpnRecsOn(), label).toBe(false)
    }
  })

  it('промо выключено + лента пуста → секция спрятана и узла карточки нет', () => {
    for (const [label, promo] of OFF_SHAPES) {
      const { api, section, hasCard } = makeSandbox()
      api.setPromo(promo); api.setRecs([])
      api.renderModalRecs()
      expect(section.style.display, label).toBe('none')
      expect(hasCard(), label).toBe(false)
      expect(section.innerHTML, label).toBe('')
    }
  })

  it('промо выключено + лента есть → секция открыта, карточки нет', () => {
    const { api, section, grid, hasCard } = makeSandbox()
    api.setPromo({ enabled: true, link: BTN_LINK }); api.setRecs([{ id: 2, name: 'AirTag', price: '3000' }])
    api.renderModalRecs()
    expect(section.style.display).toBe('')
    expect(hasCard()).toBe(false)
    expect(grid.innerHTML).toContain('modal-rec-card')
  })

  it('промо включено + лента пуста → секция открывается ТОЛЬКО ради карточки', () => {
    const { api, section, grid, hasCard } = makeSandbox()
    api.setPromo({ enabled: false, link: '', recs: { enabled: true, link: RECS_LINK } })
    api.setRecs([])
    api.renderModalRecs()
    expect(section.style.display).toBe('')
    expect(hasCard()).toBe(true)
    expect(grid.innerHTML).toBe('')
  })

  it('промо включено + лента есть → карточка встаёт ПЕРЕД лентой', () => {
    const { api, section, hasCard } = makeSandbox()
    api.setPromo({ enabled: true, link: BTN_LINK, recs: { enabled: true, link: RECS_LINK } })
    api.setRecs([{ id: 2, name: 'AirTag', price: '3000' }])
    api.renderModalRecs()
    expect(hasCard()).toBe(true)
    expect(section.insertedBefore).toEqual(['modalRecsGrid'])
  })

  it('повторная отрисовка не плодит вторую карточку', () => {
    const { api, section } = makeSandbox()
    api.setPromo({ enabled: true, link: BTN_LINK, recs: { enabled: true, link: RECS_LINK } })
    api.setRecs([{ id: 2, name: 'AirTag', price: '3000' }])
    api.renderModalRecs(); api.renderModalRecs(); api.renderModalRecs()
    expect(section.insertedBefore).toEqual(['modalRecsGrid'])
  })
})
