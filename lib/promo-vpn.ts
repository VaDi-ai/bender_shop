/**
 * Промо «2 недели VPN» — две независимые поверхности витрины:
 * кнопка «⛔ НЕ НАЖИМАТЬ» на главной и закреплённая карточка над лентой
 * «Рекомендуем» в карточке товара.
 *
 * Поверхности не связаны ничем, кроме общего ключа настройки: выключенная
 * кнопка не гасит карточку, сломанный адрес одной не выключает другую. Поэтому
 * и разбираются они РАЗНЫМИ функциями над одним и тем же JSON —
 * parsePromoVpnConfig() для кнопки, parsePromoVpnRecs() для карточки.
 *
 * Настройка живёт в ApiKey одним JSON-ключом (как setting_delivery_pricing и
 * setting_preorder): { enabled, link, offerText, recs: { enabled, link } }.
 * Обе поверхности по умолчанию ВЫКЛЮЧЕНЫ — релиз едет тихим, включает владелец
 * руками, когда готов. Старое значение без `recs` остаётся валидным: кнопка
 * читается как читалась, карточка — как выключенная.
 *
 * Адреса обеих поверхностей принимаются только из белого списка — Telegram
 * (t.me) или веб-портал VPN владельца — и проверяются дважды: на сохранении
 * (отказ 422) и на отдаче витрине (чужой хост → поверхность не показываем
 * вовсе). Двойная проверка не паранойя: ключ в ApiKey мог быть записан мимо
 * админки — руками в БД, старой версией кода, восстановлением дампа, — и
 * витрина не должна становиться трамплином на внешний домен.
 */
import { getApiKeyValue } from './api-key-store'
import { prisma } from './prisma'
import log from './logger'

export const PROMO_VPN_SETTING = 'setting_promo_vpn'

/** Ключ в PromoSeen. Следующие разовые промо заведут свой, таблица общая. */
export const PROMO_VPN_KEY = 'vpn_2weeks'

/**
 * Окно свежести initData для POST /api/promo/vpn/seen — 24 часа вместо
 * стандартных 5 минут.
 *
 * ЗАЧЕМ. `tg.initData` выдаётся один раз при запуске Mini App и в течение
 * сессии не обновляется: `auth_date` — это время старта. С окном в 5 минут
 * человек, который полистал каталог десять минут и только потом нажал кнопку,
 * получал бы отказ, флаг «видел» не записывался бы, и промо всплывало бы снова
 * при каждом заходе.
 *
 * ПОЧЕМУ ЗДЕСЬ ЭТО БЕЗОПАСНО. Повтор перехваченной подписи на этой ручке умеет
 * ровно одно: пометить «видел промо» того самого пользователя, чья подпись. Ни
 * прочитать, ни изменить что-либо ещё она не может — максимум скрыть промо у
 * его владельца. Радиус поражения нулевой.
 *
 * НЕ КОПИРОВАТЬ на другие ручки. Везде, где подпись даёт доступ к данным или
 * деньгам, окно остаётся дефолтным (см. lib/telegram-webapp-auth.ts). Сама
 * проверка HMAC здесь не ослаблена ни на символ — расширено только окно.
 */
export const PROMO_SEEN_MAX_AGE_SECONDS = 24 * 60 * 60

export interface PromoVpnConfig {
  enabled: boolean
  link: string
  offerText: string
}

/**
 * Дефолт: выключено, но с готовым адресом и текстом — владельцу остаётся
 * щёлкнуть тумблер, а не собирать настройку с нуля.
 */
export const DEFAULT_PROMO_VPN: PromoVpnConfig = {
  enabled: false,
  link: 'https://k9x2m1.conntest.xyz:8443/portal/?ref=bs_home',
  offerText: '2 недели VPN бесплатно',
}

/** Настройка карточки в «Рекомендуем». Живёт в том же ключе, под `recs`. */
export interface PromoVpnRecs {
  enabled: boolean
  link: string
}

/**
 * Дефолт карточки: выключена, адрес со своим реф-тегом. Тег отличается от
 * кнопочного (`ref=bs_home`) намеренно — по нему видно, какая поверхность
 * приводит людей.
 */
export const DEFAULT_PROMO_VPN_RECS: PromoVpnRecs = {
  enabled: false,
  link: 'https://k9x2m1.conntest.xyz:8443/portal/?ref=bs_recs',
}

