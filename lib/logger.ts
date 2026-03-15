const SECRET_SUBSTRINGS = [
  'token', 'key', 'password', 'secret',
  'auth', 'bearer', 'credential', 'phone', 'email', 'card', 'cvv', 'otp', 'pin',
]

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth >= 3) return value
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1))
  }
  if (value !== null && typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>, depth + 1)
  }
  return value
}

function sanitizeObject(data: Record<string, unknown>, depth: number): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of Object.keys(data)) {
    if (SECRET_SUBSTRINGS.some((s) => field.toLowerCase().includes(s))) {
      result[field] = '***'
    } else {
      result[field] = sanitizeValue(data[field], depth)
    }
  }
  return result
}

export function safeLog(message: string, data?: Record<string, unknown>): void {
  if (!data) {
    console.log(message)
    return
  }
  console.log(message, sanitizeObject(data, 0))
}
