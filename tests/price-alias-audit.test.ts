/**
 * Фаза A управления привязками: наблюдаемость PriceAlias.
 *   • linkSupplierPriceRow пишет в AuditLog before (прежние variantId/isIgnored
 *     обоих ключей — раньше upsert затирал их молча) и after с rematchedRowIds +
 *     batchIds (какие именно строки перевязаны, а не счётчик).
 *   • Поведение самой привязки байт-в-байт: аргументы upsert и пере-матч не
 *     изменились, возвращаемый rematched-счётчик прежний.
 *   • auditedAliasUpsert/auditedAliasDelete (легаси-пути бота): create/update
 *     насквозь + before/after в AuditLog.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    priceAlias: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    supplierPrice: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    productVariant: { findUnique: vi.fn() },
    priceApplyBatch: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))

import { prisma } from '../lib/prisma'
import { logAdminAction } from '../lib/audit'
import { linkSupplierPriceRow, auditedAliasUpsert, auditedAliasDelete } from '../lib/price-alias'

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = prisma as any
const audit = logAdminAction as any

const ROW = {
  id: 740,
  rawMessage: 'MacBook MDHE4 Air 13 Midnight (M5, 16GB, 512GB) 2026 117000',
  model: 'MacBook Air 13 M5', storage: '512GB', color: 'Midnight',
}
const RAW_KEY = ROW.rawMessage.toLowerCase()
const COMPOSITE_KEY = 'macbook air 13 m5 512gb midnight'

beforeEach(() => {
  vi.clearAllMocks()
  p.supplierPrice.findUnique.mockResolvedValue(ROW)
  p.productVariant.findUnique.mockResolvedValue({ id: 394 })
  p.priceAlias.findMany.mockResolvedValue([])
  p.priceAlias.upsert.mockImplementation(({ where, create, update }: any) =>
    Promise.resolve({ id: 23, alias: where.alias, variantId: update.variantId ?? create.variantId ?? null, productId: update.productId ?? create.productId ?? null, isIgnored: update.isIgnored ?? create.isIgnored ?? false }))
  p.supplierPrice.findMany.mockResolvedValue([])
  p.supplierPrice.count.mockResolvedValue(0)
})

describe('linkSupplierPriceRow: before/after в AuditLog', () => {
  it('перепривязка: before хранит прежний variantId обоих ключей, after — новый', async () => {
    // Композит уже привязан к 395 (кривой), rawLine-ключа ещё нет
    p.priceAlias.findMany.mockResolvedValue([
      { alias: COMPOSITE_KEY, variantId: 395, productId: null, isIgnored: false },
    ])
    const r = await linkSupplierPriceRow({ supplierPriceId: 740, variantId: 394, actor: { telegramId: '7461166995' } })
    expect(r.ok).toBe(true)

    const entry = audit.mock.calls[0][0]
    expect(entry.action).toBe('price_alias_link')
    expect(entry.before).toEqual({
      aliases: {
        [RAW_KEY]: null,                                                       // ключа не было
        [COMPOSITE_KEY]: { variantId: 395, productId: null, isIgnored: false }, // прежняя привязка
      },
    })
    expect(entry.after).toMatchObject({ variantId: 394, ignore: false })
  })

  it('after: rematchedRowIds + batchIds — какие строки перевязаны, не счётчик', async () => {
    p.supplierPrice.findMany.mockResolvedValue([
      { id: 901, rawMessage: ROW.rawMessage, model: ROW.model, storage: ROW.storage, color: ROW.color, batchId: 53 },
      { id: 902, rawMessage: 'другая строка', model: 'iPhone 17', storage: null, color: null, batchId: 53 },
    ])
    p.supplierPrice.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2)
    p.priceApplyBatch.findUnique.mockResolvedValue({ stats: {} })

    const r = await linkSupplierPriceRow({ supplierPriceId: 740, variantId: 394, actor: { telegramId: '1' } })
    expect(r.rematched).toBe(1)                       // возвращаемый счётчик — как раньше
    expect(r.batchesTouched).toEqual([53])

    const entry = audit.mock.calls[0][0]
    expect(entry.after.rematchedRowIds).toEqual([901]) // только совпавшая по ключам строка
    expect(entry.after.batchIds).toEqual([53])
    expect(entry.after.rematched).toBeUndefined()      // счётчик из аудита ушёл
  })

  it('ignore: before пишется, аргументы upsert прежние (обнуление обоих указателей)', async () => {
    p.priceAlias.findMany.mockResolvedValue([
      { alias: RAW_KEY, variantId: 395, productId: null, isIgnored: false },
    ])
    const r = await linkSupplierPriceRow({ supplierPriceId: 740, ignore: true, actor: { telegramId: '1' } })
    expect(r.ok).toBe(true)

    for (const call of p.priceAlias.upsert.mock.calls) {
      expect(call[0].update).toEqual({ isIgnored: true, variantId: null, productId: null })
    }
    const entry = audit.mock.calls[0][0]
    expect(entry.action).toBe('price_alias_ignore')
    expect(entry.before.aliases[RAW_KEY]).toEqual({ variantId: 395, productId: null, isIgnored: false })
  })

  it('поведение привязки байт-в-байт: аргументы upsert не изменились', async () => {
    await linkSupplierPriceRow({ supplierPriceId: 740, variantId: 394, actor: { telegramId: '1' } })
    const aliases = p.priceAlias.upsert.mock.calls.map((c: any) => c[0].where.alias).sort()
    expect(aliases).toEqual([COMPOSITE_KEY, RAW_KEY].sort())
    for (const call of p.priceAlias.upsert.mock.calls) {
      expect(call[0].update).toEqual({ variantId: 394, isIgnored: false })
      expect(call[0].create).toEqual({ alias: call[0].where.alias, variantId: 394 })
    }
  })
})

describe('auditedAliasUpsert / auditedAliasDelete (легаси-пути бота)', () => {
  it('upsert: create/update насквозь, before/after в аудите', async () => {
    p.priceAlias.findMany.mockResolvedValue([
      { alias: 'яблоко 16 про', variantId: 777, productId: null, isIgnored: false },
    ])
    p.priceAlias.upsert.mockResolvedValue({ id: 5, alias: 'яблоко 16 про', variantId: null, productId: 42, isIgnored: false })

    await auditedAliasUpsert({
      actor: { telegramId: '555000111' },
      alias: 'яблоко 16 про',
      create: { alias: 'яблоко 16 про', productId: 42, isIgnored: false },
      update: { productId: 42, variantId: null, isIgnored: false },
      via: 'bot_alias_add',
    })

    expect(p.priceAlias.upsert).toHaveBeenCalledWith({
      where: { alias: 'яблоко 16 про' },
      create: { alias: 'яблоко 16 про', productId: 42, isIgnored: false },
      update: { productId: 42, variantId: null, isIgnored: false },
    })
    const entry = audit.mock.calls[0][0]
    expect(entry.action).toBe('price_alias_link')
    expect(entry.before.aliases['яблоко 16 про']).toEqual({ variantId: 777, productId: null, isIgnored: false })
    expect(entry.after).toMatchObject({ productId: 42, via: 'bot_alias_add' })
  })

  it('ignore-upsert логируется как price_alias_ignore', async () => {
    p.priceAlias.upsert.mockResolvedValue({ id: 6, alias: 'доставка', variantId: null, productId: null, isIgnored: true })
    await auditedAliasUpsert({
      actor: { telegramId: '1' }, alias: 'доставка',
      create: { alias: 'доставка', isIgnored: true },
      update: { isIgnored: true, productId: null, variantId: null },
      via: 'bot_alias_ignore',
    })
    expect(audit.mock.calls[0][0].action).toBe('price_alias_ignore')
  })

  it('delete: before в аудите, count наружу; не найдено — аудита нет', async () => {
    p.priceAlias.findMany.mockResolvedValue([
      { alias: 'старый', variantId: 9, productId: null, isIgnored: false },
    ])
    p.priceAlias.deleteMany.mockResolvedValue({ count: 1 })
    expect(await auditedAliasDelete({ actor: { telegramId: '1' }, alias: 'старый', via: 'bot_alias_remove' })).toBe(1)
    const entry = audit.mock.calls[0][0]
    expect(entry.action).toBe('price_alias_remove')
    expect(entry.before.aliases['старый']).toEqual({ variantId: 9, productId: null, isIgnored: false })

    audit.mockClear()
    p.priceAlias.findMany.mockResolvedValue([])
    p.priceAlias.deleteMany.mockResolvedValue({ count: 0 })
    expect(await auditedAliasDelete({ actor: { telegramId: '1' }, alias: 'нет такого', via: 'bot_alias_remove' })).toBe(0)
    expect(audit).not.toHaveBeenCalled()
  })
})
