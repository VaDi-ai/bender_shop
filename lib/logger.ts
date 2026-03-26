import pino from 'pino'

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino/file', options: { destination: 1 } }
    : undefined,
  formatters: {
    level(label) { return { level: label } },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

const SENSITIVE_KEYS = /token|secret|password|key|phone|email|address|card|cvv|otp|pin|credential|bearer|пароль|телефон/i

function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.test(k) && typeof v === 'string') {
      result[k] = v.length > 4 ? v.slice(0, 2) + '***' + v.slice(-2) : '***'
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      result[k] = sanitize(v as Record<string, unknown>)
    } else {
      result[k] = v
    }
  }
  return result
}

export const log = {
  info(msg: string, data?: Record<string, unknown>) {
    logger.info(data ? sanitize(data) : {}, msg)
  },
  warn(msg: string, data?: Record<string, unknown>) {
    logger.warn(data ? sanitize(data) : {}, msg)
  },
  error(msg: string, data?: Record<string, unknown>) {
    logger.error(data ? sanitize(data) : {}, msg)
  },
  debug(msg: string, data?: Record<string, unknown>) {
    logger.debug(data ? sanitize(data) : {}, msg)
  },
}

export function safeLog(message: string, data?: Record<string, unknown>): void {
  log.info(message, data)
}

export default log
