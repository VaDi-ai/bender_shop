const SECRET_FIELDS = ['token', 'key', 'password', 'secret', 'api_key', 'BOT_TOKEN']

export function safeLog(message: string, data?: Record<string, any>): void {
  if (!data) {
    console.log(message)
    return
  }

  const sanitized = { ...data }
  for (const field of SECRET_FIELDS) {
    if (sanitized[field]) sanitized[field] = '***'
  }
  console.log(message, sanitized)
}
