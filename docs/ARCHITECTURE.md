# Архитектура Bender Shop

## Потоки данных

### Товары
Google Sheets → sheets-sync → PostgreSQL → API → Mini App

### Заказы
Mini App → API → PostgreSQL → CRM (Telegram topics)

### Avito
Avito API ← avito-sync → PostgreSQL ← sheets-sync ← Google Sheets

### AI
Клиент → Telegram Bot → OpenRouter (Claude/Perplexity) → Ответ клиенту

## Ключевые модули

- **sheets-sync.ts** — парсер названий (extractProductName), группировка вариантов, атрибуты
- **avito-sync.ts** — маппинг Avito ↔ Sheets по нормализованным токенам
- **agent.ts** — AI-агент Бендер с jailbreak protection и night mode
- **server.ts** — API с HMAC auth, rate limiting, order creation
- **telegram.ts** — CRM с автоматическими топиками для клиентов
