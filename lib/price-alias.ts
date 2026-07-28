/**
 * Обучение алиасами из веба (PR-8): «связал один раз — дальше узнаёт сама».
 *
 * Связывание строки «не узнал» с вариантом:
 * 1) создаёт/обновляет PriceAlias по ДВУМ ключам матчера — точный rawMessage
 *    и композит «model storage color» (оба lower) — будущие прайсы матчятся
 *    без подсказки;
 * 2) точечно пере-матчит unmatched-строки существующих preview-батчей по
 *    этим ключам (isActive остаётся false — read-only контракт не трогаем);
 * 3) обновляет счётчики stats затронутых батчей.
 *
 * «Игнорировать» (это не наш товар): PriceAlias.isIgnored — будущие разборы
 * пропускают строку; текущие unmatched-строки остаются как есть (истории
 * батча не переписываем).
 */
import { prisma } from './prisma'
import { logAdminAction } from './audit'

function aliasKeysFor(row: { rawMessage: string; model: string; storage: string | null; color: string | null }): string[] {
  const composite = (row.model + (row.storage ? ' ' + row.storage : '') + (row.color ? ' ' + row.color : '')).trim().toLowerCase()
  const raw = row.rawMessage.trim().toLowerCase()
  return [...new Set([raw, composite].filter(Boolean))]
}

export interface LinkResult {
  ok: boolean
  status: number
  error?: string
  aliases?: string[]
  rematched?: number   // строк в preview-батчах, довязанных этим алиасом
  batchesTouched?: number[]
}

export async function linkSupplierPriceRow(opts: {
  supplierPriceId: number
  variantId?: number
  ignore?: boolean
  actor: { telegramId: string }
}): Promise<LinkResult> {
  const row = await prisma.supplierPrice.findUnique({ where: { id: opts.supplierPriceId } })
  if (!row) return { ok: false, status: 404, error: 'Строка прайса не найдена' }

  if (!opts.ignore) {
    if (!opts.variantId) return { ok: false, status: 422, error: 'Укажите variantId или ignore' }
    const variant = await prisma.productVariant.findUnique({ where: { id: opts.variantId }, select: { id: true } })
    if (!variant) return { ok: false, status: 404, error: 'Вариант не найден' }
  }

  const keys = aliasKeysFor(row)
  for (const alias of keys) {
    await prisma.priceAlias.upsert({
      where: { alias },
      update: opts.ignore ? { isIgnored: true, variantId: null, productId: null } : { variantId: opts.variantId!, isIgnored: false },
      create: opts.ignore ? { alias, isIgnored: true } : { alias, variantId: opts.variantId! },
    })
  }

  let rematched = 0
  const batchesTouched = new Set<number>()
  if (!opts.ignore) {
    // Точечный пере-матч: unmatched-строки preview-батчей с теми же ключами
    const candidates = await prisma.supplierPrice.findMany({
      where: { variantId: null, batch: { status: 'preview' } },
      select: { id: true, rawMessage: true, model: true, storage: true, color: true, batchId: true },
    })
    for (const c of candidates) {
      if (!aliasKeysFor(c).some(k => keys.includes(k))) continue
      await prisma.supplierPrice.update({ where: { id: c.id }, data: { variantId: opts.variantId! } })
      rematched++
      if (c.batchId) batchesTouched.add(c.batchId)
    }
    // Обновить счётчики затронутых батчей
    for (const batchId of batchesTouched) {
      const [total, matched] = await Promise.all([
        prisma.supplierPrice.count({ where: { batchId } }),
        prisma.supplierPrice.count({ where: { batchId, variantId: { not: null } } }),
      ])
      const b = await prisma.priceApplyBatch.findUnique({ where: { id: batchId }, select: { stats: true } })
      await prisma.priceApplyBatch.update({
        where: { id: batchId },
        data: { stats: { ...(b?.stats as object), matchedRows: matched, matchedVariants: matched, unmatchedRows: total - matched } as object },
      })
    }
  }

  void logAdminAction({
    adminTelegramId: opts.actor.telegramId,
    action: opts.ignore ? 'price_alias_ignore' : 'price_alias_link',
    entity: 'PriceAlias',
    entityId: opts.supplierPriceId,
    after: { aliases: keys, variantId: opts.variantId ?? null, ignore: !!opts.ignore, rematched },
  })

  return { ok: true, status: 200, aliases: keys, rematched, batchesTouched: [...batchesTouched] }
}

/** Сводная очередь «не узнал»: unmatched-строки всех preview-батчей. */
export async function listUnmatched(limit = 100): Promise<Array<{
  supplierPriceId: number
  batchId: number | null
  rawLine: string
  model: string
  price: number
  supplierName: string | null
  parsedAt: Date
}>> {
  const rows = await prisma.supplierPrice.findMany({
    where: { variantId: null, batch: { status: 'preview' } },
    orderBy: { id: 'desc' },
    take: limit,
    include: { supplier: { select: { name: true } } },
  })
  return rows.map(r => ({
    supplierPriceId: r.id,
    batchId: r.batchId,
    rawLine: r.rawMessage,
    model: r.model,
    price: Number(r.price),
    supplierName: r.supplier?.name ?? null,
    parsedAt: r.parsedAt,
  }))
}
