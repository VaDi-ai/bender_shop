/**
 * webhooks/telegram.ts
 *
 * Двусторонний мост «клиент ↔ CRM-группа»:
 *   • Входящее от клиента  → найти/создать Client + топик форума → уведомить CRM
 *   • Ответ менеджера в топике → переслать клиенту в личку
 *
 * Требования к боту:
 *   — бот должен быть администратором CRM-группы (для создания топиков и чтения сообщений)
 *   — у бота должен быть выключен «privacy mode» (BotFather → /setprivacy → Disable)
 */

import { Telegraf, Telegram } from 'telegraf'
import { prisma } from '../lib/prisma'

const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID)
const ADMIN_IDS = (process.env.ADMIN_IDS ?? '').split(',').map((id) => Number(id.trim()))

// ─── Вспомогательные типы ─────────────────────────────────────────────────────

type TgUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
}

// ─── Экспортируемая функция подключения ───────────────────────────────────────

/**
 * Регистрирует обработчики сообщений от клиентов и ответов менеджеров.
 * ВАЖНО: вызывать ДО admin-middleware в bot/index.ts.
 */
export function setupClientHandlers(bot: Telegraf): void {
  bot.on('message', async (ctx, next) => {
    console.log('Incoming message from:', ctx.from?.id, ctx.message)

    const { chat, from } = ctx
    // Приводим message к Record для безопасного доступа к полям (двойной cast через unknown)
    const rawMsg = ctx.message as unknown as Record<string, unknown>

    if (!from) return next()

    // ── Сообщения из CRM-группы: ответ менеджера → клиент ──────────────────
    if (chat.id === CRM_GROUP_ID) {
      if (ADMIN_IDS.includes(from.id)) {
        const threadId = rawMsg['message_thread_id'] as number | undefined
        const text = rawMsg['text'] as string | undefined
        if (threadId != null && text) {
          try {
            await handleManagerReply(ctx.telegram, threadId, text)
          } catch (err) {
            console.error('handleManagerReply error:', err)
          }
        }
      }
      return // Не пропускать в admin-middleware
    }

    // ── Только личные чаты ───────────────────────────────────────────────────
    if (chat.type !== 'private') return next()

    // Администраторы → передаём дальше (в admin-middleware и команды)
    if (ADMIN_IDS.includes(from.id)) return next()

    // ── Клиентское сообщение ─────────────────────────────────────────────────
    console.log('Processing client message from:', from.id)
    const text = rawMsg['text'] as string | undefined
    if (text) {
      try {
        await handleClientMessage(ctx.telegram, from, text)
      } catch (err) {
        console.error('handleClientMessage error:', err)
      }
    }
    // Нетекстовые сообщения от клиентов — молча проглатываем,
    // чтобы они не доходили до admin-middleware («⛔ Доступ запрещён»)
  })
}

// ─── Обработка входящего сообщения от клиента ────────────────────────────────

async function handleClientMessage(
  telegram: Telegram,
  from: TgUser,
  text: string,
): Promise<void> {
  console.log('handleClientMessage called for:', from.id)
  try {
  const externalId = String(from.id)
  const name = getClientName(from)

  // Найти или создать клиента
  let client = await prisma.client.findUnique({
    where: { source_externalId: { source: 'telegram', externalId } },
  })

  if (!client) {
    client = await prisma.client.create({
      data: { name, source: 'telegram', externalId, segment: 'lead' },
    })
  }

  // Создать топик форума, если его ещё нет
  if (client.telegramTopicId == null) {
    const topic = await telegram.createForumTopic(CRM_GROUP_ID, name)

    client = await prisma.client.update({
      where: { id: client.id },
      data: { telegramTopicId: topic.message_thread_id },
    })

    await sendToTopic(
      telegram,
      CRM_GROUP_ID,
      topic.message_thread_id,
      `👤 Новый клиент: ${name}\n📌 Источник: Telegram\n💬 Сообщение: ${text}`,
    )
  } else {
    // Пересылаем в существующий топик
    await sendToTopic(
      telegram,
      CRM_GROUP_ID,
      client.telegramTopicId,
      `💬 ${name}: ${text}`,
    )
  }

  // Сохраняем сообщение в БД
  await prisma.message.create({
    data: {
      clientId: client.id,
      direction: 'in',
      text,
      source: 'telegram',
    },
  })
  } catch (e) {
    console.error('handleClientMessage FULL ERROR:', e)
  }
}

// ─── Обработка ответа менеджера в топике ────────────────────────────────────

async function handleManagerReply(
  telegram: Telegram,
  threadId: number,
  text: string,
): Promise<void> {
  const client = await prisma.client.findFirst({
    where: { telegramTopicId: threadId },
  })
  if (!client) return

  // Пересылаем в личку только клиентам из Telegram (у них есть externalId = их TG chat_id)
  if (client.source === 'telegram' && client.externalId) {
    await telegram.sendMessage(client.externalId, text)
  }

  // Сохраняем исходящее сообщение
  await prisma.message.create({
    data: {
      clientId: client.id,
      direction: 'out',
      text,
      source: 'telegram',
    },
  })
}

// ─── Хелпер: отправить сообщение в топик форума ──────────────────────────────

async function sendToTopic(
  telegram: Telegram,
  chatId: number,
  threadId: number,
  text: string,
): Promise<void> {
  // message_thread_id — стандартный параметр Telegram Bot API для форум-топиков
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (telegram.sendMessage as any)(chatId, text, { message_thread_id: threadId })
}

// ─── Утилита ─────────────────────────────────────────────────────────────────

function getClientName(from: TgUser): string {
  return (
    [from.first_name, from.last_name].filter(Boolean).join(' ') ||
    from.username ||
    'Неизвестный'
  )
}
