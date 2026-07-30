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
/** Telegram режет подпись к медиа на 1024 символах */
export const CAPTION_MAX = 1024

export interface Outcome<T = unknown> {
  ok: boolean
  status: number
  error?: string
  data?: T
}

const bad = (status: number, error: string): Outcome => ({ ok: false, status, error })

// ─── Таргетинг (перенос из bot/admin/broadcasts.ts один в один) ──────────────

export interface BroadcastTarget {
  type: 'all' | 'tag' | 'segment'
  tag?: string
  segmentId?: number
  tagFilter?: string
}

/** Валидация цели из тела запроса; отсутствие цели = 'all' (обратная совместимость). */
export function parseTarget(raw: unknown): Outcome<BroadcastTarget> {
  if (raw === undefined || raw === null) return { ok: true, status: 200, data: { type: 'all' } }
  const b = raw as Record<string, unknown>
  const type = b.type
  if (type === 'all' || type === undefined) return { ok: true, status: 200, data: { type: 'all' } }
  if (type === 'tag') {
    const tag = typeof b.tag === 'string' ? b.tag.trim() : ''
    if (!tag || tag.length > 50) return bad(422, 'Укажите тег') as Outcome<BroadcastTarget>
    return { ok: true, status: 200, data: { type: 'tag', tag } }
  }
  if (type === 'segment') {
    const segmentId = Number(b.segmentId)
    if (!Number.isInteger(segmentId)) return bad(422, 'Укажите сегмент') as Outcome<BroadcastTarget>
    const tagFilter = typeof b.tagFilter === 'string' && b.tagFilter.trim() ? b.tagFilter.trim() : undefined
    return { ok: true, status: 200, data: { type: 'segment', segmentId, tagFilter } }
  }
  return bad(422, 'Неизвестная аудитория') as Outcome<BroadcastTarget>
}

/**
 * Where-условие аудитории. С мультиканальностью база — клиенты Telegram И
 * Avito с заполненным адресом; фильтры тег/сегмент — как в боте.
 */
export function targetWhere(t: BroadcastTarget): Record<string, unknown> {
  const base = { source: { in: ['telegram', 'avito'] }, externalId: { not: null } }
  if (t.type === 'tag') return { ...base, tags: { some: { name: t.tag } } }
  if (t.type === 'segment') {
    return t.tagFilter
      ? { ...base, segmentId: t.segmentId, tags: { some: { name: t.tagFilter } } }
      : { ...base, segmentId: t.segmentId }
  }
  return base
}

/** Та же аудитория БЕЗ ограничения по каналу — для честного счёта «недоступно». */
export function targetWhereAnySource(t: BroadcastTarget): Record<string, unknown> {
  const w = { ...targetWhere(t) } as Record<string, unknown>
  delete w.source
  delete w.externalId
  return w
}

// ─── Мультиканальные получатели ──────────────────────────────────────────────

export type Channel = 'telegram' | 'avito'

export interface Recipient { channel: Channel; address: string }

/**
 * Адрес по каналу: telegram → chatId бота (externalId), avito → Avito chatId
 * из установленной конвенции externalId = "buyerId:chatId" (bot/scheduler.ts,
 * CRM-ответы). Клиент без резолвимого адреса — в «недоступные», не падаем.
 */
export function resolveRecipient(source: string, externalId: string | null): Recipient | null {
  if (!externalId) return null
  if (source === 'telegram') return { channel: 'telegram', address: externalId }
  if (source === 'avito') {
    const chatId = externalId.split(':')[1]
    return chatId ? { channel: 'avito', address: chatId } : null
  }
  return null
}

