import 'telegraf'

declare module 'telegraf' {
  interface ExtraReplyMessage {
    message_thread_id?: number
  }
}

export interface TelegramApiError extends Error {
  response?: {
    description?: string
    error_code?: number
  }
}

export function isTelegramError(e: unknown): e is TelegramApiError {
  return e instanceof Error && 'response' in e
}
