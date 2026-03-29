/**
 * webhooks/avito.ts
 *
 * Обработчик входящих лидов с Avito через webhook.
 *
 * Avito шлёт POST-запрос на ваш URL при новом сообщении в чате.
 * Подключение: создайте HTTP-сервер (например, Express) и передавайте
 * тело запроса в handleAvitoWebhook.
 *
 * Документация: https://developers.avito.ru/api-catalog/messenger/documentation
 *
 * Пример подключения Express:
 *   app.post('/webhook/avito', express.raw({ type: 'application/json' }), async (req, res) => {
 *     try {
 *       await handleAvitoWebhook(JSON.parse(req.body), bot.telegram, req.body, req.headers['x-avito-signature'] as string | undefined)
 *       res.sendStatus(200)
 *     } catch (e) {
 *       if (e instanceof AvitoSignatureError) return res.sendStatus(401)
 *       throw e
 *     }
 *   })
 */

import crypto from 'crypto'
import { Telegram } from 'telegraf'
import { prisma } from '../lib/prisma'
import { sendToTopic } from '../lib/telegram-helpers'
import log from '../lib/logger'

const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID)
const AVITO_SECRET = process.env.AVITO_WEBHOOK_SECRET

if (!AVITO_SECRET) {
  log.error('AVITO_WEBHOOK_SECRET is required but not set — Avito webhook verification will reject all requests')
}

// Validate CRM_GROUP_ID at module load; if invalid, processing is skipped entirely.
const CRM_GROUP_ID_VALID = Number.isFinite(CRM_GROUP_ID) && CRM_GROUP_ID !== 0
if (!CRM_GROUP_ID_VALID) {
  log.error('avito.ts: CRM_GROUP_ID is missing or invalid — Avito messages will not be processed')
}

// ─── HMAC-SHA256 verification ─────────────────────────────────────────────────

export class AvitoSignatureError extends Error {
  constructor() { super('Invalid or missing X-Avito-Signature') }
}

function verifyAvitoSignature(rawBody: string | Buffer, signature: string | undefined): void {
  if (!AVITO_SECRET) throw new AvitoSignatureError()
  if (!signature) throw new AvitoSignatureError()
  const expected = crypto
    .createHmac('sha256', AVITO_SECRET)
    .update(rawBody)
    .digest('hex')
  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expected, 'hex')
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new AvitoSignatureError()
  }
}

// ─── Типы payload Avito Messenger Webhook ────────────────────────────────────

interface AvitoAuthor {
  id: number
  name: string
}

interface AvitoMessageContent {
  text: string
  created: string // ISO 8601
}

interface AvitoEventPayload {
  author: AvitoAuthor
  chat_id: string         // уникальный ID чата на Avito
  message: AvitoMessageContent
}

interface AvitoEvent {
  type: string            // "message" | "item_published" | ...
  payload: AvitoEventPayload
}

export interface AvitoWebhookBody {
  events: AvitoEvent[]
}

// ─── Точка входа ─────────────────────────────────────────────────────────────

/**
 * Обрабатывает тело Avito webhook: создаёт/находит клиента,
 * создаёт топик в CRM-группе, сохраняет сообщение в БД.
 */
export async function handleAvitoWebhook(
  body: AvitoWebhookBody,
  telegram: Telegram,
  rawBody: string | Buffer,
  signature: string | undefined,
): Promise<void> {
  verifyAvitoSignature(rawBody, signature)
  if (!CRM_GROUP_ID_VALID) {
    log.error('handleAvitoWebhook: skipping — CRM_GROUP_ID is invalid')
    return
  }
  for (const event of body.events) {
    if (event.type !== 'message') continue
    await processAvitoMessage(event.payload, telegram)
  }
}

// ─── Санитизация строк из внешнего источника ──────────────────────────────────

function sanitizeField(raw: string, maxLen = 500): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // strip control chars except \t(\x09) and \n(\x0A)
    .slice(0, maxLen)
}

// ─── Обработка одного сообщения ──────────────────────────────────────────────

async function processAvitoMessage(
  payload: AvitoEventPayload,
  telegram: Telegram,
): Promise<void> {
  const externalId = String(payload.author.id)
  const name = sanitizeField(payload.author.name)
  const text = sanitizeField(payload.message.text)

  // Найти или создать клиента
  let client = await prisma.client.findUnique({
    where: { source_externalId: { source: 'avito', externalId } },
  })

  if (!client) {
    const defaultSeg = await prisma.segment.findFirst({ where: { isDefault: true } })
    client = await prisma.client.create({
      data: { name, source: 'avito', externalId, segmentId: defaultSeg?.id ?? null },
    })
  }

  // Создать топик в CRM-группе, если ещё нет
  if (client.telegramTopicId == null) {
    const topic = await telegram.createForumTopic(CRM_GROUP_ID, `[Avito] ${name}`)

    client = await prisma.client.update({
      where: { id: client.id },
      data: { telegramTopicId: topic.message_thread_id },
    })

    await sendToTopic(
      telegram,
      CRM_GROUP_ID,
      topic.message_thread_id,
      `👤 Новый клиент: ${name}\n📌 Источник: Avito\n💬 Сообщение: ${text}`,
    )
  } else {
    await sendToTopic(
      telegram,
      CRM_GROUP_ID,
      client.telegramTopicId,
      `💬 [Avito] ${name}: ${text}`,
    )
  }

  // Сохраняем сообщение
  await prisma.message.create({
    data: {
      clientId: client.id,
      direction: 'in',
      text,
      source: 'avito',
    },
  })
}

// sendToTopic imported from lib/telegram-helpers.ts
