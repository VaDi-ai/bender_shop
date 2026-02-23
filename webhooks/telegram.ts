/**
 * webhooks/telegram.ts
 *
 * Двусторонний мост «клиент ↔ CRM-группа»:
 *   • Входящее от клиента  → найти/создать Client + топик форума → уведомить CRM
 *   • Ответ менеджера в топике → переслать клиенту в личку
 *
 * Inline-панель в каждом топике:
 *   • Сегмент — переключает Лид → Квал → Клиент, обновляет кнопку на месте
 *   • Статус  — создаёт Task в БД (напомнить / ждёт скидку / реактивация)
 *   • Заметка — следующее сообщение менеджера сохраняется как notes, не пересылается клиенту
 *   • История — выводит последние 10 сообщений в топик
 *
 * Требования к боту:
 *   — администратор CRM-группы (для создания топиков и чтения сообщений)
 *   — privacy mode выключен (BotFather → /setprivacy → Disable)
 */

import { Telegraf, Telegram, Markup } from 'telegraf'
import { message } from 'telegraf/filters'
import { prisma } from '../lib/prisma'

const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID)
const ADMIN_IDS = (process.env.ADMIN_IDS ?? '').split(',').map((id) => Number(id.trim()))

// ─── Типы ─────────────────────────────────────────────────────────────────────

type TgUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
}

// ─── Состояние: режим заметки ──────────────────────────────────────────────────
// threadId топика → clientId; сбрасывается после сохранения заметки

const noteMode = new Map<number, number>()

// ─── Сегменты ─────────────────────────────────────────────────────────────────

const SEGMENT_NEXT: Record<string, string> = { lead: 'qual', qual: 'client', client: 'lead' }
const SEGMENT_LABEL: Record<string, string> = {
  lead: '🔵 Лид',
  qual: '🟡 Квал',
  client: '🟢 Клиент',
}

// ─── Панель управления (inline-клавиатура) ─────────────────────────────────────

