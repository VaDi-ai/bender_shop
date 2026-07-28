/**
 * Пауза продаж: настройка живёт в БД (а не в памяти процесса, как раньше в
 * боте), гейт стоит на сервере, и текст для покупателя человеческий.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = new Map<string, string>()
vi.mock('../lib/prisma', () => ({ prisma: {} }))
vi.mock('../lib/api-key-store', () => ({
  getApiKeyValue: async (k: string) => store.get(k) ?? null,
  setApiKeyValue: async (k: string, v: string) => { store.set(k, v) },
}))
vi.mock('../lib/audit', () => ({ logAdminAction: vi.fn() }))
vi.mock('../lib/security-log', () => ({ logSecurityEvent: vi.fn() }))

import { getMaintenance, setMaintenance } from '../lib/storefront-admin'

beforeEach(() => store.clear())

describe('пауза приёма заказов', () => {
  it('по умолчанию выключена', async () => {
    expect(await getMaintenance()).toEqual({ enabled: false, note: '' })
  })

  it('включается с текстом для покупателя и переживает перечитывание', async () => {
    await setMaintenance('900', true, 'Уехали за товаром, вернёмся в понедельник')
    expect(await getMaintenance()).toEqual({ enabled: true, note: 'Уехали за товаром, вернёмся в понедельник' })
  })

  it('выключается обратно', async () => {
    await setMaintenance('900', true, 'пауза')
    await setMaintenance('900', false, '')
    expect((await getMaintenance()).enabled).toBe(false)
  })

  it('текст режется по длине и чистится от управляющих символов', async () => {
    await setMaintenance('900', true, 'а'.repeat(300))
    expect((await getMaintenance()).note).toHaveLength(200)
    await setMaintenance('900', true, 'строка\u0007с мусором')
    expect((await getMaintenance()).note).toBe('строка с мусором')
  })
})
