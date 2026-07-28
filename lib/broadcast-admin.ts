/**
 * Рассылки из веб-админки.
 *
 * Рассылка — единственное действие панели, которое уходит НАРУЖУ, живым людям,
 * и отменить его нельзя. Поэтому:
 *   • отправка — только owner;
 *   • перед отправкой обязателен предпросмотр: сколько человек получит и как
 *     будет выглядеть текст;
 *   • есть «отправить себе» — репетиция на одном получателе (владелец), чтобы
 *     увидеть сообщение своими глазами до массовой отправки;
 *   • dryRun считает получателей и НИЧЕГО не шлёт — им же пользуется QA;
 *   • каждая отправка пишется в BroadcastLog и SecurityLog.
 *
 * Получатели: клиенты из Telegram (source=telegram и заполнен externalId) —
 * только им бот физически может написать.
 */
import { prisma } from './prisma'
import { log } from './logger'
import { logAdminAction } from './audit'
import { logSecurityEvent } from './security-log'

export const BROADCAST_MAX = 3000

export interface Outcome<T = unknown> {
  ok: boolean
  status: number
  error?: string
  data?: T
}

const bad = (status: number, error: string): Outcome => ({ ok: false, status, error })

export interface BroadcastPreview {
  recipients: number
  /** Примеры получателей — чтобы владелец видел, что это живые люди, а не «all» */
  sample: string[]
  text: string
  lastBroadcast: { createdAt: Date; target: string; totalSent: number; totalFailed: number } | null
}

async function telegramRecipients(): Promise<string[]> {
  const rows = await prisma.client.findMany({
    where: { source: 'telegram', externalId: { not: null } },
    select: { externalId: true },
  })
  return rows.map(r => r.externalId!).filter(Boolean)
}

function cleanText(raw: unknown): string {
  return String(raw ?? '').replace(/\u0000/g, '').trim()
}

export async function previewBroadcast(raw: unknown): Promise<Outcome<BroadcastPreview>> {
  const text = cleanText(raw)
  if (!text) return bad(422, 'Текст рассылки пустой — покупатели получат пустое сообщение') as Outcome<BroadcastPreview>
  if (text.length > BROADCAST_MAX) return bad(422, `Текст длиннее ${BROADCAST_MAX} символов — Telegram столько не примет`) as Outcome<BroadcastPreview>

  const [ids, sampleRows, last] = await Promise.all([
    telegramRecipients(),
    prisma.client.findMany({
      where: { source: 'telegram', externalId: { not: null } },
      select: { name: true, telegramUsername: true }, take: 5, orderBy: { lastPurchaseDate: 'desc' },
    }),
    prisma.broadcastLog.findFirst({ orderBy: { id: 'desc' }, select: { createdAt: true, target: true, totalSent: true, totalFailed: true } }),
  ])

  return {
    ok: true, status: 200,
    data: {
      recipients: ids.length,
      sample: sampleRows.map(r => r.telegramUsername ? '@' + r.telegramUsername : r.name),
      text,
      lastBroadcast: last,
    },
  }
}

export interface SendResult { sent: number; failed: number; recipients: number; dryRun: boolean }

type Sender = (chatId: string, text: string) => Promise<void>

/** Реальная отправка через Telegram Bot API — без Telegraf-контекста. */
function defaultSender(): Sender {
  const token = process.env.BOT_TOKEN ?? ''
  return async (chatId, text) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    })
    if (!res.ok) throw new Error(`telegram ${res.status}`)
  }
}

interface SendOpts {
  dryRun?: boolean
  /** Отправить только себе — репетиция перед массовой рассылкой */
  onlyTo?: string
  sender?: Sender
}

export async function sendBroadcast(actor: string, raw: unknown, opts: SendOpts = {}): Promise<Outcome<SendResult>> {
  const text = cleanText(raw)
  if (!text) return bad(422, 'Текст рассылки пустой') as Outcome<SendResult>
  if (text.length > BROADCAST_MAX) return bad(422, `Текст длиннее ${BROADCAST_MAX} символов`) as Outcome<SendResult>

  const recipients = opts.onlyTo ? [opts.onlyTo] : await telegramRecipients()
  if (!recipients.length) {
    return bad(422, 'Некому отправлять: в базе нет клиентов из Telegram') as Outcome<SendResult>
  }
  if (opts.dryRun) {
    return { ok: true, status: 200, data: { sent: 0, failed: 0, recipients: recipients.length, dryRun: true } }
  }

  const send = opts.sender ?? defaultSender()
  let sent = 0, failed = 0
  for (const chatId of recipients) {
    try {
      await send(chatId, text)
      sent++
    } catch (e) {
      failed++
      log.warn('Broadcast delivery failed', { chatId, error: e instanceof Error ? e.message : String(e) })
    }
    // Telegram душит быстрее ~30 сообщений в секунду; идём мягче
    if (recipients.length > 1) await new Promise(r => setTimeout(r, 40))
  }

  const target = opts.onlyTo ? 'self-test' : 'all'
  await prisma.broadcastLog.create({
    data: {
      type: 'all', target, messageText: text.slice(0, 1000),
      totalSent: sent, totalFailed: failed, createdBy: actor,
    },
  }).catch(e => log.error('BroadcastLog write failed', { error: e instanceof Error ? e.message : String(e) }))

  void logAdminAction({
    adminTelegramId: actor, action: 'broadcast_send', entity: 'BroadcastLog',
    after: { target, sent, failed, preview: text.slice(0, 120) },
  })
  void logSecurityEvent('broadcast_sent', { target, sent, failed, via: 'web' }, actor)
  return { ok: true, status: 200, data: { sent, failed, recipients: recipients.length, dryRun: false } }
}

export async function broadcastHistory(limit = 10): Promise<Array<{
  id: number; createdAt: Date; target: string; totalSent: number; totalFailed: number; messageText: string | null
}>> {
  return prisma.broadcastLog.findMany({
    orderBy: { id: 'desc' }, take: Math.min(limit, 50),
    select: { id: true, createdAt: true, target: true, totalSent: true, totalFailed: true, messageText: true },
  })
}
