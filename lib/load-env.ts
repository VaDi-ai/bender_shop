/**
 * Базовый .env, затем при наличии .env-prisma (перекрывает ключи, напр. DATABASE_URL).
 * Импортировать до чтения process.env в prisma.config и lib/prisma.
 */
import { config } from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'

config()
const prismaEnvPath = resolve(process.cwd(), '.env-prisma')
if (existsSync(prismaEnvPath)) {
  config({ path: prismaEnvPath, override: true })
}
