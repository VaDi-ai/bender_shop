const SECRET_SUBSTRINGS = ['token', 'key', 'password', 'secret']

export function safeLog(message: string, data?: Record<string, any>): void {
  if (!data) {
    console.log(message)
    return
  }

  const sanitized = { ...data }
  for (const field of Object.keys(sanitized)) {
    if (SECRET_SUBSTRINGS.some((s) => field.toLowerCase().includes(s))) {
      sanitized[field] = '***'
    }
  }
  console.log(message, sanitized)
}
