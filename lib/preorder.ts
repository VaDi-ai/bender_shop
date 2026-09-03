/**
 * lib/preorder.ts
 *
 * Политика предзаказа: глобальные дефолты магазина, их наложение на товар и
 * расчёт предоплаты. Устроено как lib/delivery-pricing.ts — конфиг в
 * ApiKey (JSON), чистый парсер, безопасный фолбэк на битом значении.
 *
 * Три правила, которые здесь держатся:
 *
 * 1. Флаг «Предзаказ» — единственное обязательное поле. Пусто → товар обычный,
 *    и НИЧЕГО из этого модуля к нему не применяется.
 * 2. Полузаполненный предзаказ (флаг есть, а условий нет ни в товаре, ни в
 *    дефолтах) на витрину не идёт. Товар при этом не ломается: он просто
 *    остаётся обычным нулевым остатком и подсвечивается в админке.
 * 3. Суммы считает СЕРВЕР. Клиент присылает только состав корзины — как
 *    с ценами и стоимостью доставки.
 */
import { Decimal } from '@prisma/client/runtime/client'
import { getApiKeyValue, setApiKeyValue } from './api-key-store'
import { fmtPrice } from './format'
import log from './logger'

export const PREORDER_SETTING = 'setting_preorder'

export type PreorderMode = 'full' | 'partial'
export type PrepaymentKind = 'percent' | 'fixed'

/** Глобальные дефолты: одна настройка на магазин, товар их только перекрывает. */
export interface PreorderDefaults {
  mode: PreorderMode | null
  kind: PrepaymentKind | null
  /** Процент 1..100 при kind=percent, сумма в рублях при kind=fixed */
  value: Decimal | null
  /** Шаблон условий выкупа с подстановками {предоплата} / {остаток} / {срок} */
  terms: string | null
  /** Срок по умолчанию, если у товара свой не задан */
  eta: string | null
}

/**
 * Пока владелец не сохранил настройку — дефолтов НЕТ. Намеренно: придумать за
 * магазин размер предоплаты нельзя, а «полузаполнено» — честное состояние,
 * которое видно в админке. Это не то же самое, что доставка, где 1000 ₽ по
 * Москве были согласованы заранее.
 */
export const EMPTY_PREORDER_DEFAULTS: PreorderDefaults = {
  mode: null, kind: null, value: null, terms: null, eta: null,
}

/**
 * Решение владельца от 2026-09-03. НЕ применяется молча: это подсказка, которой
 * админка заполняет форму, пока настройка пуста. Разница принципиальная —
 * «дефолт не сохранён» остаётся видимым состоянием, а не превращается в тихо
 * работающие 30%, о которых никто не помнит.
 */
export const SUGGESTED_PREORDER_DEFAULTS = {
  mode: 'partial' as const,
  kind: 'percent' as const,
  value: '30',
  eta: null as string | null,
  terms: 'Предзаказ. Предоплата {предоплата} ₽ ({процент}) — бронирует товар. '
    + 'Остаток {остаток} ₽ при получении. Ориентировочный срок: {срок}. '
    + 'Точную дату и детали подтвердит менеджер.',
}

const MODES: PreorderMode[] = ['full', 'partial']
const KINDS: PrepaymentKind[] = ['percent', 'fixed']

const asMode = (v: unknown): PreorderMode | null =>
  MODES.includes(v as PreorderMode) ? (v as PreorderMode) : null
const asKind = (v: unknown): PrepaymentKind | null =>
  KINDS.includes(v as PrepaymentKind) ? (v as PrepaymentKind) : null

const asText = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

/** Положительное число или null. Отрицательная предоплата — это не скидка, это ошибка. */
export const asPositiveDecimal = (v: unknown): Decimal | null => {
  if (v === null || v === undefined || v === '') return null
  try {
    const d = new Decimal(String(v))
    return d.isFinite() && d.greaterThan(0) ? d : null
  } catch {
    return null
  }
}

/**
 * Разбор JSON-настройки. Пусто (не сохраняли) → дефолтов нет. Битый JSON тоже
 * даёт «дефолтов нет», а не догадку: без размера предоплаты предзаказ просто
 * не выйдет на витрину, и это лучше, чем взять с покупателя неизвестную сумму.
 */
