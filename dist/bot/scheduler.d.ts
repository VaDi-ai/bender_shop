/**
 * bot/scheduler.ts
 *
 * Планировщик задач: запускается каждые 10 минут, находит Tasks с
 *   scheduledAt <= now() и status = 'pending', выполняет действие,
 *   помечает Task как 'done'.
 *
 * Поддерживаемые action-типы:
 *   • remind_client — отправить текст из payload.text клиенту через его канал
 *   • promo_notify  — то же, используется для клиентов «ждёт скидку»;
 *                     модуль акций обновляет scheduledAt при старте акции
 */
import { Telegraf } from 'telegraf';
export declare function startScheduler(bot: Telegraf): void;
//# sourceMappingURL=scheduler.d.ts.map