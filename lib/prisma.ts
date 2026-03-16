import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// A2: guard — fail fast if DATABASE_URL is missing
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required')

// DB_POOL_SIZE: configurable pool size, valid range 1–20, default 5
const _rawPoolSize = parseInt(process.env.DB_POOL_SIZE ?? '5', 10)
const DB_POOL_SIZE = Number.isFinite(_rawPoolSize) && _rawPoolSize >= 1 && _rawPoolSize <= 20
  ? _rawPoolSize
  : 5

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: DB_POOL_SIZE,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: false,
})

// A1: Telegram admin alert on pool errors
let _poolAlertBot: import('telegraf').Telegraf | null = null
let _poolAlertAdminIds: number[] = []

export function initPrismaAlerts(bot: import('telegraf').Telegraf, adminIds: number[]): void {
  _poolAlertBot = bot
  _poolAlertAdminIds = adminIds
}

pool.on('error', (err) => {
  // Log full details locally only
  console.error('pg pool error:', err.message)
  if (_poolAlertBot && _poolAlertAdminIds.length > 0) {
    // Send only error code + generic description to Telegram (no raw message)
    const code = (err as NodeJS.ErrnoException).code ?? 'unknown'
    const text = `🚨 DB pool error\nCode: ${code}\nПроблема с соединением к базе данных`
    for (const adminId of _poolAlertAdminIds) {
      _poolAlertBot.telegram.sendMessage(adminId, text).catch((e) => console.error('[prisma] pool alert send error:', e))
    }
  }
})

const adapter = new PrismaPg(pool)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

globalForPrisma.prisma = prisma

export { pool }
