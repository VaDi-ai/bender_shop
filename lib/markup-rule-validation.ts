/**
 * Валидация веб-CRUD правил наценки (PR-9). Чистые функции.
 *
 * Правила двигают ВСЕ цены при пересчёте (синк path 1, применение батчей) —
 * поэтому кроме пополевой валидации есть проверка ЦЕЛОСТНОСТИ набора канала
 * (существующая validateRules: нет дыр, нет перекрытий, последнее правило
 * уходит в бесконечность): мутация, ломающая набор, отклоняется с 422.
 */
import { MarkupRuleData, validateRules } from './markup-rules'

const ALLOWED_FIELDS = new Set(['minCost', 'maxCost', 'mode', 'value', 'channel', 'enabled'])
export const MARKUP_CHANNELS = ['site', 'avito'] as const

export interface MarkupRuleValidationResult {
  errors: Array<{ field: string; message: string }>
  data: Record<string, unknown>
}

export function validateMarkupRuleInput(
  body: Record<string, unknown>,
  opts: { partial: boolean },
): MarkupRuleValidationResult {
  const errors: MarkupRuleValidationResult['errors'] = []
  const data: Record<string, unknown> = {}
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) errors.push({ field: key, message: 'Поле не редактируется через веб' })
  }

  if (has('minCost') || !opts.partial) {
    const v = Number(body.minCost)
    if (!Number.isFinite(v) || v < 0) errors.push({ field: 'minCost', message: 'Нижняя граница — число ≥ 0' })
    else data.minCost = v
  }
  if (has('maxCost') || !opts.partial) {
    if (body.maxCost === null || body.maxCost === undefined || body.maxCost === '') data.maxCost = null
    else {
      const v = Number(body.maxCost)
      if (!Number.isFinite(v) || v <= 0) errors.push({ field: 'maxCost', message: 'Верхняя граница — число > 0 или пусто (бесконечность)' })
      else data.maxCost = v
    }
  }
  if (data.minCost !== undefined && data.maxCost !== undefined && data.maxCost !== null && (data.maxCost as number) <= (data.minCost as number)) {
    errors.push({ field: 'maxCost', message: 'Верхняя граница должна быть больше нижней' })
  }

  if (has('mode') || !opts.partial) {
    if (body.mode !== 'fixed' && body.mode !== 'percent') errors.push({ field: 'mode', message: 'Режим — fixed или percent' })
    else data.mode = body.mode
  }
  if (has('value') || !opts.partial) {
    const v = Number(body.value)
    const mode = (data.mode ?? body.mode) as string | undefined
    if (!Number.isFinite(v) || v <= 0) errors.push({ field: 'value', message: 'Значение наценки — число > 0' })
    else if (mode === 'percent' && v > 500) errors.push({ field: 'value', message: 'Процент наценки больше 500 — похоже на опечатку' })
    else data.value = Math.round(v * 100) / 100
  }
  if (has('channel') || !opts.partial) {
    const ch = body.channel ?? 'site'
    if (!MARKUP_CHANNELS.includes(ch as never)) errors.push({ field: 'channel', message: 'Канал — site или avito' })
    else data.channel = ch
  }
  if (has('enabled')) {
    if (typeof body.enabled !== 'boolean') errors.push({ field: 'enabled', message: 'enabled — булево' })
    else data.enabled = body.enabled
  }

  return { errors, data: errors.length ? {} : data }
}

export interface IntegrityTransition {
  /** true → мутацию отклонить 422 (валидный набор стал бы невалидным) */
  block: boolean
  error?: string
  /** набор после мутации невалиден, но и до был невалиден/пуст (строится) — предупреждаем, не блокируем */
  warning?: string
}

function applyChange(
  existing: MarkupRuleData[],
  change: { id?: number; data: Partial<MarkupRuleData> },
): MarkupRuleData[] {
  if (change.id !== undefined) {
    return existing.map(r => (r.id === change.id ? { ...r, ...change.data } : r))
  }
  return [...existing, { id: -1, minCost: 0, maxCost: null, mode: 'fixed', value: 1, enabled: true, ...change.data } as MarkupRuleData]
}

function setStatus(rules: MarkupRuleData[]): { ok: boolean; error?: string } {
  const enabled = rules.filter(r => r.enabled)
  if (!enabled.length) return { ok: true } // пустой набор канала валиден (канал просто не пересчитывается)
  return validateRules(enabled)
}

/**
 * Правило перехода (иначе цепочку не собрать и не разобрать — курица-яйцо):
 * - набор ДО мутации валиден, ПОСЛЕ — нет → БЛОК (нельзя ломать рабочее);
 * - набор ДО невалиден/строится → мутацию пропускаем, возвращаем warning
 *   с текстом validateRules («чего не хватает до валидного набора»);
 * - опустошение канала (все выключены) — валидное состояние.
 */
export function evaluateIntegrityTransition(
  existing: MarkupRuleData[],       // все правила канала (enabled и нет)
  change: { id?: number; data: Partial<MarkupRuleData> },
): IntegrityTransition {
  // «До» считается рабочим набором только если он НЕПУСТОЙ и валидный:
  // пустой канал — это «строимся», из него любой первый шаг разрешён
  // (иначе первая же ступень цепочки блокируется — курица-яйцо).
  const beforeEnabled = existing.filter(r => r.enabled)
  const beforeIsWorking = beforeEnabled.length > 0 && validateRules(beforeEnabled).ok
  const after = setStatus(applyChange(existing, change))
  if (after.ok) return { block: false }
  if (beforeIsWorking) return { block: true, error: after.error }
  return { block: false, warning: after.error }
}
