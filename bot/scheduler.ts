/**
 * bot/scheduler.ts
 *
 * Планировщик задач: запускается каждые 10 минут, находит Tasks с
 *   scheduledAt <= now() и status = 'pending', выполняет действие,
 *   помечает Task как 'done'.
 *
 * Поддерживаемые action-типы:
 *   • remind_client — отправить текст из payload.text клиенту через его канал
 *   • promo_notify  — то же, используется для клиентов «ждёт скидку»;
 *                     модуль акций обновляет scheduledAt при старте акции
 */

import { Telegraf, Telegram, Markup } from 'telegraf'
import { Sentry } from '../lib/sentry'
import log from '../lib/logger'
import { prisma } from '../lib/prisma'
import { isAvitoConfigured, getAvitoChats, getAvitoUserId, sendAvitoMessage, type AvitoChat } from '../lib/avito'
import { getAIMode, generateAIResponse, storeSuggestion, incrementStat } from './ai/agent'
import { moderateAIOutput } from '../webhooks/telegram'

const INTERVAL_MS = 10 * 60 * 1000 // 10 минут

export let isRunning = false

type RemindPayload = {
  text?: string
  [key: string]: unknown
}

// ─── Запуск планировщика ──────────────────────────────────────────────────────

export function startScheduler(bot: Telegraf): void {
  log.info('Scheduler started', { intervalMs: INTERVAL_MS })
  setInterval(() => { runTick(bot).catch(err => log.error('Scheduler tick error', { error: err instanceof Error ? err.message : String(err) })) }, INTERVAL_MS).unref()

  // Avito polling: отдельный таймер, каждые 2 минуты
  setTimeout(() => pollAvitoMessages(bot.telegram).catch(e => log.error('Avito poll error', { error: e instanceof Error ? e.message : String(e) })), 30_000)
  setInterval(() => { pollAvitoMessages(bot.telegram).catch(e => log.error('Avito poll error', { error: e instanceof Error ? e.message : String(e) })) }, 2 * 60 * 1000).unref()
}

// ─── Один «тик» — проверяем и выполняем задачи ───────────────────────────────

async function runTick(bot: Telegraf): Promise<void> {
  if (isRunning) return
  isRunning = true
  try {
    const now = new Date()

    const tasks = await prisma.task.findMany({
      where: {
        status: 'pending',
        scheduledAt: { lte: now },
      },
      include: { client: true },
    })

    if (tasks.length === 0) return

    log.info('Scheduler processing tasks', { count: tasks.length })

    for (const task of tasks) {
      try {
        await executeTask(bot, task)
        await prisma.task.update({ where: { id: task.id }, data: { status: 'done' } })
      } catch (err) {
        log.error('Scheduler task failed', { taskId: task.id, error: err instanceof Error ? err.message : String(err) })
        const newAttemptCount = task.attemptCount + 1
        const MAX_ATTEMPTS = 5
        if (newAttemptCount >= MAX_ATTEMPTS) {
          log.error('Scheduler task max attempts exceeded', { taskId: task.id, maxAttempts: MAX_ATTEMPTS })
          await prisma.task.update({
            where: { id: task.id },
            data: { status: 'failed', attemptCount: newAttemptCount },
          })
        } else {
          await prisma.task.update({
            where: { id: task.id },
            data: { attemptCount: newAttemptCount },
          })
        }
      }
    }
    // Деактивация устаревших цен поставщиков (старше 24ч)
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const { count } = await prisma.supplierPrice.updateMany({
        where: { isActive: true, parsedAt: { lt: cutoff } },
        data: { isActive: false },
      })
      if (count > 0) log.info('Deactivated stale supplier prices', { count })
    } catch (err) {
      log.error('Supplier price cleanup error', { error: err instanceof Error ? err.message : String(err) })
    }

    // Avito stats API — ежедневно в 14:00 МСК
    try {
      const mskNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
      if (mskNow.getHours() === 14 && mskNow.getMinutes() < 11) {
        const { isAvitoConfigured, getAvitoItemStats } = await import('../lib/avito')
        if (isAvitoConfigured()) {
          const products = await prisma.product.findMany({
            where: { avitoItemId: { not: null } },
            select: { avitoItemId: true, name: true },
          })
          const itemIds = products.filter(p => p.avitoItemId).map(p => String(p.avitoItemId))
          if (itemIds.length > 0) {
            const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
            const stats = await getAvitoItemStats(itemIds, yesterday, yesterday)
            let saved = 0
            for (const s of stats) {
              await prisma.avitoItemStat.upsert({
                where: { avitoItemId_date: { avitoItemId: s.itemId, date: new Date(s.date) } },
                create: {
                  avitoItemId: s.itemId,
                  date: new Date(s.date),
                  uniqViews: s.uniqViews,
                  uniqContacts: s.uniqContacts,
                  uniqFavorites: s.uniqFavorites,
                  title: products.find(p => String(p.avitoItemId) === s.itemId)?.name ?? null,
                },
                update: { uniqViews: s.uniqViews, uniqContacts: s.uniqContacts, uniqFavorites: s.uniqFavorites },
              }).catch(() => {})
              saved++
            }
            log.info('Avito stats collected', { items: itemIds.length, saved })
          }
        }
      }
    } catch (err) {
      log.error('Avito stats collection failed', { error: err instanceof Error ? err.message : String(err) })
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { operation: 'scheduler-tick' } })
    log.error('Scheduler fetch tasks error', { error: err instanceof Error ? err.message : String(err) })
  } finally {
    isRunning = false
  }
}

