import { Telegraf } from 'telegraf'
import { prisma } from './prisma'
import log from './logger'

export type SecurityEvent =
  | 'invalid_telegram_signature'
  | 'pdn_consent'
  | 'price_manipulation_attempt'
  | 'rate_limit_exceeded'
  | 'invalid_order_data'
  | 'unauthorized_access'
  | 'ai_key_changed'
  | 'ai_mode_changed'
  | 'enrich_batch_started'
  | 'maintenance_mode_toggled'
  | 'security_log_purged'
  | 'price_changed'
  | 'inventory_modified'
  | 'sale_confirmed'
  | 'reservation_released'
  | 'broadcast_sent'
  | 'promotion_created'
  | 'promotion_cancelled'
  | 'reservation_created'
  | 'inventory_created'
  | 'inventory_updated'
  | 'inventory_deleted'
  | 'category_changed'
  | 'segment_created'
  | 'segment_renamed'
  | 'segment_deleted'
  | 'storefront_updated'
  | 'banner_added'
  | 'banner_deleted'
  | 'banner_reordered'
  | 'region_created'
  | 'region_updated'
  | 'region_deleted'
  | 'backup_created'
  | 'supplier_created'
  | 'supplier_updated'
  | 'supplier_deleted'
  | 'supplier_markup_changed'
  | 'admin_hmac_stale'
  | 'invalid_admin_hmac'
  | 'photos_uploaded'
  | 'admin_access_denied'
  | 'admin_role_denied'
  | 'admin_invalid_signature'
  | 'price_batch_applied'
  | 'price_out_of_corridor_applied'
  | 'markup_rule_changed'
  | 'admin_added'
  | 'admin_role_changed'

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
  // Решение владельца (PR-7 п.9): вне-коридорное применение цен будит админов;
  // шторм невозможен — троттлинг отправки critical-алертов (hardening 1б)
  'price_out_of_corridor_applied',
]

