/**
 * webhooks/telegram.ts
 *
 * Двусторонний мост «клиент ↔ CRM-группа»:
 *   • Входящее от клиента  → найти/создать Client + топик форума → уведомить CRM
 *   • Ответ менеджера в топике → переслать клиенту в личку
 *
 * Inline-панель управления в каждом топике:
 *   Отправляется ОДИН РАЗ при создании топика и закрепляется.
 *   [💰 Продажа] [🔖 Резерв]
 *   [✏️ Редактировать] [📊 Сегмент]
 *   [🏷️ Теги] [📋 История]
 *   [📝 Заметка] [👤 Карточка]
 *
 * Команда /card в топике — карточка клиента с inline keyboard (статусы + редактирование).
 *
 * Требования к боту:
 *   — администратор CRM-группы (для создания топиков, закрепления/удаления сообщений)
 *   — privacy mode выключен (BotFather → /setprivacy → Disable)
 */

import { Telegraf, Telegram, Markup, Context } from 'telegraf'
import { message } from 'telegraf/filters'
import { prisma } from '../lib/prisma'
import { sendToTopic, sendToTopicWithMarkup } from '../lib/telegram-helpers'
import type { SegmentModel } from '../generated/prisma/models'
import { startSaleFlow, startReserveFlow, salesState } from '../bot/admin/sales'
import {
  getAIMode,
  generateAIResponse,
  storeSuggestion,
  getSuggestion,
  deleteSuggestion,
  incrementStat,
} from '../bot/ai/agent'
import { logSecurityEvent } from '../lib/security-log'
import { encryptClientField, decryptClientField, encryptDate, decryptDate } from '../lib/client-crypto'
import log, { safeLog } from '../lib/logger'

const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID)
const ADMIN_IDS = (process.env.ADMIN_IDS ?? '').split(',').map((id) => Number(id.trim()))

// ─── Безопасный парсинг числового ID из callback data ──────────────────────────

function parseCallbackId(value: string): number | null {
  const n = parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

// ─── Rate limit для логирования несанкционированных callback-запросов ──────────
// Хранит userId → timestamp последнего залогированного события (макс. 1 раз в минуту)

const unauthorizedLogCooldown = new Map<number, number>()

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

// ─── Состояние: редактирование поля клиента ───────────────────────────────────
// userId менеджера → { clientId, field }

type EditField = 'fullName' | 'phone' | 'email' | 'birthDate'
const editMode = new Map<number, { clientId: number; field: EditField }>()

// ─── Inline keyboard панели управления ────────────────────────────────────────
// Отправляется один раз в топик при его создании и закрепляется.
// Callback data: cp:{action}:{clientId}

function buildControlPanelKeyboard(clientId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💰 Продажа', `cp:sale:${clientId}`),
      Markup.button.callback('🔖 Резерв', `cp:res:${clientId}`),
    ],
    [
      Markup.button.callback('✏️ Редактировать', `cp:edit:${clientId}`),
      Markup.button.callback('📊 Сегмент', `cp:seg:${clientId}`),
    ],
    [
      Markup.button.callback('🏷️ Теги', `cp:tags:${clientId}`),
      Markup.button.callback('📋 История', `cp:hist:${clientId}`),
    ],
    [
      Markup.button.callback('📝 Заметка', `cp:note:${clientId}`),
      Markup.button.callback('👤 Карточка', `cp:card:${clientId}`),
    ],
    [
      Markup.button.callback('🔍 Запросить цену', `cp:price:${clientId}`),
    ],
  ])
}

// ─── Inline keyboard для карточки клиента (/card) ─────────────────────────────

function buildCardInlineKeyboard(clientId: number, segmentLabel: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${segmentLabel} · сменить сегмент`, `seg:${clientId}`)],
    [
      Markup.button.callback('💭 Думает', `st:think:${clientId}`),
      Markup.button.callback('⏳ Ждёт скидку', `st:disc:${clientId}`),
      Markup.button.callback('❌ Отказ', `st:ref:${clientId}`),
    ],
    [Markup.button.callback('✏️ Редактировать', `edit:menu:${clientId}`)],
  ])
}

function getSegmentLabel(seg: SegmentModel | null | undefined): string {
  return seg ? `${seg.color} ${seg.name}` : '— Сегмент'
}

// ─── Форматирование карточки клиента ─────────────────────────────────────────

async function buildClientCard(clientId: number): Promise<string> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { segment: true, tags: true },
  })
  if (!client) return '❌ Клиент не найден'

  const now = Date.now()
  const lastContact = client.updatedAt
  const diffMs = now - lastContact.getTime()
  const diffH = Math.floor(diffMs / 3600000)
  const diffD = Math.floor(diffH / 24)
  const lastContactStr =
    diffD > 0 ? `${diffD} дн. назад` : diffH > 0 ? `${diffH} ч. назад` : 'недавно'

  let birthDate: Date | null = null
  try { birthDate = decryptDate(client.birthDate) } catch { /* tampered or corrupted — treat as missing */ }
  const birthStr = birthDate
    ? birthDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'

  const segLabel = client.segment ? `${client.segment.color} ${client.segment.name}` : '—'
  const tagsStr = client.tags.length > 0 ? client.tags.map((t) => `[${t.name}]`).join(' ') : '—'
  const notesStr = client.notes ?? '—'
  const revenue = Number(client.totalRevenue)

  const lines: string[] = [
    `👤 ${client.fullName ?? client.name}`,
  ]
  let phone: string | null = null
  let email: string | null = null
  try { phone = decryptClientField(client.phone) } catch { /* tampered or corrupted */ }
  try { email = decryptClientField(client.email) } catch { /* tampered or corrupted */ }
  if (phone) lines.push(`📞 ${phone}`)
  if (client.telegramUsername) lines.push(`📱 Telegram: ${client.telegramUsername}`)
  if (email) lines.push(`📧 ${email}`)
  if (birthDate) lines.push(`🎂 ${birthStr}`)
  lines.push('━━━━━━━━━━━━━━━')
  lines.push(`📌 Источник: ${sourceLabel(client.source)}`)
  lines.push(`📊 Сегмент: ${segLabel}`)
  lines.push(`💬 Последний контакт: ${lastContactStr}`)
  lines.push(`🛍️ Покупок: ${client.totalPurchases} на сумму ${fmtPrice(revenue)} ₽`)
  lines.push('━━━━━━━━━━━━━━━')
  lines.push(`🏷️ Теги: ${tagsStr}`)
  lines.push(`📝 Заметка: ${notesStr}`)

  // Последний заказ
  const lastOrder = await prisma.order.findFirst({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, deliveryType: true, deliveryAddress: true, customerPhone: true, createdAt: true, totalAmount: true },
  })
  if (lastOrder) {
    const delivery = lastOrder.deliveryType === 'pickup'
      ? '📍 Самовывоз'
      : `🚚 ${lastOrder.deliveryAddress ?? 'Доставка'}`
    lines.push('')
    lines.push(`📦 Последний заказ #${lastOrder.id} (${lastOrder.createdAt.toLocaleDateString('ru-RU')}):`)
    lines.push(`   ${delivery}`)
    lines.push(`   💵 ${Number(lastOrder.totalAmount).toLocaleString('ru-RU')}₽`)
  }

  return lines.join('\n')
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    telegram: 'Telegram',
    avito: 'Avito',
    instagram: 'Instagram',
    shop: 'Магазин',
  }
  return map[source] ?? source
}