// ─── Выполнение одной задачи ──────────────────────────────────────────────────

async function executeTask(
  bot: Telegraf,
  task: Awaited<ReturnType<typeof prisma.task.findMany>>[number] & {
    client: Awaited<ReturnType<typeof prisma.client.findUnique>>
  },
): Promise<void> {
  const { action, payload, client } = task
  if (!client) return

  const data = payload as RemindPayload
  const text = data.text

  if (!text) {
    log.warn('Scheduler task missing payload.text', { taskId: task.id })
    return
  }

  if (action === 'remind_client' || action === 'promo_notify') {
    if (client.source === 'telegram' && client.externalId) {
      await bot.telegram.sendMessage(client.externalId, text)
      log.info('Scheduler task sent', { taskId: task.id, clientId: client.id, channel: 'telegram' })
      return
    }

    if (client.source === 'avito' && client.externalId) {
      // externalId = "buyerId:chatId"
      const chatId = client.externalId.split(':')[1]
      if (chatId) {
        await sendAvitoMessage(chatId, text)
        log.info('Scheduler task sent', { taskId: task.id, clientId: client.id, channel: 'avito' })
        return
      }
    }

    log.warn('Scheduler task unsupported channel', { taskId: task.id, source: client.source })
    return
  }

  if (action === 'ai_suggestion') {
    // AI suggestions are serialized/restored separately, skip
    return
  }
  log.warn('Scheduler task unknown action', { taskId: task.id, action })
}

// ─── Avito Messenger Polling ──────────────────────────────────────────────────

const lastProcessedMsg = new Map<string, string>()
let initialPollDone = false
let isPollingAvito = false

function extractMessageText(msg: { text?: string; content?: { text?: string }; body?: string }): string {
  return msg.text || msg.content?.text || msg.body || ''
}

function buildItemInfo(chat: AvitoChat): { title: string; url: string } {
  const item = chat.context?.value
  const title = item?.title || ''
  const url = item?.id ? `https://www.avito.ru/${item.id}` : ''
  return { title, url }
}

