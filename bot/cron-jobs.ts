/**
 * bot/cron-jobs.ts
 *
 * Тела ежедневных/ежечасных задач бота, вынесенные из bot/index.ts, чтобы
 * рубильники (lib/jobs-switches.ts) можно было проверить тестами. Таймеры
 * остаются в bot/index.ts; здесь — только то, что происходит на тике.
 *
 *   runCurrencyNotify  — курс валют в 10:00 + алерт о скачке USD. Рубильника
 *                        НЕТ намеренно: шлётся всегда (решение владельца).
 *   runMorningSummary  — блок 11:00: ночная сводка, сводка цен (morningSummary),
 *                        клиентское «доброе утро» (clientAuto), AI-тренды.
 *   notifyNightClients — «Актуальные цены готовы» клиентам (clientAuto).
 *   runSheetsAutoSync  — ежечасный синк; уведомления о нём и об устаревших
 *                        ценах гасит priceAlerts, сам синк идёт всегда.
 */
import type { Telegram } from 'telegraf'
import { Markup } from 'telegraf'
import { prisma } from '../lib/prisma'
import { getApiKeyValue, setApiKeyValue } from '../lib/api-key-store'
import { roundPrice } from '../lib/currency'
import { isJobEnabled } from '../lib/jobs-switches'
import log from '../lib/logger'
import { sendDailyCurrencyRates, lastCurrencyChanges } from './admin/pricing'

// ─── Ежедневное уведомление о курсах валют в 10:00 МСК ───────────────────────
// Проверяем раз в час; если час === 10 и сегодня ещё не отправляли — отправляем.

export async function runCurrencyNotify(telegram: Telegram, adminIds: number[]): Promise<void> {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
    if (now.getHours() !== 10) return

    const todayStr = now.toISOString().slice(0, 10)
    const notifyDateValue = await getApiKeyValue('currency_notify_date')
    if (notifyDateValue === todayStr) return // уже отправляли сегодня

    // Отмечаем как отправленное
    await setApiKeyValue('currency_notify_date', todayStr)

    for (const adminId of adminIds) {
      try {
        const result = await sendDailyCurrencyRates(async (text, keyboard) => {
          await telegram.sendMessage(adminId, text, { parse_mode: 'HTML', ...keyboard })
        })
        if (result?.changes) {
          lastCurrencyChanges.splice(0, lastCurrencyChanges.length, ...result.changes)
        }
      } catch { /* ignore */ }
    }
    // Проверить значительное изменение курса (> 0.5%)
    const usdRate = await prisma.currencyRate.findUnique({ where: { currency: 'USD' } })
    if (usdRate && usdRate.previousRate) {
      const current = Number(usdRate.rate)
      const previous = Number(usdRate.previousRate)
      const changePct = Math.abs((current - previous) / previous * 100)

      if (changePct > 0.5) {
        const direction = current > previous ? '📈' : '📉'
        for (const adminId of adminIds) {
          try {
            await telegram.sendMessage(adminId, [
              `⚠️ Курс доллара изменился на ${changePct.toFixed(2)}%`,
              `${direction} ${previous.toFixed(2)}₽ → ${current.toFixed(2)}₽`,
              '',
              'Рекомендуется скорректировать цены на витрине.',
            ].join('\n'), {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '📊 Скорректировать цены', callback_data: 'pricing:usd_adjust' }],
                  [{ text: '⏭️ Пропустить', callback_data: 'morning:skip_adjust' }],
                ],
              },
            })
          } catch { /* ignore */ }
        }
      }
    }
  } catch (e) {
    log.error('Currency notify error', { error: e instanceof Error ? e.message : String(e) })
  }
}

// ─── Утренняя сводка цен от поставщиков (11:00 МСК) ─────────────────────────

export async function notifyNightClients(telegram: Telegram): Promise<void> {
  try {
    // Тумблер clientAuto: клиентские авто-рассылки выключены — не шлём
    if (!(await isJobEnabled('clientAuto'))) { log.info('Morning client notify skipped: clientAuto off'); return }

    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const nightStart = new Date(todayStart)
    nightStart.setDate(nightStart.getDate() - 1)
    nightStart.setHours(20, 0, 0, 0)

    const nightEnd = new Date(todayStart)
    nightEnd.setHours(11, 0, 0, 0)

    const nightMessages = await prisma.message.findMany({
      where: {
        direction: 'in',
        createdAt: { gte: nightStart, lte: nightEnd },
      },
      include: { client: true },
      distinct: ['clientId'],
    })

    for (const msg of nightMessages) {
      if (!msg.client || msg.client.source !== 'telegram' || !msg.client.externalId) continue
      try {
        await telegram.sendMessage(
          msg.client.externalId,
          '☀️ Доброе утро! Мы на связи.\n\nАктуальные цены на сегодня готовы. Если вас интересовал какой-то товар — напишите, подберём лучший вариант!',
        )
      } catch { /* ignore: user may have blocked bot */ }
    }

    if (nightMessages.length > 0) {
      log.info('Morning notification sent', { clientCount: nightMessages.length })
    }
  } catch (err) {
    log.error('Morning notifyNightClients error', { error: err instanceof Error ? err.message : String(err) })
  }
}