/** Человекочитаемая аудитория + строка для BroadcastLog.target (как в боте). */
export async function describeTarget(t: BroadcastTarget): Promise<{ label: string; logTarget: string }> {
  if (t.type === 'tag') return { label: `тег «${t.tag}»`, logTarget: t.tag! }
  if (t.type === 'segment') {
    const seg = await prisma.segment.findUnique({ where: { id: t.segmentId! }, select: { name: true, color: true } })
    const name = seg ? seg.name : `#${t.segmentId}`
    return {
      label: t.tagFilter ? `сегмент «${name}» + тег «${t.tagFilter}»` : `сегмент «${name}»`,
      logTarget: t.tagFilter ? `${name}+${t.tagFilter}` : name,
    }
  }
  return { label: 'всем клиентам', logTarget: 'all' }
}

export interface BroadcastPreview {
  /** Кому реально можем написать (сумма каналов) */
  recipients: number
  /** Разбивка по каналам */
  byChannel: { telegram: number; avito: number }
  /** В аудитории, но без резолвимого адреса ни в одном канале */
  unreachable: number
  /** Всего клиентов в базе — чтобы разрыв был объяснён, а не пугал */
  totalClients: number
  /** Примеры получателей — чтобы владелец видел, что это живые люди, а не «all» */
  sample: string[]
  text: string
  audience: string
  lastBroadcast: { createdAt: Date; target: string; totalSent: number; totalFailed: number } | null
}

async function resolveRecipients(target: BroadcastTarget = { type: 'all' }): Promise<{
  recipients: Recipient[]
  byChannel: { telegram: number; avito: number }
  inAudience: number
}> {
  const [rows, inAudience] = await Promise.all([
    prisma.client.findMany({
      where: targetWhere(target),
      select: { source: true, externalId: true },
    }),
    prisma.client.count({ where: targetWhereAnySource(target) }),
  ])
  const recipients: Recipient[] = []
  const byChannel = { telegram: 0, avito: 0 }
  for (const r of rows) {
    const rec = resolveRecipient(r.source, r.externalId)
    if (!rec) continue
    recipients.push(rec)
    byChannel[rec.channel]++
  }
  return { recipients, byChannel, inAudience }
}

function cleanText(raw: unknown): string {
  return String(raw ?? '').replace(/\u0000/g, '').trim()
}

/**
 * Кому уйдёт. Текст здесь НЕ обязателен: владелец хочет увидеть охват до
 * того, как напишет сообщение. Текст проверяется только на отправке.
 */
export async function previewBroadcast(raw?: unknown, target: BroadcastTarget = { type: 'all' }): Promise<Outcome<BroadcastPreview>> {
  const text = cleanText(raw)

  const [resolved, sampleRows, last, totalClients, audience] = await Promise.all([
    resolveRecipients(target),
    prisma.client.findMany({
      where: targetWhere(target),
      select: { name: true, telegramUsername: true }, take: 5, orderBy: { lastPurchaseDate: 'desc' },
    }),
    prisma.broadcastLog.findFirst({ orderBy: { id: 'desc' }, select: { createdAt: true, target: true, totalSent: true, totalFailed: true } }),
    prisma.client.count(),
    describeTarget(target),
  ])

  return {
    ok: true, status: 200,
    data: {
      recipients: resolved.recipients.length,
      byChannel: resolved.byChannel,
      unreachable: Math.max(0, resolved.inAudience - resolved.recipients.length),
      totalClients,
      // username в базе иногда уже с «@» — не плодим «@@»
      sample: sampleRows.map(r => r.telegramUsername ? '@' + r.telegramUsername.replace(/^@+/, '') : r.name),
      text,
      audience: audience.label,
      lastBroadcast: last,
    },
  }
}

export interface ChannelReport { sent: number; failed: number; skipped: number }

export interface SendResult {
  sent: number
  failed: number
  /** Пропущено (Avito без пригодного контента: только-видео без текста) */
  skipped: number
  recipients: number
  dryRun: boolean
  byChannel: { telegram: ChannelReport; avito: ChannelReport }
}

export interface BroadcastMedia { url: string; type: 'photo' | 'video' }

