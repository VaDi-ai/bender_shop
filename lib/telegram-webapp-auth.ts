/**
 * Валидация подписи Telegram Mini App initData (HMAC-SHA256, ключ "WebAppData").
 * Вынесено из api/server.ts без изменений логики: нужна и витрине (Кабинет),
 * и админ-API (requireAdmin), а импорт api/server.ts из api/admin.ts дал бы цикл.
 *
 * BOT_TOKEN читается при вызове (не при импорте) — тесты могут подставить свой.
 */
import * as crypto from 'crypto'

const MAX_AGE_SECONDS = 300 // anti-replay: initData старше 5 минут не принимаем

/**
 * Проверяет подпись initData.
 *
 * `maxAgeSeconds` — ТОЛЬКО окно свежести (anti-replay). Сама подпись (HMAC)
 * проверяется всегда и одинаково: расширять окно можно, ослаблять валидацию —
 * нет. По умолчанию 5 минут; передавать другое значение уместно лишь там, где
 * повтор чужой подписи не даёт злоумышленнику ничего сверх того, что и так
 * принадлежит владельцу подписи (см. PROMO_SEEN_MAX_AGE_SECONDS в
 * lib/promo-vpn.ts — там объяснено, почему для той ручки это безопасно).
 */
export function validateTelegramWebApp(
  initData: string,
  maxAgeSeconds: number = MAX_AGE_SECONDS,
): { valid: boolean; userId?: number } {
  try {
    const botToken = process.env.BOT_TOKEN ?? ''
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return { valid: false }
    params.delete('hash')

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest()

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex')

    const expected = Buffer.from(expectedHash, 'hex')
    const received = Buffer.from(hash, 'hex')
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received))
      return { valid: false }

    const authDate = parseInt(params.get('auth_date') || '0', 10)
    const now = Math.floor(Date.now() / 1000)
    if (now - authDate > maxAgeSeconds) {
      return { valid: false }
    }

    const user = JSON.parse(params.get('user') || '{}')
    return { valid: true, userId: user.id }
  } catch {
    return { valid: false }
  }
}