// ─── Экспортируемая функция подключения ───────────────────────────────────────

/**
 * Регистрирует обработчики сообщений от клиентов, ответов менеджеров
 * и inline-кнопок карточки клиента.
 * ВАЖНО: вызывать ДО admin-middleware в bot/index.ts.
 */
export function setupClientHandlers(bot: Telegraf): void {
  // ── Обработчик нажатий inline-кнопок ────────────────────────────────────────

  const ADMIN_ACTION_PREFIXES = ['cp:', 'seg:', 'st:', 'note:', 'hist:', 'card:', 'edit:', 'crm:', 'tags:', 'ai:']

  bot.on('callback_query', async (ctx: Context, next: () => Promise<void>) => {
    const query = ctx.callbackQuery as unknown as Record<string, unknown>
    const data = query['data'] as string | undefined
    if (!data) return next()

    const msg = query['message'] as Record<string, unknown> | undefined
    const chatId = (msg?.['chat'] as Record<string, unknown>)?.['id'] as number | undefined
    const messageId = msg?.['message_id'] as number | undefined
    const threadId = msg?.['message_thread_id'] as number | undefined

    const callerId = ctx.from?.id
    if (ADMIN_ACTION_PREFIXES.some((p) => data.startsWith(p))) {
      if (!callerId || !ADMIN_IDS.includes(callerId)) {
        // Rate-limited security log: max 1 event per user per minute
        const now = Date.now()
        const lastLogged = unauthorizedLogCooldown.get(callerId ?? 0) ?? 0
        if (now - lastLogged > 60_000) {
          unauthorizedLogCooldown.set(callerId ?? 0, now)
          logSecurityEvent('unauthorized_access', {
            userId: callerId ?? 'unknown',
            action: data,
          }).catch((err) => log.error('Security log write failed', { error: err instanceof Error ? err.message : String(err) }))
        }
        return ctx.answerCbQuery()
      }
    }

    try {
      // ── Панель управления: cp:{action}:{clientId} ────────────────────────────
      if (data.startsWith('cp:')) {
        const parts = data.split(':')
        const action = parts[1]
        const clientId = parseCallbackId(parts[2])
        if (clientId === null) return ctx.answerCbQuery('Некорректные данные')
        const managerId = ctx.from?.id

        const client = await prisma.client.findUnique({
          where: { id: clientId },
          include: { segment: true },
        })
        if (!client) return ctx.answerCbQuery('Клиент не найден')

        switch (action) {
          // Продажа — флоу в личке менеджера
          case 'sale': {
            if (!managerId) return ctx.answerCbQuery()
            salesState.set(managerId, { flow: 'sale', step: 'product_method', clientId })
            await ctx.telegram.sendMessage(managerId, '💰 Продажа — выберите способ выбора товара:', {
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('📋 Из списка', `sale:list:${clientId}`)],
                [Markup.button.callback('🔢 По SKU', `sale:sku:${clientId}`)],
                [Markup.button.callback('❌ Отмена', 'sale:cancel')],
              ]).reply_markup,
            })
            return ctx.answerCbQuery('💰 Флоу продажи запущен')
          }

          // Резерв — флоу в личке менеджера
          case 'res': {
            if (!managerId) return ctx.answerCbQuery()
            salesState.set(managerId, { flow: 'reserve', step: 'product_method', clientId })
            await ctx.telegram.sendMessage(managerId, '🔖 Резерв — выберите способ выбора товара:', {
              reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('📋 Из списка', `res:list:${clientId}`)],
                [Markup.button.callback('🔢 По SKU', `res:sku:${clientId}`)],
                [Markup.button.callback('❌ Отмена', 'res:cancel')],
              ]).reply_markup,
            })
            return ctx.answerCbQuery('🔖 Флоу резерва запущен')
          }

          // Редактировать — меню в личке менеджера
          case 'edit': {
            if (!managerId) return ctx.answerCbQuery()
            await ctx.answerCbQuery()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return await ctx.telegram.sendMessage(managerId, '✏️ Что редактировать?', {
              reply_markup: Markup.inlineKeyboard([
                [
                  Markup.button.callback('👤 ФИО', `edit:field:${clientId}:fullName`),
                  Markup.button.callback('📞 Телефон', `edit:field:${clientId}:phone`),
                ],
                [
                  Markup.button.callback('📧 Email', `edit:field:${clientId}:email`),
                  Markup.button.callback('🎂 Дата рождения', `edit:field:${clientId}:birthDate`),
                ],
                [Markup.button.callback('❌ Отмена', 'edit:cancel')],
              ]).reply_markup,
            })
          }

          // Сегмент — цикличное переключение, уведомление через answerCbQuery
          case 'seg': {
            const segments = await prisma.segment.findMany({ orderBy: { id: 'asc' } })
            if (segments.length === 0) return ctx.answerCbQuery('⚠️ Нет сегментов в БД')
            const currentIndex = segments.findIndex((s) => s.id === client.segmentId)
            const nextIndex = (currentIndex + 1) % segments.length
            const nextSeg = segments[nextIndex]
            await prisma.client.update({ where: { id: clientId }, data: { segmentId: nextSeg.id } })
            return ctx.answerCbQuery(`📊 Сегмент → ${nextSeg.color} ${nextSeg.name}`)
          }

          // Теги — заглушка
          case 'tags': {
            return ctx.answerCbQuery('🏷️ Управление тегами — скоро')
          }

          // История — последние 10 сообщений в топик
          case 'hist': {
            const messages = await prisma.message.findMany({
              where: { clientId },
              orderBy: { createdAt: 'desc' },
              take: 10,
            })
            if (messages.length === 0) return ctx.answerCbQuery('История пуста')
            const lines = messages
              .reverse()
              .map((m) => {
                const time = m.createdAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                const arrow = m.direction === 'in' ? '→' : '←'
                return `[${time}] ${arrow} ${m.text.slice(0, 80)}`
              })
              .join('\n')
            if (threadId) {
              await sendToTopic(ctx.telegram, CRM_GROUP_ID, threadId, `📋 История (последние 10):\n\n${lines}`)
            }
            return ctx.answerCbQuery()
          }

          // Заметка — активируем режим ввода
          case 'note': {
            if (!threadId) return ctx.answerCbQuery('Не определён топик')
            noteMode.set(threadId, clientId)
            await sendToTopic(
              ctx.telegram,
              CRM_GROUP_ID,
              threadId,
              '📝 Режим заметки: следующее ваше сообщение сохранится как заметка клиента (не пересылается).',
            )
            return ctx.answerCbQuery('📝 Введите заметку следующим сообщением')
          }

          // Карточка — отправить в топик с inline keyboard
          case 'card': {
            const cardText = await buildClientCard(clientId)
            const segLabel = getSegmentLabel(client.segment)
            if (threadId) {
              await sendToTopicWithMarkup(
                ctx.telegram,
                CRM_GROUP_ID,
                threadId,
                cardText,
                buildCardInlineKeyboard(clientId, segLabel).reply_markup,
              )
            }
            return ctx.answerCbQuery()
          }

          case 'price': {
            if (!managerId) return ctx.answerCbQuery()
            await ctx.answerCbQuery()

            const lastMsg = await prisma.message.findFirst({
              where: { clientId, direction: 'in' },
              orderBy: { createdAt: 'desc' },
            })

            const recentQuery = lastMsg?.text ?? ''
            const { findBestPrice } = await import('../webhooks/supplier')

            if (recentQuery.length >= 5) {
              // Search in cached supplier prices
              const cached = await findBestPrice(recentQuery)
              if (cached.length > 0) {
                const priceLines = cached.slice(0, 5).map((p, i) =>
                  `${i + 1}. ${p.supplier}: ${p.model}${p.storage ? ' ' + p.storage : ''} — ${p.finalPrice.toLocaleString('ru-RU')}₽ (+${p.markup}%)`,
                )
                if (threadId) {
                  await sendToTopic(ctx.telegram, CRM_GROUP_ID, threadId, [
                    `🔍 По запросу клиента "${recentQuery.slice(0, 60)}":\n`,
                    ...priceLines,
                  ].join('\n'))
                }
                return
              }
            }

            if (threadId) {
              await sendToTopicWithMarkup(
                ctx.telegram,
                CRM_GROUP_ID,
                threadId,
                `🔍 Нет кешированных цен${recentQuery ? ` на "${recentQuery.slice(0, 60)}"` : ''}.\nЗапросить у всех поставщиков?`,
                Markup.inlineKeyboard([
                  ...(recentQuery.length >= 5
                    ? [[Markup.button.callback('📨 Запросить у поставщиков', `cp:price_send:${clientId}`)]]
                    : []),
                ]).reply_markup,
              )
            }
            return
          }

          default:
            return ctx.answerCbQuery()
        }
      }

      // ── Запрос цены у поставщиков: cp:price_send:{clientId} ─────────────────
      if (data.startsWith('cp:price_send:')) {
        const clientId = parseCallbackId(data.slice(14))
        if (clientId === null) return ctx.answerCbQuery('Некорректные данные')
        await ctx.answerCbQuery('⏳ Отправляю...')

        const lastMsg = await prisma.message.findFirst({
          where: { clientId, direction: 'in' },
          orderBy: { createdAt: 'desc' },
        })
        if (!lastMsg?.text) {
          return ctx.answerCbQuery('Нет сообщений от клиента')
        }

        const { requestPriceFromAllSuppliers } = await import('../webhooks/supplier')
        // TODO: requestPriceFromAllSuppliers should accept { telegram: Telegram } instead of Telegraf
        const sent = await requestPriceFromAllSuppliers(
          { telegram: ctx.telegram } as unknown as Telegraf,
          lastMsg.text.slice(0, 200),
        )

        const cbMsg = ctx.callbackQuery?.message as Record<string, unknown> | undefined
        const threadId = cbMsg?.message_thread_id as number | undefined
        if (threadId) {
          await sendToTopic(
            ctx.telegram,
            CRM_GROUP_ID,
            threadId,
            `📨 Запрос отправлен ${sent} поставщикам. Ответы появятся автоматически.`,
          )
        }
        return
      }

      // ── Сегмент: seg:{clientId} — используется в карточке клиента ────────────
      if (data.startsWith('seg:')) {
        const clientId = parseCallbackId(data.slice(4))
        if (clientId === null) return ctx.answerCbQuery('Некорректные данные')
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          include: { segment: true },
        })
        if (!client) return ctx.answerCbQuery('Клиент не найден')

        const segments = await prisma.segment.findMany({ orderBy: { id: 'asc' } })
        if (segments.length === 0) return ctx.answerCbQuery('Нет сегментов в БД')

        const currentIndex = segments.findIndex((s) => s.id === client.segmentId)
        const nextIndex = (currentIndex + 1) % segments.length
        const nextSeg = segments[nextIndex]

        await prisma.client.update({ where: { id: clientId }, data: { segmentId: nextSeg.id } })

        const label = getSegmentLabel(nextSeg)
        if (chatId && messageId) {
          await ctx.telegram.editMessageReplyMarkup(
            chatId,
            messageId,
            undefined,
            buildCardInlineKeyboard(clientId, label).reply_markup,
          )
        }
        return ctx.answerCbQuery(`Сегмент → ${label}`)
      }

      // ── Статус: st:{type}:{clientId} ────────────────────────────────────────
      if (data.startsWith('st:')) {
        const parts = data.split(':')
        const statusType = parts[1]
        const clientId = parseCallbackId(parts[2])
        if (clientId === null) return ctx.answerCbQuery('Некорректные данные')

        const client = await prisma.client.findUnique({ where: { id: clientId } })
        if (!client) return ctx.answerCbQuery('Клиент не найден')

        type TaskDef = {
          action: string
          payload: object
          scheduledAt: Date
          confirmText: string
        }

        const defs: Record<string, TaskDef> = {
          think: {
            action: 'remind_client',
            payload: { text: 'Добрый день! Актуален ли вопрос — готовы помочь с выбором 👍' },
            scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            confirmText: '💭 Напомним через 3 дня',
          },
          disc: {
            action: 'promo_notify',
            payload: { text: '🎉 Акция началась! Скидки уже доступны — пора брать!' },
            scheduledAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            confirmText: '⏳ Уведомим при включении акции',
          },
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
      if (data.startsWith('note:') && !data.startsWith('note:save:')) {
        const clientId = parseCallbackId(data.slice(5))
        if (clientId === null) return ctx.answerCbQuery('Некорректные данные')
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
        const clientId = parseCallbackId(data.slice(5))
        if (clientId === null) return ctx.answerCbQuery('Некорректные данные')
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

      // ── Карточка клиента: card:{clientId} ───────────────────────────────────
      if (data.startsWith('card:')) {
        const clientId = parseCallbackId(data.slice(5))
        if (clientId === null) return ctx.answerCbQuery('Некорректные данные')
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          include: { segment: true },
        })
        if (!client) return ctx.answerCbQuery('Клиент не найден')

        const cardText = await buildClientCard(clientId)
        const segLabel = getSegmentLabel(client.segment)

        if (client.telegramTopicId) {
          await sendToTopicWithMarkup(
            ctx.telegram,
            CRM_GROUP_ID,
            client.telegramTopicId,
            cardText,
            buildCardInlineKeyboard(clientId, segLabel).reply_markup,
          )
        }
        return ctx.answerCbQuery()
      }

      // ── Редактировать: edit:menu:{clientId} ──────────────────────────────────
      if (data.startsWith('edit:menu:')) {
        const clientId = parseCallbackId(data.slice(10))
        if (clientId === null) return ctx.answerCbQuery('Некорректные данные')
        await ctx.answerCbQuery()
        return await ctx.reply(
          '✏️ Что редактировать?',
          Markup.inlineKeyboard([
            [
              Markup.button.callback('👤 ФИО', `edit:field:${clientId}:fullName`),
              Markup.button.callback('📞 Телефон', `edit:field:${clientId}:phone`),
            ],
            [
              Markup.button.callback('📧 Email', `edit:field:${clientId}:email`),
              Markup.button.callback('🎂 Дата рождения', `edit:field:${clientId}:birthDate`),
            ],
            [Markup.button.callback('❌ Отмена', 'edit:cancel')],
          ]),
        )
      }

      // ── Редактировать: edit:field:{clientId}:{field} ──────────────────────
      if (data.startsWith('edit:field:')) {
        const parts = data.split(':')
        const clientId = parseCallbackId(parts[2])
        if (clientId === null) return ctx.answerCbQuery('Некорректные данные')
        const field = parts[3] as EditField
        const userId = ctx.from?.id
        if (!userId) return ctx.answerCbQuery()

        editMode.set(userId, { clientId, field })
        await ctx.answerCbQuery()

        const prompts: Record<EditField, string> = {
          fullName: 'Введите полное ФИО клиента:',
          phone: 'Введите номер телефона (например, +79001234567):',
          email: 'Введите email клиента:',
          birthDate: 'Введите дату рождения (ДД.ММ.ГГГГ):',
        }
        return await ctx.reply(
          prompts[field] ?? 'Введите значение:',
          Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'edit:cancel')]]),
        )
      }

      // ── Отмена редактирования ────────────────────────────────────────────────
      if (data === 'edit:cancel') {
        const userId = ctx.from?.id
        if (userId) editMode.delete(userId)
        await ctx.answerCbQuery()
        return await ctx.reply('Редактирование отменено.')
      }

      // ── Продажа из карточки: crm:sale:{clientId} ─────────────────────────────
      if (data.startsWith('crm:sale:')) {
        const clientId = parseCallbackId(data.slice(9))
        if (clientId === null) return ctx.answerCbQuery('Некорректные данные')
        await ctx.answerCbQuery()
        return await startSaleFlow(ctx as Context, clientId)
      }

      // ── Резерв из карточки: crm:res:{clientId} ────────────────────────────────
      if (data.startsWith('crm:res:')) {
        const clientId = parseCallbackId(data.slice(8))
        if (clientId === null) return ctx.answerCbQuery('Некорректные данные')
        await ctx.answerCbQuery()
        return await startReserveFlow(ctx as Context, clientId)
      }

      // ── Теги: tags:{clientId} ────────────────────────────────────────────────
      if (data.startsWith('tags:')) {
        return ctx.answerCbQuery('Управление тегами — скоро')
      }

      // ── AI: ai:send:{suggestionId} — отправить предложение клиенту ───────────
      if (data.startsWith('ai:send:')) {
        const suggestionId = parseCallbackId(data.slice(8))
        if (suggestionId === null) return ctx.answerCbQuery('Некорректные данные')
        const suggestion = getSuggestion(suggestionId)
        if (!suggestion) return ctx.answerCbQuery('Предложение не найдено или устарело')

        const { clientId, text } = suggestion
        deleteSuggestion(suggestionId)

        const client = await prisma.client.findUnique({ where: { id: clientId } })
        if (!client) return ctx.answerCbQuery('Клиент не найден')

        if (client.source === 'telegram' && client.externalId) {
          await ctx.telegram.sendMessage(client.externalId, text)
        } else if (client.source === 'avito' && client.externalId) {
          const { sendAvitoMessage } = await import('../lib/avito')
          const avitoChatId = client.externalId.split(':')[1]
          if (avitoChatId) await sendAvitoMessage(avitoChatId, text)
        }
        await prisma.message.create({
          data: { clientId, direction: 'out', text, source: client.source },
        })

        incrementStat('approved')

        // Обновляем сообщение с кнопками — убираем кнопки, добавляем метку
        if (chatId && messageId) {
          try {
            await ctx.telegram.editMessageReplyMarkup(chatId, messageId, undefined, {
              inline_keyboard: [],
            })
          } catch { /* ignore: message/markup may already be deleted */ }
        }
        return ctx.answerCbQuery('✅ Ответ отправлен клиенту')
      }

      // ── AI: ai:edit:{suggestionId} — редактировать предложение ──────────────
      if (data.startsWith('ai:edit:')) {
        const suggestionId = parseCallbackId(data.slice(8))
        if (suggestionId === null) return ctx.answerCbQuery('Некорректные данные')
        const suggestion = getSuggestion(suggestionId)
        if (!suggestion) return ctx.answerCbQuery('Предложение не найдено или устарело')

        deleteSuggestion(suggestionId)
        incrementStat('rejected')

        // Убираем кнопки
        if (chatId && messageId) {
          try {
            await ctx.telegram.editMessageReplyMarkup(chatId, messageId, undefined, {
              inline_keyboard: [],
            })
          } catch { /* ignore: message/markup may already be deleted */ }
        }

        if (threadId) {
          await sendToTopic(
            ctx.telegram,
            CRM_GROUP_ID,
            threadId,
            '✏️ Введите ваш вариант ответа следующим сообщением — он будет отправлен клиенту.',
          )
        }
        return ctx.answerCbQuery('✏️ Введите ваш вариант')
      }

      // ── AI: ai:skip:{suggestionId} — пропустить предложение ─────────────────
      if (data.startsWith('ai:skip:')) {
        const suggestionId = parseCallbackId(data.slice(8))
        if (suggestionId === null) return ctx.answerCbQuery('Некорректные данные')
        deleteSuggestion(suggestionId)
        incrementStat('rejected')

        if (chatId && messageId) {
          try {
            await ctx.telegram.editMessageReplyMarkup(chatId, messageId, undefined, {
              inline_keyboard: [],
            })
          } catch { /* ignore: message/markup may already be deleted */ }
        }
        return ctx.answerCbQuery('❌ Предложение пропущено')
      }

    } catch (err) {
      log.error('Callback query error', { error: err instanceof Error ? err.message : String(err) })
      return ctx.answerCbQuery('Ошибка')
    }

    return next()
  })

  // ── Команда /cancel — отменяет любой активный флоу редактирования ───────────

  bot.command('cancel', async (ctx) => {
    const userId = ctx.from?.id
    if (userId && editMode.has(userId)) {
      editMode.delete(userId)
      return ctx.reply('Редактирование отменено.')
    }
    return ctx.reply('Нет активного редактирования.')
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
      log.error('Web app data error', { error: err instanceof Error ? err.message : String(err) })
    }
  })

  // ── Обработчик входящих сообщений ───────────────────────────────────────────

  bot.on('message', async (ctx: Context, next: () => Promise<void>) => {
    const { chat, from } = ctx
    const rawMsg = ctx.message as unknown as Record<string, unknown>

    if (!from) return next()
    if (!chat) return next()

    // ── Сообщения из CRM-группы: ответ менеджера → клиент ────────────────────
    if (chat.id === CRM_GROUP_ID) {
      if (ADMIN_IDS.includes(from.id)) {
        const threadId = rawMsg['message_thread_id'] as number | undefined
        const text = rawMsg['text'] as string | undefined
        const messageId = rawMsg['message_id'] as number | undefined

        if (threadId != null) {
          if (text) {
            try {
              await handleManagerReply(ctx as Context, threadId, text, from.id, messageId)
            } catch (err) {
              log.error('Manager reply error', { error: err instanceof Error ? err.message : String(err) })
            }
          } else if (messageId) {
            // Медиа-ответ менеджера — переслать клиенту через copyMessage
            const client = await prisma.client.findFirst({ where: { telegramTopicId: threadId } })
            if (client?.externalId && client.source === 'telegram') {
              try {
                await ctx.telegram.copyMessage(client.externalId, CRM_GROUP_ID, messageId)
              } catch (err) {
                log.error('CRM media copy failed', { error: err instanceof Error ? err.message : String(err) })
              }
            }
          }
        }
      }
      return
    }

    // ── Только личные чаты ────────────────────────────────────────────────────
    if (chat.type !== 'private') return next()

    // Администраторы: проверяем режим редактирования
    if (ADMIN_IDS.includes(from.id)) {
      const text = rawMsg['text'] as string | undefined
      if (text && editMode.has(from.id)) {
        try {
          await handleEditMessage(ctx.telegram, from.id, text)
        } catch (err) {
          log.error('Edit message error', { error: err instanceof Error ? err.message : String(err) })
        }
        return
      }
      return next()
    }

    // ── Клиентское сообщение ──────────────────────────────────────────────────
    const text = rawMsg['text'] as string | undefined
    if (text) {
      try {
        await handleClientMessage(ctx.telegram, from, text)
      } catch (err) {
        log.error('Client message error', { error: err instanceof Error ? err.message : String(err) })
      }
    } else {
      // Медиа-сообщение от клиента — переслать в CRM-топик
      try {
        const mediaType = rawMsg['photo'] ? 'Фото'
          : rawMsg['voice'] ? 'Голосовое'
          : rawMsg['video'] ? 'Видео'
          : rawMsg['document'] ? 'Документ'
          : rawMsg['sticker'] ? 'Стикер'
          : rawMsg['location'] ? 'Локация'
          : 'Медиа'

        const externalId = String(from.id)
        const name = getClientName(from)
        const defaultSeg = await prisma.segment.findFirst({ where: { isDefault: true } })

        let client = await prisma.client.findUnique({
          where: { source_externalId: { source: 'telegram', externalId } },
          include: { segment: true },
        })
        if (!client) {
          client = await prisma.client.create({
            data: { name, source: 'telegram', externalId, segmentId: defaultSeg?.id ?? null, telegramUsername: from.username ? `@${from.username}` : null },
            include: { segment: true },
          })
        }

        if (client.telegramTopicId == null) {
          await createClientTopic(ctx.telegram, client.id, name)
          const refreshedClient = await prisma.client.findUnique({
            where: { id: client.id },
            include: { segment: true },
          })
          if (refreshedClient) client = refreshedClient
        }

        const messageId = rawMsg['message_id'] as number
        const chatId = (rawMsg['chat'] as Record<string, unknown>)?.['id'] as number
        if (client.telegramTopicId && chatId && messageId) {
          try {
            await ctx.telegram.forwardMessage(
              CRM_GROUP_ID, chatId, messageId,
              { message_thread_id: client.telegramTopicId },
            )
          } catch (fwdErr: any) {
            if (fwdErr?.response?.description?.includes('message thread not found')) {
              await prisma.client.update({ where: { id: client.id }, data: { telegramTopicId: null } })
              const threadId = await createClientTopic(ctx.telegram, client.id, name)
              if (threadId) {
                await ctx.telegram.forwardMessage(
                  CRM_GROUP_ID, chatId, messageId,
                  { message_thread_id: threadId },
                )
              }
            } else {
              throw fwdErr
            }
          }
        }

        await prisma.message.create({
          data: {
            clientId: client.id,
            direction: 'in',
            text: `[${mediaType}]`,
            source: 'telegram',
          },
        })
      } catch (err) {
        log.error('Client media error', { error: err instanceof Error ? err.message : String(err) })
      }
    }
  })
}

