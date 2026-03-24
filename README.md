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
# 1. Клонировать
git clone <repo-url> && cd bender-shop

# 2. Установить зависимости
npm install

# 3. Настроить переменные окружения
cp .env.example .env
# Заполнить .env (см. .env.example для описания)

# 4. Применить схему БД
npx prisma db push && npx prisma generate

# 5. Запустить
npx ts-node bot/index.ts
```

## Переменные окружения

См. [.env.example](.env.example)

## Деплой

Railway: автодеплой при пуше в master.

## Бэкап / Восстановление

```bash
# Бэкап (в боте)
/backup

# Восстановление
npx ts-node scripts/restore-db.ts backup.json --dry-run
npx ts-node scripts/restore-db.ts backup.json --force
```
