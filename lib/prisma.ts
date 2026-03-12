import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// A2: guard — fail fast if DATABASE_URL is missing
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
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
  console.error('pg pool error:', err.message)
  if (_poolAlertBot && _poolAlertAdminIds.length > 0) {
    const text = `🚨 DB pool error\n${err.message}`
    for (const adminId of _poolAlertAdminIds) {
      _poolAlertBot.telegram.sendMessage(adminId, text).catch(() => {})
    }
  }
})

const adapter = new PrismaPg(pool)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export { pool }

// A3: graceful shutdown on SIGTERM
process.on('SIGTERM', async () => {
  try {
    await prisma.$disconnect()
    await pool.end()
  } finally {
    process.exit(0)
  }
})
