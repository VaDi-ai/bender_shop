/**
 * Витрина из веб-админки на реальной БД: баннеры (создание, порядок,
 * включение, удаление), фото категории (своё / авто), бегущая строка, хиты.
 * Проверяем и то, что каждая мутация оставляет след в AuditLog.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const RUN = process.env.INTEGRATION_DB === '1'

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any
let sf: any

function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try { host = new URL(url).hostname } catch { /* noop */ }
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
    throw new Error(`INTEGRATION_DB=1 с не-локальной БД (host="${host}") — отказ.`)
  }
}

const OWNER = '900'
const IMG = '/photos/test-banner.webp'

describe.skipIf(!RUN)('витрина из веб-админки', () => {
  beforeAll(async () => {
    assertDisposableDb()
    ;({ prisma } = await import('../../lib/prisma'))
    sf = await import('../../lib/storefront-admin')
  })

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({ where: { entity: { in: ['HeroBanner', 'Category', 'Setting', 'Product', 'Brand'] } } })
    await prisma.heroBanner.deleteMany()
    await prisma.brandImage.deleteMany()
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.heroBanner.deleteMany()
    await prisma.brandImage.deleteMany()
    await prisma.auditLog.deleteMany({ where: { entity: { in: ['HeroBanner', 'Category', 'Setting', 'Product', 'Brand'] } } })
    await prisma.$disconnect()
  })

  it('баннер создаётся, попадает в показ первым и пишется в аудит', async () => {
    const r = await sf.createBanner(OWNER, { imageUrl: IMG, title: 'MacBook Pro', subtitle: 'работа с комфортом' })
    expect(r).toMatchObject({ ok: true, status: 201 })

    const list = await sf.listBanners()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ imageUrl: IMG, title: 'MacBook Pro', isActive: true, slot: 1 })

    const audit = await prisma.auditLog.findFirst({ where: { entity: 'HeroBanner', action: 'create' } })
    expect(audit.after).toMatchObject({ imageFile: IMG, title: 'MacBook Pro' })
  })

  it('битая ссылка баннер не создаёт', async () => {
    for (const bad of ['javascript:alert(1)', 'https://evil.example.com/a.png', '', '/photos/../../.env']) {
      const r = await sf.createBanner(OWNER, { imageUrl: bad })
      expect(r.ok, bad).toBe(false)
      expect(r.status).toBe(422)
    }
    expect(await prisma.heroBanner.count()).toBe(0)
  })

  it('порядок меняется даже когда у старых баннеров order одинаковый', async () => {
    // так их мог наплодить бот: order по умолчанию 0
    const a = await prisma.heroBanner.create({ data: { imageFile: IMG, title: 'A', order: 0 } })
    const b = await prisma.heroBanner.create({ data: { imageFile: IMG, title: 'B', order: 0 } })

    expect((await sf.listBanners()).map((x: any) => x.title)).toEqual(['A', 'B'])
    const moved = await sf.moveBanner(OWNER, b.id, -1)
    expect(moved.ok).toBe(true)
    expect((await sf.listBanners()).map((x: any) => x.title)).toEqual(['B', 'A'])

    // с краю двигать некуда — человеческий отказ, а не молчание
    expect(await sf.moveBanner(OWNER, b.id, -1)).toMatchObject({ ok: false, status: 422 })
    expect(await sf.moveBanner(OWNER, a.id, 1)).toMatchObject({ ok: false, status: 422 })
  })

  it('выключение последнего баннера предупреждает про пустую главную', async () => {
    const one = await prisma.heroBanner.create({ data: { imageFile: IMG, title: 'Один', isActive: true } })
    const r = await sf.updateBanner(OWNER, one.id, { isActive: false })
    expect(r.ok).toBe(true)
    expect(r.data.warning).toContain('последний включённый')

    const list = await sf.listBanners()
    expect(list[0]).toMatchObject({ isActive: false, slot: null })
  })

  it('удаление баннера — с сохранением того, что было, в аудите', async () => {
    const one = await prisma.heroBanner.create({ data: { imageFile: IMG, title: 'Прощай' } })
    expect(await sf.deleteBanner(OWNER, one.id)).toMatchObject({ ok: true })
    expect(await prisma.heroBanner.count()).toBe(0)
    const audit = await prisma.auditLog.findFirst({ where: { entity: 'HeroBanner', action: 'delete' } })
    expect(audit.before).toMatchObject({ title: 'Прощай', imageFile: IMG })
    expect(await sf.deleteBanner(OWNER, one.id)).toMatchObject({ ok: false, status: 404 })
  })

  it('фото категории: своё главнее авто, сброс возвращает авто', async () => {
    const cat = await prisma.category.upsert({
      where: { name: 'iPhone' }, update: { imageFile: null }, create: { name: 'iPhone' },
    })
    const p = await prisma.product.create({
      data: { sku: 'sf-1', name: 'iPhone 17 Pro', price: 100000, categoryId: cat.id, photoUrl: '/photos/auto.webp', attributes: {} },
    })
    await prisma.productVariant.create({
      data: { productId: p.id, sku: 'sf-1-v', price: 100000, quantity: 2, inStock: true, attributes: { fullName: 'iPhone 17 Pro' } },
    })

    let view = (await sf.listCategories()).find((c: any) => c.id === cat.id)
    expect(view).toMatchObject({ source: 'auto', effectiveImageUrl: '/photos/auto.webp' })

    expect(await sf.setCategoryPhoto(OWNER, cat.id, '/photos/custom.webp')).toMatchObject({ ok: true })
    view = (await sf.listCategories()).find((c: any) => c.id === cat.id)
    expect(view).toMatchObject({ source: 'custom', effectiveImageUrl: '/photos/custom.webp' })

    expect(await sf.setCategoryPhoto(OWNER, cat.id, null)).toMatchObject({ ok: true })
    view = (await sf.listCategories()).find((c: any) => c.id === cat.id)
    expect(view.source).toBe('auto')

    await prisma.productVariant.deleteMany({ where: { productId: p.id } })
    await prisma.product.delete({ where: { id: p.id } })
  })

  it('логотип бренда: ставится по имени, «вернуть текст» снимает, всё в аудите', async () => {
    const cat = await prisma.category.upsert({ where: { name: 'iPhone' }, update: {}, create: { name: 'iPhone' } })
    const p = await prisma.product.create({
      data: { sku: 'sf-br', name: 'Тестофон X', brand: 'Тестобренд', price: 1000, categoryId: cat.id, attributes: {} },
    })

    // до логотипа — бренд в списке, но текстом
    let view = (await sf.listBrandPhotos()).find((b: any) => b.brand === 'Тестобренд')
    expect(view).toMatchObject({ imageUrl: null, productCount: 1 })

    // регистр и пробелы не мешают попасть в тот же бренд
    expect(await sf.setBrandPhoto(OWNER, '  тестобренд ', '/photos/logo.webp')).toMatchObject({ ok: true })
    view = (await sf.listBrandPhotos()).find((b: any) => b.brand === 'Тестобренд')
    expect(view).toMatchObject({ imageUrl: '/photos/logo.webp' })
    expect(await prisma.brandImage.count()).toBe(1)

    // замена логотипа не плодит вторую запись
    expect(await sf.setBrandPhoto(OWNER, 'Тестобренд', '/photos/logo2.webp')).toMatchObject({ ok: true })
    expect(await prisma.brandImage.count()).toBe(1)

    // «вернуть текст»
    expect(await sf.setBrandPhoto(OWNER, 'Тестобренд', null)).toMatchObject({ ok: true })
    view = (await sf.listBrandPhotos()).find((b: any) => b.brand === 'Тестобренд')
    expect(view.imageUrl).toBeNull()

    const audits = await prisma.auditLog.findMany({ where: { entity: 'Brand' }, orderBy: { id: 'asc' } })
    expect(audits.map((a: any) => a.action)).toEqual(['update', 'update', 'delete'])
    expect(audits[2].before).toMatchObject({ imageFile: '/photos/logo2.webp' })

    await prisma.product.delete({ where: { id: p.id } })
  })

  it('логотип не пишется ни несуществующему бренду, ни по битой ссылке', async () => {
    expect(await sf.setBrandPhoto(OWNER, 'НетТакогоБренда', '/photos/logo.webp')).toMatchObject({ ok: false, status: 404 })
    expect(await sf.setBrandPhoto(OWNER, '', '/photos/logo.webp')).toMatchObject({ ok: false, status: 422 })

    const cat = await prisma.category.upsert({ where: { name: 'iPhone' }, update: {}, create: { name: 'iPhone' } })
    const p = await prisma.product.create({
      data: { sku: 'sf-br-2', name: 'Тестофон Y', brand: 'Тестобренд', price: 1000, categoryId: cat.id, attributes: {} },
    })
    for (const bad of ['javascript:alert(1)', 'https://evil.example.com/a.png', '/photos/../../.env']) {
      const r = await sf.setBrandPhoto(OWNER, 'Тестобренд', bad)
      expect(r.ok, bad).toBe(false)
      expect(r.status).toBe(422)
    }
    expect(await prisma.brandImage.count()).toBe(0)
    await prisma.product.delete({ where: { id: p.id } })
  })

  it('бегущая строка: сохраняется, обрезается по длине, пустая — снимает строку', async () => {
    expect(await sf.setMarquee(OWNER, 'Работаем до 22:00')).toMatchObject({ ok: true })
    expect(await sf.getMarquee()).toBe('Работаем до 22:00')

    const tooLong = await sf.setMarquee(OWNER, 'а'.repeat(sf.MARQUEE_MAX + 1))
    expect(tooLong).toMatchObject({ ok: false, status: 422 })
    expect(await sf.getMarquee()).toBe('Работаем до 22:00')      // прежний текст цел

    expect(await sf.setMarquee(OWNER, '')).toMatchObject({ ok: true })
    expect(await sf.getMarquee()).toBe('')
  })

  it('хиты: включение и снятие, повтор — no-op, чужой id — 404', async () => {
    const cat = await prisma.category.upsert({ where: { name: 'iPhone' }, update: {}, create: { name: 'iPhone' } })
    const p = await prisma.product.create({
      data: { sku: 'sf-hit', name: 'iPhone 17 Pro Max', price: 150000, categoryId: cat.id, attributes: {} },
    })

    expect(await sf.setHit(OWNER, p.id, true)).toMatchObject({ ok: true })
    expect((await sf.listHits()).manual.map((h: any) => h.id)).toContain(p.id)
    expect(await sf.setHit(OWNER, p.id, true)).toMatchObject({ ok: true, data: { unchanged: true } })

    expect(await sf.setHit(OWNER, p.id, false)).toMatchObject({ ok: true })
    expect((await sf.listHits()).manual.map((h: any) => h.id)).not.toContain(p.id)
    expect(await sf.setHit(OWNER, 999999, true)).toMatchObject({ ok: false, status: 404 })

    await prisma.product.delete({ where: { id: p.id } })
  })

  it('хит без остатков помечен честно: покупателю он не показывается', async () => {
    const cat = await prisma.category.upsert({ where: { name: 'iPhone' }, update: {}, create: { name: 'iPhone' } })
    const p = await prisma.product.create({
      data: { sku: 'sf-hit-2', name: 'iPhone 16', price: 90000, categoryId: cat.id, isFeatured: true, attributes: {} },
    })
    const hit = (await sf.listHits()).manual.find((h: any) => h.id === p.id)
    expect(hit.inStock).toBe(false)
    await prisma.product.delete({ where: { id: p.id } })
  })
})
