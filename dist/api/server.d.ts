/**
 * api/server.ts
 *
 * Express HTTP-сервер:
 *   GET  /shop                    — раздаёт webapp/index.html (Telegram Mini App)
 *   GET  /api/products            — список товаров из БД (фильтр ?category=...)
 *   POST /api/orders              — создание заказа в БД (требует Telegram auth)
 */
import 'dotenv/config';
export declare function fmtPrice(amount: number): string;
export declare function startApiServer(): void;
//# sourceMappingURL=server.d.ts.map