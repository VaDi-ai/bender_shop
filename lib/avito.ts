/**
 * lib/avito.ts — Avito Messenger Integration
 *
 * OAuth2 client_credentials → REST polling чатов → CRM forwarding.
 * Avito Messenger API: https://developers.avito.ru/api-catalog/messenger
 */

const AVITO_CLIENT_ID = process.env.AVITO_CLIENT_ID
const AVITO_CLIENT_SECRET = process.env.AVITO_CLIENT_SECRET
const AVITO_API = 'https://api.avito.ru'

// ─── OAuth2: client_credentials ───────────────────────────────────────────────

interface AvitoToken {
  access_token: string
  token_type: string
  expires_in: number
}

let cachedToken: { token: string; expiresAt: number } | null = null

export async function getAvitoToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token
  }

  if (!AVITO_CLIENT_ID || !AVITO_CLIENT_SECRET) {
    throw new Error('AVITO_CLIENT_ID or AVITO_CLIENT_SECRET not set')
  }

  const res = await fetch(`${AVITO_API}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: AVITO_CLIENT_ID,
      client_secret: AVITO_CLIENT_SECRET,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Avito auth failed: ${res.status} ${err}`)
  }

  const data = await res.json() as AvitoToken
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }

  console.log('[Avito] Token obtained, expires in', data.expires_in, 'sec')
  return cachedToken.token
}

// ─── Профиль продавца ─────────────────────────────────────────────────────────

let cachedUserId: number | null = null

export async function getAvitoUserId(): Promise<number> {
  if (cachedUserId) return cachedUserId

  const token = await getAvitoToken()
  const res = await fetch(`${AVITO_API}/core/v1/accounts/self`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Avito profile failed: ${res.status}`)
  const profile = await res.json() as { id: number }
  cachedUserId = profile.id
  return cachedUserId!
}

// ─── Получение чатов ──────────────────────────────────────────────────────────

interface AvitoLastMessage {
  id: string
  type?: string  // text, appCall, image, system, item
  text?: string
  content?: { text?: string }
  body?: string
  created: number
  author_id: number
  direction: 'in' | 'out'
}

interface AvitoContext {
  value?: {
    id?: string
    title?: string
    url?: string
    images?: string[]
  }
}

export interface AvitoChat {
  id: string
  users: Array<{ id: number; name: string }>
  last_message?: AvitoLastMessage
  context?: AvitoContext
}

export async function getAvitoChats(): Promise<AvitoChat[]> {
  const token = await getAvitoToken()
  const userId = await getAvitoUserId()

  const res = await fetch(`${AVITO_API}/messenger/v2/accounts/${userId}/chats`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Avito chats failed: ${res.status}`)
  const data = await res.json() as { chats?: AvitoChat[] }
  return data.chats || []
}

// ─── Отправка сообщения ───────────────────────────────────────────────────────

export async function sendAvitoMessage(chatId: string, text: string): Promise<void> {
  const token = await getAvitoToken()
  const userId = await getAvitoUserId()

  console.log('[Avito] Sending to chat:', chatId, 'user:', userId, 'text:', text.slice(0, 50))

  const url = `${AVITO_API}/messenger/v2/accounts/${userId}/chats/${chatId}/messages`
  const body = JSON.stringify({ message: { text } })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  })
  if (!res.ok) {
    const errBody = await res.text()
    console.error('[Avito] Send error body:', errBody)
    console.error('[Avito] Send request:', { url, chatId, userId, textLength: text.length })
    throw new Error(`Avito send failed: ${res.status} ${errBody}`)
  }
}

// ─── Проверка доступности ─────────────────────────────────────────────────────

export function isAvitoConfigured(): boolean {
  return !!(AVITO_CLIENT_ID && AVITO_CLIENT_SECRET)
}
