/**
 * Промо «2 недели VPN» — кнопка на главной витрины.
 *
 * Настройка живёт в ApiKey одним JSON-ключом (как setting_delivery_pricing и
 * setting_preorder): { enabled, link, offerText }. По умолчанию ВЫКЛЮЧЕНО —
 * релиз едет тихим, включает владелец руками, когда готов.
 *
 * Адрес кнопки принимается ТОЛЬКО как https://t.me/… и проверяется дважды: на
 * сохранении (отказ 422) и на отдаче витрине (чужой хост → промо не показываем
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
  link: 'https://t.me/Bender_KVN_bot?start=ref_bs_home',
  offerText: '2 недели VPN бесплатно',
}

/**
 * Ссылка ведёт в Telegram и никуда больше.
 *
 * Проверяется именно `hostname`, а не вхождение подстроки: `t.me.evil.com` и
 * `https://t.me@evil.com/` содержат «t.me», но ведут на чужой домен — у первого
 * hostname `t.me.evil.com`, у второго `evil.com`. Схема строго https: у http
 * ссылку можно подменить по дороге.
 */
export function isTelegramLink(raw: unknown): boolean {
  const s = String(raw ?? '').trim()
  if (!s) return false
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return false
  }
  return u.protocol === 'https:' && u.hostname === 't.me'
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
  if (!isTelegramLink(link)) {
    // Адрес не наш — промо не включаем, каким бы ни был флаг в JSON
    return { config: { enabled: false, link: '', offerText }, flaw: 'bad_link' }
  }
  return { config: { enabled: src.enabled === true, link, offerText }, flaw: null }
}

/** Настройка из ApiKey. Сбой чтения — это тоже «промо выключено». */
export async function loadPromoVpnConfig(): Promise<PromoVpnParsed> {
  try {
    const parsed = parsePromoVpnConfig(await getApiKeyValue(PROMO_VPN_SETTING))
    if (parsed.flaw) {
      log.warn('Promo VPN setting is broken — промо выключено', { flaw: parsed.flaw })
    }
    return parsed
  } catch (e) {
    log.warn('Promo VPN setting read failed', { error: e instanceof Error ? e.message : String(e) })
    return { config: { ...DEFAULT_PROMO_VPN, enabled: false }, flaw: null }
  }
}

/** Что витрина получает по GET /api/promo/vpn. */
export interface PromoVpnView {
  enabled: boolean
  link: string
  offerText: string
  /** Этот посетитель уже нажимал. Аноним — всегда false: помечать нечем */
  seen: boolean
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
  const { config } = await loadPromoVpnConfig()
  if (!config.enabled) return { enabled: false, link: '', offerText: config.offerText, seen: false }

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
  return { enabled: true, link: config.link, offerText: config.offerText, seen }
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
