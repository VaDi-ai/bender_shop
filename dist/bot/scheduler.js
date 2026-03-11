"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const prisma_1 = require("../lib/prisma");
const INTERVAL_MS = 10 * 60 * 1000; // 10 минут
// ─── Запуск планировщика ──────────────────────────────────────────────────────
function startScheduler(bot) {
    console.log('Планировщик запущен (интервал: 10 мин)');
    setInterval(() => runTick(bot), INTERVAL_MS);
}
// ─── Один «тик» — проверяем и выполняем задачи ───────────────────────────────
async function runTick(bot) {
    try {
        const now = new Date();
        const tasks = await prisma_1.prisma.task.findMany({
            where: {
                status: 'pending',
                scheduledAt: { lte: now },
            },
            include: { client: true },
        });
        if (tasks.length === 0)
            return;
        console.log(`[Scheduler] Обрабатываем ${tasks.length} задач(и)`);
        for (const task of tasks) {
            try {
                await executeTask(bot, task);
                await prisma_1.prisma.task.update({ where: { id: task.id }, data: { status: 'done' } });
            }
            catch (err) {
                console.error(`[Scheduler] Задача #${task.id} завершилась с ошибкой:`, err);
                // Не меняем статус — задача останется pending до следующего тика
            }
        }
    }
    catch (err) {
        console.error('[Scheduler] Ошибка получения задач:', err);
    }
}
// ─── Выполнение одной задачи ──────────────────────────────────────────────────
async function executeTask(bot, task) {
    const { action, payload, client } = task;
    if (!client)
        return;
    const data = payload;
    const text = data.text;
    if (!text) {
        console.warn(`[Scheduler] Задача #${task.id}: payload.text не задан, пропускаем`);
        return;
    }
    if (action === 'remind_client' || action === 'promo_notify') {
        if (client.source === 'telegram' && client.externalId) {
            await bot.telegram.sendMessage(client.externalId, text);
            console.log(`[Scheduler] Задача #${task.id}: сообщение отправлено клиенту #${client.id} (TG)`);
            return;
        }
        // TODO: каналы avito / instagram — реализовать при подключении webhooks
        console.warn(`[Scheduler] Задача #${task.id}: канал ${client.source} не поддерживается, пропускаем`);
        return;
    }
    console.warn(`[Scheduler] Задача #${task.id}: неизвестный action="${action}"`);
}
//# sourceMappingURL=scheduler.js.map