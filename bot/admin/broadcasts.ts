/**
 * bot/admin/broadcasts.ts
 *
 * Рассылки клиентам:
 *   • Всем Telegram-клиентам
 *   • По тегу
 *   • По сегменту (с опциональным фильтром по тегу)
 *   • История рассылок (BroadcastLog)
 *
 * Подключение в bot/index.ts:
 *   setupBroadcastHandlers(bot)
 *   showBroadcastMenu(ctx)
 *   handleBroadcastMessage(ctx, uid, txt) → boolean
 *   handleBroadcastPhoto(ctx, uid) → boolean
 *   handleBroadcastVideo(ctx, uid) → boolean
 *   broadcastsState — проверять/сбрасывать при нажатии кнопок меню
 */

import { Context, Markup, Telegraf } from 'telegraf'
import { prisma } from '../../lib/prisma'

// ─── Типы состояния ───────────────────────────────────────────────────────────

type BroadcastFlowState =
  | {
      flow: 'awaiting_text'
      type: 'all' | 'tag' | 'segment'
      target: string      // для tag — имя тега; для segment — "segId:segName"; для all — 'all'
      tagFilter?: string  // доп. фильтр по тегу для сегмента
    }
  | {
      flow: 'preview'
      type: 'all' | 'tag' | 'segment'
      target: string
      tagFilter?: string
      messageText?: string
      mediaFileId?: string
      mediaType?: 'photo' | 'video'
      caption?: string
    }

export const broadcastsState = new Map<number, BroadcastFlowState>()

// ─── Вспомогательные утилиты ──────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d
    .toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', '')
}

function typeIcon(type: string): string {
  if (type === 'all') return '📢'
  if (type === 'tag') return '🏷️'
  return '📂'
}

/** Человекочитаемое название аудитории для BroadcastLog.target */
function logTarget(
  type: 'all' | 'tag' | 'segment',
  target: string,
  tagFilter?: string,
): string {
  if (type === 'all') return 'all'
  if (type === 'tag') return target
  const name = target.split(':').slice(1).join(':')
  return tagFilter ? `${name}+${tagFilter}` : name
}

/** Строковое описание аудитории для предпросмотра */
function audienceLabel(
  type: 'all' | 'tag' | 'segment',
  target: string,
  count: number,
  tagFilter?: string,
): string {
  if (type === 'all') return `всем клиентам (${count} чел.)`
  if (type === 'tag') return `тег «${target}» (${count} чел.)`
  const segName = target.split(':').slice(1).join(':')
  if (tagFilter) return `сегмент «${segName}» + тег «${tagFilter}» (${count} чел.)`
  return `сегмент «${segName}» (${count} чел.)`
}

// ─── Работа с БД ──────────────────────────────────────────────────────────────

async function countRecipients(
  type: 'all' | 'tag' | 'segment',
  target: string,
  tagFilter?: string,
): Promise<number> {
  const base = { source: 'telegram' as const, externalId: { not: null } }

  if (type === 'all') return prisma.client.count({ where: base })

  if (type === 'tag') {
    return prisma.client.count({ where: { ...base, tags: { some: { name: target } } } })
  }

  const segId = parseInt(target.split(':')[0], 10)
  if (tagFilter) {
    return prisma.client.count({
      where: { ...base, segmentId: segId, tags: { some: { name: tagFilter } } },
    })
  }
  return prisma.client.count({ where: { ...base, segmentId: segId } })
}

async function getRecipients(
  type: 'all' | 'tag' | 'segment',
  target: string,
  tagFilter?: string,
): Promise<{ externalId: string | null }[]> {
  const base = { source: 'telegram' as const, externalId: { not: null } }

  if (type === 'all') {
    return prisma.client.findMany({ where: base, select: { externalId: true } })
  }

  if (type === 'tag') {
    return prisma.client.findMany({
      where: { ...base, tags: { some: { name: target } } },
      select: { externalId: true },
    })
  }

  const segId = parseInt(target.split(':')[0], 10)
  if (tagFilter) {
    return prisma.client.findMany({
      where: { ...base, segmentId: segId, tags: { some: { name: tagFilter } } },
      select: { externalId: true },
    })
  }
  return prisma.client.findMany({ where: { ...base, segmentId: segId }, select: { externalId: true } })
}

