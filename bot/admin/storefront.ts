/**
 * bot/admin/storefront.ts
 *
 * Управление витриной: бегущая строка + hero-баннеры.
 *
 * Подключение в bot/index.ts:
 *   setupStorefrontHandlers(bot)
 *   handleStorefrontMessage(ctx, uid, text)
 *   handleStorefrontPhoto(ctx, uid)   — вызывать из перехватчика фото
 *   storefrontState                   — проверять наличие активного флоу
 */

import { Context, Markup, Telegraf } from 'telegraf'
import { prisma } from '../../lib/prisma'
import { getApiKeyValue, setApiKeyValue } from '../../lib/api-key-store'
import { getUserId } from '../helpers'
import { logSecurityEvent } from '../../lib/security-log'

// ─── Типы состояния ───────────────────────────────────────────────────────────

type MarqueeFlow = { flow: 'marquee'; step: 'text' }

type BannerAddFlow =
  | { flow: 'banner_add'; step: 'photo' }
  | { flow: 'banner_add'; step: 'title'; imageFile: string }
  | { flow: 'banner_add'; step: 'subtitle'; imageFile: string; title: string | null }
  | { flow: 'banner_add'; step: 'order'; imageFile: string; title: string | null; subtitle: string | null }

export type StorefrontFlowState = MarqueeFlow | BannerAddFlow

export const storefrontState = new Map<number, StorefrontFlowState>()

// ─── Главный экран Витрины ────────────────────────────────────────────────────

export async function showStorefront(ctx: Context): Promise<void> {
  const bannerCount = await prisma.heroBanner.count({ where: { isActive: true } })
  const marqueeValue = await getApiKeyValue('setting_marquee')
  const marqueeText = marqueeValue ? `«${marqueeValue.slice(0, 40)}${marqueeValue.length > 40 ? '…' : ''}»` : '—'

  await ctx.reply(
    [
      '🖼️ Витрина',
      '',
      `📢 Бегущая строка: ${marqueeText}`,
      `🎠 Активных баннеров: ${bannerCount}`,
    ].join('\n'),
    Markup.inlineKeyboard([
      [Markup.button.callback('📢 Бегущая строка', 'sf:marquee')],
      [Markup.button.callback('🎠 Hero баннеры', 'sf:banners')],
      [Markup.button.callback('🔄 Сбросить кэш сайта', 'sf:cache_reset')],
      [Markup.button.callback('🏠 Главное меню', 'back:main')],
    ]),
  )
}

// ─── Экран бегущей строки ─────────────────────────────────────────────────────

async function showMarquee(ctx: Context): Promise<void> {
  const current = (await getApiKeyValue('setting_marquee')) ?? '—'

  await ctx.reply(
    `📢 Бегущая строка\n\nТекущий текст:\n${current}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Изменить', 'sf:marquee_edit')],
      [Markup.button.callback('← Назад', 'sf:back')],
    ]),
  )
}

// ─── Экран баннеров ───────────────────────────────────────────────────────────

async function showBanners(ctx: Context): Promise<void> {
  const banners = await prisma.heroBanner.findMany({ orderBy: { order: 'asc' } })

  if (banners.length === 0) {
    await ctx.reply(
      '🎠 Hero баннеры\n\nПока нет ни одного баннера.',
      Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить', 'sf:banner_add')],
        [Markup.button.callback('← Назад', 'sf:back')],
      ]),
    )
    return
  }

  const lines = banners.map((b, i) => {
    const status = b.isActive ? '✅' : '❌'
    const title = b.title ?? '(без заголовка)'
    return `${i + 1}. ${status} [${b.order}] ${title}`
  })

  const bannerButtons = banners.flatMap((b) => [
    [
      Markup.button.callback(`▲ #${b.id}`, `sf:banner_up:${b.id}`),
      Markup.button.callback(`▼ #${b.id}`, `sf:banner_down:${b.id}`),
      Markup.button.callback(`🗑️ #${b.id}`, `sf:banner_del:${b.id}`),
    ],
  ])

  await ctx.reply(
    `🎠 Hero баннеры\n\n${lines.join('\n')}`,
    Markup.inlineKeyboard([
      ...bannerButtons,
      [Markup.button.callback('➕ Добавить', 'sf:banner_add')],
      [Markup.button.callback('← Назад', 'sf:back')],
    ]),
  )
}

// ─── Регистрация обработчиков ─────────────────────────────────────────────────

