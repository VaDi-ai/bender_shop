/**
 * Промо «2 недели VPN»: ссылка, конфиг и заскопленное послабление anti-replay.
 *
 * Два главных инварианта этого файла:
 *   • адрес кнопки — только Telegram, и проверка стоит И на записи, И на чтении;
 *   • расширенное окно свежести initData действует ТОЛЬКО там, где его явно
 *     попросили: дефолт остаётся пятиминутным.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as crypto from 'crypto'

vi.mock('../lib/prisma', () => ({
  prisma: { promoSeen: { findUnique: vi.fn(), upsert: vi.fn() } },
}))
vi.mock('../lib/api-key-store', () => ({ getApiKeyValue: vi.fn(), setApiKeyValue: vi.fn() }))

import { prisma } from '../lib/prisma'
import { getApiKeyValue } from '../lib/api-key-store'
import {
  isAllowedPromoLink, parsePromoVpnConfig, loadPromoVpnConfig,
  getPromoVpnForUser, markPromoSeen,
  DEFAULT_PROMO_VPN, PROMO_VPN_KEY, PROMO_SEEN_MAX_AGE_SECONDS,
} from '../lib/promo-vpn'
import { validateTelegramWebApp } from '../lib/telegram-webapp-auth'

/* eslint-disable @typescript-eslint/no-explicit-any */
const ps = prisma.promoSeen as any
const getKey = getApiKeyValue as any

beforeEach(() => {
  ps.findUnique.mockReset(); ps.upsert.mockReset(); getKey.mockReset()
  ps.findUnique.mockResolvedValue(null)
  ps.upsert.mockResolvedValue({})
})

describe('белый список адресов промо', () => {
  it('пускает t.me по https без явного порта', () => {
    expect(isAllowedPromoLink('https://t.me/Bender_KVN_bot?start=ref_bs_home')).toBe(true)
    expect(isAllowedPromoLink('https://t.me/durov')).toBe(true)
    expect(isAllowedPromoLink('  https://t.me/x  ')).toBe(true)          // пробелы по краям
    expect(isAllowedPromoLink('https://T.ME/x')).toBe(true)             // хост регистронезависим
  })

  it('пускает веб-портал VPN на его порту 8443', () => {
    expect(isAllowedPromoLink('https://k9x2m1.conntest.xyz:8443/portal/?ref=bs_home')).toBe(true)
    expect(isAllowedPromoLink('https://k9x2m1.conntest.xyz:8443/portal/?ref=bs_recs')).toBe(true)
    expect(isAllowedPromoLink('https://K9X2M1.CONNTEST.XYZ:8443/portal/')).toBe(true)  // хост регистронезависим
  })

  it('портал только на 8443 и только по https', () => {
    // Порт обязан совпасть ровно: new URL убирает лишь дефолтный 443
    expect(isAllowedPromoLink('https://k9x2m1.conntest.xyz/portal/')).toBe(false)      // без порта
    expect(isAllowedPromoLink('https://k9x2m1.conntest.xyz:443/portal/')).toBe(false)  // дефолтный 443, не 8443
    expect(isAllowedPromoLink('https://k9x2m1.conntest.xyz:9443/portal/')).toBe(false) // другой порт
    expect(isAllowedPromoLink('http://k9x2m1.conntest.xyz:8443/portal/')).toBe(false)  // не https
  })

  it('t.me с нестандартным портом не проходит', () => {
    // :443 нормализуется в пустой порт (это тот же https://t.me/x) — допустимо;
    // а вот явный нестандартный порт на t.me — отказ
    expect(isAllowedPromoLink('https://t.me:8443/x')).toBe(false)
    expect(isAllowedPromoLink('https://t.me:443/x')).toBe(true)
  })

  it('заворачивает всё остальное', () => {
    const bad = [
      'http://t.me/x',                              // не https
      'https://evil.com/x',
      'https://t.me.evil.com/x',                    // поддомен-обманка: хост чужой
      'https://t.me@evil.com/x',                    // userinfo-трюк: hostname = evil.com
      'https://k9x2m1.conntest.xyz.evil.com:8443/', // сабдомен под портал: хост чужой
      'https://k9x2m1.conntest.xyz.evil.com/',
      'https://telegram.me/x',                      // похоже, но другой хост
      'https://sub.t.me/x',
      'javascript:alert(1)',                        // eslint-disable-line no-script-url
      'tg://resolve?domain=x',
      't.me/x',                                     // без схемы URL не разбирается
      '', '   ', null, undefined, 42,
    ]
    for (const v of bad) expect(isAllowedPromoLink(v), String(v)).toBe(false)
  })
})