export async function runMorningSummary(telegram: Telegram, adminIds: number[]): Promise<void> {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
    if (now.getHours() !== 11 || now.getMinutes() > 15) return

    const todayStr = now.toISOString().slice(0, 10)
    const notifyKey = 'morning_summary_date'
    const lastNotify = await getApiKeyValue(notifyKey)
    if (lastNotify === todayStr) return
    await setApiKeyValue(notifyKey, todayStr)

    // ── Ночная сводка Бендера ───────────────────────────────────────────────
    try {
      const nightBriefStart = new Date(todayStr + 'T00:00:00Z')
      nightBriefStart.setDate(nightBriefStart.getDate() - 1)
      nightBriefStart.setUTCHours(17, 0, 0, 0) // 20:00 MSK = 17:00 UTC

      const nightBriefEnd = new Date(todayStr + 'T00:00:00Z')
      nightBriefEnd.setUTCHours(8, 0, 0, 0) // 11:00 MSK = 08:00 UTC

      const nightMessages = await prisma.message.findMany({
        where: {
          direction: 'in',
          createdAt: { gte: nightBriefStart, lte: nightBriefEnd },
        },
        include: { client: true },
        orderBy: { createdAt: 'asc' },
      })

      const nightReserves = await prisma.task.findMany({
        where: {
          action: 'night_reserve',
          createdAt: { gte: nightBriefStart, lte: nightBriefEnd },
        },
        include: { client: true },
      })

      const nightRequests = await prisma.task.findMany({
        where: {
          action: 'night_request',
          createdAt: { gte: nightBriefStart, lte: nightBriefEnd },
        },
        include: { client: true },
      })

      const uniqueClients = new Set(nightMessages.map(m => m.clientId)).size

      if (uniqueClients > 0 || nightReserves.length > 0) {
        const lines = [
          '🤖 НОЧНАЯ СВОДКА БЕНДЕРА',
          '',
          `💬 Диалогов: ${uniqueClients} клиентов, ${nightMessages.length} сообщений`,
        ]

        if (nightReserves.length > 0) {
          lines.push('')
          lines.push(`🔖 БРОНИ (${nightReserves.length}) — НУЖНО ПОДТВЕРДИТЬ:`)
          for (const r of nightReserves) {
            const payload = r.payload as Record<string, unknown>
            const clientName = r.client?.name ?? 'Неизвестный'
            const clientUsername = (r.client as Record<string, unknown> | null)?.telegramUsername ?? ''
            lines.push(`  • ${clientName} ${clientUsername} → ${payload.productName} (${Number(payload.price).toLocaleString('ru-RU')}₽)`)
          }
        }

        if (nightRequests.length > 0) {
          lines.push('')
          lines.push(`❓ ЗАПРОСЫ (товар не найден):`)
          for (const r of nightRequests) {
            const payload = r.payload as Record<string, unknown>
            const clientName = r.client?.name ?? 'Неизвестный'
            lines.push(`  • ${clientName} искал: "${payload.requestedItem}"`)
          }
        }

        const clientsNeedReply = new Set<string>()
        for (const m of nightMessages) {
          if (m.client?.telegramTopicId) {
            const clientName = m.client.name
            const username = (m.client as Record<string, unknown> | null)?.telegramUsername ?? ''
            clientsNeedReply.add(`${clientName} ${username}`.trim())
          }
        }

        if (clientsNeedReply.size > 0) {
          lines.push('')
          lines.push(`👋 КЛИЕНТЫ, КОТОРЫМ НУЖНО НАПИСАТЬ:`)
          for (const c of clientsNeedReply) {
            lines.push(`  • ${c}`)
          }
        }

        lines.push('')
        lines.push('👆 Зайдите в CRM-топики этих клиентов и подтвердите брони.')

        // Кнопки для быстрого перехода к клиентам
        const crmGroupId = Number(process.env.CRM_GROUP_ID)
        const nightButtons: (ReturnType<typeof Markup.button.url> | ReturnType<typeof Markup.button.callback>)[][] = []
        for (const r of nightReserves) {
          const clientName = r.client?.name ?? 'Клиент'
          const tgUsername = (r.client as Record<string, unknown> | null)?.telegramUsername ?? ''
          const topicId = r.client?.telegramTopicId
          if (topicId && crmGroupId) {
            const topicLink = `https://t.me/c/${String(crmGroupId).replace('-100', '')}/${topicId}`
            nightButtons.push([Markup.button.url(`👤 ${clientName} ${tgUsername}`.trim(), topicLink)])
          }
        }
        if (nightButtons.length > 0) {
          nightButtons.push([Markup.button.callback('📊 Все остатки', 'inv:stock_list')])
        }

        for (const adminId of adminIds) {
          try {
            await telegram.sendMessage(adminId, lines.join('\n'),
              nightButtons.length > 0 ? Markup.inlineKeyboard(nightButtons) : undefined)
          } catch { /* ignore */ }
        }

        log.info('Night brief sent', { clients: uniqueClients, reserves: nightReserves.length, requests: nightRequests.length })
      }
    } catch (err) {
      log.error('Night brief error', { error: err instanceof Error ? err.message : String(err) })
    }

    // Тумблер morningSummary гасит только сообщения со сводкой цен. Ночная
    // сводка выше, клиентское «доброе утро» (свой тумблер) и AI-тренды ниже
    // идут как шли — решение владельца от 2026-09-22.
    const summaryOn = await isJobEnabled('morningSummary')
    if (!summaryOn) log.info('Morning price summary skipped: morningSummary off')

    // Собрать цены за сегодня
    const todayStart = new Date(todayStr + 'T00:00:00Z')
    const prices = await prisma.supplierPrice.findMany({
      where: { isActive: true, parsedAt: { gte: todayStart } },
      include: { supplier: true },
      orderBy: [{ model: 'asc' }, { price: 'asc' }],
    })

    if (prices.length === 0) {
      if (summaryOn) for (const adminId of adminIds) {
        try {
          await telegram.sendMessage(adminId, '📋 Утренняя сводка: пока нет новых цен от поставщиков. Прайсы обычно появляются к 10:30–11:00.')
        } catch { /* ignore */ }
      }
      return
    }

    // Группировать по модели
    const byModel = new Map<string, typeof prices>()
    for (const p of prices) {
      const key = `${p.model}${p.storage ? ' ' + p.storage : ''}`
      if (!byModel.has(key)) byModel.set(key, [])
      byModel.get(key)!.push(p)
    }

    const defaultMarkupStr = await getApiKeyValue('default_markup')
    const defaultMarkup = parseFloat(defaultMarkupStr ?? '5')

    const lines: string[] = [`📋 Утренняя сводка цен (${prices.length} позиций от ${new Set(prices.map(p => p.supplierId)).size} поставщиков):\n`]

    let count = 0
    for (const [model, modelPrices] of byModel) {
      if (count >= 30) { lines.push(`\n...и ещё ${byModel.size - 30} моделей`); break }
      const best = modelPrices[0]!
      const markup = best.supplier ? (Number(best.supplier.markup) || defaultMarkup) : defaultMarkup
      const finalPrice = roundPrice(Number(best.price) * (1 + markup / 100))
      const supplierLabel = best.supplier?.name ?? best.supplierName ?? 'неизвестный'

      lines.push(`${model}${best.color ? ' ' + best.color : ''}${best.country ? ' ' + best.country : ''}`)
      lines.push(`  💰 ${Number(best.price).toLocaleString('ru-RU')}₽ → ${finalPrice.toLocaleString('ru-RU')}₽ (+${markup}%) от ${supplierLabel}`)

      if (modelPrices.length > 1) {
        lines.push(`  📊 ещё ${modelPrices.length - 1} предложений`)
      }
      lines.push('')
      count++
    }

    if (summaryOn) for (const adminId of adminIds) {
      try {
        await telegram.sendMessage(adminId, lines.join('\n'), {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 Обновить цены на витрине', callback_data: 'morning:update_prices' }],
              [{ text: '📋 Подробная таблица', callback_data: 'morning:detailed' }],
            ],
          },
        })
      } catch { /* ignore */ }
    }

    await notifyNightClients(telegram)

    // AI-анализ трендов + обновление хитов
    try {
      const { fetchTrendsFromAI, saveTrends, getCurrentTrends, applyFeaturedProducts } = await import('../lib/trends')
      const newTrends = await fetchTrendsFromAI()
      if (newTrends) {
        const oldTrends = await getCurrentTrends()
        await saveTrends(newTrends)

        const changed = !oldTrends ||
          JSON.stringify(oldTrends.categories.slice(0, 6)) !== JSON.stringify(newTrends.categories.slice(0, 6)) ||
          JSON.stringify(oldTrends.brands.slice(0, 6)) !== JSON.stringify(newTrends.brands.slice(0, 6))

        if (changed) {
          for (const adminId of adminIds) {
            try {
              await telegram.sendMessage(adminId, [
                '📊 AI обновил фильтрацию витрины:',
                '',
                `🏷 Топ категории: ${newTrends.categories.slice(0, 6).join(' → ')}`,
                `🏭 Топ бренды: ${newTrends.brands.slice(0, 6).join(' → ')}`,
                '',
                `💡 ${newTrends.reasoning}`,
              ].join('\n'))
            } catch { /* ignore */ }
          }
        }

        // Обновить блок "Хит продаж" (isFeatured)
        if (newTrends.featuredProducts && newTrends.featuredProducts.length > 0) {
          const featuredCount = await applyFeaturedProducts(newTrends.featuredProducts)

          if (featuredCount > 0) {
            const featuredList = newTrends.featuredProducts.slice(0, featuredCount).join('\n• ')
            for (const adminId of adminIds) {
              try {
                await telegram.sendMessage(adminId, `🔥 AI обновил "Хит продаж" (${featuredCount}):\n• ${featuredList}`)
              } catch { /* ignore */ }
            }
          }
        }
        log.info('Trends updated', { reasoning: newTrends.reasoning?.slice(0, 100) })
      }
    } catch (err) {
      log.error('Trends error', { error: err instanceof Error ? err.message : String(err) })
    }
  } catch (err) {
    log.error('Morning summary error', { error: err instanceof Error ? err.message : String(err) })
  }
}

