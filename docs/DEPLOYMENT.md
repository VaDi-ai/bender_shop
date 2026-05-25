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

### Удачный цикл: сток должен быть **и в Sheets, и на Volume**

Кратко: **сначала залить файлы на сервер**, потом (или параллельно) прописать **те же** плоские имена в колонку «Фото», затем **`/sync`**. Если в таблице есть URL, а файла с таким именем на CDN нет — в мини-приложении будет плейсхолдер (часто **много** одинаковых, если в ячейке перечислено много разных адресов и все они 404).

1. Одна общая распакованная папка, как для матчинга (`Samsung Stock\`, `Apple Stock (Обработка)\`, …).

2. **Упаковать и залить** (ключи в архиве = относительные пути как на диске):
   ```bash
   npm run zip-photos-for-upload -- "C:\path\to\bender-photos-clean" ./photos-upload.zip
   npm run upload-photos -- ./photos-upload.zip
   ```

3. **Матчинг в Google Sheets** (на агенте много строк — см. память для Node ≥8 GB):
   ```powershell
   $env:NODE_OPTIONS="--max-old-space-size=8192"
   npm run match-photos -- "C:\path\to\bender-photos-clean" --sheet ./reports https://bendershop.store/photos --write --clear-photos --min-confidence=64
   ```

4. **`/sync`** в боте.

5. Проверка: для одного-двух новых имён из отчёта `curl.exe -I "https://bendershop.store/photos/<percent-encoded-flat-name>"` → **200**.

### Загрузка фото — варианты

**Вариант 1: HTTP-загрузка (рекомендуется).** Локально готовишь WebP, пакуешь в zip, шлёшь POST `/admin/photos/upload`. Подпись HMAC-SHA256 от `BOT_TOKEN` (anti-replay через 5-минутный timestamp). Готовая обёртка:

```bash
# Zip с сохранением вложенных папок (пути внутри архива задают итоговое имя на сервере).
# PowerShell — с папкой целиком:
Compress-Archive -Path .\Samsung Stock\* -DestinationPath .\photos.zip -Force
# bash:
(cd "Samsung Stock" && zip -r ../photos.zip .)

# Заливаем (требует BOT_TOKEN в .env)
npm run upload-photos -- ./photos.zip
# или: npm run upload-photos -- ./photos.zip --url=https://staging.example.com
```

Сервер распаковывает zip во временную папку и копирует image-файлы (`.webp .png .jpg .jpeg`) в `PHOTOS_DIR`: **конечное имя файла = плоское имя относительного пути** в архиве (как у `npm run match-photos`, см. `lib/photo-flat-name.ts`: `Samsung Stock/foo/bar.webp` → `Samsung Stock__foo__bar.webp`). Так совпадают URL после заливки и ключи матчинга при обходе той же папки локально. Вне корня архива записи игнорируются; symlink'и не копируются. Лимит body — 250 MB.

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

После заливки фото на Volume — нужно прописать их URL'ы в колонку «Фото» (Q) Google Sheets, чтобы `/sync` подтянул их в каталог. Путь может быть общей родительской папкой со вложениями (**`Apple Stock (Обработка)`**, **`Samsung Stock`** …); скрипт обходит дерево рекурсивно и матчится по тому же **плоскому имени**, что попадёт в URL после загрузки zip с тем же относительным путём.

```bash
# Dry-run (только отчёт)
npm run match-photos -- ./staging-all-brands --sheet ./reports https://bendershop.store/photos

# Полный переезд на новый сток: очистить «Фото» у всех строк + прописать новые URL
npm run match-photos -- ./staging-all-brands --sheet ./reports https://bendershop.store/photos --write --clear-photos

# Без --clear-photos — новые URL **дописываются через запятую** к уже существующим (точечные добавления)
```

Порядок: **webp в zip → `upload-photos` → match с `--write --clear-photos`**, затем **`/sync`** в боте (или автосинк), чтобы Postgres/витрина подхватили ссылки.

Если нужно только очистить колонку **«Фото»** в Sheets (до нового матчинга или заливки), без локальных фото и без перезаписи строк:

```bash
npm run clear-sheet-photos              # сколько строк с непустой «Фото» (dry-run)
npm run clear-sheet-photos -- --write  # затем /sync — в Postgres фото очистятся
```

При `/sync` в БД не попадают ссылки вида **`/no-photo.webp`**, **`.../no-photo.png`** (заглушка только на клиенте при 404 CDN; хранить их в таблице бессмысленно и раздувает карусель «много слайдов — везде Бендер»).

В колонке **«Фото»** должны быть **обычный текст или отображаемые URL**, а не ячейка `=HYPERLINK(..., "Подпись")` с текстом-подписью — иначе API Sheets отдаёт подпись без `https://`, и синк игнорирует такие значения.

Использует тот же `GOOGLE_SERVICE_ACCOUNT_KEY` + `GOOGLE_SHEET_ID` что и `/sync`. Batch-update в один API-вызов (несколько диапазонов), retry на 429.

## Database Migrations

After schema changes in `prisma/schema.prisma`:
```bash
npx prisma db push
npx prisma generate
```

Railway runs these automatically during build.
