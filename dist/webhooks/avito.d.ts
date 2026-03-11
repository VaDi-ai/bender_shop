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
import { Telegram } from 'telegraf';
interface AvitoAuthor {
    id: number;
    name: string;
}
interface AvitoMessageContent {
    text: string;
    created: string;
}
interface AvitoEventPayload {
    author: AvitoAuthor;
    chat_id: string;
    message: AvitoMessageContent;
}
interface AvitoEvent {
    type: string;
    payload: AvitoEventPayload;
}
export interface AvitoWebhookBody {
    events: AvitoEvent[];
}
/**
 * Обрабатывает тело Avito webhook: создаёт/находит клиента,
 * создаёт топик в CRM-группе, сохраняет сообщение в БД.
 */
export declare function handleAvitoWebhook(body: AvitoWebhookBody, telegram: Telegram): Promise<void>;
export {};
//# sourceMappingURL=avito.d.ts.map