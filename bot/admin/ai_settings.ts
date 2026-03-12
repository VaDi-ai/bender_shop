/**
 * bot/admin/ai_settings.ts
 *
 * Панель управления AI Sales Agent + управление API ключами.
 * Подключение в bot/index.ts:
 *   setupAISettingsHandlers(bot)
 *   setupApiKeysHandlers(bot)
 *   bot.hears('🤖 AI Агент', ...) → showAISettings(ctx)
 *   bot.hears('🔑 API Ключи', ...) → showApiKeysMenu(ctx)
 */

import OpenAI from 'openai'
import { Context, Markup, Telegraf } from 'telegraf'
import { prisma } from '../../lib/prisma'
import { humanizeApiError } from '../../lib/api-errors'
import { getAIMode, setAIMode, getAIStats, reinitClient as reinitAgentClient, type AIMode } from '../ai/agent'
import { reinitClient as reinitParserClient } from '../../lib/ai-parser'
import type { SecurityEvent } from '../../lib/security-log'

// ─── Лейблы режимов ───────────────────────────────────────────────────────────

const MODE_LABELS: Record<AIMode, string> = {
  off:    '🔴 Выключен',
  manual: '🟡 Подсказки',
  semi:   '🟠 Полуавтомат',
  auto:   '🟢 Автомат',
}

const MODE_DESCRIPTIONS: Record<AIMode, string> = {
  off:    'AI не активен',
  manual: 'AI пишет подсказки менеджеру, клиент не видит',
  semi:   'AI предлагает ответ, менеджер одобряет или редактирует',
  auto:   'AI отвечает клиенту автоматически без участия менеджера',
}

// ─── Состояние флоу API ключей ────────────────────────────────────────────────

type ApiKeysFlow = { flow: 'awaiting_openrouter_key' }

export const apiKeysState = new Map<number, ApiKeysFlow>()

// ─── Маскировка ключей ────────────────────────────────────────────────────────

export function maskKey(key: string): string {
  if (!key || key.length < 8) return '***'
  return key.slice(0, 8) + '●●●●●●●●' + key.slice(-4)
}

// ─── Пинг OpenRouter ──────────────────────────────────────────────────────────

async function pingOpenRouter(apiKey: string): Promise<'ok' | 'auth_error' | 'error'> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (res.status === 401 || res.status === 403) return 'auth_error'
    if (res.ok) return 'ok'
    return 'error'
  } catch {
    return 'error'
  }
}

// ─── Показ настроек AI ────────────────────────────────────────────────────────

export async function showAISettings(ctx: Context): Promise<void> {
  const mode = await getAIMode()
  const stats = getAIStats()
  const modeLabel = MODE_LABELS[mode] ?? mode
  const modeDesc = MODE_DESCRIPTIONS[mode] ?? ''

  const text = [
    '🤖 AI Sales Agent',
    '',
    `Режим: ${modeLabel}`,
    `${modeDesc}`,
    '',
    `📊 Статистика (сегодня):`,
    `  Ответов: ${stats.total}`,
    `  Одобрено: ${stats.approved}`,
    `  Отклонено: ${stats.rejected}`,
  ].join('\n')

  await ctx.reply(
    text,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('🔴 Выключен', 'ai:mode:off'),
        Markup.button.callback('🟡 Подсказки', 'ai:mode:manual'),
      ],
      [
        Markup.button.callback('🟠 Полуавтомат', 'ai:mode:semi'),
        Markup.button.callback('🟢 Автомат', 'ai:mode:auto'),
      ],
      [Markup.button.callback('🏠 Главное меню', 'back:main')],
    ]),
  )
}

// ─── Панель безопасности ──────────────────────────────────────────────────────

const EVENT_LABELS: Partial<Record<SecurityEvent, string>> = {
  invalid_telegram_signature: '🚫 Неверных подписей Telegram',
  rate_limit_exceeded:        '⏳ Rate limit превышен',
  unauthorized_access:        '🔑 Попыток несанкционированного доступа',
  price_manipulation_attempt: '💰 Попыток подмены цены',
}

export async function showSecurityLog(ctx: Context): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [counts, recent] = await Promise.all([
    prisma.securityLog.groupBy({
      by: ['event'],
      where: { createdAt: { gte: since } },
      _count: true,
    }),
    prisma.securityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  const countMap = new Map(counts.map((c) => [c.event, c._count]))

  const statsLines = (Object.entries(EVENT_LABELS) as [SecurityEvent, string][]).map(
    ([ev, label]) => `${label}: ${countMap.get(ev) ?? 0}`
  )

  const recentLines = recent.map((log) => {
    const time = log.createdAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    const details = (() => {
      try {
        const d = JSON.parse(log.details)
        return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(', ')
      } catch {
        return log.details.slice(0, 60)
      }
    })()
    return `• ${time} ${log.event} — ${details}`
  })

  const text = [
    '🛡️ Безопасность — последние 24 часа:',
    '',
    ...statsLines,
    '',
    'Последние события:',
    recent.length > 0 ? recentLines.join('\n') : '—',
  ].join('\n')

  await ctx.reply(
    text,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('🗑️ Очистить лог', 'sec:clear'),
        Markup.button.callback('🔄 Обновить', 'sec:refresh'),
      ],
      [Markup.button.callback('🔙 Назад', 'sec:back')],
    ]),
  )
}

