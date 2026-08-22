/**
 * Кто «админ» для бот-входа в админку (кнопка «Админка», /admin, «Быстрый вход»
 * на /start, /stats).
 *
 * До этого бот гейтил вход ТОЛЬКО по env ADMIN_IDS, а сама веб-админка
 * (requireAdmin) — по таблице AdminUser. Менеджер, заведённый через панель
 * команды, в env не попадал → у него не было входа из Telegram → подпись
 * initData не генерилась → доступа фактически не было. Теперь достаточно
 * активной записи в AdminUser.
 *
 * Это гейт UI, не безопасность: настоящий барьер — requireAdmin на каждом
 * запросе /admin/api/*. Поэтому ошибка БД здесь → false (кнопку не покажем),
 * а не исключение — бот-поллинг ронять нельзя.
 *
 * Списки уведомлений (initAdminNotifications/initSecurityAlerts/initPrismaAlerts)
 * и легаси бот-панель намеренно остаются на env ADMIN_IDS.
 */
import { prisma } from './prisma'
import { log } from './logger'
import { parseAdminIds } from './admin-users'

export async function isBotAdmin(userId: number | string | null | undefined): Promise<boolean> {
  if (userId === null || userId === undefined) return false
  const id = String(userId)
  if (!/^\d+$/.test(id)) return false
  if (parseAdminIds(process.env.ADMIN_IDS).includes(id)) return true
  try {
    const row = await prisma.adminUser.findUnique({ where: { telegramId: id }, select: { isActive: true } })
    return row?.isActive === true
  } catch (e) {
    log.warn('isBotAdmin DB lookup failed — treating as non-admin', { userId: id, error: e instanceof Error ? e.message : String(e) })
    return false
  }
}
