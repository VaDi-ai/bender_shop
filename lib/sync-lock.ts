/**
 * Общий лок синхронизации с таблицей (advisory-lock 73001).
 *
 * Тот же ключ, что берёт часовой синк (lib/sheets-sync.ts): любая массовая
 * запись в каталог должна ждать своей очереди, иначе синк и админка пишут
 * variant.attributes/цены наперегонки и одна правка затирает другую целиком
 * (attributes — цельный JSON, «слиться» построчно они не могут).
 *
 * Берём именно xact-lock: он снимается на конце транзакции сам, без
 * сессионного unlock на чужом коннекте из пула.
 */
import { prisma } from './prisma'

export const SYNC_LOCK_KEY = 73001

/** Лок занят синком или другой массовой операцией. */
export class SyncLockBusy extends Error {}

/** Текст для 409 — одинаковый во всех местах, где лок не достался. */
export const SYNC_LOCK_BUSY_MESSAGE = 'Идёт синхронизация с таблицей — повторите через минуту'

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Вся работа — в одной транзакции, первым стейтментом xact-lock синка.
 * Читать и писать нужно ВНУТРИ fn: тогда синк не вклинится между чтением
 * и записью.
 */
export async function withSyncLock<T>(fn: (tx: any) => Promise<T>, timeoutMs = 15_000): Promise<T> {
  return prisma.$transaction(async tx => {
    const r = await tx.$queryRaw<[{ l: boolean }]>`SELECT pg_try_advisory_xact_lock(${SYNC_LOCK_KEY}) as "l"`
    if (!r[0]?.l) throw new SyncLockBusy()
    return fn(tx)
  }, { timeout: timeoutMs })
}