/** Валидация медиа: только https-ссылка; фото грузится нашей загрузкой картинок. */
export function parseMedia(raw: unknown): Outcome<BroadcastMedia | null> {
  if (raw === undefined || raw === null) return { ok: true, status: 200, data: null }
  const b = raw as Record<string, unknown>
  const url = typeof b.url === 'string' ? b.url.trim() : ''
  if (!url) return { ok: true, status: 200, data: null }
  if (!/^https:\/\//.test(url)) return bad(422, 'Ссылка на медиа должна начинаться с https://') as Outcome<BroadcastMedia | null>
  if (url.length > 500) return bad(422, 'Слишком длинная ссылка на медиа') as Outcome<BroadcastMedia | null>
  const type = b.type === 'video' ? 'video' as const : 'photo' as const
  return { ok: true, status: 200, data: { url, type } }
}

type Sender = (chatId: string, text: string, media?: BroadcastMedia | null) => Promise<void>

/** Реальная отправка через Telegram Bot API — без Telegraf-контекста. */
function defaultSender(): Sender {
  const token = process.env.BOT_TOKEN ?? ''
  return async (chatId, text, media) => {
    const method = media ? (media.type === 'video' ? 'sendVideo' : 'sendPhoto') : 'sendMessage'
    const body: Record<string, unknown> = media
      ? { chat_id: chatId, [media.type]: media.url, caption: text || undefined }
      : { chat_id: chatId, text, disable_web_page_preview: true }
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`telegram ${res.status}`)
  }
}

/** Avito-отправщик — абстракция для тестов; боевой лениво импортирует lib/avito. */
export interface AvitoSender {
  message(chatId: string, text: string): Promise<void>
  image(chatId: string, imageUrl: string): Promise<void>
}

async function defaultAvitoSender(): Promise<AvitoSender> {
  const avito = await import('./avito')
  return {
    message: (chatId, text) => avito.sendAvitoMessage(chatId, text),
    image: (chatId, url) => avito.sendAvitoImage(chatId, url),
  }
}

/**
 * Троттлинг Avito: владелец принял риск спам-бана, наша часть — не дать
 * превысить лимит (~150 req/мин). Один верхнеуровневый вызов может дать до
 * 2–3 запросов внутри (fallback-цепочка sendAvitoImage), поэтому держим
 * ≥1 сек между вызовами — ≤60 вызовов/мин, с запасом.
 */
export const AVITO_MIN_INTERVAL_MS = 1000

interface SendOpts {
  dryRun?: boolean
  /** Отправить только себе — репетиция перед массовой рассылкой (telegram-чат владельца) */
  onlyTo?: string
  sender?: Sender
  avitoSender?: AvitoSender
  target?: BroadcastTarget
  media?: BroadcastMedia | null
  /** Пауза между Avito-вызовами (в тестах укорачивается) */
  avitoIntervalMs?: number
}

