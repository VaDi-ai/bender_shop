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
 *   app.post('/webhook/avito', express.raw({ type: 'application/json' }), async (req, res) => {
 *     try {
 *       await handleAvitoWebhook(JSON.parse(req.body), bot.telegram, req.body, req.headers['x-avito-signature'] as string | undefined)
 *       res.sendStatus(200)
 *     } catch (e) {
 *       if (e instanceof AvitoSignatureError) return res.sendStatus(401)
 *       throw e
 *     }
 *   })
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AvitoSignatureError = void 0;
exports.handleAvitoWebhook = handleAvitoWebhook;
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../lib/prisma");
const CRM_GROUP_ID = Number(process.env.CRM_GROUP_ID);
const AVITO_SECRET = process.env.AVITO_WEBHOOK_SECRET ?? '';
if (!process.env.AVITO_WEBHOOK_SECRET)
    console.warn('AVITO_WEBHOOK_SECRET not set');
// ─── HMAC-SHA256 verification ─────────────────────────────────────────────────
class AvitoSignatureError extends Error {
    constructor() { super('Invalid or missing X-Avito-Signature'); }
}
exports.AvitoSignatureError = AvitoSignatureError;
function verifyAvitoSignature(rawBody, signature) {
    if (!signature)
        throw new AvitoSignatureError();
    const expected = crypto_1.default
        .createHmac('sha256', AVITO_SECRET)
        .update(rawBody)
        .digest('hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto_1.default.timingSafeEqual(sigBuf, expBuf)) {
        throw new AvitoSignatureError();
    }
}
// ─── Точка входа ─────────────────────────────────────────────────────────────
/**
 * Обрабатывает тело Avito webhook: создаёт/находит клиента,
 * создаёт топик в CRM-группе, сохраняет сообщение в БД.
 */
async function handleAvitoWebhook(body, telegram, rawBody, signature) {
    verifyAvitoSignature(rawBody, signature);
    for (const event of body.events) {
        if (event.type !== 'message')
            continue;
        await processAvitoMessage(event.payload, telegram);
    }
}
// ─── Санитизация строк из внешнего источника ──────────────────────────────────
function sanitizeField(raw, maxLen = 500) {
    return raw
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // strip control chars except \t(\x09) and \n(\x0A)
        .slice(0, maxLen);
}
// ─── Обработка одного сообщения ──────────────────────────────────────────────
async function processAvitoMessage(payload, telegram) {
    const externalId = String(payload.author.id);
    const name = sanitizeField(payload.author.name);
    const text = sanitizeField(payload.message.text);
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