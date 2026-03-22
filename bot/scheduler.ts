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

import { Telegraf, Telegram } from 'telegraf'
import { prisma } from '../lib/prisma'
import { isAvitoConfigured, getAvitoChats, getAvitoUserId, sendAvitoMessage } from '../lib/avito'

const INTERVAL_MS = 10 * 60 * 1000 // 10 минут

export let isRunning = false

type RemindPayload = {
  text?: string
  [key: string]: unknown
}

// ─── Запуск планировщика ──────────────────────────────────────────────────────

export function startScheduler(bot: Telegraf): void {
  console.log('Планировщик запущен (интервал: 10 мин)')
  setInterval(() => { runTick(bot).catch(err => console.error('[Scheduler]', err)) }, INTERVAL_MS)
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

    console.log(`[Scheduler] Обрабатываем ${tasks.length} задач(и)`)

    for (const task of tasks) {
      try {
        await executeTask(bot, task)
        await prisma.task.update({ where: { id: task.id }, data: { status: 'done' } })
      } catch (err) {
        console.error(`[Scheduler] Задача #${task.id} завершилась с ошибкой:`, err)
        const newAttemptCount = task.attemptCount + 1
        const MAX_ATTEMPTS = 5
        if (newAttemptCount >= MAX_ATTEMPTS) {
          console.error(`[Scheduler] Задача #${task.id} превысила лимит попыток (${MAX_ATTEMPTS}), помечаем как failed`)
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
    // Polling Avito Messenger
    await pollAvitoMessages(bot.telegram).catch(err => console.error('[Scheduler] Avito poll error:', err))

    // Деактивация устаревших цен поставщиков (старше 24ч)
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const { count } = await prisma.supplierPrice.updateMany({
        where: { isActive: true, parsedAt: { lt: cutoff } },
        data: { isActive: false },
      })
      if (count > 0) console.log(`[Scheduler] Deactivated ${count} stale supplier prices`)
    } catch (err) {
      console.error('[Scheduler] Supplier price cleanup error:', err)
    }
  } catch (err) {
    console.error('[Scheduler] Ошибка получения задач:', err)
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
    console.warn(`[Scheduler] Задача #${task.id}: payload.text не задан, пропускаем`)
    return
  }

  if (action === 'remind_client' || action === 'promo_notify') {
    if (client.source === 'telegram' && client.externalId) {
      await bot.telegram.sendMessage(client.externalId, text)
      console.log(
        `[Scheduler] Задача #${task.id}: сообщение отправлено клиенту #${client.id} (TG)`,
      )
      return
    }

    if (client.source === 'avito' && client.externalId) {
      // externalId = "buyerId:chatId"
      const chatId = client.externalId.split(':')[1]
      if (chatId) {
        await sendAvitoMessage(chatId, text)
        console.log(`[Scheduler] Задача #${task.id}: сообщение отправлено клиенту #${client.id} (Avito)`)
        return
      }
    }

    console.warn(
      `[Scheduler] Задача #${task.id}: канал ${client.source} не поддерживается, пропускаем`,
    )
    return
  }

  if (action === 'ai_suggestion') {
    // AI suggestions are serialized/restored separately, skip
    return
  }
  console.warn(`[Scheduler] Задача #${task.id}: неизвестный action="${action}"`)
}

// ─── Avito Messenger Polling ──────────────────────────────────────────────────

const lastProcessedMsg = new Map<string, string>()

async function pollAvitoMessages(telegram: Telegram): Promise<void> {
  if (!isAvitoConfigured()) return

  const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID)
  if (!CRM_GROUP_ID) return

  const userId = await getAvitoUserId()
  const chats = await getAvitoChats()

  for (const chat of chats) {
    const lastMsg = chat.last_message
    if (!lastMsg || lastMsg.direction === 'out') continue
    if (lastProcessedMsg.get(chat.id) === lastMsg.id) continue

    lastProcessedMsg.set(chat.id, lastMsg.id)

    const buyer = chat.users?.find(u => u.id !== userId)
    if (!buyer) continue

    const name = buyer.name || 'Avito покупатель'
    const text = lastMsg.text || '(без текста)'
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
        // Upgrade externalId to include chatId
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

    // Create CRM topic if needed
    if (!client.telegramTopicId) {
      try {
        const topic = await telegram.createForumTopic(CRM_GROUP_ID, `[Avito] ${name}`)
        client = await prisma.client.update({
          where: { id: client.id },
          data: { telegramTopicId: topic.message_thread_id },
        })
        await (telegram.sendMessage as any)(CRM_GROUP_ID,
          `👤 Новый клиент с Avito: ${name}\n💬 ${text}`,
          { message_thread_id: topic.message_thread_id },
        )
      } catch (err) {
        console.error(`[Avito] Failed to create topic for ${name}:`, err)
        continue
      }
    } else {
      try {
        await (telegram.sendMessage as any)(CRM_GROUP_ID,
          `💬 [Avito] ${name}: ${text}`,
          { message_thread_id: client.telegramTopicId },
        )
      } catch (err) {
        console.error(`[Avito] Failed to forward message:`, err)
      }
    }

    // Save message
    await prisma.message.create({
      data: { clientId: client.id, direction: 'in', text, source: 'avito' },
    })

    console.log(`[Avito] New message from ${name}: ${text.slice(0, 50)}`)
  }
}
