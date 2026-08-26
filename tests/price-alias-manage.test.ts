/**
 * Фаза B: управление привязками (list / rebind / update / delete / rollback).
 *   • rebind работает ВСЕГДА: уже привязанная строка (не 409), авто-узнанная
 *     без алиаса (создаётся override), применённая история не переписывается;
 *   • updateAlias — дельта before/after + точечный пере-матч по этому ключу;
 *   • rollback — только preview-слой, конфликт-гейт, применённые батчи в отчёт,
 *     повторный откат → 409 (схема rollbackRecalc);
 *   • списки: обогащение вариантом и audit-следом; auto-matched без алиасов.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    priceAlias: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), delete: vi.fn() },
    supplierPrice: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    productVariant: { findUnique: vi.fn(), findMany: vi.fn() },
    product: { findMany: vi.fn() },
    priceApplyBatch: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { findFirst: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))

import { prisma } from '../lib/prisma'
import { logAdminAction } from '../lib/audit'
import {
  rebindSupplierPriceRow, updateAlias, deleteAlias, rollbackAliasEffect,
  listAliases, listAutoMatched,
} from '../lib/price-alias'

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = prisma as any
const audit = logAdminAction as any
const ACTOR = { telegramId: '7461166995' }

const ROW = {
  id: 740, batchId: 53,
  rawMessage: 'MacBook MDHE4 Air 13 Midnight (M5, 16GB, 512GB) 2026 117000',
  model: 'MacBook Air 13 M5', storage: '512GB', color: 'Midnight',
  variantId: 395, parsedAt: new Date('2026-08-26T09:00:00Z'),
}
const RAW_KEY = ROW.rawMessage.toLowerCase()
const COMPOSITE_KEY = 'macbook air 13 m5 512gb midnight'

beforeEach(() => {
  vi.clearAllMocks()
  p.productVariant.findUnique.mockResolvedValue({ id: 394 })
  p.productVariant.findMany.mockResolvedValue([])
  p.product.findMany.mockResolvedValue([])
  p.priceAlias.findMany.mockResolvedValue([])
  p.priceAlias.upsert.mockResolvedValue({})
  p.priceAlias.update.mockResolvedValue({})
  p.priceAlias.delete.mockResolvedValue({})
  p.supplierPrice.findMany.mockResolvedValue([])
  p.supplierPrice.count.mockResolvedValue(0)
  p.priceApplyBatch.findUnique.mockResolvedValue({ stats: {} })
  p.auditLog.findFirst.mockResolvedValue(null)
  p.auditLog.findMany.mockResolvedValue([])
  p.$transaction.mockImplementation((fn: any) => fn(p))
})

describe('rebindSupplierPriceRow — перепривязка работает всегда', () => {
  it('уже привязанная preview-строка: НЕ 409, строка перевязана, before со старым вариантом', async () => {
    p.supplierPrice.findUnique.mockResolvedValue({ ...ROW, batch: { id: 53, status: 'preview' } })
    p.priceAlias.findMany.mockResolvedValue([
      { alias: COMPOSITE_KEY, variantId: 395, productId: null, isIgnored: false },
    ])
    const r = await rebindSupplierPriceRow({ supplierPriceId: 740, variantId: 394, actor: ACTOR })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)          // не 409 «уже привязана»
    expect(r.rowUpdated).toBe(true)
    expect(p.supplierPrice.update).toHaveBeenCalledWith({ where: { id: 740 }, data: { variantId: 394 } })

    const entry = audit.mock.calls[0][0]
    expect(entry.action).toBe('price_alias_rebind')
    expect(entry.before.rowVariantId).toBe(395)                                  // прежний вариант строки
    expect(entry.before.aliases[COMPOSITE_KEY]).toMatchObject({ variantId: 395 }) // прежняя привязка ключа
    expect(entry.after.rematchedRowIds).toContain(740)
    expect(entry.after.batchIds).toEqual([53])
  })

  it('авто-узнанная строка без алиаса: создаётся override-алиас по обоим ключам', async () => {
    p.supplierPrice.findUnique.mockResolvedValue({ ...ROW, batch: { id: 53, status: 'preview' } })
    p.priceAlias.findMany.mockResolvedValue([]) // алиасов не было — система узнала сама

    const r = await rebindSupplierPriceRow({ supplierPriceId: 740, variantId: 394, actor: ACTOR })
    expect(r.ok).toBe(true)

    const upserted = p.priceAlias.upsert.mock.calls.map((c: any) => c[0])
    expect(upserted.map((u: any) => u.where.alias).sort()).toEqual([COMPOSITE_KEY, RAW_KEY].sort())
    for (const u of upserted) {
      expect(u.create).toEqual({ alias: u.where.alias, variantId: 394 })
      // override: ключ указывает ровно на вариант, productId обнуляется
      expect(u.update).toEqual({ variantId: 394, productId: null, isIgnored: false })
    }
    const entry = audit.mock.calls[0][0]
    expect(entry.before.aliases).toEqual({ [RAW_KEY]: null, [COMPOSITE_KEY]: null })
  })

  it('строка в применённом батче: алиас учится, история строки не переписывается', async () => {
    p.supplierPrice.findUnique.mockResolvedValue({ ...ROW, batch: { id: 52, status: 'applied' } })
    const r = await rebindSupplierPriceRow({ supplierPriceId: 740, variantId: 394, actor: ACTOR })
    expect(r.ok).toBe(true)
    expect(r.rowUpdated).toBe(false)
    expect(p.supplierPrice.update).not.toHaveBeenCalled()   // unmatched-кандидатов нет
    expect(p.priceAlias.upsert).toHaveBeenCalledTimes(2)    // но алиасы записаны
  })

  it('перепривязка довязывает и другие unmatched preview-строки с теми же ключами', async () => {
    p.supplierPrice.findUnique.mockResolvedValue({ ...ROW, variantId: null, batch: { id: 53, status: 'preview' } })
    p.supplierPrice.findMany.mockResolvedValue([
      { id: 901, rawMessage: ROW.rawMessage, model: ROW.model, storage: ROW.storage, color: ROW.color, batchId: 39 },
    ])
    const r = await rebindSupplierPriceRow({ supplierPriceId: 740, variantId: 394, actor: ACTOR })
    expect(r.rematched).toBe(2)  // сама строка + довязанная
    expect(audit.mock.calls[0][0].after.rematchedRowIds).toEqual([740, 901])
    expect([...audit.mock.calls[0][0].after.batchIds].sort()).toEqual([39, 53])
  })
})

describe('updateAlias — PUT по привязке', () => {
  it('перепривязка на другой вариант: дельта before/after + пере-матч по этому ключу', async () => {
    p.priceAlias.findUnique.mockResolvedValue({ id: 23, alias: COMPOSITE_KEY, variantId: 395, productId: null, isIgnored: false })
    p.supplierPrice.findMany.mockResolvedValue([
      { id: 901, rawMessage: ROW.rawMessage, model: ROW.model, storage: ROW.storage, color: ROW.color, batchId: 53 },
      { id: 902, rawMessage: 'iPhone 17 128', model: 'iPhone 17', storage: '128GB', color: null, batchId: 53 },
    ])
    const r = await updateAlias({ id: 23, variantId: 394, actor: ACTOR })
    expect(r.ok).toBe(true)
    expect(p.priceAlias.update).toHaveBeenCalledWith({ where: { id: 23 }, data: { variantId: 394, productId: null, isIgnored: false } })

    const entry = audit.mock.calls[0][0]
    expect(entry.action).toBe('price_alias_update')
    expect(entry.before).toEqual({ alias: COMPOSITE_KEY, variantId: 395, productId: null, isIgnored: false })
    expect(entry.after.variantId).toBe(394)
    expect(entry.after.rematchedRowIds).toEqual([901]) // только строка с этим ключом
  })

  it('переключение в ignore обнуляет оба указателя', async () => {
    p.priceAlias.findUnique.mockResolvedValue({ id: 23, alias: COMPOSITE_KEY, variantId: 395, productId: null, isIgnored: false })
    const r = await updateAlias({ id: 23, ignore: true, actor: ACTOR })
    expect(r.ok).toBe(true)
    expect(p.priceAlias.update).toHaveBeenCalledWith({ where: { id: 23 }, data: { isIgnored: true, variantId: null, productId: null } })
  })

  it('валидация: ничего не передано или всё сразу → 422', async () => {
    p.priceAlias.findUnique.mockResolvedValue({ id: 23, alias: COMPOSITE_KEY, variantId: 395, productId: null, isIgnored: false })
    expect((await updateAlias({ id: 23, actor: ACTOR })).status).toBe(422)
    expect((await updateAlias({ id: 23, variantId: 1, ignore: true, actor: ACTOR })).status).toBe(422)
  })
})

describe('deleteAlias — «забыть привязку»', () => {
  it('пишет before и удаляет', async () => {
    p.priceAlias.findUnique.mockResolvedValue({ id: 23, alias: COMPOSITE_KEY, variantId: 395, productId: null, isIgnored: false })
    const r = await deleteAlias({ id: 23, actor: ACTOR })
    expect(r.ok).toBe(true)
    expect(p.priceAlias.delete).toHaveBeenCalledWith({ where: { id: 23 } })
    const entry = audit.mock.calls[0][0]
    expect(entry.action).toBe('price_alias_remove')
    expect(entry.before).toEqual({ alias: COMPOSITE_KEY, variantId: 395, productId: null, isIgnored: false })
  })
})

describe('rollbackAliasEffect — откат эффекта, три слоя', () => {
  const ALIAS = { id: 23, alias: COMPOSITE_KEY, variantId: 395, productId: null, isIgnored: false }

  it('возвращает perевязанные preview-строки в «не узнал», применённые не трогает', async () => {
    p.priceAlias.findUnique.mockResolvedValue(ALIAS)
    p.auditLog.findFirst.mockImplementation(async ({ where }: any) =>
      where.action === 'price_alias_rollback' ? null : { id: 840, after: {} })
    p.auditLog.findMany.mockResolvedValue([
      { after: { aliases: [COMPOSITE_KEY], rematchedRowIds: [901, 720] } },
    ])
    // byVariant (фолбэк-скан) пустой; строки из аудита: 901 preview, 720 applied
    p.supplierPrice.findMany.mockImplementation(async ({ where }: any) =>
      where.id
        ? [
            { id: 901, rawMessage: ROW.rawMessage, model: ROW.model, storage: ROW.storage, color: ROW.color, variantId: 395, batchId: 53, batch: { id: 53, status: 'preview' } },
            { id: 720, rawMessage: ROW.rawMessage, model: ROW.model, storage: ROW.storage, color: ROW.color, variantId: 395, batchId: 52, batch: { id: 52, status: 'applied' } },
          ]
        : [])

    const r = await rollbackAliasEffect({ id: 23, actor: ACTOR })
    expect(r.ok).toBe(true)
    expect(r.restored).toBe(1)
    expect(r.appliedBatches).toEqual([52])   // слой 3 — только штатный батч-откат
    expect(p.supplierPrice.update).toHaveBeenCalledTimes(1)
    expect(p.supplierPrice.update).toHaveBeenCalledWith({ where: { id: 901 }, data: { variantId: null } })
    expect(p.$transaction).toHaveBeenCalled()
    expect(p.priceApplyBatch.update).toHaveBeenCalled() // stats пересчитаны

    const entry = audit.mock.calls[0][0]
    expect(entry.action).toBe('price_alias_rollback')
    expect(entry.before.restoredRowIds).toEqual([901])
  })

  it('конфликт-гейт: строку перевязали после — пропускаем и отдаём в conflicts', async () => {
    p.priceAlias.findUnique.mockResolvedValue(ALIAS)
    p.auditLog.findFirst.mockImplementation(async ({ where }: any) =>
      where.action === 'price_alias_rollback' ? null : { id: 840, after: {} })
    p.auditLog.findMany.mockResolvedValue([{ after: { aliases: [COMPOSITE_KEY], rematchedRowIds: [901] } }])
    p.supplierPrice.findMany.mockImplementation(async ({ where }: any) =>
      where.id
        ? [{ id: 901, rawMessage: ROW.rawMessage, model: ROW.model, storage: ROW.storage, color: ROW.color, variantId: 777, batchId: 53, batch: { id: 53, status: 'preview' } }]
        : [])

    const r = await rollbackAliasEffect({ id: 23, actor: ACTOR })
    expect(r.restored).toBe(0)
    expect(r.conflicts).toEqual([{ rowId: 901, expected: 395, actual: 777 }])
    expect(p.supplierPrice.update).not.toHaveBeenCalled()
  })

  it('до-A привязка без rematchedRowIds: консервативный фолбэк — preview-строки с variantId алиаса и ЕГО ключом', async () => {
    p.priceAlias.findUnique.mockResolvedValue(ALIAS)
    p.auditLog.findFirst.mockImplementation(async ({ where }: any) =>
      where.action === 'price_alias_rollback' ? null : { id: 24, after: {} })
    p.auditLog.findMany.mockResolvedValue([{ after: { aliases: [COMPOSITE_KEY], rematched: 2 } }]) // старый формат, без ids
    p.supplierPrice.findMany.mockImplementation(async ({ where }: any) =>
      where.variantId === 395
        ? [
            { id: 901, rawMessage: ROW.rawMessage, model: ROW.model, storage: ROW.storage, color: ROW.color, variantId: 395, batchId: 53, batch: { id: 53, status: 'preview' } },
            // однофамилец по имени, ключи другие — фолбэк его НЕ трогает
            { id: 902, rawMessage: 'MacBook Air 15 M5 512 Midnight', model: 'MacBook Air 15 M5', storage: '512GB', color: 'Midnight', variantId: 395, batchId: 53, batch: { id: 53, status: 'preview' } },
          ]
        : [])

    const r = await rollbackAliasEffect({ id: 23, actor: ACTOR })
    expect(r.restored).toBe(1)
    expect(p.supplierPrice.update).toHaveBeenCalledWith({ where: { id: 901 }, data: { variantId: null } })
  })

  it('повторный откат → 409', async () => {
    p.priceAlias.findUnique.mockResolvedValue(ALIAS)
    p.auditLog.findFirst.mockImplementation(async ({ where }: any) =>
      where.action === 'price_alias_rollback' ? { id: 999 } : { id: 840, after: {} })
    const r = await rollbackAliasEffect({ id: 23, actor: ACTOR })
    expect(r.status).toBe(409)
  })

  it('ignore-привязка → 422, эффекта нет', async () => {
    p.priceAlias.findUnique.mockResolvedValue({ ...ALIAS, variantId: null, isIgnored: true })
    expect((await rollbackAliasEffect({ id: 23, actor: ACTOR })).status).toBe(422)
  })
})

describe('списки', () => {
  it('listAliases: обогащение вариантом (имя товара + fullName) и audit-следом via', async () => {
    p.priceAlias.findMany.mockResolvedValue([
      { id: 23, alias: COMPOSITE_KEY, variantId: 394, productId: null, isIgnored: false, createdAt: new Date(), updatedAt: new Date() },
      { id: 5, alias: 'яблоко 16 про', variantId: null, productId: 42, isIgnored: false, createdAt: new Date(), updatedAt: new Date() },
    ])
    p.productVariant.findMany.mockResolvedValue([
      { id: 394, attributes: { fullName: 'MacBook Air 13 M5 16GB 512GB Midnight' }, product: { name: 'Macbook Air M5' } },
    ])
    p.product.findMany.mockResolvedValue([{ id: 42, name: 'iPhone 16 Pro' }])
    p.auditLog.findMany.mockResolvedValue([
      { adminTelegramId: '555', createdAt: new Date(), after: { aliases: ['яблоко 16 про'], via: 'bot_alias_add' } },
    ])

    const list = await listAliases()
    expect(list[0]).toMatchObject({ id: 23, productName: 'Macbook Air M5', fullName: 'MacBook Air 13 M5 16GB 512GB Midnight' })
    expect(list[1]).toMatchObject({ id: 5, productName: 'iPhone 16 Pro', via: 'bot_alias_add', lastActorId: '555' })
  })

  it('listAutoMatched: отдаёт только строки без алиасов по их ключам', async () => {
    p.supplierPrice.findMany.mockResolvedValue([
      { id: 901, rawMessage: 'iPhone 17 Pro 256 Silver 122500', model: 'iPhone 17 Pro', storage: '256GB', color: 'Silver', variantId: 10, batchId: 53, batch: { id: 53, status: 'preview' }, parsedAt: new Date() },
      { id: 902, rawMessage: ROW.rawMessage, model: ROW.model, storage: ROW.storage, color: ROW.color, variantId: 394, batchId: 53, batch: { id: 53, status: 'preview' }, parsedAt: new Date() },
    ])
    p.priceAlias.findMany.mockResolvedValue([{ alias: COMPOSITE_KEY }]) // у 902 алиас есть
    p.productVariant.findMany.mockResolvedValue([
      { id: 10, attributes: { fullName: 'iPhone 17 Pro 256GB Silver' }, product: { name: 'iPhone 17 Pro' } },
    ])
    const rows = await listAutoMatched()
    expect(rows.map(r => r.supplierPriceId)).toEqual([901])
    expect(rows[0]).toMatchObject({ productName: 'iPhone 17 Pro', fullName: 'iPhone 17 Pro 256GB Silver' })
  })
})