export function setupStorefrontHandlers(bot: Telegraf): void {
  // Главный экран
  bot.action('sf:back', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    await showStorefront(ctx)
  })

  // Бегущая строка
  bot.action('sf:marquee', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    await showMarquee(ctx)
  })

  bot.action('sf:marquee_edit', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    storefrontState.set(userId, { flow: 'marquee', step: 'text' })
    await ctx.reply(
      'Введите новый текст бегущей строки:',
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  // Сброс кэша
  bot.action('sf:cache_reset', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const version = Date.now().toString()
    await setApiKeyValue('cache_version', version)
    await ctx.reply(`✅ Кэш сайта сброшен. Сайт обновится в течение 30 секунд.`)
    await showStorefront(ctx)
  })

  // Баннеры
  bot.action('sf:banners', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    await showBanners(ctx)
  })

  bot.action('sf:banner_add', async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const userId = getUserId(ctx)
    storefrontState.set(userId, { flow: 'banner_add', step: 'photo' })
    await ctx.reply(
      '🎠 Добавление баннера\n\nОтправьте фото баннера:',
      Markup.keyboard([['❌ Отмена']]).resize(),
    )
  })

  // Переместить вверх (уменьшить order)
  bot.action(/^sf:banner_up:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const id = Number((ctx.match as RegExpMatchArray)[1])
    const banner = await prisma.heroBanner.findUnique({ where: { id } })
    if (banner && banner.order > 0) {
      await prisma.heroBanner.update({ where: { id }, data: { order: banner.order - 1 } })
      try { await logSecurityEvent('banner_reordered', { adminId: getUserId(ctx) }, getUserId(ctx)) } catch { /* ignore */ }
    }
    await showBanners(ctx)
  })

  // Переместить вниз (увеличить order)
  bot.action(/^sf:banner_down:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const id = Number((ctx.match as RegExpMatchArray)[1])
    const banner = await prisma.heroBanner.findUnique({ where: { id } })
    if (banner) {
      await prisma.heroBanner.update({ where: { id }, data: { order: banner.order + 1 } })
      try { await logSecurityEvent('banner_reordered', { adminId: getUserId(ctx) }, getUserId(ctx)) } catch { /* ignore */ }
    }
    await showBanners(ctx)
  })

  // Удалить баннер
  bot.action(/^sf:banner_del:(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery() } catch { /* ignore: answerCbQuery may fail if query expired */ }
    const id = Number((ctx.match as RegExpMatchArray)[1])
    await prisma.heroBanner.delete({ where: { id } })
    try { await logSecurityEvent('banner_deleted', { bannerId: id, adminId: getUserId(ctx) }, getUserId(ctx)) } catch { /* ignore */ }
    await ctx.reply(`🗑️ Баннер #${id} удалён.`)
    await showBanners(ctx)
  })
}

// ─── Обработка текстовых сообщений флоу ──────────────────────────────────────

export async function handleStorefrontMessage(
  ctx: Context & { message: { text: string } },
  userId: number,
  text: string,
): Promise<boolean> {
  const state = storefrontState.get(userId)
  if (!state) return false

  if (text === '❌ Отмена') {
    storefrontState.delete(userId)
    await ctx.reply('Отменено.', Markup.removeKeyboard())
    await showStorefront(ctx)
    return true
  }

  // ── Бегущая строка ────────────────────────────────────────────────────────
  if (state.flow === 'marquee' && state.step === 'text') {
    storefrontState.delete(userId)
    await setApiKeyValue('setting_marquee', text)
    try { await logSecurityEvent('storefront_updated', { field: 'marquee', adminId: userId }, userId) } catch { /* ignore */ }
    await ctx.reply('✅ Бегущая строка обновлена.', Markup.removeKeyboard())
    await showMarquee(ctx)
    return true
  }

  // ── Добавление баннера: шаг title ─────────────────────────────────────────
  if (state.flow === 'banner_add' && state.step === 'title') {
    const title = text === '—' ? null : text
    storefrontState.set(userId, {
      flow: 'banner_add',
      step: 'subtitle',
      imageFile: state.imageFile,
      title,
    })
    await ctx.reply(
      'Введите подзаголовок (или «—» чтобы пропустить):',
      Markup.keyboard([['—'], ['❌ Отмена']]).resize(),
    )
    return true
  }

  // ── Добавление баннера: шаг subtitle ─────────────────────────────────────
  if (state.flow === 'banner_add' && state.step === 'subtitle') {
    const subtitle = text === '—' ? null : text
    storefrontState.set(userId, {
      flow: 'banner_add',
      step: 'order',
      imageFile: state.imageFile,
      title: state.title,
      subtitle,
    })
    await ctx.reply(
      'Введите порядковый номер (например 0, 1, 2…):',
      Markup.keyboard([['0'], ['❌ Отмена']]).resize(),
    )
    return true
  }

  // ── Добавление баннера: шаг order ────────────────────────────────────────
  if (state.flow === 'banner_add' && state.step === 'order') {
    const order = parseInt(text, 10)
    if (isNaN(order)) {
      await ctx.reply('Введите число (например 0, 1, 2).')
      return true
    }
    storefrontState.delete(userId)
    const banner = await prisma.heroBanner.create({
      data: {
        imageFile: state.imageFile,
        title: state.title,
        subtitle: state.subtitle,
        order,
      },
    })
    try { await logSecurityEvent('banner_added', { bannerId: banner.id, adminId: userId }, userId) } catch { /* ignore */ }
    await ctx.reply('✅ Баннер добавлен!', Markup.removeKeyboard())
    await showBanners(ctx)
    return true
  }

  return false
}

// ─── Обработка фото ───────────────────────────────────────────────────────────

export async function handleStorefrontPhoto(
  ctx: Context & { message: { photo: Array<{ file_id: string }> } },
  userId: number,
): Promise<boolean> {
  const state = storefrontState.get(userId)
  if (!state || state.flow !== 'banner_add' || state.step !== 'photo') return false

  const photo = ctx.message.photo
  const fileId = photo[photo.length - 1].file_id

  storefrontState.set(userId, {
    flow: 'banner_add',
    step: 'title',
    imageFile: fileId,
  })

  await ctx.reply(
    'Фото получено! Введите заголовок (или «—» чтобы пропустить):',
    Markup.keyboard([['—'], ['❌ Отмена']]).resize(),
  )
  return true
}
