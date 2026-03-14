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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstagramSignatureError = void 0;
exports.handleInstagramWebhook = handleInstagramWebhook;
const crypto_1 = __importDefault(require("crypto"));
const INSTAGRAM_SECRET = process.env.INSTAGRAM_APP_SECRET ?? '';
if (!process.env.INSTAGRAM_APP_SECRET)
    console.warn('INSTAGRAM_APP_SECRET not set');
// ─── X-Hub-Signature-256 verification ────────────────────────────────────────
class InstagramSignatureError extends Error {
    constructor() { super('Invalid or missing X-Hub-Signature-256'); }
}
exports.InstagramSignatureError = InstagramSignatureError;
function verifyInstagramSignature(rawBody, signature) {
    if (!signature)
        throw new InstagramSignatureError();
    // Meta sends "sha256=<hex>"
    const provided = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    const expected = crypto_1.default
        .createHmac('sha256', INSTAGRAM_SECRET)
        .update(rawBody)
        .digest('hex');
    const providedBuf = Buffer.from(provided, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (providedBuf.length !== expectedBuf.length || !crypto_1.default.timingSafeEqual(providedBuf, expectedBuf)) {
        throw new InstagramSignatureError();
    }
}
// ─── Точка входа ──────────────────────────────────────────────────────────────
/**
 * Обрабатывает входящий Instagram webhook.
 * Верифицирует подпись X-Hub-Signature-256, затем логирует payload.
 */
async function handleInstagramWebhook(body, _telegram, rawBody, signature) {
    verifyInstagramSignature(rawBody, signature);
    console.log('[Instagram] webhook получен, интеграция ещё не реализована:', body);
}
//# sourceMappingURL=instagram.js.map