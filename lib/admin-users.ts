/**
 * AdminUser — доступ к /admin/api/* (ADMIN-DESIGN §2).
 *
 * env ADMIN_IDS остаётся bootstrap-списком: при старте все ID из него
 * апсертятся в AdminUser с ролью owner (текущие админы равноправны,
 * роли дальше правятся из веба). Сид идемпотентен: существующим записям
 * роль/имя НЕ перетираются — только реактивация, если запись выключили,
 * а ID всё ещё в env.
 */
import { prisma } from './prisma'
import { log } from './logger'

/** ADMIN_IDS="1,2,3" → ['1','2','3']; мусор и пустые отбрасываются. */
export function parseAdminIds(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(s => /^\d+$/.test(s))
}

export async function seedAdminUsers(): Promise<void> {
  const ids = parseAdminIds(process.env.ADMIN_IDS)
  if (!ids.length) return
  for (const telegramId of ids) {
    await prisma.adminUser.upsert({
      where: { telegramId },
      update: { isActive: true },
      create: { telegramId, role: 'owner', isActive: true },
    })
  }
  log.info('AdminUser seed done', { count: ids.length })
}
