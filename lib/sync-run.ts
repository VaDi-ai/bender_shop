/**
 * SyncRun — журнал прогонов синка Sheets (ADMIN-DESIGN §3.3, Этап 1 / PR-4).
 *
 * Первый писатель в новую таблицу. Контракт безопасности: журнал никогда
 * не роняет сам синк — обе функции глотают свои ошибки (лог + продолжаем).
 * Упавшая запись журнала = потерянная строка истории, а не сломанный каталог.
 */
import { prisma } from './prisma'
import { log } from './logger'

export type SyncTrigger = 'cron' | 'manual' | 'deploy'

export interface SyncRunMeta {
  trigger?: SyncTrigger
  startedBy?: string // telegramId, для trigger=manual
}

export interface SyncRunResult {
  ok: boolean
  rowsRead?: number
  created?: number
  updated?: number
  disabled?: number
  writebacks?: number
  errors?: string[]
}

/** Ошибок в прогоне может быть сотни однотипных — в журнал идёт голова списка. */
const MAX_LOGGED_ERRORS = 100

export async function syncRunStart(meta: SyncRunMeta = {}): Promise<number | null> {
  try {
    const run = await prisma.syncRun.create({
      data: {
        trigger: meta.trigger ?? 'manual',
        startedBy: meta.startedBy ?? null,
      },
      select: { id: true },
    })
    return run.id
  } catch (e) {
    log.error('SyncRun start write failed', { error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

export async function syncRunFinish(runId: number | null, result: SyncRunResult): Promise<void> {
  if (runId === null) return
  try {
    const errors = result.errors ?? []
    await prisma.syncRun.update({
      where: { id: runId },
      data: {
        finishedAt: new Date(),
        ok: result.ok,
        rowsRead: result.rowsRead ?? null,
        created: result.created ?? null,
        updated: result.updated ?? null,
        disabled: result.disabled ?? null,
        writebacks: result.writebacks ?? null,
        errors: errors.length
          ? errors.slice(0, MAX_LOGGED_ERRORS).concat(
              errors.length > MAX_LOGGED_ERRORS ? [`… и ещё ${errors.length - MAX_LOGGED_ERRORS}`] : [],
            )
          : undefined,
      },
    })
  } catch (e) {
    log.error('SyncRun finish write failed', { runId, error: e instanceof Error ? e.message : String(e) })
  }
}
