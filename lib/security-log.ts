import { Telegraf } from 'telegraf'
import { prisma } from './prisma'

export type SecurityEvent =
  | 'invalid_telegram_signature'
  | 'price_manipulation_attempt'
  | 'rate_limit_exceeded'
  | 'invalid_order_data'
  | 'unauthorized_access'
  | 'ai_key_changed'
  | 'ai_mode_changed'
  | 'maintenance_mode_toggled'
  | 'security_log_purged'

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
  ai_key_changed:             '🔑 Изменён ключ API (OpenRouter)',
  ai_mode_changed:            '🤖 Изменён режим AI-агента',
  maintenance_mode_toggled:   '🔧 Переключён режим техработ',
  security_log_purged:        '🗑️ Очищен лог безопасности',
}

const SENSITIVE_KEY_PATTERNS = ['token', 'key', 'hash', 'secret']

function sanitizeDetails(obj: Record<string, any>, depth = 0): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase()
    if (SENSITIVE_KEY_PATTERNS.some((p) => lk.includes(p))) {
      result[k] = '***'
    } else if (depth < 2 && Array.isArray(v)) {
      result[k] = v.map((el) =>
        el !== null && typeof el === 'object' && !Array.isArray(el)
          ? sanitizeDetails(el as Record<string, any>, depth + 1)
          : typeof el === 'string' ? el.slice(0, 200) : el
      )
    } else if (depth < 2 && v !== null && typeof v === 'object') {
      result[k] = sanitizeDetails(v as Record<string, any>, depth + 1)
    } else if (typeof v === 'string') {
      result[k] = v.slice(0, 200)
    } else {
      result[k] = v
    }
  }
  return result
}

function formatSecurityAlert(event: SecurityEvent, details: Record<string, any>): string {
  const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
  const desc = EVENT_DESCRIPTIONS[event] ?? event
  const safe = sanitizeDetails(details)
  const detailsStr = Object.entries(safe)
    .map(([k, v]) => `${k}: ${String(v).replace(/\n/g, '\\n')}`)
    .join('\n')
  return `⚠️ СОБЫТИЕ БЕЗОПАСНОСТИ\n\n${desc}\nВремя: ${time}\n\n${detailsStr}`
}

// ─── Основная функция логирования ─────────────────────────────────────────────

export async function logSecurityEvent(
  event: SecurityEvent,
  details: Record<string, any>,
  adminTelegramId?: string | number,
): Promise<void> {
  const allDetails = adminTelegramId !== undefined
    ? { ...details, adminTelegramId }
    : details
  const safe = sanitizeDetails(allDetails)
  console.warn(`[SECURITY] ${event}:`, safe)

  try {
    await prisma.securityLog.create({
      data: {
        event,
        details: JSON.stringify(safe),
        ip: details.ip ?? null,
      },
    })
  } catch (err) {
    console.error('[SECURITY] Failed to write security log:', err)
  }

  const text = formatSecurityAlert(event, safe)

  if (CRITICAL_EVENTS.includes(event) && _bot && _adminIds.length > 0) {
    for (const adminId of _adminIds) {
      try {
        await _bot.telegram.sendMessage(adminId, text)
      } catch (err) {
        console.error('[SECURITY] Failed to send alert to admin', adminId, ':', err)
      }
    }
  }

  // Also alert the specific adminTelegramId if provided and not already in _adminIds
  if (adminTelegramId !== undefined && _bot) {
    const id = Number(adminTelegramId)
    if (!isNaN(id) && !_adminIds.includes(id)) {
      try {
        await _bot.telegram.sendMessage(id, text)
      } catch (err) {
        console.error('[SECURITY] Failed to send alert to admin', id, ':', err)
      }
    }
  }
}
