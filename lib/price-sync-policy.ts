/**
 * Решение ценовой ветки синка для варианта (PR-7). Вынесено в чистую функцию:
 * это единственное место, где выбирается действие с ценой при прогоне
 * «лист → БД», и его можно тестировать без Google API.
 *
 * Действия:
 * - freeze              — вариант принадлежит applied-батчу с writebackFailed:
 *                         цену/закупку НЕ трогаем, пока writeback не проехал
 *                         (иначе часовой синк откатил бы применённый батч —
 *                         обязательное усиление владельца №2 к PR-7);
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
 * Варианты, чью цену синк должен заморозить: строки applied-батчей,
 * у которых writeback в лист не проехал (stats.writebackFailed = true).
 */
export async function getFrozenVariantIds(prismaClient: any): Promise<Set<number>> {
  const batches: Array<{ id: number }> = await prismaClient.priceApplyBatch.findMany({
    where: { status: 'applied', stats: { path: ['writebackFailed'], equals: true } },
    select: { id: true },
  })
  if (!batches.length) return new Set()
  // Только ПРИМЕНЁННЫЕ строки (isActive=true): skipped-строки батча цен не
  // получали и морозить их листовые правки нельзя (не-блокер №1 ревью #31)
  const rows: Array<{ variantId: number | null }> = await prismaClient.supplierPrice.findMany({
    where: { batchId: { in: batches.map(b => b.id) }, variantId: { not: null }, isActive: true },
    select: { variantId: true },
  })
  return new Set(rows.map(r => r.variantId!).filter(Boolean))
}