// ─── Обработка ввода поля клиента менеджером ─────────────────────────────────

async function handleEditMessage(
  telegram: Telegram,
  userId: number,
  text: string,
): Promise<void> {
  const edit = editMode.get(userId)
  if (!edit) return

  editMode.delete(userId)
  const { clientId, field } = edit

  const value: string = text.trim()

  if (field === 'phone') {
    if (!/^\+?[0-9\s\-()]{7,20}$/.test(value)) {
      await telegram.sendMessage(userId, '❌ Неверный формат телефона. Пример: +79001234567')
      return
    }
  }

  if (field === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      await telegram.sendMessage(userId, '❌ Неверный формат email. Пример: user@example.com')
      return
    }
  }

  if (field === 'birthDate') {
    const parts = value.split('.')
    if (parts.length !== 3) {
      await telegram.sendMessage(userId, '❌ Неверный формат даты. Используйте ДД.ММ.ГГГГ')
      return
    }
    const [d, m, y] = parts.map(Number)
    const date = new Date(y, m - 1, d)
    if (isNaN(date.getTime())) {
      await telegram.sendMessage(userId, '❌ Неверная дата.')
      return
    }
    const encryptedDate = encryptDate(date, 'birthDate')
    await prisma.client.update({
      where: { id: clientId },
      data: { birthDate: encryptedDate },
    })
  } else {
    const encryptedValue = (field === 'phone' || field === 'email')
      ? encryptClientField(value, field)
      : value
    await prisma.client.update({
      where: { id: clientId },
      data: { [field]: encryptedValue },
    })
  }

  const fieldLabel: Record<EditField, string> = {
    fullName: 'ФИО',
    phone: 'Телефон',
    email: 'Email',
    birthDate: 'Дата рождения',
  }

  await telegram.sendMessage(userId, `✅ ${fieldLabel[field]} обновлено.`)

  // Отправить обновлённую карточку в топик клиента
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { segment: true },
  })
  if (client?.telegramTopicId) {
    const cardText = await buildClientCard(clientId)
    const segLabel = getSegmentLabel(client.segment)
    await sendToTopicWithMarkup(
      telegram,
      CRM_GROUP_ID,
      client.telegramTopicId,
      cardText,
      buildCardInlineKeyboard(clientId, segLabel).reply_markup,
    )
  }
}

