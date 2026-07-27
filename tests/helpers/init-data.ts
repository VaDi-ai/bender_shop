/** Сборка валидного Telegram initData для тестов (зеркало validateTelegramWebApp). */
import * as crypto from 'crypto'

export function buildInitData(userId: number, botToken: string, authDate = Math.floor(Date.now() / 1000)): string {
  const params = new URLSearchParams()
  params.set('user', JSON.stringify({ id: userId, first_name: 'Test' }))
  params.set('auth_date', String(authDate))
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
  params.set('hash', hash)
  return params.toString()
}
