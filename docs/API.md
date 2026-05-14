# API Reference

## Public Endpoints

### GET /health
Health check with DB connectivity.

**Response:** `200 { status: 'ok', db: 'connected' }` or `503 { status: 'error' }`

### GET /shop
Serves the Mini App (webapp/index.html).

### GET /api/products?brand=&category=&search=
Product catalog with optional filters.

**Query params:**
- `brand` — filter by brand name
- `category` — filter by category name
- `search` — search in product name

**Response:** `200 { products: [...], categories: [...] }`

### GET /api/categories
Category list with product counts.

### POST /api/orders
Create order. Requires Telegram initData header for verification.

**Headers:**
- `x-telegram-init-data` — Telegram WebApp initData string

**Body:**
```json
{
  "items": [{ "variantId": 1, "quantity": 1 }],
  "customerName": "Name",
  "customerPhone": "+79991234567",
  "paymentMethod": "cash|card",
  "deliveryMethod": "pickup|delivery",
  "deliveryAddress": "Address (required for delivery)"
}
```

**Response:** `200 { success: true, orderId: 1 }`

### POST /api/track
Event tracking for analytics (rate limited 100/min).

**Body:**
```json
{
  "type": "view_product",
  "productId": 1,
  "data": { "key": "value" },
  "sessionId": "abc123"
}
```

**Allowed types:** view_product, add_to_cart, remove_from_cart, search, filter_brand, filter_category, checkout_start

**Response:** `200 { ok: true }`

### GET /api/hero-banners
Banner images for hero slider.

### GET /api/photo/:fileId
Telegram photo proxy (cached 7 days).

### GET /api/cache-version
Returns current cache version for client-side cache busting.

## Webhook Endpoints

### POST /webhook/telegram
Telegram Bot webhook. Verified by `WEBHOOK_SECRET` header.

### GET /webhook/instagram
Instagram webhook verification (challenge response).

### GET /api/avito/feed
Avito XML feed for autoload listings.

## Admin Endpoints

Auth: HMAC-SHA256 от `BOT_TOKEN` поверх `<timestamp>:<sha256(body)>`. Заголовки:
- `X-Admin-Timestamp` — unix-секунды, replay-окно 5 минут
- `X-Admin-Signature` — hex(hmac-sha256)

Локальная обёртка: `scripts/upload-photos.ts` (`npm run upload-photos -- <zip>`) — формирует подпись автоматически.

### POST /admin/photos/upload
Заливка zip с готовыми WebP в `PHOTOS_DIR`. Лимит — 250 MB.

**Headers:** `Content-Type: application/zip` + admin HMAC.

**Body:** raw bytes zip-архива.

**Response:** `{ uploaded, skipped, errors, photosDir }`. `skipped` — файлы у которых mtime в `PHOTOS_DIR` уже >= mtime в zip.

### GET /admin/photos/info
Статус `PHOTOS_DIR` на сервере.

**Response:** `{ photosDir, exists, configured, count, bytes, sizeMb, latestMtime }`.

## Admin Bot Commands

| Command | Description |
|---------|-------------|
| /start | Main menu |
| /sync | Manual Google Sheets sync |
| /stats | Quick statistics |
| /events | Today's event stats |
| /hits | Manage featured products |
| /hits auto | AI-powered hits selection |
| /avito | Avito integration status |
| /avito stats | Avito analytics (API + Excel) |
| /avito sync | Sync prices to Avito |
| /avito map | Auto-map Avito listings |
| /avito clear_sales | Clear sales data |
| /avito clear_stats | Clear stats data |
| /alias | Manage price aliases |
| /audit_attrs | Audit product attributes |
| /shop | Mini App link |

## File Import (via bot)

Send xlsx file to bot with caption:
- `avito stats` — import Avito statistics
- `avito sales` — import sales/expenses
