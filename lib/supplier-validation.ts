/**
 * Валидация входа веб-CRUD поставщиков (PR-5). Чистая функция — юнит-тесты.
 *
 * Контракт (утверждено владельцем):
 * - редактируемые поля: name, markup (0–50), priceTtlDays (1–30), notes (≤1000);
 * - chatId/chatType/lastPriceAt клиент не присылает НИКОГДА: неизвестные и
 *   запрещённые поля → 422, не молчаливый игнор (фронт-баги не маскируем);
 * - никаких 500 на плохой ввод.
 */

export interface SupplierValidationResult {
  errors: Array<{ field: string; message: string }>
  /** только разрешённые поля, нормализованные; заполняется при отсутствии ошибок */
  data: Record<string, unknown>
}

const ALLOWED_FIELDS = new Set(['name', 'markup', 'priceTtlDays', 'notes'])

export function validateSupplierInput(
  body: Record<string, unknown>,
  opts: { partial: boolean },
): SupplierValidationResult {
  const errors: Array<{ field: string; message: string }> = []
  const data: Record<string, unknown> = {}

  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) {
      errors.push({ field: key, message: 'Поле не редактируется через веб' })
    }
  }

  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  if (has('name') || !opts.partial) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) errors.push({ field: 'name', message: 'Название обязательно' })
    else if (name.length > 100) errors.push({ field: 'name', message: 'Название длиннее 100 символов' })
    else data.name = name
  }

  if (has('markup')) {
    const markup = typeof body.markup === 'number' ? body.markup : Number(body.markup)
    if (!Number.isFinite(markup) || markup < 0 || markup > 50) {
      errors.push({ field: 'markup', message: 'Наценка — число от 0 до 50 (%)' })
    } else data.markup = Math.round(markup * 100) / 100
  }

  if (has('priceTtlDays')) {
    const ttl = typeof body.priceTtlDays === 'number' ? body.priceTtlDays : Number(body.priceTtlDays)
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 30) {
      errors.push({ field: 'priceTtlDays', message: 'Срок жизни прайса — целое число дней от 1 до 30' })
    } else data.priceTtlDays = ttl
  }

  if (has('notes')) {
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
    if (notes.length > 1000) errors.push({ field: 'notes', message: 'Заметка длиннее 1000 символов' })
    else data.notes = notes || null
  }

  return { errors, data: errors.length ? {} : data }
}

/** Дельта для AuditLog: только реально изменившиеся поля (before/after). */
export function supplierDelta(
  existing: Record<string, unknown>,
  update: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(update)) {
    const old = existing[k]
    // Decimal из Prisma сравниваем по числовому значению
    const oldNorm = old !== null && old !== undefined && typeof old === 'object' ? Number(old) : old
    if (oldNorm !== v) { before[k] = oldNorm ?? null; after[k] = v }
  }
  return { before, after }
}