async function pollAvitoMessages(telegram: Telegram): Promise<void> {
  if (isPollingAvito) return
  isPollingAvito = true
  try {
  log.debug('Avito poll check', { clientIdSet: !!process.env.AVITO_CLIENT_ID })
  if (!isAvitoConfigured()) { log.debug('Avito not configured, skipping'); return }

  log.debug('Avito polling started')
  const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID)
  if (!CRM_GROUP_ID) return

  const userId = await getAvitoUserId()
  const chats = await getAvitoChats()

  // First poll after restart: cache all current messages, don't process
  if (!initialPollDone) {
    for (const chat of chats) {
      if (chat.last_message) {
        lastProcessedMsg.set(chat.id, chat.last_message.id)
      }
    }
    initialPollDone = true
    log.info('Avito initial poll cached', { chatCount: chats.length })
    return
  }

  for (const chat of chats) {
    const lastMsg = chat.last_message
    if (!lastMsg || lastMsg.direction === 'out') continue
    if (lastMsg.type && lastMsg.type !== 'text') continue  // only text messages
    if (lastProcessedMsg.get(chat.id) === lastMsg.id) continue

    lastProcessedMsg.set(chat.id, lastMsg.id)

    log.debug('Avito chat message', { chatId: chat.id, keys: Object.keys(chat).join(',') })

    const buyer = chat.users?.find(u => u.id !== userId)
    if (!buyer) continue

    const name = buyer.name || 'Avito покупатель'
    const text = extractMessageText(lastMsg) || '(без текста)'
    const { title: itemTitle, url: itemUrl } = buildItemInfo(chat)
    // externalId = "buyerId:chatId"
    const externalId = `${buyer.id}:${chat.id}`

    // Find or create client
    let client = await prisma.client.findFirst({
      where: { source: 'avito', externalId },
    })

    if (!client) {
      // Also try matching by just buyerId (old format without chatId)
      client = await prisma.client.findFirst({
        where: { source: 'avito', externalId: String(buyer.id) },
      })
      if (client) {
        client = await prisma.client.update({
          where: { id: client.id },
          data: { externalId },
        })
      }
    }

    if (!client) {
      const defaultSeg = await prisma.segment.findFirst({ where: { isDefault: true } })
      client = await prisma.client.create({
        data: { name, source: 'avito', externalId, segmentId: defaultSeg?.id ?? null },
      })
    }

    // Build CRM message with item info
    const itemLine = itemTitle ? `\n📦 ${itemTitle}` : ''
    const urlLine = itemUrl ? `\n🔗 ${itemUrl}` : ''

    // Create CRM topic if needed
    if (!client.telegramTopicId) {
      try {
        const topic = await telegram.createForumTopic(CRM_GROUP_ID, `[Avito] ${name}`)
        client = await prisma.client.update({
          where: { id: client.id },
          data: { telegramTopicId: topic.message_thread_id },
        })
        await telegram.sendMessage(CRM_GROUP_ID,
          `👤 Новый клиент с Avito: ${name}${itemLine}${urlLine}\n💬 ${text}`,
          { message_thread_id: topic.message_thread_id },
        )
      } catch (err) {
        log.error('Avito topic creation failed', { error: err instanceof Error ? err.message : String(err) })
        continue
      }
    } else {
      try {
        await telegram.sendMessage(CRM_GROUP_ID,
          `💬 [Avito] ${name}:${itemLine}\n${text}`,
          { message_thread_id: client.telegramTopicId },
        )
      } catch (err: any) {
        // Topic deleted — recreate
        if (err?.message?.includes('thread not found') || err?.message?.includes('message thread not found')) {
          try {
            const topic = await telegram.createForumTopic(CRM_GROUP_ID, `[Avito] ${name}`)
            client = await prisma.client.update({
              where: { id: client.id },
              data: { telegramTopicId: topic.message_thread_id },
            })
            await telegram.sendMessage(CRM_GROUP_ID,
              `👤 Топик пересоздан\n💬 [Avito] ${name}:${itemLine}\n${text}`,
              { message_thread_id: topic.message_thread_id },
            )
          } catch (err2) {
            log.error('Avito topic recreation failed', { error: err2 instanceof Error ? err2.message : String(err2) })
          }
        } else {
          log.error('Avito forward message failed', { error: err instanceof Error ? err.message : String(err) })
        }
      }
    }

    // Save message
    await prisma.message.create({
      data: { clientId: client.id, direction: 'in', text, source: 'avito' },
    })

    log.info('Avito new message', { clientId: client.id, textPreview: text.slice(0, 50) })

    // AI agent processing
    if (client.telegramTopicId) {
      try {
        const aiMode = await getAIMode()
        if (aiMode === 'auto' || aiMode === 'semi') {
          const aiText = await generateAIResponse(client.id, text)
          incrementStat('total')
          const safeText = moderateAIOutput(aiText)

          if (aiMode === 'auto') {
            await sendAvitoMessage(chat.id, safeText)
            await prisma.message.create({
              data: { clientId: client.id, direction: 'out', text: safeText, source: 'avito' },
            })
            incrementStat('approved')
            await telegram.sendMessage(CRM_GROUP_ID,
              `🤖 Бендер → [Avito] ${name}:\n${safeText}`,
              { message_thread_id: client.telegramTopicId },
            )
          } else {
            // semi — предложение менеджеру с кнопками
            const suggestionId = storeSuggestion(client.id, safeText, client.telegramTopicId)
            await telegram.sendMessage(CRM_GROUP_ID, `🤖 Предложение AI:\n\n${safeText}`, {
              message_thread_id: client.telegramTopicId,
              reply_markup: Markup.inlineKeyboard([
                [
                  Markup.button.callback('✅ Отправить', `ai:send:${suggestionId}`),
                  Markup.button.callback('✏️ Редактировать', `ai:edit:${suggestionId}`),
                  Markup.button.callback('❌ Пропустить', `ai:skip:${suggestionId}`),
                ],
              ]).reply_markup,
            })
          }
        }
      } catch (err) {
        log.error('Avito AI error', { clientId: client.id, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  log.debug('Avito polling done', { chatCount: chats.length })

  // LRU eviction — keep map from growing unbounded
  if (lastProcessedMsg.size > 1000) {
    const entries = [...lastProcessedMsg.entries()]
    lastProcessedMsg.clear()
    for (const [k, v] of entries.slice(-500)) {
      lastProcessedMsg.set(k, v)
    }
  }
  } finally {
    isPollingAvito = false
  }
}