// ─── Главное меню рассылок ────────────────────────────────────────────────────

export async function showBroadcastMenu(ctx: Context): Promise<void> {
  const totalTg = await prisma.client.count({
    where: { source: 'telegram', externalId: { not: null } },
  })

  await ctx.reply(
    `📢 Рассылки\n\nTelegram-клиентов: ${totalTg}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('📢 Всем клиентам', 'bcast:all')],
      [Markup.button.callback('🏷️ По тегу', 'bcast:tags')],
      [Markup.button.callback('📂 По сегменту', 'bcast:segs')],
      [Markup.button.callback('📊 История рассылок', 'bcast:history')],
      [Markup.button.callback('🔙 Назад', 'back:main')],
    ]),
  )
}

// ─── Вспомогательные экраны ───────────────────────────────────────────────────

async function showTagsList(ctx: Context): Promise<void> {
  const tags = await prisma.tag.groupBy({
    by: ['name'],
    _count: { clientId: true },
    orderBy: { name: 'asc' },
  })

  if (tags.length === 0) {
    await ctx.reply(
      '🏷️ Теги не найдены.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'bcast:menu')]]),
    )
    return
  }

  const buttons = tags.map((t) =>
    Markup.button.callback(
      `${t.name} (${t._count.clientId})`,
      `bcast:tag:${t.name.slice(0, 50)}`,
    ),
  )
  const rows: ReturnType<typeof Markup.button.callback>[][] = []
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2))
  rows.push([Markup.button.callback('🔙 Назад', 'bcast:menu')])

  await ctx.reply('🏷️ Выберите тег для рассылки:', Markup.inlineKeyboard(rows))
}

async function showSegmentsList(ctx: Context): Promise<void> {
  const segments = await prisma.segment.findMany({
    orderBy: { id: 'asc' },
    include: { _count: { select: { clients: true } } },
  })

  if (segments.length === 0) {
    await ctx.reply(
      '📂 Сегменты не найдены.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'bcast:menu')]]),
    )
    return
  }

  const rows = segments.map((s) => [
    Markup.button.callback(
      `${s.color} ${s.name} (${s._count.clients})`,
      `bcast:seg:${s.id}`,
    ),
  ])
  rows.push([Markup.button.callback('🔙 Назад', 'bcast:menu')])

  await ctx.reply('📂 Выберите сегмент для рассылки:', Markup.inlineKeyboard(rows))
}

async function showTagsForSegment(ctx: Context, segId: number): Promise<void> {
  const tags = await prisma.tag.groupBy({
    by: ['name'],
    where: { client: { segmentId: segId } },
    _count: { clientId: true },
    orderBy: { name: 'asc' },
  })

  if (tags.length === 0) {
    await ctx.reply(
      'У клиентов этого сегмента нет тегов.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', `bcast:seg:${segId}`)]]),
    )
    return
  }

  const buttons = tags.map((t) =>
    Markup.button.callback(
      `${t.name} (${t._count.clientId})`,
      `bcast:seg_tag_pick:${segId}:${t.name.slice(0, 38)}`,
    ),
  )
  const rows: ReturnType<typeof Markup.button.callback>[][] = []
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2))
  rows.push([Markup.button.callback('🔙 Назад', `bcast:seg:${segId}`)])

  await ctx.reply('🏷️ Выберите тег для уточнения аудитории:', Markup.inlineKeyboard(rows))
}

async function showHistory(ctx: Context): Promise<void> {
  const logs = await prisma.broadcastLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  if (logs.length === 0) {
    await ctx.reply(
      '📊 История рассылок пуста.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'bcast:menu')]]),
    )
    return
  }

  const lines = logs.map((l) => {
    const icon = typeIcon(l.type)
    const date = fmtDate(l.createdAt)
    const preview = l.messageText
      ? `"${l.messageText.slice(0, 30)}${l.messageText.length > 30 ? '…' : ''}"`
      : '[медиа]'
    const stat = `✅ ${l.totalSent}/${l.totalSent + l.totalFailed}`
    return `${icon} ${l.target} — ${preview} — ${date} — ${stat}`
  })

  await ctx.reply(
    `📊 История рассылок (последние ${logs.length}):\n\n${lines.join('\n')}`,
    Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад', 'bcast:menu')]]),
  )
}

// ─── Предпросмотр ─────────────────────────────────────────────────────────────

async function showPreview(
  ctx: Context,
  state: Extract<BroadcastFlowState, { flow: 'preview' }>,
): Promise<void> {
  const count = await countRecipients(state.type, state.target, state.tagFilter)
  const audience = audienceLabel(state.type, state.target, count, state.tagFilter)

  const previewButtons = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Отправить', 'bcast:send'),
      Markup.button.callback('✏️ Изменить', 'bcast:edit'),
    ],
    [Markup.button.callback('❌ Отмена', 'bcast:cancel')],
  ])

  if (state.mediaType === 'photo' && state.mediaFileId) {
    await ctx.reply(`📋 Предпросмотр — ${audience}:`)
    await ctx.replyWithPhoto(state.mediaFileId, {
      caption: state.caption,
      reply_markup: previewButtons.reply_markup,
    })
  } else if (state.mediaType === 'video' && state.mediaFileId) {
    await ctx.reply(`📋 Предпросмотр — ${audience}:`)
    await ctx.replyWithVideo(state.mediaFileId, {
      caption: state.caption,
      reply_markup: previewButtons.reply_markup,
    })
  } else {
    await ctx.reply(`📋 Предпросмотр — ${audience}:\n\n${state.messageText}`, previewButtons)
  }
}

// ─── Выполнение рассылки ───────────────────────────────────────────────────────

async function executeBroadcast(
  ctx: Context,
  userId: number,
  state: Extract<BroadcastFlowState, { flow: 'preview' }>,
): Promise<void> {
  const recipients = await getRecipients(state.type, state.target, state.tagFilter)
  const total = recipients.length

  if (total === 0) {
    await ctx.reply(
      'Нет Telegram-клиентов для рассылки.',
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Меню', 'bcast:menu')]]),
    )
    return
  }

  const progressMsg = await ctx.reply(`Отправлено 0/${total}…`)
  const chatId = ctx.chat!.id
  const progressMsgId = progressMsg.message_id

  let sent = 0
  let failed = 0

  for (let i = 0; i < recipients.length; i++) {
    const tgId = recipients[i].externalId!
    try {
      if (state.mediaType === 'photo' && state.mediaFileId) {
        await ctx.telegram.sendPhoto(tgId, state.mediaFileId, { caption: state.caption })
      } else if (state.mediaType === 'video' && state.mediaFileId) {
        await ctx.telegram.sendVideo(tgId, state.mediaFileId, { caption: state.caption })
      } else {
        await ctx.telegram.sendMessage(tgId, state.messageText!)
      }
      sent++
    } catch {
      failed++
    }

    // Обновляем прогресс каждые 10 сообщений
    if ((i + 1) % 10 === 0 || i === recipients.length - 1) {
      try {
        await ctx.telegram.editMessageText(
          chatId,
          progressMsgId,
          undefined,
          `Отправлено ${sent + failed}/${total}…`,
        )
      } catch {
        // ignore edit errors
      }
    }

    // Задержка против flood-лимитов Telegram
    await new Promise((r) => setTimeout(r, 50))
  }

  // Сохраняем лог
  await prisma.broadcastLog.create({
    data: {
      type: state.type,
      target: logTarget(state.type, state.target, state.tagFilter),
      messageText: state.messageText,
      mediaFileId: state.mediaFileId,
      mediaType: state.mediaType,
      totalSent: sent,
      totalFailed: failed,
      createdBy: String(userId),
    },
  })

  await ctx.reply(
    `✅ Рассылка завершена\n\nДоставлено: ${sent}\n❌ Ошибок: ${failed}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 История', 'bcast:history'),
        Markup.button.callback('🔙 Меню', 'bcast:menu'),
      ],
    ]),
  )
}