describe('чтение настройки', () => {
  it('не сохраняли → дефолты, и они ВЫКЛЮЧЕНЫ', () => {
    const { config, flaw } = parsePromoVpnConfig(null)
    expect(config.enabled).toBe(false)
    expect(config.link).toBe(DEFAULT_PROMO_VPN.link)
    expect(flaw).toBeNull()
  })

  it('нормальная настройка читается как есть', () => {
    const raw = JSON.stringify({ enabled: true, link: 'https://t.me/a', offerText: 'месяц VPN' })
    expect(parsePromoVpnConfig(raw)).toEqual({
      config: { enabled: true, link: 'https://t.me/a', offerText: 'месяц VPN' },
      flaw: null,
    })
  })

  it('чужой хост в базе → промо выключено и ссылка НЕ отдаётся', () => {
    const raw = JSON.stringify({ enabled: true, link: 'https://evil.com/x', offerText: 'что-то' })
    const { config, flaw } = parsePromoVpnConfig(raw)
    expect(config.enabled).toBe(false)
    expect(config.link).toBe('')          // наружу чужой адрес не уходит вообще
    expect(flaw).toBe('bad_link')
  })

  it('битый JSON → выключено, не падаем', () => {
    for (const raw of ['{не json', '[]', 'null', '"строка"']) {
      const { config, flaw } = parsePromoVpnConfig(raw)
      expect(config.enabled, raw).toBe(false)
      expect(flaw, raw).toBe('bad_json')
    }
  })

  it('enabled принимается только строгим true', () => {
    const mk = (v: unknown) => parsePromoVpnConfig(JSON.stringify({ enabled: v, link: 'https://t.me/a' })).config.enabled
    expect(mk(true)).toBe(true)
    expect(mk('true')).toBe(false)
    expect(mk(1)).toBe(false)
  })

  it('сбой чтения ключа не роняет витрину', async () => {
    getKey.mockRejectedValue(new Error('БД моргнула'))
    const { config } = await loadPromoVpnConfig()
    expect(config.enabled).toBe(false)
  })
})

describe('состояние для посетителя', () => {
  const on = () => getKey.mockResolvedValue(JSON.stringify({ enabled: true, link: 'https://t.me/a', offerText: 'о' }))

  it('выключено → в БД не ходим и ссылку не отдаём', async () => {
    getKey.mockResolvedValue(JSON.stringify({ enabled: false, link: 'https://t.me/a' }))
    const v = await getPromoVpnForUser('42')
    expect(v).toMatchObject({ enabled: false, link: '', seen: false })
    expect(ps.findUnique).not.toHaveBeenCalled()
  })

  it('аноним всегда видит промо: помечать нечем', async () => {
    on()
    const v = await getPromoVpnForUser(null)
    expect(v).toMatchObject({ enabled: true, seen: false })
    expect(ps.findUnique).not.toHaveBeenCalled()
  })

  it('уже нажимал → seen:true', async () => {
    on()
    ps.findUnique.mockResolvedValue({ id: 1 })
    expect((await getPromoVpnForUser('42')).seen).toBe(true)
  })

  it('сбой БД → показываем ещё раз, а не падаем', async () => {
    on()
    ps.findUnique.mockRejectedValue(new Error('нет связи'))
    const v = await getPromoVpnForUser('42')
    expect(v).toMatchObject({ enabled: true, seen: false })
  })

  it('отметка идемпотентна: upsert по паре', async () => {
    await markPromoSeen('42')
    expect(ps.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { telegramUserId_promoKey: { telegramUserId: '42', promoKey: PROMO_VPN_KEY } },
      update: {},
    }))
  })
})

// ── Послабление anti-replay: доказываем, что оно ЗАСКОПЛЕНО ──────────────────
//
// Расширенное окно живёт только там, где его передали явно. Дефолт остаётся
// пятиминутным, поэтому ни одна другая ручка его случайно не унаследует.
describe('окно свежести initData', () => {
  const TOKEN = 'test-bot-token'
  const OLD_ENV = process.env.BOT_TOKEN

  beforeEach(() => { process.env.BOT_TOKEN = TOKEN })
  afterEach(() => { process.env.BOT_TOKEN = OLD_ENV })

  /** Подписывает initData с заданным возрастом — как это делает Telegram. */
  function initData(ageSeconds: number, userId = 42): string {
    const p = new URLSearchParams()
    p.set('user', JSON.stringify({ id: userId, first_name: 'QA' }))
    p.set('auth_date', String(Math.floor(Date.now() / 1000) - ageSeconds))
    const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
    const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest()
    p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'))
    return p.toString()
  }

  it('свежая подпись проходит и по дефолту, и с расширенным окном', () => {
    const fresh = initData(60)
    expect(validateTelegramWebApp(fresh)).toMatchObject({ valid: true, userId: 42 })
    expect(validateTelegramWebApp(fresh, PROMO_SEEN_MAX_AGE_SECONDS)).toMatchObject({ valid: true })
  })

  for (const [label, age] of [['5 часов', 5 * 3600], ['23 часа', 23 * 3600]] as const) {
    it(`возраст ${label}: промо-путём проходит, дефолтом — отклоняется`, () => {
      const stale = initData(age)
      // промо-ручка: человек полистал каталог и нажал кнопку позже — засчитываем
      expect(validateTelegramWebApp(stale, PROMO_SEEN_MAX_AGE_SECONDS).valid).toBe(true)
      // все остальные вызовы: окно прежнее, послабление не расползлось
      expect(validateTelegramWebApp(stale).valid).toBe(false)
    })
  }

  it('старше суток не проходит даже промо-путём', () => {
    expect(validateTelegramWebApp(initData(25 * 3600), PROMO_SEEN_MAX_AGE_SECONDS).valid).toBe(false)
  })

  it('послабление НЕ трогает саму подпись: подделанный hash не проходит', () => {
    const forged = initData(60).replace(/hash=[0-9a-f]+/, 'hash=' + 'de'.repeat(32))
    expect(validateTelegramWebApp(forged, PROMO_SEEN_MAX_AGE_SECONDS).valid).toBe(false)
    // и подменённые данные при валидном по длине хеше — тоже
    const tampered = initData(60).replace('%22id%22%3A42', '%22id%22%3A999')
    expect(validateTelegramWebApp(tampered, PROMO_SEEN_MAX_AGE_SECONDS).valid).toBe(false)
  })

  it('окно промо — ровно сутки, значение зафиксировано', () => {
    expect(PROMO_SEEN_MAX_AGE_SECONDS).toBe(86400)
  })
})
