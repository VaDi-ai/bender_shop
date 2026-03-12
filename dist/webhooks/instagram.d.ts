/**
 * webhooks/instagram.ts
 *
 * Заглушка для будущей интеграции Instagram Direct через Meta Messenger API.
 *
 * TODO: реализовать после получения доступа к Instagram Graph API.
 * Документация: https://developers.facebook.com/docs/messenger-platform/instagram
 *
 * Пример подключения Express:
 *   // Верификация webhook (GET)
 *   app.get('/webhook/instagram', (req, res) => {
 *     const mode = req.query['hub.mode']
 *     const token = req.query['hub.verify_token']
 *     const challenge = req.query['hub.challenge']
 *     if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
 *       res.status(200).send(challenge)
 *     } else {
 *       res.sendStatus(403)
 *     }
 *   })
 *   // Приём событий (POST) — используйте express.raw() чтобы получить rawBody для проверки подписи
 *   app.post('/webhook/instagram', express.raw({ type: 'application/json' }), async (req, res) => {
 *     try {
 *       await handleInstagramWebhook(JSON.parse(req.body), bot.telegram, req.body, req.headers['x-hub-signature-256'] as string | undefined)
 *       res.sendStatus(200)
 *     } catch (e) {
 *       if (e instanceof InstagramSignatureError) return res.sendStatus(401)
 *       throw e
 *     }
 *   })
 */
import { Telegram } from 'telegraf';
export declare class InstagramSignatureError extends Error {
    constructor();
}
export interface InstagramWebhookBody {
    object: string;
    entry: unknown[];
}
/**
 * Обрабатывает входящий Instagram webhook.
 * Верифицирует подпись X-Hub-Signature-256, затем логирует payload.
 */
export declare function handleInstagramWebhook(body: InstagramWebhookBody, _telegram: Telegram, rawBody: string | Buffer, signature: string | undefined): Promise<void>;
//# sourceMappingURL=instagram.d.ts.map