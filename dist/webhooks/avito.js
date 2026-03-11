"use strict";
/**
 * webhooks/avito.ts
 *
 * Обработчик входящих лидов с Avito через webhook.
 *
 * Avito шлёт POST-запрос на ваш URL при новом сообщении в чате.
 * Подключение: создайте HTTP-сервер (например, Express) и передавайте
 * тело запроса в handleAvitoWebhook.
 *
 * Документация: https://developers.avito.ru/api-catalog/messenger/documentation
 *
 * Пример подключения Express:
 *   app.post('/webhook/avito', express.json(), async (req, res) => {
 *     await handleAvitoWebhook(req.body, bot.telegram)
 *     res.sendStatus(200)
 *   })
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAvitoWebhook = handleAvitoWebhook;
const prisma_1 = require("../lib/prisma");
const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID);
// ─── Точка входа ─────────────────────────────────────────────────────────────
/**
 * Обрабатывает тело Avito webhook: создаёт/находит клиента,
 * создаёт топик в CRM-группе, сохраняет сообщение в БД.
 */
async function handleAvitoWebhook(body, telegram) {
    for (const event of body.events) {
        if (event.type !== 'message')
            continue;
        await processAvitoMessage(event.payload, telegram);
    }
}
// ─── Обработка одного сообщения ──────────────────────────────────────────────
async function processAvitoMessage(payload, telegram) {
    const externalId = String(payload.author.id);
    const name = payload.author.name;
    const text = payload.message.text;
    // Найти или создать клиента
    let client = await prisma_1.prisma.client.findUnique({
        where: { source_externalId: { source: 'avito', externalId } },
    });
    if (!client) {
        const defaultSeg = await prisma_1.prisma.segment.findFirst({ where: { isDefault: true } });
        client = await prisma_1.prisma.client.create({
            data: { name, source: 'avito', externalId, segmentId: defaultSeg?.id ?? null },
        });
    }
    // Создать топик в CRM-группе, если ещё нет
    if (client.telegramTopicId == null) {
        const topic = await telegram.createForumTopic(CRM_GROUP_ID, `[Avito] ${name}`);
        client = await prisma_1.prisma.client.update({
            where: { id: client.id },
            data: { telegramTopicId: topic.message_thread_id },
        });
        await sendToTopic(telegram, CRM_GROUP_ID, topic.message_thread_id, `👤 Новый клиент: ${name}\n📌 Источник: Avito\n💬 Сообщение: ${text}`);
    }
    else {
        await sendToTopic(telegram, CRM_GROUP_ID, client.telegramTopicId, `💬 [Avito] ${name}: ${text}`);
    }
    // Сохраняем сообщение
    await prisma_1.prisma.message.create({
        data: {
            clientId: client.id,
            direction: 'in',
            text,
            source: 'avito',
        },
    });
}
// ─── Хелпер ──────────────────────────────────────────────────────────────────
async function sendToTopic(telegram, chatId, threadId, text) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await telegram.sendMessage(chatId, text, { message_thread_id: threadId });
}
//# sourceMappingURL=avito.js.map