function buildControlPanel(clientId: number, segment: string) {
  const segLabel = SEGMENT_LABEL[segment] ?? segment
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${segLabel} · сменить сегмент`, `seg:${clientId}`)],
    [
      Markup.button.callback('💭 Думает', `st:think:${clientId}`),
      Markup.button.callback('⏳ Ждёт скидку', `st:disc:${clientId}`),
      Markup.button.callback('❌ Отказ', `st:ref:${clientId}`),
    ],
    [
      Markup.button.callback('📝 Заметка', `note:${clientId}`),
      Markup.button.callback('📋 История', `hist:${clientId}`),
    ],
  ])
}

// ─── Экспортируемая функция подключения ───────────────────────────────────────

/**
 * Регистрирует обработчики сообщений от клиентов, ответов менеджеров
 * и всех inline-кнопок панели управления.
 * ВАЖНО: вызывать ДО admin-middleware в bot/index.ts.
 */
export function setupClientHandlers(bot: Telegraf): void {
  // ── Обработчик нажатий inline-кнопок ────────────────────────────────────────

  bot.on('callback_query', async (ctx) => {
    const query = ctx.callbackQuery as unknown as Record<string, unknown>
    const data = query['data'] as string | undefined
    if (!data) return ctx.answerCbQuery()

    // Из какого сообщения пришёл callback — нужно для editMessageReplyMarkup
    const msg = query['message'] as Record<string, unknown> | undefined
    const chatId = (msg?.['chat'] as Record<string, unknown>)?.['id'] as number | undefined
    const messageId = msg?.['message_id'] as number | undefined

    try {
      // ── Сегмент: seg:{clientId} ─────────────────────────────────────────────
      if (data.startsWith('seg:')) {
        const clientId = parseInt(data.slice(4), 10)
        const client = await prisma.client.findUnique({ where: { id: clientId } })
        if (!client) return ctx.answerCbQuery('Клиент не найден')

        const nextSeg = SEGMENT_NEXT[client.segment] ?? 'lead'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await prisma.client.update({ where: { id: clientId }, data: { segment: nextSeg as any } })

        // Обновляем кнопку в том же сообщении
        if (chatId && messageId) {
          await ctx.telegram.editMessageReplyMarkup(
            chatId,
            messageId,
            undefined,
            buildControlPanel(clientId, nextSeg).reply_markup,
          )
        }
        return ctx.answerCbQuery(`Сегмент → ${SEGMENT_LABEL[nextSeg]}`)
      }

      // ── Статус: st:{type}:{clientId} ────────────────────────────────────────
      if (data.startsWith('st:')) {
        const parts = data.split(':')
        const statusType = parts[1]
        const clientId = parseInt(parts[2], 10)

        const client = await prisma.client.findUnique({ where: { id: clientId } })
        if (!client) return ctx.answerCbQuery('Клиент не найден')

        type TaskDef = {
          action: string
          payload: object
          scheduledAt: Date
          confirmText: string
        }

        const defs: Record<string, TaskDef> = {
          // "Думает" → напомнить через 3 дня
          think: {
            action: 'remind_client',
            payload: { text: 'Добрый день! Актуален ли вопрос — готовы помочь с выбором 👍' },
            scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            confirmText: '💭 Напомним через 3 дня',
          },
          // "Ждёт скидку" → уведомить при включении акции
          // scheduledAt ставим далеко вперёд; модуль акций обновит его при старте
          disc: {
            action: 'promo_notify',
            payload: { text: '🎉 Акция началась! Скидки уже доступны — пора брать!' },
            scheduledAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            confirmText: '⏳ Уведомим при включении акции',
          },
          // "Отказ" → реактивация через 30 дней
          ref: {
            action: 'remind_client',
            payload: {
              text: 'Здравствуйте! Хотели напомнить о нашем предложении — возможно, сейчас актуально?',
            },
            scheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            confirmText: '❌ Реактивируем через 30 дней',
          },
        }

        const def = defs[statusType]
        if (!def) return ctx.answerCbQuery()

        await prisma.task.create({
          data: {
            clientId,
            action: def.action,
            payload: def.payload,
            scheduledAt: def.scheduledAt,
          },
        })
        return ctx.answerCbQuery(def.confirmText)
      }

      // ── Заметка: note:{clientId} ────────────────────────────────────────────
      if (data.startsWith('note:')) {
        const clientId = parseInt(data.slice(5), 10)
        const client = await prisma.client.findUnique({ where: { id: clientId } })
        if (!client || client.telegramTopicId == null) return ctx.answerCbQuery('Клиент не найден')

        noteMode.set(client.telegramTopicId, clientId)
        await sendToTopic(
          ctx.telegram,
          CRM_GROUP_ID,
          client.telegramTopicId,
          '📝 Режим заметки: следующее ваше сообщение сохранится как заметка клиента (не пересылается).',
        )
        return ctx.answerCbQuery('📝 Введите заметку следующим сообщением')
      }

      // ── История: hist:{clientId} ────────────────────────────────────────────
      if (data.startsWith('hist:')) {
        const clientId = parseInt(data.slice(5), 10)
        const client = await prisma.client.findUnique({ where: { id: clientId } })
        if (!client) return ctx.answerCbQuery('Клиент не найден')

        const messages = await prisma.message.findMany({
          where: { clientId },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })

        if (messages.length === 0) return ctx.answerCbQuery('История пуста')

        const lines = messages
          .reverse()
          .map((m) => {
            const time = m.createdAt.toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit',
            })
            const arrow = m.direction === 'in' ? '→' : '←'
            return `[${time}] ${arrow} ${m.text.slice(0, 80)}`
          })
          .join('\n')

        if (client.telegramTopicId) {
          await sendToTopic(
            ctx.telegram,
            CRM_GROUP_ID,
            client.telegramTopicId,
            `📋 История (последние 10):\n\n${lines}`,
          )
        }
        return ctx.answerCbQuery()
      }
    } catch (err) {
      console.error('callback_query error:', err)
      return ctx.answerCbQuery('Ошибка')
    }

    return ctx.answerCbQuery()
  })

  // ── Команда /shop — открыть Mini App ────────────────────────────────────────

  bot.command('shop', (ctx) => {
    const webAppUrl = process.env.WEBAPP_URL ?? `http://localhost:${process.env.API_PORT ?? 3000}/shop`
    return ctx.reply(
      '🛍️ Добро пожаловать в Bender Shop!',
      Markup.keyboard([[Markup.button.webApp('🛒 Открыть магазин', webAppUrl)]]).resize(),
    )
  })

  // ── Заказ из Mini App (web_app_data) ─────────────────────────────────────────
  // Регистрируется ДО generic message-handler, чтобы не попасть в «тихий дроп»

  bot.on(message('web_app_data'), async (ctx) => {
    try {
      const raw = ctx.message.web_app_data.data
      const orderData = JSON.parse(raw) as {
        orderId: number
        items: Array<{ productId: number; name: string; price: string; qty: number }>
        payment: string
        total: string
      }
      await handleWebAppOrder(ctx.telegram, ctx.from, orderData)
    } catch (err) {
      console.error('web_app_data error:', err)
    }
  })

  // ── Обработчик входящих сообщений ───────────────────────────────────────────

  bot.on('message', async (ctx, next) => {
    const { chat, from } = ctx
    const rawMsg = ctx.message as unknown as Record<string, unknown>

    if (!from) return next()

    // ── Сообщения из CRM-группы: ответ менеджера → клиент ────────────────────
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
      return // Не пропускаем в admin-middleware
    }

    // ── Только личные чаты ────────────────────────────────────────────────────
    if (chat.type !== 'private') return next()

    // Администраторы → передаём дальше (команды, меню)
    if (ADMIN_IDS.includes(from.id)) return next()

    // ── Клиентское сообщение ──────────────────────────────────────────────────
    const text = rawMsg['text'] as string | undefined
    if (text) {
      try {
        await handleClientMessage(ctx.telegram, from, text)
      } catch (err) {
        console.error('handleClientMessage error:', err)
      }
    }
    // Нетекстовые сообщения — молча проглатываем (не доходят до admin-middleware)
  })
}

