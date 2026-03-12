import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { Pool } from 'pg';
declare const pool: Pool;
export declare function initPrismaAlerts(bot: import('telegraf').Telegraf, adminIds: number[]): void;
export declare const prisma: PrismaClient;
export { pool };
//# sourceMappingURL=prisma.d.ts.map