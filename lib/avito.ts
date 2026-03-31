/**
 * lib/avito.ts — Avito Messenger Integration
 *
 * OAuth2 client_credentials → REST polling чатов → CRM forwarding.
 * Avito Messenger API: https://developers.avito.ru/api-catalog/messenger
 */

import { Sentry } from './sentry'
import log from './logger'

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
let refreshPromise: Promise<string> | null = null

export async function getAvitoToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token
  }

  if (refreshPromise) return refreshPromise

  if (!AVITO_CLIENT_ID || !AVITO_CLIENT_SECRET) {
    throw new Error('AVITO_CLIENT_ID or AVITO_CLIENT_SECRET not set')
  }

  refreshPromise = (async () => {
  try {
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

      log.info('Avito token obtained', { expiresIn: data.expires_in })
      return cachedToken.token
    } catch (err) {
      log.error('Avito token refresh failed', { attempt, error: err instanceof Error ? err.message : String(err) })
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000))
    }
  }
  const oauthErr = new Error('Avito OAuth: failed after 3 attempts')
  Sentry.captureException(oauthErr, { tags: { operation: 'avito-oauth' } })
  throw oauthErr
  } finally {
    refreshPromise = null
  }
  })()

  return refreshPromise
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

interface AvitoImageSizes {
  [resolution: string]: string  // e.g. "1280x960": "https://..."
}

interface AvitoLastMessage {
  id: string
  type?: string  // text, appCall, image, system, item, link
  text?: string
  content?: {
    text?: string
    image?: { sizes?: AvitoImageSizes }
    images?: Array<{ sizes?: AvitoImageSizes }>
    link?: { url?: string; text?: string }
  }
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

  log.debug('Avito sending message', { chatId, userId, textPreview: text.slice(0, 50) })

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const body = JSON.stringify({ message: { text }, type: 'text' })

  // v1 is the correct endpoint per Avito docs
  for (const ver of ['v1']) {
    const url = `${AVITO_API}/messenger/${ver}/accounts/${userId}/chats/${chatId}/messages`
    log.debug('Avito API request', { version: ver })

    const res = await fetch(url, { method: 'POST', headers, body })
    if (res.ok) {
      log.info('Avito message sent', { version: ver })
      return
    }

    const errText = await res.text()
    log.warn('Avito send failed', { version: ver, status: res.status, response: errText.slice(0, 200) })
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
      log.warn('Avito rate limited', { attempt, maxRetries, delay })
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
      log.error('Avito price update failed', { itemId, status: res.status })
      return false
    }
    log.info('Avito price updated', { itemId, price: Math.round(price) })
    return true
  } catch (err) {
    log.error('Avito updatePrice error', { error: err instanceof Error ? err.message : String(err) })
    return false
  }
}

// ─── Stats API ──────────────────────────────────────────────────────────────

interface AvitoItemStatResult {
  itemId: string
  date: string
  uniqViews: number
  uniqContacts: number
  uniqFavorites: number
}

/** Fetch daily stats for items via POST /stats/v1/accounts/{userId}/items */
export async function getAvitoItemStats(
  itemIds: string[], dateFrom: string, dateTo: string,
): Promise<AvitoItemStatResult[]> {
  const token = await getAvitoToken()
  const userId = await getAvitoUserId()
  const results: AvitoItemStatResult[] = []

  const BATCH = 200
  for (let i = 0; i < itemIds.length; i += BATCH) {
    const batch = itemIds.slice(i, i + BATCH)
    const res = await avitoFetchWithRetry(
      `${AVITO_API}/stats/v1/accounts/${userId}/items`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateFrom, dateTo,
          itemIds: batch.map(Number),
          fields: ['uniqViews', 'uniqContacts', 'uniqFavorites'],
        }),
      },
    )
    if (!res.ok) {
      log.warn('Avito stats API error', { status: res.status })
      continue
    }
    const data = await res.json() as {
      result?: { items?: Array<{ itemId: number; stats?: Array<{ date: string; uniqViews?: number; uniqContacts?: number; uniqFavorites?: number }> }> }
    }
    for (const item of data.result?.items ?? []) {
      for (const stat of item.stats ?? []) {
        results.push({
          itemId: String(item.itemId),
          date: stat.date,
          uniqViews: stat.uniqViews ?? 0,
          uniqContacts: stat.uniqContacts ?? 0,
          uniqFavorites: stat.uniqFavorites ?? 0,
        })
      }
    }
    if (i + BATCH < itemIds.length) await new Promise(r => setTimeout(r, 15_000))
  }
  return results
}

