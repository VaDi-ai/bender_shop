/**
 * Шаг 4: подарок VPN в корзине и экран после оплаты — ещё две независимые
 * поверхности того же промо (плюс кнопка #137 и карточка #139 = четыре).
 *
 * Проверяется: аддитивный разбор новых узлов (старое значение без них → off),
 * независимость всех четырёх, и — главное — что состояния лежат в ОБЕИХ ветках
 * getPromoVpnForUser (мина: выключенная кнопка не должна гасить остальные).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({ prisma: { promoSeen: { findUnique: vi.fn(), upsert: vi.fn() } } }))
vi.mock('../lib/api-key-store', () => ({ getApiKeyValue: vi.fn(), setApiKeyValue: vi.fn() }))

import { prisma } from '../lib/prisma'
import { getApiKeyValue } from '../lib/api-key-store'
import {
  parsePromoVpnCart, parsePromoVpnOrder, parsePromoVpnConfig, parsePromoVpnRecs,
  getPromoVpnForUser, DEFAULT_PROMO_VPN_CART, DEFAULT_PROMO_VPN_ORDER,
} from '../lib/promo-vpn'

/* eslint-disable @typescript-eslint/no-explicit-any */
const ps = prisma.promoSeen as any
const getKey = getApiKeyValue as any

const BTN = 'https://t.me/Bender_KVN_bot?start=ref_bs_home'
const CART = 'https://k9x2m1.conntest.xyz:8443/portal/?ref=bs_cart'
const ORDER = 'https://k9x2m1.conntest.xyz:8443/portal/?ref=bs_order'
const setting = (o: Record<string, unknown>) => JSON.stringify(o)

beforeEach(() => {
  ps.findUnique.mockReset(); ps.upsert.mockReset(); getKey.mockReset()
  ps.findUnique.mockResolvedValue(null); getKey.mockResolvedValue(null)
})

describe('разбор новых поверхностей — аддитивно', () => {
  it('дефолты выключены', () => {
    expect(DEFAULT_PROMO_VPN_CART.enabled).toBe(false)
    expect(DEFAULT_PROMO_VPN_ORDER.enabled).toBe(false)
  })
  it('старое значение без cart/order (времён #139) → обе off, кнопка/карточка не тронуты', () => {
    const old = setting({ enabled: true, link: BTN, offerText: 'о', recs: { enabled: true, link: 'https://t.me/x' } })
    expect(parsePromoVpnCart(old)).toEqual({ surface: { ...DEFAULT_PROMO_VPN_CART }, flaw: null })
    expect(parsePromoVpnOrder(old)).toEqual({ surface: { ...DEFAULT_PROMO_VPN_ORDER }, flaw: null })
    // регрессия: разбор кнопки/карточки не изменился
    expect(parsePromoVpnConfig(old).config).toEqual({ enabled: true, link: BTN, offerText: 'о' })
    expect(parsePromoVpnRecs(old).recs).toEqual({ enabled: true, link: 'https://t.me/x' })
  })
  it('нормальные узлы читаются как есть', () => {
    const raw = setting({ enabled: false, link: BTN, cart: { enabled: true, link: CART }, order: { enabled: true, link: ORDER } })
    expect(parsePromoVpnCart(raw).surface).toEqual({ enabled: true, link: CART })
    expect(parsePromoVpnOrder(raw).surface).toEqual({ enabled: true, link: ORDER })
  })
  it('чужой хост → поверхность off, адрес наружу не уходит', () => {
    for (const link of ['https://evil.com/x', 'http://k9x2m1.conntest.xyz:8443/x', 'https://k9x2m1.conntest.xyz:9443/x', 'https://k9x2m1.conntest.xyz.evil.com:8443/']) {
      const raw = setting({ enabled: true, link: BTN, cart: { enabled: true, link } })
      expect(parsePromoVpnCart(raw), link).toEqual({ surface: { enabled: false, link: '' }, flaw: 'bad_link' })
    }
  })
  it('enabled только строгим true', () => {
    const mk = (v: unknown) => parsePromoVpnCart(setting({ cart: { enabled: v, link: CART } })).surface.enabled
    expect(mk(true)).toBe(true); expect(mk('true')).toBe(false); expect(mk(1)).toBe(false)
  })
})

describe('четыре поверхности независимы', () => {
  it('сломан адрес подарка — падает только он', () => {
    const raw = setting({ enabled: true, link: BTN, recs: { enabled: true, link: 'https://t.me/r' }, cart: { enabled: true, link: 'https://evil.com/x' }, order: { enabled: true, link: ORDER } })
    expect(parsePromoVpnConfig(raw).config.enabled).toBe(true)
    expect(parsePromoVpnRecs(raw).recs.enabled).toBe(true)
    expect(parsePromoVpnCart(raw).surface.enabled).toBe(false)
    expect(parsePromoVpnOrder(raw).surface.enabled).toBe(true)
  })
})

describe('представление витрины: состояния в ОБЕИХ ветках getPromoVpnForUser', () => {
  // Мина: при выключенной кнопке функция уходит ранним возвратом. Каждая из
  // трёх прочих поверхностей, включённая при выключенной кнопке, обязана
  // доехать до ответа. Проверяем по отдельности — мутация «recs/cart/order
  // только в финальном return» валит соответствующий кейс.
  it('кнопка off, подарок on → cart.enabled:true', async () => {
    getKey.mockResolvedValue(setting({ enabled: false, link: BTN, cart: { enabled: true, link: CART } }))
    const v = await getPromoVpnForUser('42')
    expect(v.enabled).toBe(false)
    expect(v.cart).toEqual({ enabled: true, link: CART })
  })
  it('кнопка off, экран on → order.enabled:true', async () => {
    getKey.mockResolvedValue(setting({ enabled: false, link: BTN, order: { enabled: true, link: ORDER } }))
    const v = await getPromoVpnForUser('42')
    expect(v.order).toEqual({ enabled: true, link: ORDER })
  })
  it('кнопка on → cart/order тоже доезжают', async () => {
    getKey.mockResolvedValue(setting({ enabled: true, link: BTN, cart: { enabled: true, link: CART }, order: { enabled: true, link: ORDER } }))
    const v = await getPromoVpnForUser('42')
    expect(v.enabled).toBe(true)
    expect(v.cart).toEqual({ enabled: true, link: CART })
    expect(v.order).toEqual({ enabled: true, link: ORDER })
  })
  it('выключенные поверхности адрес наружу не отдают', async () => {
    getKey.mockResolvedValue(setting({ enabled: true, link: BTN, cart: { enabled: false, link: CART }, order: { enabled: false, link: ORDER } }))
    const v = await getPromoVpnForUser('42')
    expect(v.cart).toEqual({ enabled: false, link: '' })
    expect(v.order).toEqual({ enabled: false, link: '' })
  })
  it('ключ читается один раз на запрос', async () => {
    getKey.mockResolvedValue(setting({ enabled: true, link: BTN, cart: { enabled: true, link: CART }, order: { enabled: true, link: ORDER } }))
    await getPromoVpnForUser('42')
    expect(getKey).toHaveBeenCalledTimes(1)
  })
  it('настройки нет → все четыре off', async () => {
    const v = await getPromoVpnForUser('42')
    expect(v.enabled).toBe(false)
    expect(v.recs).toEqual({ enabled: false, link: '' })
    expect(v.cart).toEqual({ enabled: false, link: '' })
    expect(v.order).toEqual({ enabled: false, link: '' })
  })
})