// ─── Отправка и закрепление панели управления ─────────────────────────────────

async function sendAndPinControlPanel(
  telegram: Telegram,
  threadId: number,
  clientId: number,
): Promise<number | null> {
  try {
    const panelMsg = await telegram.sendMessage(CRM_GROUP_ID, '⚙️ Панель управления', {
      message_thread_id: threadId,
      reply_markup: buildControlPanelKeyboard(clientId).reply_markup,
    })
    const pinnedMessageId = panelMsg.message_id as number

    // Закрепляем сообщение в топике
    try {
      await telegram.pinChatMessage(CRM_GROUP_ID, pinnedMessageId, {
        disable_notification: true,
      })
    } catch (pinErr) {
      log.error('Pin message error', { error: pinErr instanceof Error ? pinErr.message : String(pinErr) })
    }

    return pinnedMessageId
  } catch (err) {
    log.error('Control panel send error', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

// ─── Создание топика форума для клиента ──────────────────────────────────────
// Возвращает message_thread_id нового топика.

async function createClientTopic(
  telegram: Telegram,
  clientId: number,
  name: string,
): Promise<number | null> {
  let threadId: number | null = null

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const topic = await telegram.createForumTopic(CRM_GROUP_ID, name)
      threadId = topic.message_thread_id
      break
    } catch (err) {
      log.error('CRM topic creation attempt failed', { attempt, error: err instanceof Error ? err.message : String(err) })
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000))
    }
  }

  if (!threadId) {
    log.error('CRM topic creation failed, using general chat')
    return null
  }

  await prisma.client.update({
    where: { id: clientId },
    data: { telegramTopicId: threadId, pinnedMessageId: null },
  })

  // Карточка клиента
  const cardText = await buildClientCard(clientId)
  await sendToTopic(telegram, CRM_GROUP_ID, threadId, cardText)

  // Inline панель управления — отправляется ОДИН РАЗ и закрепляется
  const pinnedMessageId = await sendAndPinControlPanel(telegram, threadId, clientId)
  if (pinnedMessageId) {
    await prisma.client.update({
      where: { id: clientId },
      data: { pinnedMessageId },
    })
  }

  return threadId
}