// ─── Обработка входящего сообщения от клиента ────────────────────────────────

async function handleClientMessage(
  telegram: Telegram,
  from: TgUser,
  text: string,
): Promise<void> {
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
      await sendToTopic(telegram, CRM_GROUP_ID, client.telegramTopicId, `💬 ${name}: ${text}`)
    }

    // Панель управления после каждого сообщения клиента
    await sendControlPanel(
      telegram,
      CRM_GROUP_ID,
      client.telegramTopicId!,
      client.id,
      client.segment,
    )

    // Сохраняем сообщение в БД
    await prisma.message.create({
      data: { clientId: client.id, direction: 'in', text, source: 'telegram' },
    })
  } catch (e) {
    console.error('handleClientMessage FULL ERROR:', e)
  }
}

// ─── Обработка ответа менеджера в топике ─────────────────────────────────────

async function handleManagerReply(
  telegram: Telegram,
  threadId: number,
  text: string,
): Promise<void> {
  // Режим заметки: сохраняем текст в notes, не пересылаем клиенту
  if (noteMode.has(threadId)) {
    const clientId = noteMode.get(threadId)!
    noteMode.delete(threadId)
    await prisma.client.update({ where: { id: clientId }, data: { notes: text } })
    await sendToTopic(telegram, CRM_GROUP_ID, threadId, '✅ Заметка сохранена')
    return
  }

  const client = await prisma.client.findFirst({ where: { telegramTopicId: threadId } })
  if (!client) return

  // Пересылаем в личку только клиентам из Telegram
  if (client.source === 'telegram' && client.externalId) {
    await telegram.sendMessage(client.externalId, text)
  }

  // Сохраняем исходящее сообщение
  await prisma.message.create({
    data: { clientId: client.id, direction: 'out', text, source: 'telegram' },
  })
}

