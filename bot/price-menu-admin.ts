import type { Context, Telegraf } from 'telegraf'
import type { InlineKeyboardButton } from 'telegraf/types'
import { getPriceMenuStore, type PriceMenuPage } from './price-menu'
import type { PriceMenuStore } from './price-menu-store'

type Input = { action: 'add' | 'title' | 'text'; id: string; revision: number; prompt: number; expires: number }

// Same explicit administrators as the existing legacy bot management panel.
function canEdit(ctx: Context): boolean {
  return ctx.chat?.type === 'private' && !!ctx.from
    && (process.env.ADMIN_IDS ?? '').split(',').map(id => id.trim()).includes(String(ctx.from.id))
}

function editor(store: PriceMenuStore, requestedId: string): PriceMenuPage {
  const { nodes } = store.snapshot()
  const id = Object.prototype.hasOwnProperty.call(nodes, requestedId) ? requestedId : 'root'
  const node = nodes[id]!
  const rows: InlineKeyboardButton[][] = (node.children ?? []).map(child => [
    { text: nodes[child]!.title, callback_data: `pm:view:${child}` },
  ])
  rows.push(
    [{ text: '➕ Добавить кнопку', callback_data: `pm:add:${id}` }],
    [{ text: '✏️ Название', callback_data: `pm:title:${id}` }, { text: '📝 Текст прайса', callback_data: `pm:text:${id}` }],
    [{ text: '👁 Посмотреть прайс', callback_data: `price:quick:${id}` }],
  )
  if (id !== 'root') rows.push([{ text: '🗑 Удалить кнопку', callback_data: `pm:confirm:${id}` }])
  rows.push([{ text: 'Назад', callback_data: id === 'root' ? 'price:quick:home' : `pm:view:${node.parent}` }])
  return {
    text: `Управление прайсом · ${node.title}\n\n${node.text ?? 'Текст пока не заполнен.'}\n\nВыберите подраздел или действие. Изменения сохраняются после вашего ответа.`,
    reply_markup: { inline_keyboard: rows },
  }
}

export function registerPriceMenuAdmin(bot: Telegraf, resolveStore: () => PriceMenuStore = getPriceMenuStore): void {
  const inputs = new Map<number, Input>()
  bot.command('price_menu', async ctx => {
    if (!canEdit(ctx)) { await ctx.reply('Управление прайсом доступно администратору.'); return }
    inputs.delete(ctx.from.id)
    const page = editor(resolveStore(), 'root')
    await ctx.reply(page.text, { reply_markup: page.reply_markup })
  })
  bot.on('callback_query', async (ctx, next) => {
    const query = ctx.callbackQuery
    if (!('data' in query) || !query.data.startsWith('pm:')) return next()
    const msg = query.message
    if (!canEdit(ctx) || !msg || msg.date === 0 || !('text' in msg)
      || msg.from?.id !== ctx.botInfo.id || 'forward_origin' in msg) {
      await ctx.answerCbQuery('Управление доступно администратору в личном чате.'); return
    }
    const match = /^pm:(view|add|title|text|confirm|delete|cancel):([a-z0-9_]+)(?::(\d+))?$/.exec(query.data)
    await ctx.answerCbQuery()
    if (!match) return
    const action = match[1]!, id = match[2]!
    inputs.delete(ctx.from.id)
    const store = resolveStore()
    const data = store.snapshot()
    const node = Object.prototype.hasOwnProperty.call(data.nodes, id) ? data.nodes[id] : undefined
    if (!node) {
      const page = editor(store, 'root')
      await ctx.editMessageText(page.text, { reply_markup: page.reply_markup }); return
    }
    let page: PriceMenuPage
    if (action === 'add' || action === 'title' || action === 'text') {
      const prompt = action === 'add' ? 'Ответьте на это сообщение названием новой кнопки (до 64 символов).'
        : action === 'title' ? 'Ответьте на это сообщение новым названием кнопки (до 64 символов).'
          : 'Ответьте на это сообщение текстом прайса (до 3500 символов). Переносы строк и эмодзи сохранятся. Чтобы очистить текст, отправьте «-».'
      const sent = await ctx.reply(`${node.title}\n\n${prompt}\nОтмена: /cancel`, {
        reply_markup: { force_reply: true, selective: true },
      })
      inputs.set(ctx.from.id, { action, id, revision: data.revision, prompt: sent.message_id, expires: Date.now() + 15 * 60_000 })
      return
    } else if (action === 'confirm' && id !== 'root') {
      page = { text: `Удалить кнопку «${node.title}»?\n\nБудут удалены также все её подразделы и тексты прайса.`, reply_markup: { inline_keyboard: [
        [{ text: 'Да, удалить', callback_data: `pm:delete:${id}:${data.revision}` }],
        [{ text: 'Отмена', callback_data: `pm:cancel:${id}` }],
      ] } }
    } else if (action === 'delete') {
      if (match[3] === undefined) return
      try { page = editor(store, store.change({ action: 'delete', id }, Number(match[3]))) }
      catch (error) { await ctx.reply(error instanceof Error ? error.message : 'Не удалось сохранить прайс.'); return }
    } else page = editor(store, id)
    try { await ctx.editMessageText(page.text, { reply_markup: page.reply_markup }) }
    catch (error) {
      const r = (error as { response?: { error_code?: number; description?: string } }).response
      if (r?.error_code !== 400 || !r.description?.startsWith('Bad Request: message is not modified')) throw error
    }
  })
  bot.on('text', async (ctx, next) => {
    const input = inputs.get(ctx.from.id)
    if (!input) return next()
    if (!canEdit(ctx)) { inputs.delete(ctx.from.id); return next() }
    const text = ctx.message.text
    if (text.startsWith('/')) {
      inputs.delete(ctx.from.id)
      if (/^\/cancel(?:@\w+)?(?:\s|$)/.test(text)) { await ctx.reply('Изменение отменено. /price_menu — управление прайсом.'); return }
      return next()
    }
    if (ctx.message.reply_to_message?.message_id !== input.prompt) return next()
    inputs.delete(ctx.from.id)
    if (input.expires < Date.now()) { await ctx.reply('Время ввода истекло. Откройте /price_menu заново.'); return }
    try {
      const store = resolveStore()
      const id = store.change({ action: input.action, id: input.id, value: text }, input.revision)
      const page = editor(store, id)
      await ctx.reply(`Сохранено.\n\n${page.text}`, { reply_markup: page.reply_markup })
    } catch (error) {
      await ctx.reply(error instanceof Error ? error.message : 'Не удалось сохранить прайс. Откройте /price_menu и повторите.')
    }
  })
}
