/**
 * lib/markup-rules.ts — Правила наценки по интервалам закупочных цен.
 *
 * Интервалы: [minCost, maxCost). maxCost=null = бесконечность.
 * mode='fixed' → retail = cost + value
 * mode='percent' → retail = cost * (1 + value/100)
 * Результат всегда округляется через roundPrice (вверх до 100 — единое
 * округление всех розничных цен; прежний стиль «…90» отменён владельцем).
 */

import { prisma } from './prisma'
import log from './logger'
import { roundPrice } from './currency'

export interface MarkupRuleData {
  id: number
  minCost: number
  maxCost: number | null
  mode: string        // 'fixed' | 'percent'
  value: number
  enabled: boolean
}

/**
 * Применить правила наценки к закупочной цене.
 * Возвращает рекомендованную розничную цену.
 * Если правил нет или ни одно не подходит — возвращает roundPrice(cost) без наценки.
 */
export function applyMarkupRules(cost: number, rules: MarkupRuleData[]): number {
  if (cost <= 0) return 0

  // Тай-брейк по id: при равных minCost выбор правила детерминирован
  // (валидатор перекрытия запрещает, но старые/выключенные наборы могли
  // пересекаться — поведение не должно зависеть от порядка выдачи БД)
  const enabled = rules
    .filter(r => r.enabled)
    .sort((a, b) => a.minCost - b.minCost || a.id - b.id)

  const rule = enabled.find(r =>
    r.minCost <= cost && (r.maxCost === null || cost < r.maxCost)
  )

  if (!rule) {
    log.warn('No markup rule found for cost', { cost })
    return roundPrice(cost)
  }

  const raw = rule.mode === 'percent'
    ? cost * (1 + rule.value / 100)
    : cost + rule.value

  return roundPrice(raw)
}

/**
 * Валидация набора правил: нет дырок, нет перекрытий, последнее уходит в бесконечность.
 * Возвращает { ok: true } или { ok: false, error: 'описание' }.
 */
export function validateRules(rules: MarkupRuleData[]): { ok: boolean; error?: string } {
  const enabled = rules
    .filter(r => r.enabled)
    .sort((a, b) => a.minCost - b.minCost)

  if (enabled.length === 0) {
    return { ok: false, error: 'Нет ни одного активного правила' }
  }

  if (enabled[0]!.minCost !== 0) {
    return { ok: false, error: `Первое правило должно начинаться с 0 ₽, сейчас начинается с ${enabled[0]!.minCost} ₽` }
  }

  for (let i = 0; i < enabled.length - 1; i++) {
    const current = enabled[i]!
    const next = enabled[i + 1]!

    if (current.maxCost === null) {
      return { ok: false, error: `Правило ${i + 1} уходит в бесконечность, но после него ещё есть правила` }
    }

    if (current.maxCost < next.minCost) {
      return { ok: false, error: `Дырка между ${current.maxCost} ₽ и ${next.minCost} ₽ — нет правила для этого диапазона` }
    }

    if (current.maxCost > next.minCost) {
      return { ok: false, error: `Перекрытие между правилами: ${current.maxCost} ₽ > ${next.minCost} ₽` }
    }
  }

  const last = enabled[enabled.length - 1]!
  if (last.maxCost !== null) {
    return { ok: false, error: `Последнее правило должно уходить в бесконечность (maxCost = пусто), сейчас ограничено ${last.maxCost} ₽` }
  }

  return { ok: true }
}

/**
 * Загрузить все правила из БД и конвертировать в MarkupRuleData[].
 */
export type MarkupChannel = 'site' | 'avito'

/**
 * Правила одного канала. Дефолт — 'site': витринная цена не должна видеть
 * avito-правила (админ-API умеет их заводить, а движок раньше грузил всё
 * подряд — первое же avito-правило утекло бы в расчёт site-розницы).
 * Сортировка minCost, id — детерминизм при равных minCost.
 */
export async function loadRules(channel: MarkupChannel = 'site'): Promise<MarkupRuleData[]> {
  const rows = await prisma.markupRule.findMany({ where: { channel }, orderBy: [{ minCost: 'asc' }, { id: 'asc' }] })
  return rows.map(r => ({
    id: r.id,
    minCost: Number(r.minCost),
    maxCost: r.maxCost !== null ? Number(r.maxCost) : null,
    mode: r.mode,
    value: Number(r.value),
    enabled: r.enabled,
  }))
}

/**
 * Форматирует правило для отображения в Telegram.
 */
export function formatRule(r: MarkupRuleData, index: number): string {
  const from = r.minCost.toLocaleString('ru-RU')
  const to = r.maxCost !== null ? r.maxCost.toLocaleString('ru-RU') + ' ₽' : '∞'
  const action = r.mode === 'percent'
    ? `+${r.value}%`
    : `+${r.value.toLocaleString('ru-RU')} ₽`
  const status = r.enabled ? '' : ' ⏸️'
  return `${index + 1}. ${from} – ${to} → ${action}${status}`
}
