# Bender Shop

Telegram CRM + Mini App магазин электроники.

## Стек

- **Runtime:** Node.js + TypeScript
- **Bot:** Telegraf 4
- **API:** Express 5
- **ORM:** Prisma 7
- **DB:** PostgreSQL (Railway)
- **AI:** OpenRouter (Claude, Perplexity)
- **Frontend:** Single-file HTML Mini App

## Структура

```
api/          — Express API сервер
bot/          — Telegram бот + админ-панель
  admin/      — Модули админки (inventory, pricing, analytics...)
  ai/         — AI агент Бендер
webhooks/     — Обработчики вебхуков (Telegram, Avito, поставщики)
lib/          — Общие модули (sync, crypto, avito, sheets...)
webapp/       — Telegram Mini App (index.html)
prisma/       — Схема БД и миграции
scripts/      — Утилиты (backup, restore, optimize)
```

## Быстрый старт

```bash
# Установка
npm install

# Настройка окружения
cp .env.example .env
# Заполнить все переменные

# Миграция БД
npx prisma migrate deploy

# Dev
npm run dev

# Production
npm run build && npm start
```

## Переменные окружения

См. [.env.example](.env.example)

## Ключевые команды бота

| Команда | Описание |
|---------|----------|
| /start | Главное меню |
| /sync | Синхронизация Google Sheets |
| /hits | Управление хитами продаж |
| /avito | Управление Avito |
| /avito map | Маппинг Avito ↔ Sheets |

## Ежедневные процессы

- **Авто-синхронизация** Sheets → БД (при деплое + по расписанию)
- **Утренняя сводка** устаревших цен (11:00 МСК)
- **AI-тренды** — обновление хитов (11:00 МСК)
- **Ежедневный бэкап** БД

## Деплой

Автодеплой из master в Railway.

## Бэкап / Восстановление

```bash
# Бэкап (в боте)
/backup

# Восстановление
npx ts-node scripts/restore-db.ts backup.json --dry-run
npx ts-node scripts/restore-db.ts backup.json --force
```
