import { Telegraf } from 'telegraf'
import { prisma } from './prisma'

export type SecurityEvent =
  | 'invalid_telegram_signature'
  | 'price_manipulation_attempt'
  | 'rate_limit_exceeded'
  | 'invalid_order_data'
  | 'unauthorized_access'

// ─── Ссылка на бот для реалтайм-алертов ──────────────────────────────────────

let _bot: Telegraf | null = null
let _adminIds: number[] = []

export function initSecurityAlerts(bot: Telegraf, adminIds: number[]): void {
  _bot = bot
  _adminIds = adminIds
}

// ─── Критичные события → немедленное уведомление ─────────────────────────────

const CRITICAL_EVENTS: SecurityEvent[] = [
  'price_manipulation_attempt',
  'unauthorized_access',
  'invalid_telegram_signature',
]

const EVENT_DESCRIPTIONS: Record<SecurityEvent, string> = {
  price_manipulation_attempt: '💰 Попытка подмены цены в заказе',
  unauthorized_access:        '🚫 Попытка несанкционированного доступа к админке',
  invalid_telegram_signature: '🔑 Запрос с неверной подписью Telegram',
  rate_limit_exceeded:        '⏳ Превышен лимит запросов',
  invalid_order_data:         '📋 Неверные данные заказа',
}

function formatSecurityAlert(event: SecurityEvent, details: Record<string, any>): string {
  const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
  const desc = EVENT_DESCRIPTIONS[event] ?? event
  const detailsStr = Object.entries(details)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  return `⚠️ СОБЫТИЕ БЕЗОПАСНОСТИ\n\n${desc}\nВремя: ${time}\n\n${detailsStr}`
}

// ─── Основная функция логирования ─────────────────────────────────────────────

export async function logSecurityEvent(
  event: SecurityEvent,
  details: Record<string, any>
): Promise<void> {
  console.warn(`[SECURITY] ${event}:`, details)

  try {
    await prisma.securityLog.create({
      data: {
        event,
        details: JSON.stringify(details),
        ip: details.ip ?? null,
      },
    })
  } catch {}

  if (CRITICAL_EVENTS.includes(event) && _bot && _adminIds.length > 0) {
    const text = formatSecurityAlert(event, details)
    for (const adminId of _adminIds) {
      try {
        await _bot.telegram.sendMessage(adminId, text)
      } catch {}
    }
  }
}
