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

Каталог использует квадратные карточки (`aspect-ratio: 1/1`). Фото считаются **уже подготовленными** во внешнем стоковом пайплайне (Apple Stock, Samsung Stock, каталог «(Обработка)» и т.д.). Важно сохранить машинную схему имён вида `Apple Stock__…` или `Samsung Stock__…`.

В репозитории остаются только **matching** и **заливка** на CDN:

- `scripts/match-photos-to-sheets.ts` → колонка **Фото (Q)** в Sheets. Путь к файлам может быть родительским каталогом: скрипт **рекурсивно** обходит подпапки (`Apple Stock (Обработка)/`, `Samsung Stock/` …); для ключей матчинга и URL используется **`flattenRelativePhotoPath`** из `lib/photo-flat-name.ts` (совпадает с тем, как `POST /admin/photos/upload` кладёт файлы из zip с вложенными папками; не только `basename`). Флаг **`--clear-photos`** перед матчем обнуляет «Фото» у всех строк (полное обновление каталога; без него новые URL **дописываются** к старым через запятую). Дубликаты одного и того же плоского имени попадут в лог и будут пропущены. Дополнительно: если ключ `brand|family|цвет|размер` расходится, используется **сравнение полного названия строки («Название модели») с текстом имени файла** (Dice + подстрока), когда файл назван почти как товар в таблице.
- `scripts/upload-photos.ts` (+ `POST /admin/photos/upload`) — zip → Railway Volume (`PHOTOS_DIR`).

Устаревший локальный Sharp-пайплайн (`pad-to-square`, `flatten-on-bg`, `optimize-images`) **удалён**.

Готовые файлы живут на **Railway Volume** (mount `/data/photos`) и отдаются через `/photos/*` в `api/server.ts`. Подробности — DEPLOYMENT.md → Product Photos.

### Matching фото к Sheets

Имена на диске/в URL задаются либо длинными стоковыми ключами целиком (`Apple Stock__…`), либо **сборкой из пути** (`Samsung Stock/.../file.png` → `Samsung Stock__...__file.png`). `scripts/match-photos-to-sheets.ts` парсит эти строки и сопоставляет их со строками xlsx, заполняя колонку `Фото` (Q) URL вида `https://bendershop.store/photos/<encoded-flat-name>` (расширение как у файла).

Уровни matching: exact (бренд+семейство+размер+цвет, conf 100), no-size match (85), family+color (75), prefix family + color (70 — `iPad Air 11` фото матчится с `iPad Air` строкой), family-only (50, не пишется). Per-brand парсеры есть для Apple Watch / iPhone / Samsung Galaxy S / Dyson; остальные обрабатываются generic парсером с extraction цвета по словарю common colors.

Запуск: `npm run match-photos <photos_dir> <input_xlsx> <output_dir> <base_url>`. На выходе — обновлённый xlsx и три CSV: matched (что записано), orphans (фото без надёжного матча — для ручного разбора), unmatched_rows (строки Sheets без фото).

Реалистичное покрытие — 30-50% строк автоматом, остальное вручную через orphans.csv. Это нормально для разнородных source-данных: автомат экономит ~80% работы, но не 100%.
