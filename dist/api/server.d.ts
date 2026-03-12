/**
 * api/server.ts
 *
 * Express HTTP-сервер:
 *   GET  /shop                    — раздаёт webapp/index.html (Telegram Mini App)
 *   GET  /api/products            — список товаров из БД (фильтр ?category=...)
 *   POST /api/orders              — создание заказа в БД (требует Telegram auth)
 */
import 'dotenv/config';
import type { Telegraf } from 'telegraf';
export declare function fmtPrice(amount: number): string;
export declare function startApiServer(bot?: Telegraf): void;
//# sourceMappingURL=server.d.ts.map