// ─── Google Sheets синхронизация (каждый час в рабочее время) ─────────────────

export async function runSheetsAutoSync(telegram: Telegram, adminIds: number[]): Promise<void> {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }))
    const hour = now.getHours()
    if (hour < 11 || hour >= 20) return // только рабочее время

    log.info('Sheets auto-sync', { hour })
    const { syncProductsFromSheets, checkStalePrices, formatStaleSupplierMessage } = await import('../lib/sheets-sync')
    const result = await syncProductsFromSheets(undefined, { trigger: 'cron' })

    // Тумблер priceAlerts: синк выше идёт всегда, гасятся только уведомления
    // о нём и проверка устаревших цен (она существует ради уведомления).
    const alertsOn = await isJobEnabled('priceAlerts')
    if (!alertsOn) log.info('Sheets auto-sync notifications skipped: priceAlerts off')

    if (alertsOn && (result.created > 0 || result.updated > 0)) {
      for (const adminId of adminIds) {
        try {
          await telegram.sendMessage(adminId,
            `🔄 Авто-синхронизация Google Sheets:\n➕ ${result.created} создано | 🔄 ${result.updated} обновлено | 🔴 ${result.disabled} снято`)
        } catch { /* ignore */ }
      }
    }

    // Проверка устаревших цен (>6 часов)
    if (alertsOn) try {
      const staleItems = await checkStalePrices()
      if (staleItems.length > 0) {
        const totalProducts = await prisma.product.count({ where: { isAvailable: true } })
        const staleRatio = totalProducts > 0 ? staleItems.length / totalProducts : 0

        if (staleRatio > 0.9) {
          // >90% без обновлённых цен — бот ещё не используется для ценообразования
          for (const adminId of adminIds) {
            try {
              await telegram.sendMessage(adminId,
                `📋 ${staleItems.length} позиций без обновлённых цен.\n\nРазберите прайс в админке (вкладка «Цены» → «Загрузить прайс»).`,
              )
            } catch (err) { log.error('Stale notify failed', { error: err instanceof Error ? err.message : String(err) }) }
          }
        } else {
          // Кнопки stale:* удалены (фаза 2) — уведомление текстом; действия в админке
          for (const adminId of adminIds) {
            try {
              await telegram.sendMessage(adminId, [
                `⚠️ ${staleItems.length} позиций с устаревшими ценами (>6 часов)`,
                '',
                'Обновите цены прайсом в админке («Цены» → «Загрузить прайс») или скройте позиции во вкладке «Товары».',
              ].join('\n'))
              const fullMsg = formatStaleSupplierMessage(staleItems)
              if (fullMsg.length <= 4000) {
                await telegram.sendMessage(adminId, fullMsg)
              } else {
                const buffer = Buffer.from(fullMsg, 'utf-8')
                await telegram.sendDocument(adminId, {
                  source: buffer,
                  filename: `stale-prices-${new Date().toISOString().slice(0, 10)}.txt`,
                }, { caption: `📋 ${staleItems.length} позиций — переслать поставщикам` })
              }
            } catch (err) { log.error('Stale notify error', { error: err instanceof Error ? err.message : String(err) }) }
          }
        }
      }
    } catch (err) {
      log.error('Stale prices check error', { error: err instanceof Error ? err.message : String(err) })
    }
  } catch (err) {
    log.error('Sheets auto-sync error', { error: err instanceof Error ? err.message : String(err) })
  }
}
