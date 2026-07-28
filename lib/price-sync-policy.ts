/**
 * Решение ценовой ветки синка для варианта (PR-7). Вынесено в чистую функцию:
 * это единственное место, где выбирается действие с ценой при прогоне
 * «лист → БД», и его можно тестировать без Google API.
 *
 * Действия:
 * - freeze              — цену/закупку НЕ трогаем. Две причины заморозки:
 *                         (1) вариант принадлежит applied-батчу с
 *                         writebackFailed — иначе часовой синк откатил бы
 *                         применённый батч (усиление владельца №2 к PR-7);
 *                         (2) на варианте ИДЁТ АКЦИЯ — иначе лист вернул бы
 *                         полную цену, покупатель перестал бы видеть скидку,
 *                         а панель продолжала бы показывать «акция активна»;
 * - recalc_from_cost    — закупка в листе изменилась → пересчитать розницу
 *                         по правилам наценки (существующий path 1);
 * - respect_sheet_price — розницу поправили руками в листе → уважать лист
 *                         (существующий path 2);
 * - mirror_sheet_price  — ничего не менялось → обычное зеркалирование.
 *
 * Инвариант овеаррайда (усиление №4): apply пишет в БД и в лист согласованно
 * cost + retail + lastSyncedCostPrice = новым значениям. После этого
 * sheetCost == lastSyncedCost (path 1 молчит) и sheetPrice == dbPrice
 * (path 2 молчит) → mirror, применённая цена переживает синк.
 */

export type PriceSyncAction = 'freeze' | 'recalc_from_cost' | 'respect_sheet_price' | 'mirror_sheet_price'

export interface PriceSyncInput {
  sheetCost: number | null      // закупочная из листа (L), null/0 = не задана
  lastSyncedCost: number | null // снапшот закупки на момент последнего синка
  dbPrice: number               // текущая розница в БД
  sheetPrice: number            // розница в листе (M)
  frozen: boolean               // вариант в applied-батче с writebackFailed=true
}

export function decidePriceSync(i: PriceSyncInput): PriceSyncAction {
  if (i.frozen) return 'freeze'
  if (i.sheetCost !== null && i.sheetCost > 0 && i.sheetCost !== i.lastSyncedCost) return 'recalc_from_cost'
  if (i.sheetPrice !== i.dbPrice && i.sheetPrice > 0) return 'respect_sheet_price'
  return 'mirror_sheet_price'
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Варианты, чью цену синк должен заморозить:
 *   1) строки applied-батчей с непроехавшим writeback (stats.writebackFailed);
 *   2) товары под ИДУЩЕЙ акцией — их цену держит акция, а не лист.
 */
export async function getFrozenVariantIds(prismaClient: any): Promise<Set<number>> {
  const frozen = new Set<number>()

  const batches: Array<{ id: number }> = await prismaClient.priceApplyBatch.findMany({
    where: { status: 'applied', stats: { path: ['writebackFailed'], equals: true } },
    select: { id: true },
  })
  if (batches.length) {
    // Только ПРИМЕНЁННЫЕ строки (isActive=true): skipped-строки батча цен не
    // получали и морозить их листовые правки нельзя (не-блокер №1 ревью #31)
    const rows: Array<{ variantId: number | null }> = await prismaClient.supplierPrice.findMany({
      where: { batchId: { in: batches.map(b => b.id) }, variantId: { not: null }, isActive: true },
      select: { variantId: true },
    })
    for (const r of rows) if (r.variantId) frozen.add(r.variantId)
  }

  // Акция держит цену, пока идёт: снимки старых цен живут в PromotionPrice и
  // вернутся при отмене. Без этой заморозки скидка жила бы до первого синка.
  const promoRows: Array<{ variantId: number }> = await prismaClient.promotionPrice.findMany({
    where: { promotion: { isActive: true } },
    select: { variantId: true },
  })
  for (const r of promoRows) frozen.add(r.variantId)

  return frozen
}
