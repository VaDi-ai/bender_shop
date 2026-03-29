/**
 * lib/api-errors.ts — Человекочитаемые сообщения об ошибках API
 */
import log from './logger'

export function humanizeApiError(e: unknown): string {
  const err = e as Record<string, unknown>
  const status =
    (err?.status as number | undefined) ??
    ((err?.response as Record<string, unknown>)?.status as number | undefined)
  const message = String(err?.message ?? '')

  if (status === 401) return '🔑 Неверный ключ API. Проверьте что скопировали ключ полностью.'
  if (status === 403) return '🚫 Доступ запрещён. Возможно ключ заблокирован или нет прав.'
  if (status === 429) return '⏳ Превышен лимит запросов. Подождите немного и попробуйте снова.'
  if (status === 402) return '💳 Недостаточно средств на балансе OpenRouter. Пополните счёт.'
  if (status === 500) return '🔧 Ошибка на стороне OpenRouter. Попробуйте через несколько минут.'
  if (status === 503) return '🔧 OpenRouter временно недоступен. Попробуйте позже.'
  if (message.includes('ENOTFOUND') || message.includes('ECONNREFUSED'))
    return '🌐 Нет подключения к интернету или OpenRouter недоступен.'
  if (message.includes('timeout') || message.includes('aborted') || message.includes('AbortError'))
    return '⏱️ Превышено время ожидания ответа. Проверьте интернет-соединение.'
  if (message.includes('invalid_api_key'))
    return '🔑 Неверный формат ключа API.'
  if (message.includes('model'))
    return '🤖 Указанная модель недоступна для вашего тарифа OpenRouter.'
  log.error('[API Error] Unhandled', { message: message || undefined, status })
  return 'Произошла ошибка. Попробуйте позже или обратитесь к администратору.'
}
