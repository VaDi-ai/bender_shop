# Deployment Guide

## Railway Setup

1. Create Railway project
2. Add PostgreSQL service
3. Add Node.js service from GitHub repo
4. Set environment variables (see [ENVIRONMENT.md](ENVIRONMENT.md))
5. Deploy triggers automatically on push to master

## Build Process

Railway executes (from package.json):
1. `npm install`
2. `npx prisma db push`
3. `npx prisma generate`
4. `npm run build` (TypeScript compilation)
5. `npm start`

## Rollback

### Quick rollback (Railway UI):
1. Go to Railway dashboard > Deployments
2. Find last working deployment
3. Click "Redeploy"

### Git rollback:
```bash
git revert HEAD
git push
```

## Backup

### Manual (via bot):
Send `/backup` or press "🗄️ Бэкап сейчас" in Техработы menu.

### Manual (CLI):
```bash
npm run backup
```

### Restore:
```bash
npm run restore backup-YYYY-MM-DD.json --force
```

## Health Check

GET /health returns 200 if DB is connected, 503 otherwise.

## Monitoring

- **Sentry**: errors tracked if SENTRY_DSN is set
- **Logs**: structured JSON via pino (Railway captures stdout)
- **Bot**: /sync for manual Google Sheets sync trigger

## Product Photos (Railway Volume)

Фото товаров живут на Railway Volume отдельно от репозитория — иначе git раздувается и каждый деплой копирует ~50 MB изображений.

### Setup
1. Railway dashboard → service → Settings → Volumes → **New Volume**
2. Mount path: `/data/photos`
3. Variables → добавить `PHOTOS_DIR=/data/photos`
4. Redeploy сервиса (Volume монтируется при старте)

После этого URL `https://bendershop.store/photos/<filename>.webp` отдаёт файлы из Volume. Если Volume пуст или `PHOTOS_DIR` не задан — route возвращает 404 и пишет warning в лог (см. `api/server.ts`).

### Загрузка фото — варианты

**Вариант 1: HTTP-загрузка (рекомендуется).** Локально готовишь WebP, пакуешь в zip, шлёшь POST `/admin/photos/upload`. Подпись HMAC-SHA256 от `BOT_TOKEN` (anti-replay через 5-минутный timestamp). Готовая обёртка:

```bash
# Папку с готовыми webp паковать в zip
# PowerShell:
Compress-Archive -Path .\R-final\*.webp -DestinationPath .\photos.zip -Force
# bash:
(cd R-final && zip -r ../photos.zip *.webp)

# Заливаем (требует BOT_TOKEN в .env)
npm run upload-photos -- ./photos.zip
# или: npm run upload-photos -- ./photos.zip --url=https://staging.example.com
```

Сервер распаковывает zip во временную папку, копирует image-файлы (`.webp .png .jpg .jpeg`) плоско в `PHOTOS_DIR`. Symlinks игнорируются, имена нормализуются через `path.basename` — path traversal невозможен. Лимит размера body — 250 MB.

Проверить статус Volume:
```bash
# GET /admin/photos/info через тот же HMAC (можно через curl + scripts/upload-photos.ts если расширить, либо через RC tool)
```

**Вариант 2: Railway CLI** (для разовой массовой заливки):
```bash
railway shell
# Скопировать локальные WebP файлы в смонтированный Volume
# (вариант через scp или временный rsync — зависит от Railway-плагина)
```

Проверка: `curl -I https://bendershop.store/photos/<filename>.webp` должен вернуть 200.

### Прямая запись URL в Google Sheets

После заливки фото на Volume — нужно прописать их URL'ы в колонку «Фото» (Q) Google Sheets, чтобы `/sync` подтянул их в каталог. Путь может быть общей родительской папкой со вложениями **`Apple Stock (Обработка)`**, **`Samsung Stock`** и т.д.; скрипт обходит дерево рекурсивно (совпадает только **basename**, префикс в имени файла типа `Apple Stock__…` должен сохраниться).

```bash
# Dry-run (только отчёт)
npm run match-photos -- ./staging-all-brands --sheet ./reports https://bendershop.store/photos

# Полный переезд на новый сток: очистить «Фото» у всех строк + прописать новые URL
npm run match-photos -- ./staging-all-brands --sheet ./reports https://bendershop.store/photos --write --clear-photos

# Без --clear-photos — новые URL **дописываются через запятую** к уже существующим (точечные добавления)
```

Порядок: **webp в zip → `upload-photos` → match с `--write --clear-photos`**, затем **`/sync`** в боте (или автосинк), чтобы Postgres/витрина подхватили ссылки.

Использует тот же `GOOGLE_SERVICE_ACCOUNT_KEY` + `GOOGLE_SHEET_ID` что и `/sync`. Batch-update в один API-вызов (несколько диапазонов), retry на 429.

## Database Migrations

After schema changes in `prisma/schema.prisma`:
```bash
npx prisma db push
npx prisma generate
```

Railway runs these automatically during build.