const EVENT_DESCRIPTIONS: Record<SecurityEvent, string> = {
  pdn_consent:                '✅ Согласие на обработку персональных данных (профиль)',
  price_manipulation_attempt: '💰 Попытка подмены цены в заказе',
  unauthorized_access:        '🚫 Попытка несанкционированного доступа к админке',
  invalid_telegram_signature: '🔑 Запрос с неверной подписью Telegram',
  rate_limit_exceeded:        '⏳ Превышен лимит запросов',
  invalid_order_data:         '📋 Неверные данные заказа',
  ai_key_changed:             '🔑 Изменён ключ API (OpenRouter)',
  ai_mode_changed:            '🤖 Изменён режим AI-агента',
  enrich_batch_started:       '✨ Запущено массовое обогащение карточек (платные запросы)',
  maintenance_mode_toggled:   '🔧 Переключён режим техработ',
  security_log_purged:        '🗑️ Очищен лог безопасности',
  price_changed:              '💰 Изменена цена товара',
  inventory_modified:         '📦 Изменение остатков (приход/списание)',
  sale_confirmed:             '💵 Подтверждена продажа',
  reservation_released:       '🔖 Завершён/отменён резерв',
  broadcast_sent:             '📢 Отправлена рассылка',
  promotion_created:          '🏷️ Создана акция',
  promotion_cancelled:        '🏷️ Отменена акция',
  reservation_created:        '🔖 Создан резерв',
  inventory_created:          '📦 Создан товар',
  inventory_updated:          '📦 Изменение остатков',
  inventory_deleted:          '📦 Удалён товар',
  category_changed:           '📂 Изменена категория',
  segment_created:            '📊 Создан сегмент',
  segment_renamed:            '📊 Переименован сегмент',
  segment_deleted:            '📊 Удалён сегмент',
  storefront_updated:         '🖼️ Обновлена витрина',
  banner_added:               '🖼️ Добавлен баннер',
  banner_deleted:             '🖼️ Удалён баннер',
  banner_reordered:           '🖼️ Изменён порядок баннеров',
  region_created:             '🌍 Добавлен регион',
  region_updated:             '🌍 Изменён регион',
  region_deleted:             '🌍 Удалён регион',
  backup_created:             '🗄️ Создан бэкап базы данных',
  supplier_created:           '🏭 Добавлен поставщик',
  supplier_updated:           '🏭 Обновлён поставщик',
  supplier_deleted:           '🏭 Удалён поставщик',
  supplier_markup_changed:    '🏭 Изменена наценка по умолчанию',
  admin_hmac_stale:           '🕒 Просроченная подпись /admin (replay-защита)',
  invalid_admin_hmac:         '🔑 Неверная HMAC-подпись /admin',
  photos_uploaded:            '🖼️ Загружен пакет фото товаров',
  admin_access_denied:        '🚫 Отказ в доступе к админ-API (нет в AdminUser / деактивирован)',
  admin_role_denied:          '🚫 Отказ по роли в админ-API (нужен owner)',
  // Намеренно ВНЕ CRITICAL_EVENTS: сканеры с мусорным заголовком не должны
  // будить всех админов (замечание владельца №1а к PR-2). Витринная подпись
  // остаётся critical как invalid_telegram_signature.
  admin_invalid_signature:    '🔑 Запрос к админ-API с неверной подписью Telegram',
  price_batch_applied:        '💰 Применён батч цен из разбора прайса',
  price_out_of_corridor_applied: '🚨 Применены цены ВНЕ коридора ±15% (owner-овеаррайд)',
  admin_added:                '👤 Добавлен сотрудник в админку',
  admin_role_changed:         '👤 Изменены права сотрудника',
  markup_rule_changed:        '💰 Изменено правило наценки (влияет на пересчёт всех цен)',
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

// ─── Троттлинг critical-алертов (hardening 1б) ────────────────────────────────
//
// Троттлится ТОЛЬКО отправка в Telegram — в SecurityLog пишется каждое событие
// (полный аудит не режем). Окно: 1 сообщение на (событие × IP) в 5 минут;
// подавленные считаются и доклеиваются суффиксом к следующему отправленному.
// Стор in-memory (сброс на рестарте — ок), с эвикцией, чтобы не тёк на
// множестве IP: сначала истёкшие окна, затем самые старые.

const ALERT_WINDOW_MS = 5 * 60 * 1000
const ALERT_MAP_MAX = 500
const _alertWindows = new Map<string, { start: number; suppressed: number }>()

/** Решение «слать ли алерт сейчас» + сколько подавили за прошлое окно. */
export function shouldSendCriticalAlert(
  event: string,
  ip: string | undefined,
  now: number = Date.now(),
): { send: boolean; suppressedBefore: number } {
  const key = `${event}:${ip ?? '-'}`
  const cur = _alertWindows.get(key)
  if (cur && now - cur.start < ALERT_WINDOW_MS) {
    cur.suppressed++
    return { send: false, suppressedBefore: 0 }
  }
  const suppressedBefore = cur?.suppressed ?? 0
  if (!cur && _alertWindows.size >= ALERT_MAP_MAX) {
    for (const [k, v] of _alertWindows) {
      if (now - v.start >= ALERT_WINDOW_MS) _alertWindows.delete(k)
    }
    while (_alertWindows.size >= ALERT_MAP_MAX) {
      let oldestKey: string | null = null
      let oldestStart = Infinity
      for (const [k, v] of _alertWindows) {
        if (v.start < oldestStart) { oldestStart = v.start; oldestKey = k }
      }
      if (!oldestKey) break
      _alertWindows.delete(oldestKey)
    }
  }
  _alertWindows.set(key, { start: now, suppressed: 0 })
  return { send: true, suppressedBefore }
}

/** Только для тестов. */
export function _resetAlertWindows(): void {
  _alertWindows.clear()
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
  log.warn(`[SECURITY] ${event}`, { event, details: safe })

  try {
    await prisma.securityLog.create({
      data: {
        event,
        details: JSON.stringify(safe),
        ip: details.ip ?? null,
      },
    })
  } catch (err) {
    log.error('[SECURITY] Failed to write security log', { err: err instanceof Error ? err.message : String(err) })
  }

  const text = formatSecurityAlert(event, safe)

  if (CRITICAL_EVENTS.includes(event) && _bot && _adminIds.length > 0) {
    const { send, suppressedBefore } = shouldSendCriticalAlert(event, details.ip)
    if (send) {
      const alertText = suppressedBefore > 0
        ? `${text}\n\n…и ещё ${suppressedBefore} таких событий за прошлое окно (5 мин)`
        : text
      for (const adminId of _adminIds) {
        try {
          await _bot.telegram.sendMessage(adminId, alertText)
        } catch (err) {
          log.error('[SECURITY] Failed to send alert to admin', { adminId, err: err instanceof Error ? err.message : String(err) })
        }
      }
    }
  }

  // Also alert the specific adminTelegramId if provided and not already in _adminIds.
  // ТОЛЬКО реальным членам команды (AdminUser): в витринных событиях сюда
  // прилетает telegramId ПОКУПАТЕЛЯ — слать ему «СОБЫТИЕ БЕЗОПАСНОСТИ» нельзя.
  if (adminTelegramId !== undefined && _bot) {
    const id = Number(adminTelegramId)
    if (!isNaN(id) && !_adminIds.includes(id)) {
      let isTeamMember = false
      try {
        isTeamMember = !!(await prisma.adminUser.findUnique({ where: { telegramId: String(id) }, select: { telegramId: true } }))
      } catch { /* AdminUser недоступен — молчим, критикал-рассылка выше уже ушла */ }
      if (isTeamMember) {
        try {
          await _bot.telegram.sendMessage(id, text)
        } catch (err) {
          log.error('[SECURITY] Failed to send alert to admin', { adminId: id, err: err instanceof Error ? err.message : String(err) })
        }
      }
    }
  }
}