/** Подарок-строка в корзине и экран после оплаты — ещё две поверхности того же
 *  промо, каждая со своим тумблером и реф-тегом. Форма одинаковая. */
export interface PromoVpnSurface {
  enabled: boolean
  link: string
}

/** Подарок VPN строкой в корзине. Реф-тег `bs_cart`. */
export const DEFAULT_PROMO_VPN_CART: PromoVpnSurface = {
  enabled: false,
  link: 'https://k9x2m1.conntest.xyz:8443/portal/?ref=bs_cart',
}

/** Экран «спасибо за покупку» после заказа. Реф-тег `bs_order`. */
export const DEFAULT_PROMO_VPN_ORDER: PromoVpnSurface = {
  enabled: false,
  link: 'https://k9x2m1.conntest.xyz:8443/portal/?ref=bs_order',
}

/**
 * Белый список адресов промо: Telegram или веб-портал VPN владельца.
 *
 * Проверяется именно `hostname` (точное равенство, не подстрока и не endsWith)
 * плюс порт — а не вхождение текста. `t.me.evil.com` и `https://t.me@evil.com/`
 * содержат «t.me», но ведут на чужой домен: у первого hostname `t.me.evil.com`,
 * у второго — `evil.com` (userinfo до `@` хостом не становится). Так же
 * `k9x2m1.conntest.xyz.evil.com` не пройдёт под портал. Схема строго https.
 *
 * Портал слушает нестандартный порт 8443, и он обязан совпасть ровно: `new URL`
 * убирает только дефолтный порт схемы (443 → пусто), поэтому `:443` и `:9443`
 * оба отсекаются как не-8443. Telegram, наоборот, ходит по дефолтному 443 —
 * там явный порт запрещаем (`port === ''`).
 */
export function isAllowedPromoLink(raw: unknown): boolean {
  const s = String(raw ?? '').trim()
  if (!s) return false
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  if (u.hostname === 't.me' && u.port === '') return true
  if (u.hostname === 'k9x2m1.conntest.xyz' && u.port === '8443') return true
  return false
}

/** Что не так с сохранённой настройкой — нужно и админке, и логу. */
export type PromoVpnFlaw = 'bad_json' | 'bad_link'

export interface PromoVpnParsed {
  config: PromoVpnConfig
  /** null = настройка в порядке (или её ещё не сохраняли — тогда дефолты) */
  flaw: PromoVpnFlaw | null
}

/**
 * Разбор JSON-настройки. Пусто (не сохраняли) → дефолты. Битый JSON или чужой
 * хост → промо ВЫКЛЮЧЕНО, а причина возвращается наверх: витрина в таком случае
 * просто не рисует кнопку, админка показывает владельцу, что именно сломано.
 * Падать тут нечему — сломанная настройка не должна ронять витрину.
 */
export function parsePromoVpnConfig(raw: string | null): PromoVpnParsed {
  if (raw === null || raw.trim() === '') return { config: { ...DEFAULT_PROMO_VPN }, flaw: null }

  let src: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { config: { ...DEFAULT_PROMO_VPN, enabled: false }, flaw: 'bad_json' }
    }
    src = parsed as Record<string, unknown>
  } catch {
    return { config: { ...DEFAULT_PROMO_VPN, enabled: false }, flaw: 'bad_json' }
  }

  const link = String(src.link ?? '').trim()
  const offerText = String(src.offerText ?? '').trim() || DEFAULT_PROMO_VPN.offerText
  if (!isAllowedPromoLink(link)) {
    // Адрес не из белого списка — промо не включаем, каким бы ни был флаг в JSON
    return { config: { enabled: false, link: '', offerText }, flaw: 'bad_link' }
  }
  return { config: { enabled: src.enabled === true, link, offerText }, flaw: null }
}

export interface PromoVpnRecsParsed {
  recs: PromoVpnRecs
  /** null = настройка карточки в порядке (или её ещё не сохраняли) */
  flaw: PromoVpnFlaw | null
}

/**
 * Разбор настройки КАРТОЧКИ из того же JSON — отдельной функцией, не трогая
 * parsePromoVpnConfig().
 *
 * Так сделано не из аккуратности, а чтобы поверхности нельзя было случайно
 * связать: разбор кнопки физически не участвует в судьбе карточки и наоборот.
 * Сломанный адрес кнопки гасит кнопку, сломанный адрес карточки — карточку.
 *
 * Ключа `recs` нет вовсе — это значение времён #137, когда была только кнопка.
 * Читается как «карточка выключена»: старая настройка остаётся валидной и
 * ничего не ломает.
 */