// ─── Обработка входящего сообщения от клиента ────────────────────────────────

async function handleClientMessage(
  telegram: Telegram,
  from: TgUser,
  text: string,
): Promise<void> {
  try {
    log.info('CRM client message', { fromId: from.id, textPreview: (text ?? '[media]').slice(0, 80) })
    const externalId = String(from.id)
    const name = getClientName(from)

    const defaultSeg = await prisma.segment.findFirst({ where: { isDefault: true } })

    let client = await prisma.client.findUnique({
      where: { source_externalId: { source: 'telegram', externalId } },
      include: { segment: true },
    })

    let isNewClient = false
    if (!client) {
      client = await prisma.client.create({
        data: { name, source: 'telegram', externalId, segmentId: defaultSeg?.id ?? null, telegramUsername: from.username ? `@${from.username}` : null },
        include: { segment: true },
      })
      isNewClient = true
    } else if (from.username && client.telegramUsername !== `@${from.username}`) {
      await prisma.client.update({
        where: { id: client.id },
        data: { telegramUsername: `@${from.username}` },
      })
    }

    // Приветственное сообщение для нового клиента
    if (isNewClient) {
      const webAppUrl = process.env.WEBAPP_URL
      try {
        const welcomeText = [
          'Привет! 👋 Добро пожаловать в Bender Shop!',
          '',
          '🛍 У нас можно купить технику по лучшим ценам — iPhone, MacBook, PlayStation, Dyson и многое другое.',
          '',
          '📍 Мы работаем:',
          '   Барклая 8, ТЦ Горбушка, Павильон 211/1',
          '   ⏰ Ежедневно с 11:00 до 20:00',
          '',
          '💬 Напишите что вас интересует — ответим быстро!',
          '🛒 Или откройте каталог по кнопке ниже 👇',
        ].join('\n')
        if (webAppUrl) {
          await telegram.sendMessage(from.id, welcomeText, {
            reply_markup: {
              inline_keyboard: [[{ text: '🛍 Открыть каталог', web_app: { url: webAppUrl } }]],
            },
          })
        } else {
          await telegram.sendMessage(from.id, welcomeText)
        }
      } catch { /* ignore: user may have blocked bot */ }
    }

    // Создать топик форума, если его ещё нет
    if (client.telegramTopicId == null) {
      const threadId = await createClientTopic(telegram, client.id, name)
      if (threadId) {
        await sendToTopic(telegram, CRM_GROUP_ID, threadId, `💬 ${name}: ${text}`)
      } else {
        await telegram.sendMessage(CRM_GROUP_ID, `💬 ${name}: ${text}`)
      }
    } else {
      // Топик уже существует — пересылаем сообщение; при ошибке пересоздаём
      try {
        await sendToTopic(telegram, CRM_GROUP_ID, client.telegramTopicId, `💬 ${name}: ${text}`)
      } catch (e: any) {
        if (e?.response?.description?.includes('message thread not found')) {
          log.warn('CRM topic not found, recreating', { topicId: client.telegramTopicId })
          await prisma.client.update({ where: { id: client.id }, data: { telegramTopicId: null } })
          const threadId = await createClientTopic(telegram, client.id, name)
          if (threadId) {
            await sendToTopic(telegram, CRM_GROUP_ID, threadId, `💬 ${name}: ${text}`)
          } else {
            await telegram.sendMessage(CRM_GROUP_ID, `💬 ${name}: ${text}`)
          }
        } else {
          throw e
        }
      }
    }

    const savedMessage = await prisma.message.create({
      data: { clientId: client.id, direction: 'in', text, source: 'telegram' },
    })

    // ── AI Sales Agent ────────────────────────────────────────────────────────
    const currentClient = await prisma.client.findUnique({ where: { id: client.id } })
    if (currentClient?.telegramTopicId) {
      const threadId = currentClient.telegramTopicId
      // Запускаем AI асинхронно, не блокируем ответ клиенту
      handleAIResponse(telegram, client.id, text, threadId).catch((err) => {
        log.error('AI response error', { error: err instanceof Error ? err.message : String(err) })
      })
    }
  } catch (e) {
    log.error('Client message handler error', { error: e instanceof Error ? e.message : String(e) })
  }
}