export function parsePreorderDefaults(raw: string | null): PreorderDefaults {
  if (raw === null || raw.trim() === '') return EMPTY_PREORDER_DEFAULTS
  let src: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    src = parsed as Record<string, unknown>
  } catch {
    log.warn('Preorder defaults unreadable, treating as unset')
    return EMPTY_PREORDER_DEFAULTS
  }
  const kind = asKind(src.kind)
  const value = asPositiveDecimal(src.value)
  return {
    mode: asMode(src.mode),
    kind,
    // Процент выше 100 — это не предоплата, а переплата: значение отбрасываем
    value: kind === 'percent' && value && value.greaterThan(100) ? null : value,
    terms: asText(src.terms, 2000),
    eta: asText(src.eta, 120),
  }
}

export async function loadPreorderDefaults(): Promise<PreorderDefaults> {
  try {
    return parsePreorderDefaults(await getApiKeyValue(PREORDER_SETTING))
  } catch (e) {
    log.warn('Preorder defaults read failed', { error: e instanceof Error ? e.message : String(e) })
    return EMPTY_PREORDER_DEFAULTS
  }
}

export function serializePreorderDefaults(d: PreorderDefaults): string {
  return JSON.stringify({
    mode: d.mode, kind: d.kind,
    value: d.value ? d.value.toString() : null,
    terms: d.terms, eta: d.eta,
  })
}

export async function savePreorderDefaults(d: PreorderDefaults): Promise<void> {
  await setApiKeyValue(PREORDER_SETTING, serializePreorderDefaults(d))
}

// ─── Политика конкретного товара ─────────────────────────────────────────────

/** Поля товара, из которых складывается политика (override поверх дефолтов). */
export interface PreorderProductFields {
  isPreorder: boolean
  preorderMode: PreorderMode | null
  prepaymentKind: PrepaymentKind | null
  prepaymentValue: Decimal | string | number | null
  preorderEta: string | null
  preorderTerms: string | null
}

export interface PreorderPolicy {
  mode: PreorderMode
  kind: PrepaymentKind | null   // при mode=full вид не нужен: берём 100%
  value: Decimal | null
  eta: string | null
  terms: string | null
}

/** Почему предзаказ не готов к показу — текст для админки, в терминах владельца. */
export type PreorderGap = 'no_mode' | 'no_kind' | 'no_value' | 'bad_percent'

export const PREORDER_GAP_LABEL: Record<PreorderGap, string> = {
  no_mode: 'не выбран тип предоплаты (полная или частичная)',
  no_kind: 'не выбран вид частичной предоплаты (процент или сумма)',
  no_value: 'не задан размер предоплаты',
  bad_percent: 'процент предоплаты вне диапазона 1–100',
}

export type PreorderReadiness =
  | { kind: 'off' }                                       // товар не предзаказный
  | { kind: 'ready'; policy: PreorderPolicy }             // можно показывать и продавать
  | { kind: 'incomplete'; gaps: PreorderGap[] }           // флаг есть, условий нет

/**
 * Складывает политику товара: своё поле сильнее дефолта, дефолт сильнее пустоты.
 * `full` не требует ни вида, ни значения — предоплата равна цене.
 */
export function resolvePreorder(p: PreorderProductFields, defaults: PreorderDefaults): PreorderReadiness {
  if (!p.isPreorder) return { kind: 'off' }

  const mode = p.preorderMode ?? defaults.mode
  const eta = p.preorderEta ?? defaults.eta
  const terms = p.preorderTerms ?? defaults.terms

  if (!mode) return { kind: 'incomplete', gaps: ['no_mode'] }
  if (mode === 'full') {
    return { kind: 'ready', policy: { mode, kind: null, value: null, eta, terms } }
  }

  const kind = p.prepaymentKind ?? defaults.kind
  const value = asPositiveDecimal(p.prepaymentValue) ?? defaults.value

  const gaps: PreorderGap[] = []
  if (!kind) gaps.push('no_kind')
  if (!value) gaps.push('no_value')
  if (kind === 'percent' && value && value.greaterThan(100)) gaps.push('bad_percent')
  if (gaps.length) return { kind: 'incomplete', gaps }

  return { kind: 'ready', policy: { mode, kind, value, eta, terms } }
}