// ─── Регистрация обработчиков ─────────────────────────────────────────────────

export function setupBroadcastHandlers(bot: Telegraf): void {
  // Главное меню рассылок
  bot.action('bcast:menu', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    await showBroadcastMenu(ctx)
  })

  // ── Всем клиентам ──────────────────────────────────────────────────────────

  bot.action('bcast:all', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const count = await prisma.client.count({
      where: { source: 'telegram', externalId: { not: null } },
    })
    broadcastsState.set(userId, { flow: 'awaiting_text', type: 'all', target: 'all' })
    await ctx.reply(
      `📢 Рассылка всем клиентам (${count} чел.)\n\nОтправьте текст, фото или видео:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'bcast:cancel')]]),
    )
  })

  // ── По тегу ────────────────────────────────────────────────────────────────

  bot.action('bcast:tags', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    await showTagsList(ctx)
  })

  bot.action(/^bcast:tag:(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const tagName = ctx.match[1]
    const count = await prisma.client.count({
      where: { source: 'telegram', externalId: { not: null }, tags: { some: { name: tagName } } },
    })
    await ctx.reply(
      `Клиентов с тегом «${tagName}»: ${count}\n\nОтправить рассылку этой группе?`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Продолжить', `bcast:tag_go:${tagName}`),
          Markup.button.callback('🔙 Назад', 'bcast:tags'),
        ],
      ]),
    )
  })

  bot.action(/^bcast:tag_go:(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const tagName = ctx.match[1]
    const count = await prisma.client.count({
      where: { source: 'telegram', externalId: { not: null }, tags: { some: { name: tagName } } },
    })
    broadcastsState.set(userId, { flow: 'awaiting_text', type: 'tag', target: tagName })
    await ctx.reply(
      `🏷️ Рассылка по тегу «${tagName}» (${count} чел.)\n\nОтправьте текст, фото или видео:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'bcast:cancel')]]),
    )
  })

  // ── По сегменту ───────────────────────────────────────────────────────────

  bot.action('bcast:segs', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    await showSegmentsList(ctx)
  })

  bot.action(/^bcast:seg:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const segId = parseInt(ctx.match[1], 10)
    const seg = await prisma.segment.findUnique({ where: { id: segId } })
    if (!seg) return await ctx.reply('Сегмент не найден.')

    const count = await prisma.client.count({
      where: { source: 'telegram', externalId: { not: null }, segmentId: segId },
    })
    await ctx.reply(
      `Сегмент «${seg.color} ${seg.name}» — ${count} Telegram-клиентов.\n\nУточнить по тегу?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🏷️ Добавить фильтр по тегу', `bcast:seg_tag:${segId}`)],
        [Markup.button.callback('📤 Отправить всем в сегменте', `bcast:seg_go:${segId}`)],
        [Markup.button.callback('🔙 Назад', 'bcast:segs')],
      ]),
    )
  })

  bot.action(/^bcast:seg_go:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const segId = parseInt(ctx.match[1], 10)
    const seg = await prisma.segment.findUnique({ where: { id: segId } })
    if (!seg) return await ctx.reply('Сегмент не найден.')

    const count = await prisma.client.count({
      where: { source: 'telegram', externalId: { not: null }, segmentId: segId },
    })
    broadcastsState.set(userId, {
      flow: 'awaiting_text',
      type: 'segment',
      target: `${segId}:${seg.name}`,
    })
    await ctx.reply(
      `📂 Рассылка по сегменту «${seg.color} ${seg.name}» (${count} чел.)\n\nОтправьте текст, фото или видео:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'bcast:cancel')]]),
    )
  })

  // Выбор тега для фильтрации сегмента
  bot.action(/^bcast:seg_tag:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const segId = parseInt(ctx.match[1], 10)
    await showTagsForSegment(ctx, segId)
  })

  bot.action(/^bcast:seg_tag_pick:(\d+):(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const segId = parseInt(ctx.match[1], 10)
    const tagName = ctx.match[2]
    const seg = await prisma.segment.findUnique({ where: { id: segId } })
    if (!seg) return await ctx.reply('Сегмент не найден.')

    const count = await prisma.client.count({
      where: {
        source: 'telegram',
        externalId: { not: null },
        segmentId: segId,
        tags: { some: { name: tagName } },
      },
    })
    broadcastsState.set(userId, {
      flow: 'awaiting_text',
      type: 'segment',
      target: `${segId}:${seg.name}`,
      tagFilter: tagName,
    })
    await ctx.reply(
      `📂 ${seg.color} ${seg.name} + 🏷️ «${tagName}»: ${count} Telegram-клиентов.\n\nОтправьте текст, фото или видео:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'bcast:cancel')]]),
    )
  })

  // ── История ────────────────────────────────────────────────────────────────

  bot.action('bcast:history', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    await showHistory(ctx)
  })

  // ── Отмена ─────────────────────────────────────────────────────────────────

  bot.action('bcast:cancel', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    broadcastsState.delete(ctx.from!.id)
    await ctx.reply('Рассылка отменена.')
    await showBroadcastMenu(ctx)
  })

  // ── Предпросмотр: отправить ────────────────────────────────────────────────

  bot.action('bcast:send', async (ctx) => {
    try { await ctx.answerCbQuery('Начинаю отправку…') } catch {}
    const userId = ctx.from!.id
    const state = broadcastsState.get(userId)
    if (!state || state.flow !== 'preview') {
      return await ctx.reply('Сессия истекла. Начните рассылку заново.')
    }
    broadcastsState.delete(userId)
    await executeBroadcast(ctx, userId, state)
  })

  // ── Предпросмотр: изменить ─────────────────────────────────────────────────

  bot.action('bcast:edit', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = broadcastsState.get(userId)
    if (!state || state.flow !== 'preview') return

    broadcastsState.set(userId, {
      flow: 'awaiting_text',
      type: state.type,
      target: state.target,
      tagFilter: state.tagFilter,
    })
    await ctx.reply(
      'Отправьте новый текст, фото или видео:',
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'bcast:cancel')]]),
    )
  })
}

// ─── Обработчики входящих сообщений ──────────────────────────────────────────

export async function handleBroadcastMessage(
  ctx: Context,
  userId: number,
  text: string,
): Promise<boolean> {
  const state = broadcastsState.get(userId)
  if (!state || state.flow !== 'awaiting_text') return false

  const previewState: Extract<BroadcastFlowState, { flow: 'preview' }> = {
    flow: 'preview',
    type: state.type,
    target: state.target,
    tagFilter: state.tagFilter,
    messageText: text,
  }
  broadcastsState.set(userId, previewState)
  await showPreview(ctx, previewState)
  return true
}

export async function handleBroadcastPhoto(ctx: Context, userId: number): Promise<boolean> {
  const state = broadcastsState.get(userId)
  if (!state || state.flow !== 'awaiting_text') return false

  const msg = ctx.message as { photo?: Array<{ file_id: string }>; caption?: string }
  if (!msg?.photo?.length) return false

  const fileId = msg.photo[msg.photo.length - 1].file_id
  const previewState: Extract<BroadcastFlowState, { flow: 'preview' }> = {
    flow: 'preview',
    type: state.type,
    target: state.target,
    tagFilter: state.tagFilter,
    mediaFileId: fileId,
    mediaType: 'photo',
    caption: msg.caption,
  }
  broadcastsState.set(userId, previewState)
  await showPreview(ctx, previewState)
  return true
}

export async function handleBroadcastVideo(ctx: Context, userId: number): Promise<boolean> {
  const state = broadcastsState.get(userId)
  if (!state || state.flow !== 'awaiting_text') return false

  const msg = ctx.message as { video?: { file_id: string }; caption?: string }
  if (!msg?.video) return false

  const previewState: Extract<BroadcastFlowState, { flow: 'preview' }> = {
    flow: 'preview',
    type: state.type,
    target: state.target,
    tagFilter: state.tagFilter,
    mediaFileId: msg.video.file_id,
    mediaType: 'video',
    caption: msg.caption,
  }
  broadcastsState.set(userId, previewState)
  await showPreview(ctx, previewState)
  return true
}
