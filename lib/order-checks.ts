/**
 * Проверки позиции заказа на чекауте (аудит №2). Вынесены из api/server.ts:
 * правило «скрытый товар не покупается никогда» должно тестироваться без
 * поднятия сервера.
 *
 * Ошибка помечается isStockConflict — существующий обработчик заказа отдаёт
 * по ней человеческий 409 вместо 500.
 */
import log from './logger'

export interface OrderableVariant {
  /** Decimal | string | number — сравниваем численно */
  price: { toString(): string } | string | number
  inStock: boolean
  quantity: number
  /** Предзаказный вариант: остаток 0 — норма, но касса должна уметь предоплату */
  isPreorder?: boolean
  product: { isAvailable: boolean; isPreorder?: boolean }
}

const conflict = (message: string): Error =>
  Object.assign(new Error(message), { isStockConflict: true })

/**
 * Кидает isStockConflict-ошибку, если вариант нельзя заказать.
 *
 * Порядок правил:
 * 1) вариант исчез → «Товар не найден»;
 * 2) товар скрыт (product.isAvailable=false) → отказ ВСЕГДА, независимо от
 *    STOCK_WRITEOFF_ENABLED — скрытые/черновые строки заказуемы только
 *    перебором variantId, это не покупка;
 * 3) цена ≤ 0 → отказ (черновик без цены — «Уточняйте у менеджера»);
 * 4) предзаказ → отказ, пока касса не умеет считать предоплату (снимается
 *    вместе с предзаказной ветвью чекаута). Товар с флагом предзаказа виден
 *    как isAvailable=true даже с нулём на складе, и без этого правила его
 *    можно было бы заказать перебором variantId — без предоплаты, без условий
 *    и без пометки оператору. Заказ БЕЗ обязательства хуже отказа;
 * 5) остаток — только при включённом списании (как раньше) и только для
 *    обычных позиций: у предзаказа ноль на складе — это и есть смысл.
 */
export function assertOrderableVariant(
  variant: OrderableVariant | null,
  requestedQty: number,
  stockCheckEnabled: boolean,
  variantId?: number,
): asserts variant is OrderableVariant {
  if (!variant) {
    throw conflict('Товар не найден')
  }
  if (!variant.product.isAvailable) {
    log.warn('Order for hidden product rejected', { variantId })
    throw conflict('Товар недоступен для заказа')
  }
  if (Number(variant.price) <= 0) {
    log.warn('Order for zero-price variant rejected', { variantId })
    throw conflict('Товар недоступен для заказа')
  }
  const isPreorder = variant.isPreorder === true || variant.product.isPreorder === true
  if (isPreorder) {
    log.warn('Preorder checkout not enabled yet', { variantId })
    throw conflict('Предзаказ этого товара пока нельзя оформить — напишите менеджеру')
  }
  if (stockCheckEnabled && (!variant.inStock || variant.quantity < requestedQty)) {
    log.warn('Stock conflict', { variantId, available: variant.quantity, requested: requestedQty })
    throw conflict('Товар закончился или недоступен')
  }
}