// ─── AI: обработка входящего сообщения ────────────────────────────────────────

/** Модерирует вывод AI: обрезает до 2000 символов, фильтрует утечки промпта, редактирует PII */
export function moderateAIOutput(text: string): string {
  const leakPatterns = [
    /system prompt/gi,
    /you are an ai/gi,
    /instructions:/gi,
    /\[system\]/gi,
  ]
  const lines = text.split('\n').filter((line) => {
    return !leakPatterns.some((re) => re.test(line))
  })
  let cleaned = lines.join('\n').trim()

  // Redact phone numbers
  cleaned = cleaned.replace(/(\+?[\d][\d\s\-()\u00d7]{6,14}[\d])/g, '[телефон]')
  // Redact emails
  cleaned = cleaned.replace(/[\w.+\-]+@[\w\-]+\.[\w.]+/g, '[email]')
  // Redact URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '[ссылка]')
  // Redact card numbers
  cleaned = cleaned.replace(/\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/g, '[номер карты]')
  cleaned = cleaned.replace(/\b\d{16}\b/g, '[номер карты]')

  return cleaned.length > 2000 ? cleaned.slice(0, 2000) : cleaned
}

async function processAIReservation(
  aiResponse: string,
  clientId: number,
): Promise<string> {
  const reserveMatch = aiResponse.match(/\[БРОНЬ:\s*(.+?)\]/)
  if (!reserveMatch) return aiResponse

  const requestedItem = reserveMatch[1].trim()
  let cleanResponse = aiResponse.replace(/\[БРОНЬ:\s*.+?\]/, '').trim()

  try {
    const products = await prisma.product.findMany({
      where: { isAvailable: true },
      include: { variants: { where: { quantity: { gt: 0 } } } },
    })

    const found = products.find(p =>
      requestedItem.toLowerCase().includes(p.name.toLowerCase()) ||
      p.name.toLowerCase().includes(requestedItem.toLowerCase())
    )

    if (found && found.variants.length > 0) {
      const variant = found.variants[0]

      await prisma.$transaction(async (tx) => {
        await tx.reservation.create({
          data: {
            clientId,
            productId: found.id,
            variantId: variant.id,
            quantity: 1,
            status: 'active',
            comment: `Ночной бот Бендер (${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })})`,
          },
        })
        await tx.product.update({
          where: { id: found.id },
          data: { reserved: { increment: 1 } },
        })
      })

      log.info('AI night reserve created', { productName: found.name, variantId: variant.id, clientId })

      await prisma.task.create({
        data: {
          clientId,
          action: 'night_reserve',
          payload: {
            productName: found.name,
            variantId: variant.id,
            variantSku: variant.sku,
            price: Number(variant.price),
            reservedAt: new Date().toISOString(),
          },
          scheduledAt: new Date(),
          status: 'done',
        },
      })
    } else {
      await prisma.task.create({
        data: {
          clientId,
          action: 'night_request',
          payload: {
            requestedItem,
            requestedAt: new Date().toISOString(),
          },
          scheduledAt: new Date(),
          status: 'done',
        },
      })
      log.info('AI night reserve product not found', { requestedItem, clientId })
    }
  } catch (err) {
    log.error('AI night reserve error', { error: err instanceof Error ? err.message : String(err) })
  }

  return cleanResponse
}