// ─── Извлечение URL изображения из сообщения ─────────────────────────────────

/** Pick the largest image URL from Avito image sizes map */
function pickLargestImage(sizes: AvitoImageSizes): string | undefined {
  // Keys like "1280x960", "640x480" — pick the one with largest first dimension
  let best: string | undefined
  let bestW = 0
  for (const [key, url] of Object.entries(sizes)) {
    const w = parseInt(key.split('x')[0] ?? '0', 10)
    if (url && w > bestW) {
      bestW = w
      best = url
    }
  }
  return best || Object.values(sizes)[0]
}

/** Extract all image URLs from an Avito message */
export function extractAvitoImages(msg: AvitoLastMessage): string[] {
  const urls: string[] = []

  // type === 'image': content.image.sizes
  if (msg.content?.image?.sizes) {
    const url = pickLargestImage(msg.content.image.sizes)
    if (url) urls.push(url)
  }

  // content.images[] array (multiple images)
  if (msg.content?.images) {
    for (const img of msg.content.images) {
      if (img.sizes) {
        const url = pickLargestImage(img.sizes)
        if (url) urls.push(url)
      }
    }
  }

  // type === 'link' with image URL
  if (msg.type === 'link' && msg.content?.link?.url) {
    const linkUrl = msg.content.link.url
    if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(linkUrl)) {
      urls.push(linkUrl)
    }
  }

  return urls
}

// ─── Отправка изображения в чат Avito ────────────────────────────────────────

export async function sendAvitoImage(chatId: string, imageUrl: string): Promise<void> {
  const token = await getAvitoToken()
  const userId = await getAvitoUserId()

  // Download the image from Telegram
  const imageResponse = await fetch(imageUrl)
  if (!imageResponse.ok) throw new Error(`Failed to download image: ${imageResponse.status}`)
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'

  // Method 1: multipart upload to Avito images endpoint
  try {
    const boundary = '----AvitoFormBoundary' + Date.now()
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="photo.jpg"\r\nContent-Type: ${contentType}\r\n\r\n`),
      imageBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])

    const uploadUrl = `${AVITO_API}/messenger/v1/accounts/${userId}/chats/${chatId}/images`
    const res1 = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    })

    if (res1.ok) {
      log.info('Avito image sent via upload', { chatId })
      return
    }
    log.warn('Avito image upload failed', { status: res1.status, error: (await res1.text()).slice(0, 200) })
  } catch (err) {
    log.warn('Avito image upload error', { error: err instanceof Error ? err.message : String(err) })
  }

  // Method 2: send as message with type=image
  try {
    const msgUrl = `${AVITO_API}/messenger/v1/accounts/${userId}/chats/${chatId}/messages`
    const res2 = await fetch(msgUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: { text: '' },
        type: 'image',
        image: { url: imageUrl },
      }),
    })

    if (res2.ok) {
      log.info('Avito image sent via message type:image', { chatId })
      return
    }
    log.warn('Avito image message failed', { status: res2.status, error: (await res2.text()).slice(0, 200) })
  } catch (err) {
    log.warn('Avito image message error', { error: err instanceof Error ? err.message : String(err) })
  }

  // Method 3: host image on our server, send public URL
  const { writeFileSync, mkdirSync, existsSync } = await import('fs')
  const pathMod = await import('path')

  const uploadsDir = pathMod.join(__dirname, '../public/uploads')
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true })

  const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg'
  const filename = `avito-${Date.now()}${ext}`
  writeFileSync(pathMod.join(uploadsDir, filename), imageBuffer)

  const baseUrl = process.env.WEBAPP_URL || 'https://bendershop.store'
  const publicUrl = `${baseUrl}/uploads/${filename}`

  await sendAvitoMessage(chatId, `📷 ${publicUrl}`)
  log.info('Avito image sent via hosted URL', { chatId, publicUrl })
}