export function parsePromoVpnRecs(raw: string | null): PromoVpnRecsParsed {
  if (raw === null || raw.trim() === '') return { recs: { ...DEFAULT_PROMO_VPN_RECS }, flaw: null }

  let src: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { recs: { ...DEFAULT_PROMO_VPN_RECS, enabled: false }, flaw: 'bad_json' }
    }
    src = parsed as Record<string, unknown>
  } catch {
    return { recs: { ...DEFAULT_PROMO_VPN_RECS, enabled: false }, flaw: 'bad_json' }
  }

  const node = src.recs
  if (node === undefined || node === null) return { recs: { ...DEFAULT_PROMO_VPN_RECS }, flaw: null }
  if (typeof node !== 'object' || Array.isArray(node)) {
    return { recs: { ...DEFAULT_PROMO_VPN_RECS, enabled: false }, flaw: 'bad_json' }
  }

  const n = node as Record<string, unknown>
  // Адреса нет в объекте — берём дефолтный: это не поломка, а недописанная
  // настройка. Поломка — это когда адрес есть и он чужой
  const link = String(n.link ?? DEFAULT_PROMO_VPN_RECS.link).trim()
  if (!isAllowedPromoLink(link)) return { recs: { enabled: false, link: '' }, flaw: 'bad_link' }
  return { recs: { enabled: n.enabled === true, link }, flaw: null }
}

export interface PromoVpnSurfaceParsed {
  surface: PromoVpnSurface
  flaw: PromoVpnFlaw | null
}

/**
 * Разбор одной дополнительной поверхности (`cart` или `order`) из того же JSON —
 * общей функцией, но НЕ трогая parsePromoVpnConfig/parsePromoVpnRecs. Правила те
 * же, что у карточки: узла нет → поверхность выключена (дефолтный адрес как
 * подсказка); чужой хост → выключена и адрес наружу не уходит.
 */
export function parsePromoVpnSurface(
  raw: string | null, key: 'cart' | 'order', def: PromoVpnSurface,
): PromoVpnSurfaceParsed {
  if (raw === null || raw.trim() === '') return { surface: { ...def }, flaw: null }
  let src: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { surface: { ...def, enabled: false }, flaw: 'bad_json' }
    }
    src = parsed as Record<string, unknown>
  } catch {
    return { surface: { ...def, enabled: false }, flaw: 'bad_json' }
  }
  const node = src[key]
  if (node === undefined || node === null) return { surface: { ...def }, flaw: null }
  if (typeof node !== 'object' || Array.isArray(node)) {
    return { surface: { ...def, enabled: false }, flaw: 'bad_json' }
  }
  const n = node as Record<string, unknown>
  const link = String(n.link ?? def.link).trim()
  if (!isAllowedPromoLink(link)) return { surface: { enabled: false, link: '' }, flaw: 'bad_link' }
  return { surface: { enabled: n.enabled === true, link }, flaw: null }
}

export const parsePromoVpnCart = (raw: string | null) => parsePromoVpnSurface(raw, 'cart', DEFAULT_PROMO_VPN_CART)
export const parsePromoVpnOrder = (raw: string | null) => parsePromoVpnSurface(raw, 'order', DEFAULT_PROMO_VPN_ORDER)

/** Обе поверхности за одно чтение ключа: getApiKeyValue ходит в БД и не кэширует. */
export interface PromoVpnAll {
  button: PromoVpnParsed
  recs: PromoVpnRecsParsed
  cart: PromoVpnSurfaceParsed
  order: PromoVpnSurfaceParsed
}

