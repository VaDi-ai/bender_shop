"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = exports.prisma = void 0;
exports.initPrismaAlerts = initPrismaAlerts;
require("dotenv/config");
const client_1 = require("../generated/prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
// A2: guard — fail fast if DATABASE_URL is missing
if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL required');
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: false,
});
exports.pool = pool;
// A1: Telegram admin alert on pool errors
let _poolAlertBot = null;
let _poolAlertAdminIds = [];
function initPrismaAlerts(bot, adminIds) {
    _poolAlertBot = bot;
    _poolAlertAdminIds = adminIds;
}
pool.on('error', (err) => {
    console.error('pg pool error:', err.message);
    if (_poolAlertBot && _poolAlertAdminIds.length > 0) {
        const text = `🚨 DB pool error\n${err.message}`;
        for (const adminId of _poolAlertAdminIds) {
            _poolAlertBot.telegram.sendMessage(adminId, text).catch(() => { });
        }
    }
});
const adapter = new adapter_pg_1.PrismaPg(pool);
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ?? new client_1.PrismaClient({ adapter });
globalForPrisma.prisma = exports.prisma;
// A3: graceful shutdown on SIGTERM
process.on('SIGTERM', async () => {
    try {
        await exports.prisma.$disconnect();
        await pool.end();
    }
    finally {
        process.exit(0);
    }
});
//# sourceMappingURL=prisma.js.map