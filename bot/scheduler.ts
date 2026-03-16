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

import { Telegraf } from 'telegraf'
import { prisma } from '../lib/prisma'

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

    // TODO: каналы avito / instagram — реализовать при подключении webhooks.
    // Паттерн: аналогично telegram — отправить через соответствующий API
    // (Avito Messenger API / Instagram Graph API).
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
