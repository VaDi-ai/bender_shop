/**
 * AuditLog — журнал мутаций админки (ADMIN-DESIGN §4.8) и источник
 * «вернуть моё» для LWW-полей (§1.2). Вызывается роутами админ-API после
 * успешной мутации; ошибка записи журнала мутацию не откатывает и наружу
 * не всплывает (лог + продолжаем) — аудит не должен ронять рабочий путь.
 */
import { prisma } from './prisma'
import { log } from './logger'

export interface AuditEntry {
  adminTelegramId: string
  action: string // "create" | "update" | "delete" | доменные ("price_batch_apply", …)
  entity: string // "Product", "MarkupRule", "PriceApplyBatch", …
  entityId?: string | number
  before?: unknown
  after?: unknown
}

export async function logAdminAction(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        adminTelegramId: entry.adminTelegramId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId !== undefined ? String(entry.entityId) : null,
        before: entry.before === undefined ? undefined : (entry.before as object),
        after: entry.after === undefined ? undefined : (entry.after as object),
      },
    })
  } catch (e) {
    log.error('AuditLog write failed', {
      entity: entry.entity,
      action: entry.action,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
