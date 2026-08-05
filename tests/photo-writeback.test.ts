/**
 * Фото товара — зеркало таблицы. Тесты держат главный инвариант: без записи
 * в лист в БД не пишем вовсе, иначе синк сотрёт фото ближайшим прогоном.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/prisma', () => ({
  prisma: {
    productVariant: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    product: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/api-key-store', () => ({ getApiKeyValue: vi.fn(), setApiKeyValue: vi.fn() }))

import { prisma } from '../lib/prisma'
import { setApiKeyValue } from '../lib/api-key-store'
import { buildPhotoUpdates, setVariantPhoto, setProductMainPhoto } from '../lib/photo-writeback'

/* eslint-disable @typescript-eslint/no-explicit-any */
const pv = prisma.productVariant as any
const pp = prisma.product as any
const bump = setApiKeyValue as any
const ACTOR = '900'
const PHOTO = '/photos/iphone-17-pro.webp'

const sheet = (rows: string[][]) => [{ name: 'iPhone', data: [['A', 'B', 'C', 'D', 'Название'], ...rows] }]

beforeEach(() => {
  ;[pv.findUnique, pv.update, pv.findMany, pp.findUnique, pp.update, bump].forEach(f => f.mockReset())
  pv.update.mockResolvedValue({})
  pv.findMany.mockResolvedValue([{ photoUrls: [PHOTO] }])
  pp.update.mockResolvedValue({})
})

describe('адресация строки в таблице', () => {
  it('пишет в колонку фото найденной строки', () => {
    const { updates, missing } = buildPhotoUpdates(
      [{ fullName: 'iPhone 17 Pro 256 (Индия)', photo: PHOTO }],
      sheet([['', '', '', '', 'iPhone 16 128 (Китай)'], ['', '', '', '', 'iPhone 17 Pro 256 (Индия)']]),
    )
    expect(missing).toEqual([])
    expect(updates).toEqual([{ range: "'iPhone'!Q3", values: [[PHOTO]] }])
  })

  it('регистр и пробелы в названии не мешают', () => {
    const { updates } = buildPhotoUpdates(
      [{ fullName: '  IPHONE 17 PRO 256 (ИНДИЯ)  ', photo: PHOTO }],
      sheet([['', '', '', '', 'iPhone 17 Pro 256 (Индия)']]),
    )
    expect(updates).toHaveLength(1)
  })

  it('нет строки — честно в missing, апдейтов нет', () => {
    const { updates, missing } = buildPhotoUpdates(
      [{ fullName: 'Товар, которого нет', photo: PHOTO }],
      sheet([['', '', '', '', 'iPhone 17 Pro 256 (Индия)']]),
    )
    expect(updates).toEqual([])
    expect(missing).toEqual(['товар, которого нет'])
  })

  it('снятие фото = пустая ячейка (ровно то, что синк трактует как «фото нет»)', () => {
    const { updates } = buildPhotoUpdates(
      [{ fullName: 'iPhone 17 Pro 256 (Индия)', photo: '' }],
      sheet([['', '', '', '', 'iPhone 17 Pro 256 (Индия)']]),
    )
    expect(updates).toEqual([{ range: "'iPhone'!Q2", values: [['']] }])
  })
})

