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

## Подготовка фото товаров

Фото товаров приходят с разными пропорциями (1024×1024, 1280×800, 1344×768, 1408×736 и др.), но карточка в каталоге использует `aspect-ratio: 1/1` — нужны квадраты, иначе видны пустые полосы.

`scripts/pad-to-square.ts` приводит любое фото к квадрату 1024×1024 WebP без видимых стыков:
1. Crop светлых полей по краям (стандартные апплевские paddings)
2. Pad до квадрата через `extend({ extendWith: 'copy' })` — повторение крайней строки/столбца. NB: `resize` через Lanczos здесь даёт артефакт яркости (Sharp делает sRGB↔linear gamma transform на однородных полосах), поэтому используем именно extend.
3. Bright-streak detection: если у края есть яркие пятна (логотип) при тёмном фоне — fallback на solid color заливку
4. Resize 1024×1024, WebP quality 85

Запуск: `npm run pad-images <input_dir> <output_dir>`. Идемпотентен (skip-up-to-date по mtime, как `optimize-images.ts`).

Готовые файлы выкладываются на **Railway Volume** (mount `/data/photos`, env `PHOTOS_DIR`) и раздаются через `/photos/*` — отдельный static route в `api/server.ts`. Volume отделён от репо чтобы не раздувать git и не копировать MB изображений при каждом деплое. См. DEPLOYMENT.md → Product Photos.

### Matching фото к Sheets

Имена файлов с Apple/Samsung-style образцов несут структурированную информацию (`Apple Stock__Apple Watch Stock__S11__MGHY4_VW_34FR+watch-case-42-titanium-natural-cell-s11_...`). `scripts/match-photos-to-sheets.ts` парсит эти имена и сопоставляет их со строками xlsx, заполняя колонку `Фото` (Q) URL'ами вида `https://bendershop.store/photos/<filename>.webp`.

Уровни matching: exact (бренд+семейство+размер+цвет, conf 100), no-size match (85), family+color (75), prefix family + color (70 — `iPad Air 11` фото матчится с `iPad Air` строкой), family-only (50, не пишется). Per-brand парсеры есть для Apple Watch / iPhone / Samsung Galaxy S / Dyson; остальные обрабатываются generic парсером с extraction цвета по словарю common colors.

Запуск: `npm run match-photos <photos_dir> <input_xlsx> <output_dir> <base_url>`. На выходе — обновлённый xlsx и три CSV: matched (что записано), orphans (фото без надёжного матча — для ручного разбора), unmatched_rows (строки Sheets без фото).

Реалистичное покрытие — 30-50% строк автоматом, остальное вручную через orphans.csv. Это нормально для разнородных source-данных: автомат экономит ~80% работы, но не 100%.
