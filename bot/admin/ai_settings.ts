/**
 * bot/admin/ai_settings.ts
 *
 * Панель управления AI Sales Agent.
 * Подключение в bot/index.ts:
 *   setupAISettingsHandlers(bot)
 *   bot.hears('🤖 AI Агент', ...) → showAISettings(ctx)
 */

import { Context, Markup, Telegraf } from 'telegraf'
import { getAIMode, setAIMode, getAIStats, type AIMode } from '../ai/agent'

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

// ─── Показ настроек ───────────────────────────────────────────────────────────

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

// ─── Обработчики ─────────────────────────────────────────────────────────────

export function setupAISettingsHandlers(bot: Telegraf): void {
  const modes: AIMode[] = ['off', 'manual', 'semi', 'auto']

  for (const mode of modes) {
    bot.action(`ai:mode:${mode}`, async (ctx) => {
      await ctx.answerCbQuery()
      await setAIMode(mode)
      await showAISettings(ctx)
    })
  }
}