// ─── Деньги ──────────────────────────────────────────────────────────────────

export interface PrepaymentSplit {
  /** Сколько берём вперёд, в рублях */
  prepayment: Decimal
  /** Сколько останется добрать при получении */
  remaining: Decimal
}

/**
 * Считает предоплату по сумме позиции. Округление — до рубля вверх, как везде
 * в проекте, и предоплата никогда не больше самой суммы: фикс-сумма, заданная
 * выше цены товара, превращается в 100%, а не в долг магазину.
 */
export function computePrepayment(lineTotal: Decimal, policy: PreorderPolicy): PrepaymentSplit {
  const total = lineTotal.isNegative() ? new Decimal(0) : lineTotal
  let prepayment: Decimal

  if (policy.mode === 'full' || !policy.kind || !policy.value) {
    prepayment = total
  } else if (policy.kind === 'percent') {
    prepayment = total.times(policy.value).dividedBy(100).ceil()
  } else {
    prepayment = policy.value.ceil()
  }

  if (prepayment.greaterThan(total)) prepayment = total
  return { prepayment, remaining: total.minus(prepayment) }
}

/**
 * Подставляет числа и срок в шаблон условий. Шаблон — владельца; ИИ его не
 * сочиняет: условия выкупа это оферта магазина, а не факт из интернета.
 */
export function renderPreorderTerms(
  template: string | null,
  v: { prepayment: Decimal; remaining: Decimal; eta: string | null },
): string | null {
  if (!template) return null
  // Суммы подставляем БЕЗ знака рубля: в шаблоне владельца «₽» стоит своим
  // словом после плейсхолдера («Предоплата {предоплата} ₽»), и подстановка
  // с валютой давала бы «44 997 ₽ ₽». Разряды — общий формат проекта.
  const num = (d: Decimal) => fmtPrice(d.toFixed(0))

  // {процент} — какую долю заказа забираем вперёд. Считается от факта, а не от
  // настройки: при фикс-сумме доля тоже осмысленна, а при полной всегда 100%.
  const total = v.prepayment.plus(v.remaining)
  const share = total.greaterThan(0)
    ? `${v.prepayment.times(100).dividedBy(total).toDecimalPlaces(0).toString()}%`
    : ''

  return template
    .replace(/\{предоплата\}/g, num(v.prepayment))
    .replace(/\{остаток\}/g, num(v.remaining))
    .replace(/\{процент\}/g, share)
    .replace(/\{срок\}/g, v.eta ?? 'уточняется')
    .slice(0, 2000)
}

// ─── Чтение ячейки листа ─────────────────────────────────────────────────────

const TRUTHY = new Set(['да', 'yes', 'y', '1', 'true', '✓', 'v', 'x', 'предзаказ', 'preorder', '+'])

/**
 * Пустая ячейка = обычный товар. Никаких догадок: любое непонятное значение
 * тоже «обычный», иначе случайный символ в колонке вывел бы на витрину
 * распроданный товар с обязательством по срокам.
 */
export function parsePreorderCell(raw: string): boolean {
  return TRUTHY.has(raw.trim().toLowerCase())
}

// ─── Заказ: сколько берём вперёд по корзине целиком ──────────────────────────

/** Позиция корзины глазами предзаказа. `policy: null` — обычная позиция. */
export interface OrderLine {
  lineTotal: Decimal
  policy: PreorderPolicy | null
  /** Название для снапшота условий, когда в заказе несколько предзаказных позиций */
  name?: string
}

export interface OrderPrepayment {
  /** В заказе есть хоть одна предзаказная позиция */
  isPreorder: boolean
  /** Сколько берём вперёд — ТОЛЬКО по предзаказным позициям */
  prepayment: Decimal
  /** Условия выкупа на момент заказа, уже с подставленными суммами */
  terms: string | null
}