async function handleAIResponse(
  telegram: Telegram,
  clientId: number,
  userMessage: string,
  threadId: number,
): Promise<void> {
  const mode = await getAIMode()
  if (mode === 'off') return

  // Подсказка с ценами поставщиков в топик (только менеджеру)
  try {
    const { findBestPrice } = await import('../webhooks/supplier')
    const bestPrices = await findBestPrice(userMessage)
    if (bestPrices.length > 0) {
      const priceHint = [
        '💰 Цены поставщиков:',
        ...bestPrices.slice(0, 3).map((p, i) => {
          const icon = i === 0 ? '⭐' : '  '
          return `${icon} ${p.supplier}: ${p.model}${p.storage ? ' ' + p.storage : ''} — ${p.price.toLocaleString('ru-RU')}₽ → ${p.finalPrice.toLocaleString('ru-RU')}₽ (+${p.markup}%)`
        }),
      ].join('\n')
      await sendToTopic(telegram, CRM_GROUP_ID, threadId, priceHint)
    }
  } catch (err) { log.error('CRM supplier price lookup error', { error: err instanceof Error ? err.message : String(err) }) }

  let aiText: string
  try {
    aiText = await generateAIResponse(clientId, userMessage)
    incrementStat('total')
  } catch (err) {
    log.error('AI response generation error', { error: err instanceof Error ? err.message : String(err) })
    return
  }

  if (mode === 'auto') {
    // Обработка ночных броней (парсинг [БРОНЬ: ...] тега)
    const mskNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
    const mskHour = mskNow.getHours()
    const isNight = mskHour < 11 || mskHour >= 20
    if (isNight) {
      aiText = await processAIReservation(aiText, clientId)
    }
    // Модерируем ответ перед отправкой клиенту
    const safeAiText = moderateAIOutput(aiText)
    // Отправляем клиенту автоматически
    const client = await prisma.client.findUnique({ where: { id: clientId } })
    if (client?.source === 'telegram' && client.externalId) {
      await telegram.sendMessage(client.externalId, safeAiText)
    }
    await prisma.message.create({
      data: { clientId, direction: 'out', text: safeAiText, source: 'telegram' },
    })
    incrementStat('approved')
    // Уведомляем менеджера в топике
    await sendToTopic(telegram, CRM_GROUP_ID, threadId, `🤖 AI ответил: ${safeAiText}`)
    return
  }

  if (mode === 'semi') {
    const safeAiText = moderateAIOutput(aiText)
    // Сохраняем предложение и показываем менеджеру с кнопками
    const suggestionId = storeSuggestion(clientId, safeAiText, threadId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await telegram.sendMessage(CRM_GROUP_ID, `🤖 Предложение AI:\n\n${safeAiText}`, {
      message_thread_id: threadId,
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Отправить', `ai:send:${suggestionId}`),
          Markup.button.callback('✏️ Редактировать', `ai:edit:${suggestionId}`),
          Markup.button.callback('❌ Пропустить', `ai:skip:${suggestionId}`),
        ],
      ]).reply_markup,
    })
    return
  }

  if (mode === 'manual') {
    // Только подсказка менеджеру
    await sendToTopic(telegram, CRM_GROUP_ID, threadId, `💡 AI подсказка: ${moderateAIOutput(aiText)}`)
    return
  }
}

