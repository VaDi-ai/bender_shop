import './load-env'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import log from './logger'

// A2: guard — fail fast if DATABASE_URL is missing
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
})

let _poolAlertBot: import('telegraf').Telegraf | null = null
let _poolAlertAdminIds: number[] = []

export function initPrismaAlerts(bot: import('telegraf').Telegraf, adminIds: number[]): void {
  _poolAlertBot = bot
  _poolAlertAdminIds = adminIds
}

pool.on('error', (err) => {
  log.error('pg pool error', { message: err.message })
  if (_poolAlertBot && _poolAlertAdminIds.length > 0) {
    const code = (err as NodeJS.ErrnoException).code ?? 'unknown'
    const text = `🚨 DB pool error\nCode: ${code}\nПроблема с соединением к базе данных`
    for (const adminId of _poolAlertAdminIds) {
      _poolAlertBot.telegram.sendMessage(adminId, text).catch((e) => log.error('[prisma] pool alert send error', { err: e instanceof Error ? e.message : String(e) }))
    }
  }
})

const adapter = new PrismaPg(pool)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

globalForPrisma.prisma = prisma

export { pool }
