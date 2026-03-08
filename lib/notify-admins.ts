/**
 * lib/notify-admins.ts — Уведомления администраторов об ошибках AI API
 */

import { Telegraf } from 'telegraf'
import { humanizeApiError } from './api-errors'

let _bot: Telegraf | null = null
const _adminIds: number[] = []

/** Вызвать один раз при старте бота */
export function initAdminNotifications(bot: Telegraf, adminIds: number[]): void {
  _bot = bot
  _adminIds.length = 0
  _adminIds.push(...adminIds)
}

/** Уведомить всех администраторов об ошибке AI API */
export async function notifyAdminsAboutApiError(error: unknown, context: string): Promise<void> {
  if (!_bot || _adminIds.length === 0) return
  const msg = humanizeApiError(error)
  const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
  const text = `⚠️ Ошибка AI API\n\nКонтекст: ${context}\n${msg}\n\nВремя: ${time}`
  for (const adminId of _adminIds) {
    try {
      await _bot.telegram.sendMessage(adminId, text, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Обновить ключ OpenRouter', callback_data: 'api_key_update_openrouter' }],
          ],
        },
      })
    } catch {
      // ignore — admin may have blocked the bot
    }
  }
}