// ─── Меню API ключей ──────────────────────────────────────────────────────────

export async function showApiKeysMenu(ctx: Context): Promise<void> {
  const key = process.env.OPENROUTER_API_KEY ?? ''

  let statusLine: string
  if (!key) {
    statusLine = '❌ Ключ не задан'
  } else {
    const status = await pingOpenRouter(key)
    if (status === 'ok') statusLine = '✅ Работает'
    else if (status === 'auth_error') statusLine = '⚠️ Ошибка авторизации'
    else statusLine = '❌ Недоступен'
  }

  const mask = (v: string | undefined) => (v ? maskKey(v) : '❌ не задан')

  const present = (v: string | undefined) => (v ? '✅ Задан' : '❌ Не задан')

  const lines = [
    '🔑 API Ключи',
    '',
    `🤖 OpenRouter: ${statusLine}`,
    key ? maskKey(key) : '',
    '',
    `BOT_TOKEN:    ${present(process.env.BOT_TOKEN)}`,
    `CRM_GROUP_ID: ${mask(process.env.CRM_GROUP_ID)}`,
    `ADMIN_IDS:    ${mask(process.env.ADMIN_IDS)}`,
    `DATABASE_URL: ${present(process.env.DATABASE_URL)}`,
    `API_PORT:     ${process.env.API_PORT ?? '3000 (default)'}`,
    `WEBAPP_URL:   ${process.env.WEBAPP_URL ?? '❌ не задан'}`,
  ].filter(Boolean)

  await ctx.reply(
    lines.join('\n'),
    Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Обновить ключ OpenRouter', 'api_key_update_openrouter')],
      [Markup.button.callback('🛡️ Безопасность', 'sec:view')],
      [Markup.button.callback('🏠 Главное меню', 'back:main')],
    ]),
  )
}

// ─── Обработчик текста (флоу смены ключа) ────────────────────────────────────

export async function handleApiKeysMessage(
  ctx: Context,
  userId: number,
  text: string,
): Promise<boolean> {
  const state = apiKeysState.get(userId)
  if (!state) return false

  if (state.flow === 'awaiting_openrouter_key') {
    if (!text.startsWith('sk-or-')) {
      await ctx.reply('❌ Ключ OpenRouter должен начинаться с "sk-or-". Попробуйте ещё раз:')
      return true
    }

    await ctx.reply('🤖 Проверяю ключ…')

    try {
      const test = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: text })
      await test.chat.completions.create({
        model: 'anthropic/claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5,
      })
    } catch (e) {
      const msg = humanizeApiError(e)
      await ctx.reply(`❌ Ключ не сохранён.\n${msg}`)
      return true
    }

    // Сохраняем и переинициализируем клиентов
    await prisma.apiKey.upsert({
      where: { service: 'openrouter_key' },
      create: { service: 'openrouter_key', value: text },
      update: { value: text },
    })
    process.env.OPENROUTER_API_KEY = text
    reinitAgentClient(text)
    reinitParserClient(text)

    apiKeysState.delete(userId)
    await ctx.reply('✅ Ключ проверен и сохранён.')
    await showApiKeysMenu(ctx)
    return true
  }

  return false
}

// ─── Регистрация обработчиков AI режимов ─────────────────────────────────────

export function setupAISettingsHandlers(bot: Telegraf): void {
  const modes: AIMode[] = ['off', 'manual', 'semi', 'auto']

  for (const mode of modes) {
    bot.action(`ai:mode:${mode}`, async (ctx) => {
      try { await ctx.answerCbQuery() } catch {}
      await setAIMode(mode)
      await showAISettings(ctx)
    })
  }
}

// ─── Регистрация обработчиков API ключей ─────────────────────────────────────

export function setupApiKeysHandlers(bot: Telegraf): void {
  bot.action('api_key_update_openrouter', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    const userId = ctx.from!.id
    const currentKey = process.env.OPENROUTER_API_KEY ?? ''
    const maskedKey = currentKey ? maskKey(currentKey) : '❌ не задан'

    apiKeysState.set(userId, { flow: 'awaiting_openrouter_key' })
    await ctx.reply(
      `Текущий ключ OpenRouter: ${maskedKey}\n\nВведите новый API ключ OpenRouter:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'api_key_cancel')]]),
    )
  })

  bot.action('api_key_cancel', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    apiKeysState.delete(ctx.from!.id)
    await showApiKeysMenu(ctx)
  })

  bot.action('sec:view', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    await showSecurityLog(ctx)
  })

  bot.action('sec:refresh', async (ctx) => {
    try { await ctx.answerCbQuery('Обновлено') } catch {}
    await showSecurityLog(ctx)
  })

  bot.action('sec:clear', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    await prisma.securityLog.deleteMany()
    await ctx.reply('🗑️ Лог безопасности очищен.')
    await showSecurityLog(ctx)
  })

  bot.action('sec:back', async (ctx) => {
    try { await ctx.answerCbQuery() } catch {}
    await showApiKeysMenu(ctx)
  })
}
