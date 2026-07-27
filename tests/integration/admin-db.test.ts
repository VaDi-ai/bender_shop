/**
 * Интеграционные тесты с реальной БД (ADMIN-DESIGN §10.6).
 * Гейт: бегут только при INTEGRATION_DB=1 (в CI — сервис postgres + prisma db push).
 * Локально без тестовой БД — молча скипаются; импорты — в beforeAll, чтобы
 * lib/prisma (throw без DATABASE_URL) не валил скипнутый файл на этапе сборки.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'

const RUN = process.env.INTEGRATION_DB === '1'
const BOT_TOKEN = 'integration-bot-token'

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any
let seedAdminUsers: () => Promise<void>
let requireAdmin: any
let logAdminAction: any
let buildInitData: (userId: number, botToken: string) => string

/**
 * Предохранитель (замечание владельца к PR-2): тесты делают deleteMany() —
 * INTEGRATION_DB=1 никогда не должен добраться до реальной БД. Пускаем
 * только явно локальные хосты; иначе — падение до первого хука.
 */
function assertDisposableDb(): void {
  const url = process.env.DATABASE_URL ?? ''
  let host = ''
  try { host = new URL(url).hostname } catch { /* пустой url упадёт ниже */ }
  const LOCAL = ['localhost', '127.0.0.1', '::1', 'postgres']
  if (!LOCAL.includes(host)) {
    throw new Error(`INTEGRATION_DB=1 с не-локальной БД (host="${host}") — отказ: тесты стирают AdminUser/AuditLog/SyncRun. Используйте одноразовую локальную БД.`)
  }
}

describe.skipIf(!RUN)('seedAdminUsers + requireAdmin (реальная БД)', () => {
  beforeAll(async () => {
    assertDisposableDb()
    process.env.BOT_TOKEN = BOT_TOKEN
    ;({ prisma } = await import('../../lib/prisma'))
    ;({ seedAdminUsers } = await import('../../lib/admin-users'))
    ;({ requireAdmin } = await import('../../api/admin'))
    ;({ logAdminAction } = await import('../../lib/audit'))
    ;({ buildInitData } = await import('../helpers/init-data'))
  })

  beforeEach(async () => {
    await prisma.adminUser.deleteMany()
    await prisma.auditLog.deleteMany()
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.adminUser.deleteMany()
    await prisma.auditLog.deleteMany()
    await prisma.$disconnect()
  })

  it('идемпотентность: повторный прогон не плодит дублей', async () => {
    process.env.ADMIN_IDS = '111,222'
    await seedAdminUsers()
    await seedAdminUsers()
    const rows = await prisma.adminUser.findMany({ orderBy: { telegramId: 'asc' } })
    expect(rows.map((r: { telegramId: string }) => r.telegramId)).toEqual(['111', '222'])
    expect(rows.every((r: { role: string; isActive: boolean }) => r.role === 'owner' && r.isActive)).toBe(true)
  })

  it('не перетирает роль: owner, пониженный до manager, остаётся manager', async () => {
    process.env.ADMIN_IDS = '111'
    await seedAdminUsers()
    await prisma.adminUser.update({ where: { telegramId: '111' }, data: { role: 'manager', name: 'Стафф' } })
    await seedAdminUsers()
    const row = await prisma.adminUser.findUnique({ where: { telegramId: '111' } })
    expect(row?.role).toBe('manager')
    expect(row?.name).toBe('Стафф')
  })

  it('реактивирует выключенного, чей ID остался в env (офбординг-рунбук §2)', async () => {
    process.env.ADMIN_IDS = '111'
    await seedAdminUsers()
    await prisma.adminUser.update({ where: { telegramId: '111' }, data: { isActive: false } })
    await seedAdminUsers()
    const row = await prisma.adminUser.findUnique({ where: { telegramId: '111' } })
    expect(row?.isActive).toBe(true)
  })

  it('requireAdmin: активный админ из БД проходит, чужой — 403', async () => {
    process.env.ADMIN_IDS = '333'
    await seedAdminUsers()

    const call = async (userId: number) => {
      const req = { headers: { 'x-telegram-init-data': buildInitData(userId, BOT_TOKEN) }, ip: 't' }
      let status = 0
      let nextCalled = false
      const res = {
        status(c: number) { status = c; return this },
        json() { return this },
      }
      await requireAdmin()(req, res, () => { nextCalled = true })
      return { status, nextCalled }
    }

    expect(await call(333)).toEqual({ status: 0, nextCalled: true })
    expect((await call(444)).status).toBe(403)
  })

  it('logAdminAction пишет запись и не бросает', async () => {
    await logAdminAction({ adminTelegramId: '111', action: 'update', entity: 'Product', entityId: 42, before: { badge: null }, after: { badge: 'ХИТ' } })
    const rows = await prisma.auditLog.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0].entityId).toBe('42')
  })
})
