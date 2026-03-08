/**
 * bot/admin/segments.ts
 *
 * Управление сегментами клиентов:
 *   • Список сегментов с кол-вом клиентов
 *   • Переименование (текстовый флоу)
 *   • Удаление (с переводом клиентов в дефолтный сегмент)
 *   • Добавление (название → выбор цвета)
 *
 * Подключение в bot/index.ts:
 *   setupSegmentHandlers(bot)             — регистрирует action-обработчики
 *   handleSegmentMessage(ctx, uid, txt)   — вызывать из перехватчика текста
 *   segmentsState                         — проверять/сбрасывать активный флоу
 */

import { Context, Markup, Telegraf } from 'telegraf'
import { prisma } from '../../lib/prisma'

// ─── Типы состояния ───────────────────────────────────────────────────────────

type SegmentFlowState =
  | { flow: 'rename'; segmentId: number }
  | { flow: 'add_name' }
  | { flow: 'add_color'; name: string }

export const segmentsState = new Map<number, SegmentFlowState>()

const COLORS = ['🔵', '🟡', '🟢', '🔴', '🟣', '⚪']

// ─── Отображение списка сегментов ─────────────────────────────────────────────

export async function showSegments(ctx: Context): Promise<void> {
  const segments = await prisma.segment.findMany({
    orderBy: { id: 'asc' },
    include: { _count: { select: { clients: true } } },
  })

  if (segments.length === 0) {
    await ctx.reply(
      '📂 Сегменты\n\nСписок пуст.',
      Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить сегмент', 'segs:add')],
        [Markup.button.callback('🏠 Главное меню', 'back:main')],
      ]),
    )
    return
  }

  const lines = segments
    .map(
      (s) =>
        `${s.color} ${s.name} — ${s._count.clients} клиент.${s.isDefault ? ' (дефолт)' : ''}`,
    )
    .join('\n')

  // Каждый сегмент → строка [✏️ Название] [🗑️]
  const rows = segments.map((s) => [
    Markup.button.callback(`✏️ ${s.color} ${s.name}`, `segs:rename:${s.id}`),
    Markup.button.callback('🗑️', `segs:del_confirm:${s.id}`),
  ])

  await ctx.reply(
    `📂 Сегменты:\n\n${lines}`,
    Markup.inlineKeyboard([
      ...rows,
      [Markup.button.callback('➕ Добавить сегмент', 'segs:add')],
      [Markup.button.callback('🏠 Главное меню', 'back:main')],
    ]),
  )
}

// ─── Регистрация обработчиков ─────────────────────────────────────────────────

export function setupSegmentHandlers(bot: Telegraf): void {
  // Список сегментов (inline-кнопка из аналитики)
  bot.action('segs:list', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    await showSegments(ctx)
  })

  // Начать переименование
  bot.action(/^segs:rename:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const segmentId = parseInt(ctx.match[1], 10)
    const seg = await prisma.segment.findUnique({ where: { id: segmentId } })
    if (!seg) return ctx.reply('Сегмент не найден.')

    segmentsState.set(userId, { flow: 'rename', segmentId })
    await ctx.reply(`Введите новое название для "${seg.color} ${seg.name}":`)
  })

  // Подтверждение удаления
  bot.action(/^segs:del_confirm:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const segmentId = parseInt(ctx.match[1], 10)

    const [seg, defaultSeg] = await Promise.all([
      prisma.segment.findUnique({
        where: { id: segmentId },
        include: { _count: { select: { clients: true } } },
      }),
      prisma.segment.findFirst({ where: { isDefault: true } }),
    ])

    if (!seg) return ctx.reply('Сегмент не найден.')

    if (seg.isDefault) {
      return ctx.reply('❌ Нельзя удалить дефолтный сегмент.')
    }

    const count = seg._count.clients
    const defLabel = defaultSeg ? `"${defaultSeg.color} ${defaultSeg.name}"` : 'дефолтный'
    const warn =
      count > 0
        ? `${count} клиент(ов) будут переведены в ${defLabel}`
        : 'Клиентов в сегменте нет.'

    await ctx.reply(
      `Удалить сегмент "${seg.color} ${seg.name}"?\n${warn}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Подтвердить', `segs:del:${segmentId}`),
          Markup.button.callback('❌ Отмена', 'segs:list'),
        ],
      ]),
    )
  })

  // Подтверждённое удаление
  bot.action(/^segs:del:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const segmentId = parseInt(ctx.match[1], 10)

    const seg = await prisma.segment.findUnique({ where: { id: segmentId } })
    if (!seg) return ctx.reply('Сегмент не найден.')
    if (seg.isDefault) return ctx.reply('❌ Нельзя удалить дефолтный сегмент.')

    const defaultSeg = await prisma.segment.findFirst({ where: { isDefault: true } })

    // Клиентов переводим в дефолтный (или null если дефолтного нет)
    await prisma.client.updateMany({
      where: { segmentId },
      data: { segmentId: defaultSeg?.id ?? null },
    })
    await prisma.segment.delete({ where: { id: segmentId } })

    await ctx.reply(`✅ Сегмент "${seg.color} ${seg.name}" удалён.`)
    await showSegments(ctx)
  })

  // Начать добавление
  bot.action('segs:add', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    segmentsState.set(userId, { flow: 'add_name' })
    await ctx.reply('Введите название нового сегмента:')
  })

  // Выбор цвета (вызывается из handleSegmentMessage после ввода названия)
  bot.action(/^segs:color:(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const state = segmentsState.get(userId)

    if (!state || state.flow !== 'add_color') {
      return ctx.reply('Сессия истекла. Начните заново через меню Сегменты.')
    }

    const color = ctx.match[1]
    const { name } = state

    try {
      await prisma.segment.create({ data: { name, color } })
      segmentsState.delete(userId)
      await ctx.reply(`✅ Сегмент "${color} ${name}" создан.`)
      await showSegments(ctx)
    } catch {
      await ctx.reply('Сегмент с таким названием уже существует. Введите другое:')
      segmentsState.set(userId, { flow: 'add_name' })
    }
  })
}

// ─── Обработчик текстового ввода ──────────────────────────────────────────────

export async function handleSegmentMessage(
  ctx: Context,
  userId: number,
  text: string,
): Promise<boolean> {
  const state = segmentsState.get(userId)
  if (!state) return false

  // Переименование: получили новое название
  if (state.flow === 'rename') {
    const { segmentId } = state
    segmentsState.delete(userId)

    try {
      const updated = await prisma.segment.update({
        where: { id: segmentId },
        data: { name: text.trim() },
      })
      await ctx.reply(`✅ Сегмент переименован: "${updated.color} ${updated.name}".`)
      await showSegments(ctx)
    } catch {
      await ctx.reply('Сегмент с таким названием уже существует. Попробуйте другое:')
      segmentsState.set(userId, { flow: 'rename', segmentId })
    }
    return true
  }

  // Добавление шаг 1: получили название → предлагаем выбрать цвет
  if (state.flow === 'add_name') {
    const name = text.trim()
    segmentsState.set(userId, { flow: 'add_color', name })

    const colorButtons = COLORS.map((c) => Markup.button.callback(c, `segs:color:${c}`))
    // По 3 кнопки в ряд
    const rows: ReturnType<typeof Markup.button.callback>[][] = []
    for (let i = 0; i < colorButtons.length; i += 3) {
      rows.push(colorButtons.slice(i, i + 3))
    }

    await ctx.reply(
      `Название: "${name}"\nВыберите цвет сегмента:`,
      Markup.inlineKeyboard(rows),
    )
    return true
  }

  return false
}
