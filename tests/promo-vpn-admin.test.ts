/**
 * Сохранение настройки VPN-промо из админки.
 *
 * Главное здесь — что чужой адрес не попадает в базу (422 на записи) и не
 * выходит наружу, даже если он туда как-то попал мимо админки: чтение отсекает
 * его повторно. И что менять настройку может только владелец.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({ prisma: {} }))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/api-key-store', () => ({ getApiKeyValue: vi.fn(), setApiKeyValue: vi.fn() }))

import { getApiKeyValue, setApiKeyValue } from '../lib/api-key-store'
import { getPromoVpn, setPromoVpn } from '../lib/storefront-admin'
import { PROMO_VPN_SETTING, DEFAULT_PROMO_VPN, DEFAULT_PROMO_VPN_RECS } from '../lib/promo-vpn'

/* eslint-disable @typescript-eslint/no-explicit-any */
const getKey = getApiKeyValue as any
const setKey = setApiKeyValue as any
const ACTOR = '900'
const OK_LINK = 'https://t.me/Bender_KVN_bot?start=ref_bs_home'
const OK_RECS_LINK = 'https://t.me/Bender_KVN_bot?start=ref_bs_recs'

beforeEach(() => {
  getKey.mockReset(); setKey.mockReset()
  getKey.mockResolvedValue(null)
  setKey.mockResolvedValue(undefined)
})

/** JSON, который реально ушёл в ApiKey под ключом настройки. */
const stored = () => {
  const call = setKey.mock.calls.find((c: unknown[]) => c[0] === PROMO_VPN_SETTING)
  return call ? JSON.parse(call[1] as string) : null
}

describe('запись: адрес кнопки', () => {
  it('t.me сохраняется', async () => {
    const r = await setPromoVpn(ACTOR, { enabled: true, link: OK_LINK, offerText: '2 недели VPN бесплатно' })
    expect(r.ok).toBe(true)
    // Ключ `recs` добавился вместе с карточкой в «Рекомендуем»: тело без её
    // полей сохраняет то, что уже лежало (здесь — дефолт: выключена)
    expect(stored()).toEqual({
      enabled: true, link: OK_LINK, offerText: '2 недели VPN бесплатно',
      recs: { enabled: false, link: DEFAULT_PROMO_VPN_RECS.link },
    })
  })

  it('чужой хост — 422 и в базу НИЧЕГО не пишется', async () => {
    for (const link of ['https://evil.com/x', 'http://t.me/x', 'https://t.me.evil.com/x', 'https://t.me@evil.com/x']) {
      setKey.mockClear()
      const r = await setPromoVpn(ACTOR, { enabled: true, link })
      expect(r, link).toMatchObject({ ok: false, status: 422 })
      expect(r.error, link).toContain('t.me')
      expect(stored(), link).toBeNull()
    }
  })

  it('пустой адрес — 422', async () => {
    expect(await setPromoVpn(ACTOR, { enabled: false, link: '   ' })).toMatchObject({ ok: false, status: 422 })
  })

  it('слишком длинный адрес — 422', async () => {
    const long = 'https://t.me/' + 'a'.repeat(600)
    expect(await setPromoVpn(ACTOR, { enabled: true, link: long })).toMatchObject({ ok: false, status: 422 })
  })
})

describe('запись: остальное', () => {
  it('пустой текст оффера подменяется дефолтным', async () => {
    await setPromoVpn(ACTOR, { enabled: true, link: OK_LINK, offerText: '  ' })
    expect(stored().offerText).toBe(DEFAULT_PROMO_VPN.offerText)
  })

  it('слишком длинный текст — 422', async () => {
    const r = await setPromoVpn(ACTOR, { enabled: true, link: OK_LINK, offerText: 'я'.repeat(201) })
    expect(r).toMatchObject({ ok: false, status: 422 })
  })

  it('enabled приводится к булеву, мусор = выключено', async () => {
    await setPromoVpn(ACTOR, { enabled: 'да', link: OK_LINK })
    expect(stored().enabled).toBe(false)
  })

  it('успешное сохранение бампает кэш витрины', async () => {
    await setPromoVpn(ACTOR, { enabled: true, link: OK_LINK })
    expect(setKey.mock.calls.some((c: unknown[]) => c[0] === 'cache_version')).toBe(true)
  })
})