export async function loadPromoVpnAll(): Promise<PromoVpnAll> {
  let raw: string | null
  try {
    raw = await getApiKeyValue(PROMO_VPN_SETTING)
  } catch (e) {
    log.warn('Promo VPN setting read failed', { error: e instanceof Error ? e.message : String(e) })
    return {
      button: { config: { ...DEFAULT_PROMO_VPN, enabled: false }, flaw: null },
      recs: { recs: { ...DEFAULT_PROMO_VPN_RECS, enabled: false }, flaw: null },
      cart: { surface: { ...DEFAULT_PROMO_VPN_CART, enabled: false }, flaw: null },
      order: { surface: { ...DEFAULT_PROMO_VPN_ORDER, enabled: false }, flaw: null },
    }
  }
  const button = parsePromoVpnConfig(raw)
  const recs = parsePromoVpnRecs(raw)
  const cart = parsePromoVpnCart(raw)
  const order = parsePromoVpnOrder(raw)
  if (button.flaw) log.warn('Promo VPN setting is broken — кнопка выключена', { flaw: button.flaw })
  if (recs.flaw) log.warn('Promo VPN recs setting is broken — карточка выключена', { flaw: recs.flaw })
  if (cart.flaw) log.warn('Promo VPN cart setting is broken — подарок выключен', { flaw: cart.flaw })
  if (order.flaw) log.warn('Promo VPN order setting is broken — экран выключен', { flaw: order.flaw })
  return { button, recs, cart, order }
}

/** Настройка кнопки из ApiKey. Сбой чтения — это тоже «промо выключено». */
export async function loadPromoVpnConfig(): Promise<PromoVpnParsed> {
  return (await loadPromoVpnAll()).button
}

/** Что витрина получает по GET /api/promo/vpn. */
export interface PromoVpnView {
  enabled: boolean
  link: string
  offerText: string
  /** Этот посетитель уже нажимал. Аноним — всегда false: помечать нечем */
  seen: boolean
  /**
   * Карточка в «Рекомендуем». Отдельная поверхность: не смотрит ни на `enabled`
   * кнопки, ни на `seen` — карточка показывается всем и каждый раз.
   */
  recs: PromoVpnRecs
  /** Подарок-строка в корзине. Своя поверхность, свой тумблер. */
  cart: PromoVpnSurface
  /** Экран после оплаты. Своя поверхность, свой тумблер. */
  order: PromoVpnSurface
}

/**
 * Состояние промо для конкретного посетителя.
 *
 * `telegramUserId === null` — аноним (нет initData или подпись не сошлась).
 * Ему промо показывается каждый заход: пометить «видел» не за что зацепиться,
 * и это осознанно принято.
 *
 * Выключенное промо не ходит в БД и не отдаёт ссылку — витрине попросту нечего
 * показывать, а лишний адрес в ответе ей ни к чему.
 */
export async function getPromoVpnForUser(telegramUserId: string | null): Promise<PromoVpnView> {
  const { button, recs, cart, order } = await loadPromoVpnAll()
  const config = button.config

  // Состояния ВСЕХ прочих поверхностей считаются ДО развилки по кнопке и кладутся
  // в ОБА возврата. Если оставить их только в финальном, выключенная кнопка молча
  // потушит и карточку/подарок/экран — поверхности перестанут быть независимыми
  // ровно в том состоянии, в котором релиз едет на прод.
  const surfaceView = (s: PromoVpnSurface): PromoVpnSurface => (s.enabled && s.link ? { enabled: true, link: s.link } : { enabled: false, link: '' })
  const recsView: PromoVpnRecs = surfaceView(recs.recs)
  const cartView: PromoVpnSurface = surfaceView(cart.surface)
  const orderView: PromoVpnSurface = surfaceView(order.surface)

  if (!config.enabled) {
    return { enabled: false, link: '', offerText: config.offerText, seen: false, recs: recsView, cart: cartView, order: orderView }
  }

  let seen = false
  if (telegramUserId) {
    try {
      seen = !!(await prisma.promoSeen.findUnique({
        where: { telegramUserId_promoKey: { telegramUserId, promoKey: PROMO_VPN_KEY } },
        select: { id: true },
      }))
    } catch (e) {
      // БД моргнула — покажем промо ещё раз, это мягче, чем ронять главную
      log.warn('Promo seen lookup failed', { error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { enabled: true, link: config.link, offerText: config.offerText, seen, recs: recsView, cart: cartView, order: orderView }
}

/**
 * Пометить, что посетитель нажал кнопку. Идемпотентно: upsert по паре
 * (посетитель, промо), поэтому дабл-тап и ретрай клиента ничего не ломают.
 */
export async function markPromoSeen(telegramUserId: string, promoKey = PROMO_VPN_KEY): Promise<void> {
  await prisma.promoSeen.upsert({
    where: { telegramUserId_promoKey: { telegramUserId, promoKey } },
    create: { telegramUserId, promoKey },
    update: {},
  })
}