// ─── Хелперы ─────────────────────────────────────────────────────────────────

async function sendControlPanel(
  telegram: Telegram,
  chatId: number,
  threadId: number,
  clientId: number,
  segment: string,
): Promise<void> {
  const panel = buildControlPanel(clientId, segment)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (telegram.sendMessage as any)(chatId, '⚙️ Панель клиента', {
    message_thread_id: threadId,
    reply_markup: panel.reply_markup,
  })
}

async function sendToTopic(
  telegram: Telegram,
  chatId: number,
  threadId: number,
  text: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (telegram.sendMessage as any)(chatId, text, { message_thread_id: threadId })
}

function getClientName(from: TgUser): string {
  return (
    [from.first_name, from.last_name].filter(Boolean).join(' ') ||
    from.username ||
    'Неизвестный'
  )
}

function fmtPrice(n: number): string {
  return n.toLocaleString('ru-RU')
}

// ─── Обработка заказа из Mini App ────────────────────────────────────────────

async function handleWebAppOrder(
  telegram: Telegram,
  from: TgUser,
  orderData: {
    orderId: number
    items: Array<{ productId: number; name: string; price: string; qty: number }>
    payment: string
    total: string
  },
): Promise<void> {
  const { orderId, items, payment, total } = orderData
  const externalId = String(from.id)
  const name = getClientName(from)

  const PAYMENT_LABEL: Record<string, string> = {
    cash: '💵 Наличные',
    transfer: '📲 Перевод',
    card: '💳 Карта (+14%)',
  }

  // Найти или создать клиента
  let client = await prisma.client.findUnique({
    where: { source_externalId: { source: 'telegram', externalId } },
  })

  if (!client) {
    client = await prisma.client.create({
      data: { name, source: 'telegram', externalId, segment: 'lead' },
    })
  }

  // Привязать заказ к клиенту (если orderId корректен)
  if (orderId > 0) {
    await prisma.order.update({
      where: { id: orderId },
      data: { clientId: client.id },
    }).catch(() => {})
  }

  // Создать CRM-топик если нет
  if (client.telegramTopicId == null) {
    const topic = await telegram.createForumTopic(CRM_GROUP_ID, name)
    client = await prisma.client.update({
      where: { id: client.id },
      data: { telegramTopicId: topic.message_thread_id },
    })
  }

  // Форматируем уведомление
  const itemLines = items
    .map((i) => `• ${i.name} × ${i.qty} — ${fmtPrice(Number(i.price) * i.qty)} ₽`)
    .join('\n')
  const orderRef = orderId > 0 ? ` #${orderId}` : ''
  const notification = [
    `🛒 Новый заказ${orderRef} из магазина`,
    `👤 ${name}`,
    '',
    itemLines,
    '',
    `💰 Итого: ${fmtPrice(Number(total))} ₽`,
    `💳 Оплата: ${PAYMENT_LABEL[payment] ?? payment}`,
  ].join('\n')

  await sendToTopic(telegram, CRM_GROUP_ID, client.telegramTopicId!, notification)
  await sendControlPanel(telegram, CRM_GROUP_ID, client.telegramTopicId!, client.id, client.segment)

  // Сохраняем в историю
  await prisma.message.create({
    data: { clientId: client.id, direction: 'in', text: notification, source: 'shop' },
  })

  // Подтверждение клиенту
  const itemCount = items.reduce((s, i) => s + i.qty, 0)
  await telegram.sendMessage(
    externalId,
    `✅ Заказ принят!\n\n${itemCount} поз. на ${fmtPrice(Number(total))} ₽\nОплата: ${PAYMENT_LABEL[payment] ?? payment}\n\nОжидайте — скоро свяжемся с вами 👋`,
  )
}