describe('запись: карточка в «Рекомендуем»', () => {
  it('свой адрес и свой тумблер сохраняются рядом с кнопкой', async () => {
    const r = await setPromoVpn(ACTOR, {
      enabled: false, link: OK_LINK, offerText: 'о',
      recsEnabled: true, recsLink: OK_RECS_LINK,
    })
    expect(r.ok).toBe(true)
    expect(stored()).toEqual({
      enabled: false, link: OK_LINK, offerText: 'о',
      recs: { enabled: true, link: OK_RECS_LINK },
    })
  })

  it('чужой хост карточки — 422 и в базу НИЧЕГО не пишется', async () => {
    for (const link of ['https://evil.com/x', 'http://t.me/x', 'https://t.me.evil.com/x', 'https://t.me@evil.com/x']) {
      setKey.mockClear()
      const r = await setPromoVpn(ACTOR, { enabled: true, link: OK_LINK, recsEnabled: true, recsLink: link })
      expect(r, link).toMatchObject({ ok: false, status: 422 })
      expect(r.error, link).toContain('t.me')
      expect(stored(), link).toBeNull()
    }
  })

  it('отказ по адресу карточки не сохраняет и кнопку', async () => {
    // Сохранение атомарно: одна форма — одна запись. Иначе владелец получил бы
    // «не получилось», а половина настройки всё равно уехала бы в базу
    const r = await setPromoVpn(ACTOR, { enabled: true, link: OK_LINK, recsLink: 'https://evil.com/x' })
    expect(r).toMatchObject({ ok: false, status: 422 })
    expect(stored()).toBeNull()
  })

  it('полей карточки в теле нет → сохранённое переносится, а не обнуляется', async () => {
    getKey.mockResolvedValue(JSON.stringify({
      enabled: false, link: OK_LINK, offerText: 'о',
      recs: { enabled: true, link: OK_RECS_LINK },
    }))
    await setPromoVpn(ACTOR, { enabled: true, link: OK_LINK, offerText: 'о' })
    expect(stored().recs).toEqual({ enabled: true, link: OK_RECS_LINK })
  })

  it('и наоборот: тело только с полями карточки не гасит кнопку', async () => {
    getKey.mockResolvedValue(JSON.stringify({
      enabled: true, link: OK_LINK, offerText: 'о', recs: { enabled: false, link: OK_RECS_LINK },
    }))
    await setPromoVpn(ACTOR, { enabled: true, link: OK_LINK, offerText: 'о', recsEnabled: true })
    expect(stored()).toMatchObject({ enabled: true, recs: { enabled: true, link: OK_RECS_LINK } })
  })

  it('recsEnabled приводится к булеву, мусор = выключено', async () => {
    await setPromoVpn(ACTOR, { enabled: true, link: OK_LINK, recsEnabled: 'да', recsLink: OK_RECS_LINK })
    expect(stored().recs.enabled).toBe(false)
  })

  it('слишком длинный адрес карточки — 422', async () => {
    const long = 'https://t.me/' + 'a'.repeat(600)
    const r = await setPromoVpn(ACTOR, { enabled: true, link: OK_LINK, recsLink: long })
    expect(r).toMatchObject({ ok: false, status: 422 })
  })
})

describe('чтение: отравленную настройку наружу не отдаём', () => {
  it('чужой хост в базе → выключено и помечено как сломанное', async () => {
    getKey.mockResolvedValue(JSON.stringify({ enabled: true, link: 'https://evil.com/x', offerText: 'о' }))
    const v = await getPromoVpn()
    expect(v.enabled).toBe(false)
    expect(v.flaw).toBe('bad_link')
    // владельцу показываем дефолтный адрес как подсказку, но промо выключено
    expect(v.link).toBe(DEFAULT_PROMO_VPN.link)
  })

  it('битый JSON → выключено, flaw bad_json', async () => {
    getKey.mockResolvedValue('{сломано')
    expect(await getPromoVpn()).toMatchObject({ enabled: false, flaw: 'bad_json' })
  })

  it('настройки нет → дефолт выключен', async () => {
    expect(await getPromoVpn()).toMatchObject({ enabled: false, flaw: null, link: DEFAULT_PROMO_VPN.link })
  })

  it('сломан адрес карточки — помечена она, кнопка цела', async () => {
    getKey.mockResolvedValue(JSON.stringify({
      enabled: true, link: OK_LINK, offerText: 'о', recs: { enabled: true, link: 'https://evil.com/x' },
    }))
    const v = await getPromoVpn()
    expect(v).toMatchObject({ enabled: true, flaw: null, recsEnabled: false, recsFlaw: 'bad_link' })
    expect(v.recsLink).toBe(DEFAULT_PROMO_VPN_RECS.link)
  })

  it('сломан адрес кнопки — помечена она, карточка цела', async () => {
    getKey.mockResolvedValue(JSON.stringify({
      enabled: true, link: 'https://evil.com/x', offerText: 'о', recs: { enabled: true, link: OK_RECS_LINK },
    }))
    expect(await getPromoVpn()).toMatchObject({
      enabled: false, flaw: 'bad_link', recsEnabled: true, recsLink: OK_RECS_LINK, recsFlaw: null,
    })
  })

  it('настройки нет → карточка выключена с дефолтным адресом', async () => {
    expect(await getPromoVpn()).toMatchObject({
      recsEnabled: false, recsFlaw: null, recsLink: DEFAULT_PROMO_VPN_RECS.link,
    })
  })
})

describe('гейт ручки', () => {
  /** Слои маршрута в express: [ownerOnly?, safe(handler)]. */
  function handlersOf(router: any, method: string, path: string): string[] {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method])
    if (!layer) throw new Error(`Маршрут ${method.toUpperCase()} ${path} не зарегистрирован`)
    return layer.route.stack.map((h: any) => h.name || h.handle?.name || '')
  }

  it('менеджеру настройку не сохранить — PUT owner-only', async () => {
    const { adminApiRouter } = await import('../api/admin')
    expect(handlersOf(adminApiRouter() as any, 'put', '/settings/promo-vpn')).toContain('ownerOnly')
  })

  it('читать состояние промо может и менеджер', async () => {
    const { adminApiRouter } = await import('../api/admin')
    expect(handlersOf(adminApiRouter() as any, 'get', '/settings/promo-vpn')).not.toContain('ownerOnly')
  })
})
