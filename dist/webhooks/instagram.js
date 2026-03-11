"use strict";
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
 *   // Приём событий (POST)
 *   app.post('/webhook/instagram', express.json(), async (req, res) => {
 *     await handleInstagramWebhook(req.body, bot.telegram)
 *     res.sendStatus(200)
 *   })
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleInstagramWebhook = handleInstagramWebhook;
/**
 * Обрабатывает входящий Instagram webhook.
 * Пока не реализован — только логирует полученный payload.
 */
async function handleInstagramWebhook(body, _telegram) {
    console.log('[Instagram] webhook получен, интеграция ещё не реализована:', body);
}
//# sourceMappingURL=instagram.js.map