// ─── Обработка ответа менеджера в топике ─────────────────────────────────────

async function handleManagerReply(
  ctx: Context,
  threadId: number,
  text: string,
  managerId: number,
  messageId?: number,
): Promise<void> {
  // ── /card — показать карточку клиента с inline keyboard ───────────────────
  if (text === '/card') {
    const client = await prisma.client.findFirst({
      where: { telegramTopicId: threadId },
      include: { segment: true },
    })
    if (client) {
      const cardText = await buildClientCard(client.id)
      const segLabel = getSegmentLabel(client.segment)
      await sendToTopicWithMarkup(
        ctx.telegram,
        CRM_GROUP_ID,
        threadId,
        cardText,
        buildCardInlineKeyboard(client.id, segLabel).reply_markup,
      )
      // Удаляем команду из топика
      if (messageId) {
        try { await ctx.telegram.deleteMessage(CRM_GROUP_ID, messageId) } catch { /* ignore: message/markup may already be deleted */ }
      }
    }
    return
  }

  // ── Режим заметки ─────────────────────────────────────────────────────────
  if (noteMode.has(threadId)) {
    const clientId = noteMode.get(threadId)
    noteMode.delete(threadId)
    if (clientId == null) return
    await prisma.client.update({ where: { id: clientId }, data: { notes: text } })
    await sendToTopic(ctx.telegram, CRM_GROUP_ID, threadId, '✅ Заметка сохранена')
    return
  }

  // ── Режим редактирования поля (менеджер вводит значение в топике) ─────────
  if (editMode.has(managerId)) {
    await handleEditMessage(ctx.telegram, managerId, text)
    return
  }

  // ── Обычный ответ — пересылаем клиенту ───────────────────────────────────
  log.info('CRM manager reply', { managerId, threadId, textPreview: (text ?? '[media]').slice(0, 80) })
  const client = await prisma.client.findFirst({ where: { telegramTopicId: threadId } })
  if (!client) return

  if (client.source === 'telegram' && client.externalId) {
    await ctx.telegram.sendMessage(client.externalId, text)
  } else if (client.source === 'avito' && client.externalId) {
    try {
      const { sendAvitoMessage } = await import('../lib/avito')
      // externalId = "buyerId:chatId"
      const chatId = client.externalId.split(':')[1]
      if (chatId) {
        await sendAvitoMessage(chatId, text)
      }
    } catch (err) {
      log.error('CRM Avito reply error', { error: err instanceof Error ? err.message : String(err) })
      await sendToTopic(ctx.telegram, CRM_GROUP_ID, threadId, `⚠️ Не удалось отправить в Avito: ${err instanceof Error ? err.message : err}`)
    }
  }

  await prisma.message.create({
    data: { clientId: client.id, direction: 'out', text, source: client.source },
  })
}

// ─── Хелперы ─────────────────────────────────────────────────────────────────

// sendToTopic and sendToTopicWithMarkup imported from lib/telegram-helpers.ts

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
  const { orderId, payment } = orderData
  const externalId = String(from.id)
  const name = getClientName(from)

  // Fetch server-verified prices from DB — never trust client-supplied items/total
  if (!orderId || orderId <= 0) {
    safeLog('[handleWebAppOrder] Rejected order with missing/zero orderId', { userId: from.id })
    return
  }

  const dbOrder = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } })
  if (!dbOrder) {
    safeLog('[handleWebAppOrder] orderId not found in DB', { orderId, userId: from.id })
    return
  }

  const verifiedItems = dbOrder.items
    .map((i) => ({ name: i.productName, price: String(i.priceAtPurchase), qty: i.quantity }))
  const verifiedTotal = Number(dbOrder.totalAmount)

  const PAYMENT_LABEL: Record<string, string> = {
    cash: '💵 Наличные',
    transfer: '📲 Перевод',
    card: '💳 Карта (+14%)',
  }

  const defaultSeg = await prisma.segment.findFirst({ where: { isDefault: true } })

  let client = await prisma.client.findUnique({
    where: { source_externalId: { source: 'telegram', externalId } },
    include: { segment: true },
  })

  if (!client) {
    client = await prisma.client.create({
      data: { name, source: 'telegram', externalId, segmentId: defaultSeg?.id ?? null, telegramUsername: from.username ? `@${from.username}` : null },
      include: { segment: true },
    })
  }

  if (orderId > 0) {
    await prisma.order.update({
      where: { id: orderId },
      data: { clientId: client.id },
    }).catch((err) => log.error('Webhook order update error', { error: err instanceof Error ? err.message : String(err) }))

    // Обновить статистику клиента
    await prisma.client.update({
      where: { id: client.id },
      data: {
        totalPurchases: { increment: 1 },
        totalRevenue: { increment: verifiedTotal },
        lastPurchaseDate: new Date(),
      },
    }).catch((err) => log.error('Webhook client stats update error', { error: err instanceof Error ? err.message : String(err) }))
  }

  if (client.telegramTopicId == null) {
    await createClientTopic(telegram, client.id, name)
    // Перечитываем клиента, чтобы получить актуальный telegramTopicId
    const refreshed = await prisma.client.findUnique({
      where: { id: client.id },
      include: { segment: true },
    })
    if (!refreshed) {
      log.error('Webhook client not found after topic creation', { clientId: client.id })
      return
    }
    client = refreshed
  }

  const itemLines = verifiedItems
    .map((i) => `• ${i.name} × ${i.qty} — ${fmtPrice(Number(i.price) * i.qty)} ₽`)
    .join('\n')
  const orderRef = orderId > 0 ? ` #${orderId}` : ''
  const notification = [
    `🛒 Новый заказ${orderRef} из магазина`,
    `👤 ${name}`,
    '',
    itemLines,
    '',
    `💰 Итого: ${fmtPrice(verifiedTotal)} ₽`,
    `💳 Оплата: ${PAYMENT_LABEL[payment] ?? payment}`,
  ].join('\n')

  if (client.telegramTopicId) {
    await sendToTopic(telegram, CRM_GROUP_ID, client.telegramTopicId, notification)
  } else {
    await telegram.sendMessage(CRM_GROUP_ID, notification)
  }

  await prisma.message.create({
    data: { clientId: client.id, direction: 'in', text: notification, source: 'shop' },
  })

  const itemCount = verifiedItems.reduce((s, i) => s + i.qty, 0)
  await telegram.sendMessage(
    externalId,
    `✅ Заказ принят!\n\n${itemCount} поз. на ${fmtPrice(verifiedTotal)} ₽\nОплата: ${PAYMENT_LABEL[payment] ?? payment}\n\nОжидайте — скоро свяжемся с вами 👋`,
  )
}