export async function sendBroadcast(actor: string, raw: unknown, opts: SendOpts = {}): Promise<Outcome<SendResult>> {
  const text = cleanText(raw)
  const media = opts.media ?? null
  // С медиа текст — подпись (может быть пустой); без медиа текст обязателен
  if (!media && !text) return bad(422, 'Текст рассылки пустой') as Outcome<SendResult>
  if (media && text.length > CAPTION_MAX) return bad(422, `Подпись к медиа длиннее ${CAPTION_MAX} символов`) as Outcome<SendResult>
  if (!media && text.length > BROADCAST_MAX) return bad(422, `Текст длиннее ${BROADCAST_MAX} символов`) as Outcome<SendResult>

  const target = opts.target ?? { type: 'all' as const }
  const recipients: Recipient[] = opts.onlyTo
    ? [{ channel: 'telegram', address: opts.onlyTo }]
    : (await resolveRecipients(target)).recipients
  if (!recipients.length) {
    return bad(422, 'Некому отправлять: в выбранной аудитории нет клиентов с доступным адресом') as Outcome<SendResult>
  }
  const empty = (): ChannelReport => ({ sent: 0, failed: 0, skipped: 0 })
  const byChannel = { telegram: empty(), avito: empty() }
  if (opts.dryRun) {
    return { ok: true, status: 200, data: { sent: 0, failed: 0, skipped: 0, recipients: recipients.length, dryRun: true, byChannel } }
  }

  const send = opts.sender ?? defaultSender()
  const needsAvito = recipients.some(r => r.channel === 'avito')
  const avito = needsAvito ? (opts.avitoSender ?? await defaultAvitoSender()) : null
  const avitoInterval = opts.avitoIntervalMs ?? AVITO_MIN_INTERVAL_MS
  let lastAvitoCall = 0
  const avitoPace = async () => {
    const wait = lastAvitoCall + avitoInterval - Date.now()
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastAvitoCall = Date.now()
  }

  for (const r of recipients) {
    const ch = byChannel[r.channel]
    try {
      if (r.channel === 'telegram') {
        await send(r.address, text, media)
        ch.sent++
        // Telegram душит быстрее ~30 сообщений в секунду; идём мягче
        if (recipients.length > 1) await new Promise(res => setTimeout(res, 40))
      } else {
        // Avito: видео мессенджер по URL не принимает — деградируем до
        // текста (и фото, если фото); совсем без контента — пропускаем.
        const photoUrl = media?.type === 'photo' ? media.url : null
        if (!photoUrl && !text) { ch.skipped++; continue }
        if (photoUrl) {
          await avitoPace()
          await avito!.image(r.address, photoUrl)
        }
        if (text) {
          await avitoPace()
          await avito!.message(r.address, text)
        }
        ch.sent++
        // Каждый Avito-отправленный — в лог (принятый риск, но с полным следом)
        log.info('Avito broadcast message sent', { chatId: r.address, media: photoUrl ? 'photo' : null })
      }
    } catch (e) {
      ch.failed++
      log.warn('Broadcast delivery failed', { channel: r.channel, chatId: r.address, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const sent = byChannel.telegram.sent + byChannel.avito.sent
  const failed = byChannel.telegram.failed + byChannel.avito.failed
  const skipped = byChannel.telegram.skipped + byChannel.avito.skipped

  const desc = await describeTarget(target)
  const logTarget = opts.onlyTo ? 'self-test' : desc.logTarget
  await prisma.broadcastLog.create({
    data: {
      type: target.type, target: logTarget, messageText: text ? text.slice(0, 1000) : null,
      mediaFileId: media?.url ?? null, mediaType: media?.type ?? null,
      totalSent: sent, totalFailed: failed, createdBy: actor,
    },
  }).catch(e => log.error('BroadcastLog write failed', { error: e instanceof Error ? e.message : String(e) }))

  void logAdminAction({
    adminTelegramId: actor, action: 'broadcast_send', entity: 'BroadcastLog',
    after: { target: logTarget, byChannel, media: media?.type ?? null, preview: text.slice(0, 120) },
  })
  void logSecurityEvent('broadcast_sent', { target: logTarget, type: target.type, sent, failed, skipped, byChannel, media: media?.type ?? null, via: 'web' }, actor)
  return { ok: true, status: 200, data: { sent, failed, skipped, recipients: recipients.length, dryRun: false, byChannel } }
}

export async function broadcastHistory(limit = 10): Promise<Array<{
  id: number; createdAt: Date; type: string; target: string; totalSent: number; totalFailed: number
  messageText: string | null; mediaType: string | null
}>> {
  return prisma.broadcastLog.findMany({
    orderBy: { id: 'desc' }, take: Math.min(limit, 50),
    select: { id: true, createdAt: true, type: true, target: true, totalSent: true, totalFailed: true, messageText: true, mediaType: true },
  })
}

/** Теги для таргетинга: имя + сколько клиентов; опционально в рамках сегмента. */
export async function listBroadcastTags(segmentId?: number): Promise<Array<{ name: string; clients: number }>> {
  const tags = await prisma.tag.groupBy({
    by: ['name'],
    where: segmentId ? { client: { segmentId } } : undefined,
    _count: { clientId: true },
    orderBy: { name: 'asc' },
  })
  return tags.map(t => ({ name: t.name, clients: t._count.clientId }))
}