/**
 * Смешанная корзина: предоплата считается только по предзаказным позициям,
 * обычный товар оплачивается как обычно. База — товары; доставка в предоплату
 * не входит (решение владельца), поэтому здесь про неё ничего нет.
 *
 * Остаток заказа считается вызывающим как `итог − предоплата`: туда попадают
 * и обычные позиции, и доставка — ровно то, что оператор возьмёт при выдаче.
 */
export function splitOrderPrepayment(lines: OrderLine[]): OrderPrepayment {
  const preorderLines = lines.filter(l => l.policy !== null)
  if (!preorderLines.length) {
    return { isPreorder: false, prepayment: new Decimal(0), terms: null }
  }

  let prepayment = new Decimal(0)
  const rendered: Array<{ name: string | undefined; text: string }> = []

  for (const line of preorderLines) {
    const split = computePrepayment(line.lineTotal, line.policy!)
    prepayment = prepayment.plus(split.prepayment)
    const text = renderPreorderTerms(line.policy!.terms, {
      prepayment: split.prepayment,
      remaining: split.remaining,
      eta: line.policy!.eta,
    })
    if (text) rendered.push({ name: line.name, text })
  }

  if (!rendered.length) return { isPreorder: true, prepayment, terms: null }

  // Сначала сравниваем САМИ условия, и только потом подписываем именами: иначе
  // два одинаковых текста, приписанных к разным позициям, выглядели бы как
  // разные и дублировались в снапшоте.
  const distinct = [...new Set(rendered.map(r => r.text))]
  const terms = distinct.length === 1
    ? distinct[0]!
    // Условия разные — без имени позиции покупатель не поймёт, к чему срок
    : rendered.map(r => (r.name ? `${r.name}: ${r.text}` : r.text)).join('\n\n')

  return { isPreorder: true, prepayment, terms: terms.slice(0, 2000) }
}

// ─── Витрина: кого показываем ────────────────────────────────────────────────

/**
 * Условие «есть что купить»: живой остаток ИЛИ предзаказ. Один фрагмент на все
 * витринные выборки (каталог, категории, бренды) — иначе счётчик категории
 * разойдётся со списком товаров, как это уже было с латентными дублями.
 *
 * Готовность условий предоплаты SQL не проверяет: она зависит от дефолтов
 * магазина. Её досеивает isProductVisible — предзаказных товаров единицы,
 * и лишний проход по ним ничего не стоит.
 */
export const STOCK_OR_PREORDER_WHERE = {
  OR: [
    { variants: { some: { quantity: { gt: 0 }, inStock: true } } },
    { isPreorder: true },
  ],
}

/** Какие варианты вообще показываем: живые + предзаказные (у них остаток 0). */
export const VISIBLE_VARIANT_WHERE = {
  OR: [
    { inStock: true, quantity: { gt: 0 } },
    { isPreorder: true },
  ],
}

/**
 * Пускать ли товар на витрину.
 *
 * Живой остаток пускает всегда. Товар без остатка — только если он помечен
 * предзаказом И условия предоплаты полны. Полузаполненный предзаказ на витрине
 * означал бы кнопку «оформить» с неизвестной суммой, поэтому он остаётся
 * невидимым и ждёт владельца в «Ошибках в товарах».
 */
export function isProductVisible(
  p: PreorderProductFields & { hasLiveVariants: boolean },
  defaults: PreorderDefaults,
): boolean {
  if (p.hasLiveVariants) return true
  return resolvePreorder(p, defaults).kind === 'ready'
}

/** Цена предзаказа для витрины: что берём вперёд и что останется. */
export interface VariantPreorderView {
  prepayment: string
  remaining: string
  eta: string | null
  terms: string | null
}

export function variantPreorderView(price: Decimal, policy: PreorderPolicy): VariantPreorderView {
  const split = computePrepayment(price, policy)
  return {
    prepayment: split.prepayment.toFixed(0),
    remaining: split.remaining.toFixed(0),
    eta: policy.eta,
    terms: renderPreorderTerms(policy.terms, {
      prepayment: split.prepayment, remaining: split.remaining, eta: policy.eta,
    }),
  }
}
