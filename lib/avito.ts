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

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${AVITO_API}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: AVITO_CLIENT_ID,
          client_secret: AVITO_CLIENT_SECRET,
          scope: 'messenger:read,messenger:write,items:info',
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

      console.log('[Avito] Token obtained (scope: messenger:read,write), expires in', data.expires_in, 'sec')
      return cachedToken.token
    } catch (err) {
      console.error(`[Avito] Token refresh attempt ${attempt}/3:`, err instanceof Error ? err.message : err)
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000))
    }
  }
  throw new Error('Avito OAuth: failed after 3 attempts')
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

  console.log('[Avito] Sending to chat:', chatId, 'type:', typeof chatId, 'user:', userId, 'text:', text.slice(0, 50))

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const body = JSON.stringify({ message: { text }, type: 'text' })

  // v1 is the correct endpoint per Avito docs
  for (const ver of ['v1']) {
    const url = `${AVITO_API}/messenger/${ver}/accounts/${userId}/chats/${chatId}/messages`
    console.log(`[Avito] Trying ${ver}: ${url}`)

    const res = await fetch(url, { method: 'POST', headers, body })
    if (res.ok) {
      console.log(`[Avito] Send success with ${ver}!`)
      return
    }

    const errText = await res.text()
    console.log(`[Avito] ${ver} response: ${res.status} ${errText.slice(0, 300)}`)
  }

  throw new Error(`Avito send failed: all API versions returned errors for chat ${chatId}`)
}

// ─── Проверка доступности ─────────────────────────────────────────────────────

export function isAvitoConfigured(): boolean {
  return !!(AVITO_CLIENT_ID && AVITO_CLIENT_SECRET)
}

// ─── Retry с обработкой 429 ──────────────────────────────────────────────────

async function avitoFetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options)
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10)
      const delay = retryAfter > 0 ? retryAfter * 1000 : attempt * 2000
      console.warn(`[Avito] 429 rate limited, retry in ${delay}ms (attempt ${attempt}/${maxRetries})`)
      await new Promise(r => setTimeout(r, delay))
      continue
    }
    return res
  }
  throw new Error('Avito API: max retries exceeded after 429')
}

// ─── Items API (объявления) ───────────────────────────────────────────────────

/** Получить все активные объявления с Avito (пагинация) */
export async function getAvitoItems(): Promise<Array<{ id: number; title: string; price: number | null; status: string; url: string | null }>> {
  const token = await getAvitoToken()
  const all: Array<{ id: number; title: string; price: number | null; status: string; url: string | null }> = []
  let page = 1
  while (true) {
    const res = await avitoFetchWithRetry(`${AVITO_API}/core/v1/items?status=active&per_page=50&page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) break
    const data = await res.json() as { resources?: Array<{ id: number; title: string; price?: number; status: string; url?: string }> }
    if (!data.resources || data.resources.length === 0) break
    all.push(...data.resources.map(r => ({ id: r.id, title: r.title, price: r.price ?? null, status: r.status, url: r.url ?? null })))
    if (data.resources.length < 50) break
    page++
  }
  return all
}

/** Обновить цену объявления. Rate limit: 150 req/min */
export async function updateAvitoPrice(itemId: number, price: number): Promise<boolean> {
  try {
    const token = await getAvitoToken()
    const res = await avitoFetchWithRetry(`${AVITO_API}/core/v1/items/${itemId}/update_price`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: Math.round(price) }),
    })
    if (!res.ok) {
      console.error(`[Avito] updatePrice ${itemId}: ${res.status} ${await res.text()}`)
      return false
    }
    console.log(`[Avito] Price updated: item ${itemId} → ${Math.round(price)}₽`)
    return true
  } catch (err) {
    console.error(`[Avito] updatePrice error:`, err)
    return false
  }
}