describe('фото предложения', () => {
  const variant = {
    id: 7, productId: 3, photoUrls: [],
    attributes: { fullName: 'iPhone 17 Pro 256 (Индия)', 'Страна': 'Индия' },
  }

  it('таблица первая, БД вторая', async () => {
    pv.findUnique.mockResolvedValue(variant)
    const seen: unknown[] = []
    const wb = vi.fn(async (rows: unknown) => { seen.push(rows); return { missing: [] } })

    const r = await setVariantPhoto(ACTOR, 7, PHOTO, wb)
    expect(r).toMatchObject({ ok: true, photoUrl: PHOTO })
    expect(seen[0]).toEqual([{ fullName: 'iPhone 17 Pro 256 (Индия)', photo: PHOTO }])
    expect(pv.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { photoUrls: [PHOTO] } })
  })

  it('после успеха бампает версию кэша — витрина подхватит фото без «Обновить сайт»', async () => {
    pv.findUnique.mockResolvedValue(variant)
    const r = await setVariantPhoto(ACTOR, 7, PHOTO, vi.fn(async () => ({ missing: [] })))
    expect(r.ok).toBe(true)
    expect(bump).toHaveBeenCalledWith('cache_version', expect.any(String))
  })

  it('лист недоступен → 503 и в БД НИЧЕГО не записано', async () => {
    pv.findUnique.mockResolvedValue(variant)
    const wb = vi.fn(async () => { throw new Error('google down') })
    const r = await setVariantPhoto(ACTOR, 7, PHOTO, wb)
    expect(r).toMatchObject({ ok: false, status: 503 })
    expect(r.error).toContain('таблицу')
    expect(pv.update).not.toHaveBeenCalled()          // фото-призрака не завели
    expect(bump).not.toHaveBeenCalled()               // и кэш зря не сбросили
  })

  it('строки нет в листе → 409 и в БД НИЧЕГО не записано (синк бы всё равно стёр)', async () => {
    pv.findUnique.mockResolvedValue(variant)
    const wb = vi.fn(async () => ({ missing: ['iphone 17 pro 256 (индия)'] }))
    const r = await setVariantPhoto(ACTOR, 7, PHOTO, wb)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(pv.update).not.toHaveBeenCalled()
  })

  it('мусорная ссылка отбивается до всякой записи', async () => {
    pv.findUnique.mockResolvedValue(variant)
    const wb = vi.fn(async () => ({ missing: [] }))
    for (const bad of ['javascript:alert(1)', 'https://evil.example.com/x.png', '/photos/../../.env']) {
      expect((await setVariantPhoto(ACTOR, 7, bad, wb)).status).toBe(422)
    }
    expect(wb).not.toHaveBeenCalled()
    expect(pv.update).not.toHaveBeenCalled()
  })

  it('снятие фото чистит и ячейку, и базу', async () => {
    pv.findUnique.mockResolvedValue({ ...variant, photoUrls: [PHOTO] })
    pv.findMany.mockResolvedValue([{ photoUrls: [] }])
    const wb = vi.fn(async () => ({ missing: [] }))
    const r = await setVariantPhoto(ACTOR, 7, null, wb)
    expect(r).toMatchObject({ ok: true, photoUrl: null })
    expect(wb).toHaveBeenCalledWith([{ fullName: 'iPhone 17 Pro 256 (Индия)', photo: '' }])
    expect(pv.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { photoUrls: [] } })
    expect(pp.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { photos: [], photoUrl: null } })
  })

  it('без fullName писать некуда — 422 с объяснением', async () => {
    pv.findUnique.mockResolvedValue({ ...variant, attributes: { 'Страна': 'Индия' } })
    const wb = vi.fn(async () => ({ missing: [] }))
    const r = await setVariantPhoto(ACTOR, 7, PHOTO, wb)
    expect(r.status).toBe(422)
    expect(r.error).toContain('таблице')
    expect(wb).not.toHaveBeenCalled()
  })

  it('чужой вариант — 404', async () => {
    pv.findUnique.mockResolvedValue(null)
    expect((await setVariantPhoto(ACTOR, 999, PHOTO, vi.fn())).status).toBe(404)
  })
})

describe('главное фото товара — обложка, DB-only', () => {
  const AUTO = '/photos/auto-first-variant.webp'
  const product = { id: 3, coverPhoto: null, photoUrl: AUTO, photos: [AUTO] }

  it('пишет coverPhoto в БД: без писбэка в таблицу и без фото предложений', async () => {
    pp.findUnique.mockResolvedValue(product)
    const r = await setProductMainPhoto(ACTOR, 3, PHOTO)
    expect(r).toMatchObject({ ok: true, photoUrl: PHOTO })
    expect(pp.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { coverPhoto: PHOTO } })
    expect(pv.update).not.toHaveBeenCalled()          // офферные фото не тронуты
    expect(bump).toHaveBeenCalledWith('cache_version', expect.any(String))
  })

  it('снятие обложки → coverPhoto=null, покупателю снова авто-превью', async () => {
    pp.findUnique.mockResolvedValue({ ...product, coverPhoto: PHOTO })
    const r = await setProductMainPhoto(ACTOR, 3, null)
    expect(r).toMatchObject({ ok: true, photoUrl: AUTO })
    expect(pp.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { coverPhoto: null } })
  })

  it('мусорная ссылка отбивается до всякой записи', async () => {
    pp.findUnique.mockResolvedValue(product)
    for (const bad of ['javascript:alert(1)', 'https://evil.example.com/x.png', '/photos/../../.env']) {
      expect((await setProductMainPhoto(ACTOR, 3, bad)).status).toBe(422)
    }
    expect(pp.update).not.toHaveBeenCalled()
    expect(bump).not.toHaveBeenCalled()
  })

  it('нет товара — 404', async () => {
    pp.findUnique.mockResolvedValue(null)
    expect((await setProductMainPhoto(ACTOR, 999, PHOTO)).status).toBe(404)
  })
})
