/**
 * A4 — обратная запись профиля из заказа (жёсткий ПДн-гейт).
 * Реальная БД (INTEGRATION_DB=1, одноразовая, предохранитель как в admin-db).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const RUN = process.env.INTEGRATION_DB === '1'

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any
let buildProfileWriteback: any
let decryptClientField: any

function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try { host = new URL(url).hostname } catch { /* noop */ }
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
    throw new Error(`INTEGRATION_DB=1 с не-локальной БД (host="${host}") — отказ.`)
  }
}

describe.skipIf(!RUN)('buildProfileWriteback + запись в Client (реальная БД)', () => {
  beforeAll(async () => {
    assertDisposableDb()
    ;({ prisma } = await import('../../lib/prisma'))
    ;({ buildProfileWriteback } = await import('../../lib/client-profile'))
    ;({ decryptClientField } = await import('../../lib/client-crypto'))
  })

  beforeEach(async () => { await prisma.client.deleteMany({ where: { source: 'telegram', externalId: { startsWith: 'a4test_' } } }) })
  afterAll(async () => {
    if (!prisma) return
    await prisma.client.deleteMany({ where: { source: 'telegram', externalId: { startsWith: 'a4test_' } } })
    await prisma.$disconnect()
  })

  async function mkClient(extra: Record<string, unknown> = {}) {
    return prisma.client.create({
      data: { name: 'A4', source: 'telegram', externalId: 'a4test_' + Math.floor(Math.random() * 1e9), ...extra },
    })
  }

  it('БЕЗ согласия: в профиль не пишется ВООБЩЕ (жёсткий гейт)', async () => {
    const c = await mkClient()
    const wb = buildProfileWriteback(
      { fullName: c.fullName, phone: c.phone, pdnConsentAt: c.pdnConsentAt },
      { fullName: 'Иванов Иван', phone: '+7 999 123-45-67' },
      false, // галочки нет, pdnConsentAt нет
    )
    expect(wb.data).toBeNull()
    expect(wb.consentIsNew).toBe(false)
    // заказ при этом проходит: гейт возвращает «ничего не писать», а не ошибку
  })

  it('С согласием (галочка чекаута): пишется, телефон зашифрован, pdnConsentAt проставлен', async () => {
    const c = await mkClient()
    const wb = buildProfileWriteback(
      { fullName: null, phone: null, pdnConsentAt: null },
      { fullName: 'Иванов Иван', phone: '+7 999 123-45-67' },
      true,
    )
    expect(wb.data).not.toBeNull()
    expect(wb.consentIsNew).toBe(true)
    await prisma.client.update({ where: { id: c.id }, data: wb.data })
    const saved = await prisma.client.findUnique({ where: { id: c.id } })
    expect(saved.fullName).toBe('Иванов Иван')
    expect(saved.phone).not.toBe('+7 999 123-45-67')            // не plaintext
    expect(decryptClientField(saved.phone)).toBe('+7 999 123-45-67') // расшифровывается
    expect(saved.pdnConsentAt).not.toBeNull()
  })

  it('согласие уже в профиле (pdnConsentAt) — галочка не нужна, но consentIsNew=false', async () => {
    const wb = buildProfileWriteback(
      { fullName: null, phone: null, pdnConsentAt: new Date() },
      { fullName: 'Пётр', phone: '+79990000000' },
      false,
    )
    expect(wb.data).not.toBeNull()
    expect(wb.consentIsNew).toBe(false)
    expect(wb.data.pdnConsentAt).toBeUndefined()
  })

  it('профиль молча не перетирается: заполняются только пустые поля', async () => {
    const wb = buildProfileWriteback(
      { fullName: 'Старое Имя', phone: 'enc:существующий', pdnConsentAt: new Date() },
      { fullName: 'Новое Имя', phone: '+79991112233' },
      true,
    )
    expect(wb.data).toBeNull() // оба поля заняты → писать нечего
  })

  it('пустой ввод не пишет ничего даже с согласием', async () => {
    const wb = buildProfileWriteback(
      { fullName: null, phone: null, pdnConsentAt: null },
      { fullName: '  ', phone: '' },
      true,
    )
    expect(wb.data).toBeNull()
    expect(wb.consentIsNew).toBe(false)
  })
})
