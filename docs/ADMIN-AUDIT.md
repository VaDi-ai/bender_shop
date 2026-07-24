# ADMIN-AUDIT — карта существующего (перед проектированием админки)

> Аудит на 2026-07-24. **Только исследование, код не менялся, ничего не удалено.**
> Числа строк — с прод-снапшота `backups/prod-snapshot-20260724-025149.json` (30 таблиц, 17 104 строки).

## TL;DR
- **Веб-админки нет.** Вся админка — это **conversational-флоу в Telegram-боте** (`bot/admin/*`, 11 разделов меню). В HTTP только **2 админ-эндпоинта** (загрузка фото, HMAC). `webapp/index.html` — 100% клиентский, admin-UI = 0.
- **Контент (баннеры, маркиза, категории, акции, витрина) НЕ правится «в коде»** — он правится **через бота** (модуль `storefront.ts` и др.), пишется в БД / `setting_*`. Боль не «лезть в код», а «всё через чат-бота». **Код-only реально только**: статические тексты витрины (футер, ярлыки), структура/раскладка секций главной, юр-документы.
- **Много рудиментов старой складской схемы** (Supplier/SupplierPrice/Reservation/PriceChange/PriceAlias, поля `Product.stock/reserved`) — код живой, строк 0, товароучёт уехал в Google-таблицу.
- **Готовые, но простаивающие фичи**: Акции (Promotion — работает, сейчас спит), Рассылки (BroadcastLog — работает, ни разу не запускали), Сегменты/Теги/Шаблоны (схема есть, 0 строк).
- **Собирается, но не показывается**: Event (1491 событие витрины — вид только «за сегодня»), прибыль по Sale, `Client.birthDate/email`.

---

## 1. Что существует (списком: что делает / где / живое-мёртвое)

### 1a. Админ-меню Telegram-бота (`bot/index.ts:189` `adminKeyboard`, gate — admin-middleware `bot/index.ts:413+`)
| Раздел (кнопка) | Модуль | Что делает | Статус |
|---|---|---|---|
| 📦 Товароучёт | `bot/admin/inventory.ts` (158 KB) | Товары/варианты/остатки, приход/расход, **создание/правка категорий** | LIVE частично — категории/правки живые; ручной приход-расход (StockMovement) **рудимент** (учёт в Sheet) |
| 💰 Цены | `bot/admin/pricing.ts` (115 KB) | Парсинг цен из сообщений поставщиков, **правила наценки (MarkupRule)**, история цен, алиасы | MarkupRule (12) **LIVE**; PriceChange/PriceAlias (0) **мёртвые**; парсинг поставщиков — рудимент |
| 📊 Аналитика | `bot/admin/analytics.ts` | Карточки клиентов, выручка/заказы, VIP-фильтр, плитка «мало на складе» | LIVE (читает Order/Client-роллапы) |
| 📬 Входящие | CRM-чаты (`Message` 9470) | Переписка с клиентами (Telegram/Avito/IG) | LIVE |
| 🏭 Поставщики | `bot/admin/suppliers.ts` | CRUD поставщиков, разбор их прайсов | **МЁРТВОЕ** (Supplier/SupplierPrice = 0/0, цены теперь из Sheet) |
| 🤖 AI Агент | `bot/admin/ai_settings.ts` | Настройки AI (ключи, режим) | LIVE |
| 📢 Рассылки | `bot/admin/broadcasts.ts` | Массовые сообщения (all/tag/segment), лог | Код LIVE, **0 отправок** (BroadcastLog=0) |
| 🏷️ Акции | `bot/admin/promotions.ts` | Скидки (percent/fixed) по категории/бренду/атрибуту/товарам, применить/отменить | LIVE-фича, **сейчас спит** (Promotion=1 неактивна, PromotionPrice=0) |
| 🖼️ Витрина | `bot/admin/storefront.ts` | **Hero-баннеры, маркиза, cache_version, тренды/featured** | LIVE — это и есть «управление контентом витрины» |
| 📂 Сегменты | `bot/admin/segments.ts` | CRM-сегменты клиентов | **МЁРТВОЕ** (Segment=0) |
| 🔧 Техработы | maintenance | Триггеры синка Sheets, служебное | LIVE |
| (💰 Балансы, 🔑 API Ключи) | — | доп. пункты в `MENU_BUTTONS` | — |
| (продажи) | `bot/admin/sales.ts` (53 KB) | импорт продаж, резервы | Sale (224) LIVE; Reservation (0) мёртвый |

Дополнительно (не на главной клавиатуре, но живые/важные):
- **CRM клиентов** — панель в топиках CRM-группы (`webhooks/telegram.ts:217`, keyboard `:86`): Продажа/Резерв, **правка ФИО/phone/email/birthDate** (`:289,647`), сегмент/статус (Думает/Ждёт скидку/Отказ), заметки, история, карточка, «запросить цену у поставщиков». LIVE.
- **AI Агент** (`ai_settings.ts`): режимы off/manual/semi/auto (`:293`), расписание ночного режима 20:00–11:00, ревью AI-черновиков ответов (`webhooks/telegram.ts:700`), `/hits` (AI-подбор featured), enrich карточек. LIVE.
- **Техработы** (`bot/index.ts:1340`): режим обслуживания, **бэкап сейчас** + авто-бэкап 03:00 (`:1862`), API-ключи (OpenRouter), **security-log вьюер**, `maint:clear_products`/`clear_orders` (bulk-удаление с подтверждением). LIVE.
- **Планировщики** (LIVE): авто-синк Sheets 11–20 MSK, авто-истечение акций (10 мин), AI-расписание, утреннее уведомление о курсе USD, очистка `public/uploads` >24ч.

### 1e. Мёртвое/орфаны ВНУТРИ бота (не склад — просто недоступно/заглушка)
- **`💰 Балансы`** (`bot/index.ts:952`) — хендлер есть, но кнопки в меню нет → достижимо только вводом текста. Орфан.
- **CRM «Теги» по клиенту** (`webhooks/telegram.ts:320,695`) — заглушка «Управление тегами — скоро». (Теги в рассылках/сегментах при этом работают.)
- **Старый UI приёмки/списания** (`inventory.ts:505,520,536,592`, колбэки `inv:receive*`/`inv:r_*`/`inv:w_*`) — функции не вызываются, хендлеры не зарегистрированы. Заменён живыми `inv:stock_in`/`inv:stock_out`.
- **Flow-состояния `receive_variant`/`writeoff_variant`** (`inventory.ts:253,262`) — объявлены, нигде не используются.

### 1b. Админ-эндпоинты HTTP (`api/server.ts`)
Единственный настоящий admin-gate — **`requireAdminHmac`** (`server.ts:144`, HMAC по `BOT_TOKEN` + анти-реплей 5 мин). `ADMIN_IDS` (`:53`) — только для уведомлений о заказах, роуты не гейтит.

| METHOD путь | Что | Где | Статус |
|---|---|---|---|
| `GET /admin/photos/info` | статус папки фото на Volume | `server.ts:408` | LIVE |
| `POST /admin/photos/upload` | приём zip с WebP → PHOTOS_DIR (guard от traversal) | `server.ts:457` | LIVE |

Клиент обоих — CLI `scripts/upload-photos.ts`. Других `/admin/*` нет. **Ни один HTTP-роут не создаёт/не правит баннеры, настройки, категории, тренды** — всё это только read-only GET.

### 1c. Админ-панель в webapp
**Нет.** `admin` в `webapp/index.html` встречается 0 раз (кроме класса `ask-manager`). Ни загрузок, ни правок, ни скрытых вью.

### 1d. Скрипты (`scripts/`) — кратко (полный разбор ниже в §7)
Живое-recurring: `backup-db.ts`, `restore-db.ts`, `match-photos-to-sheets.ts`, `upload-photos.ts`, `import-avito-stats.ts`, `audit-*`, `zip-photos-for-upload.ts`.
Разовые/миграции: `encrypt-*`, `rotate-encryption-key.ts`, `add-check-constraints.ts`, `clear-test-products.ts`.
Dev/экспорт-хелперы: `export-*-photo-links.ts`, `create-template.ts`, `restore-paths.ts`, `inspect-xlsx-export.cjs` (последний — вероятно мёртв).

---

## 2. МЁРТВОЕ — рудименты старой складской архитектуры
Товароучёт теперь в Google-таблице (`lib/sheets-sync.ts`); исходная складская схема осталась в коде и БД. **Код живой (пути есть), строк 0 → на практике не используется. НЕ удалять — пометить.**

| Модель / поле | Что было | Где в коде | Строк |
|---|---|---|---|
| **Reservation** | резерв товара под клиента | `bot/admin/sales.ts:366,616`, `api/server.ts:1591`, `lib/stock.ts:201` | 0 |
| **Supplier** | карточки поставщиков | `bot/admin/suppliers.ts` (полный CRUD) | 0 |
| **SupplierPrice** | распарсенные прайсы поставщиков | `webhooks/supplier.ts:73`, `bot/admin/pricing.ts:760` | 0 |
| **PriceChange** | история правок цены | `bot/admin/pricing.ts:379,494,1802` | 0 |
| **PriceAlias** | маппинг «имя поставщика → вариант» | `bot/index.ts:813-921`, `webhooks/supplier.ts:57` | 0 |
| **AvitoItemStat** | суточная статистика Avito по API | `bot/scheduler.ts:112` (сборщик 14:00) | 0 (джоба не идёт) |
| `Product.stock` | остаток на складе | пишется в приходе `inventory.ts:925`; читается только плиткой «мало на складе» `analytics.ts:160` | — |
| `Product.reserved` | зарезервировано | декремент в заказе `server.ts:1597`, инкремент из мёртвого резерва | инертно |
| **StockMovement** | аудит движений склада | ручные пути `inventory.ts` не используются; пишется как **побочка заказа** `server.ts:1577` | 14 (=14 заказов) |

**Единственное живое из склада — `Product.quantity` / `ProductVariant.quantity`** (управляют доступностью на витрине, `server.ts:711,723`; `isAvailable` `bot/index.ts:1543`). `stock`/`reserved` можно считать legacy.

> ⚠️ `lib/sheets-sync.ts:474-485`: при `SHEETS_FULL_RESET=true` синк сносит весь складской граф в одной транзакции — это и есть маркер «производных/одноразовых» таблиц.

---

## 3. Что сейчас требует «лезть» (кандидаты в админку)
**Важная поправка к постановке:** баннеры/категории/акции/маркиза правятся **не в коде, а через чат-бота** (`storefront.ts`, `promotions.ts`, `inventory.ts`). Боль — неудобный conversational-UX и отсутствие веба. Кандидаты:

| Что | Как сейчас | Куда в админке |
|---|---|---|
| Hero-баннеры | бот `storefront.ts:263/166/188` → БД `HeroBanner`, отдаётся `GET /api/hero-banners` | веб-CRUD баннеров (загрузка, порядок, тексты, вкл/выкл) |
| Маркиза (бегущая строка) | бот `storefront.ts:215` → `setting_marquee` | поле в настройках витрины |
| Категории (+ **баннер категории**, **сторона текста**) | бот `inventory.ts:1089-1188` + синк `sheets-sync.ts:651` | справочник категорий с презентацией |
| Контент товара (описание/характеристики/бейдж/бренд/фото) | бот `inventory.ts:1674-1821` (+ AI enrich) | редактор карточки |
| Хиты (`isFeatured`) | бот `/hits`, `inv:hit_toggle` `inventory.ts:1003`, AI `hits:auto` | управление хитами |
| Сброс кэша витрины (`cache_version`) | бот `sf:cache_reset` `storefront.ts:136` | кнопка «обновить сайт» |
| Тренды/хиты/featured | AI `lib/trends.ts:23` + бот; на главной — `isFeatured`/`badge` (override из Sheet R+) | управление хитами/бейджами |
| Акции/скидки | бот `promotions.ts` (движок `lib/promotions.ts`) | веб-конструктор акций |
| Настройки (store_name, currency, promo_banner) | `setting_*` через бота | страница настроек |
| **Код-only (реально в коде)** | | |
| Тексты витрины (футер: адрес/телефон, ярлыки UI) | хардкод в `webapp/index.html` | вынести в настройки |
| Структура/раскладка секций главной (Новинки/Бренды/Хиты/блок бренда) | хардкод (`renderHome` и разметка) | конфигурируемые секции (позже) |
| Юр-документы (`/legal/*`) | статические | редактор текстов (позже) |

---

## 4. Данные, которые уже собираются (пишется / показывается)
| Данные | Пишется | Показывается | Пробел |
|---|---|---|---|
| Client: fullName/phone | `server.ts:903-905` (профиль) | карточка `analytics.ts:310-311` | — |
| Client: **email** | `server.ts:906` | только сводка `webhooks/telegram.ts:162` | почти не показывается |
| Client: **birthDate** | `server.ts:904` | нигде staff-facing | **собирается, не показывается** |
| Client: pdnConsentAt | `server.ts:908` + SecurityLog | только как булев гейт | значение не показывается |
| totalPurchases / totalRevenue / lastPurchaseDate | заказ `server.ts:1606-1608` | карточка `analytics.ts:315-318`, сводка | показывается |
| segmentId | `server.ts:1522` | `analytics.ts:313` | всегда «—» (Segment=0) |
| Order/OrderItem (14) | checkout `server.ts:1535` | дашборд `bot/index.ts:283`, аналитика, Кабинет `server.ts:927` | показывается |
| **Sale (224)** | импорт Excel `lib/avito-import.ts:158` | только счётчик в `/avito stats` | **прибыль/costPrice не показываются** |
| **Event (1491)** | `trackEvent()` `lib/events.ts:15` ← `/api/track` + `order_created` | только `/events` **за сегодня** `bot/index.ts:303` | **нет дашборда/воронки/истории** |
| AvitoStat (368) | импорт `lib/avito-import.ts:77` | `/avito stats` (Telegram) | показывается |

Мелочи: `webapp` шлёт `track('filter_line')` (`index.html:2048`), но `filter_line` **нет в allowlist** `ALLOWED_EVENT_TYPES` (`server.ts:344`) → отклоняется 400, не пишется (мёртвая запись).

---

## 5. Рассылки / скидки / акции — зачатки есть, не с нуля
- **Акции (Promotion + PromotionPrice)** — фича **полностью реализована**: движок `lib/promotions.ts` (`applyPromotion:74` пишет снапшот старой цены → переписывает цены вариантов; `cancelPromotion:137` восстанавливает и удаляет снапшоты), admin-CRUD `promotions.ts:366+`, авто-истечение `bot/index.ts:1917`, анонс в рассылку. Prod: 1 акция (неактивна), 0 снапшотов → **работает, простаивает**.
- **Рассылки (BroadcastLog)** — код живой: отправка `broadcasts.ts:397`, история `:248`, + `SecurityLog('broadcast_sent')`. Prod: **0 строк** → ни разу не отправляли. Функционал есть.
- **Наценка (MarkupRule, 12 строк)** — **живая**, участвует в цепочке цен: загрузка `lib/markup-rules.ts:108`, применение `applyMarkupRules` в `pricing.ts:980` (и в синке Sheet). Единственная «ценовая» модель, пережившая переход на таблицу.

---

## 6. Схема БД — живое / пустое / мёртвое (по строкам на проде)
| Модель | Строк | Статус |
|---|---|---|
| Message | 9470 | LIVE |
| ProductVariant | 1751 | LIVE |
| Event | 1491 | LIVE (сбор), показ минимальный |
| Product | 712 | LIVE |
| AvitoStat | 368 | LIVE |
| Sale | 224 | LIVE (показ частичный) |
| Category | 92 | LIVE |
| SecurityLog | 35 | LIVE |
| Order / OrderItem | 14 / 14 | LIVE |
| StockMovement | 14 | LIVE (побочка заказов) |
| MarkupRule | 12 | LIVE |
| ApiKey | 8 | LIVE |
| HeroBanner | 2 | LIVE |
| CurrencyRate / Region(ShopRegion) | 1 / 1 | LIVE |
| Task | 1 | LIVE (еле) |
| Promotion | 1 | HALF-LIVE (спит) |
| Client | — | LIVE |
| Segment, Tag, Template | 0 | схема живая, **пусто/мёртвое** |
| Reservation, Supplier, SupplierPrice, PriceChange, PriceAlias, PromotionPrice, BroadcastLog, AvitoItemStat | 0 | код живой, **мёртвое на практике** |

---

## 7. Скрипты (`scripts/`) — полный разбор
| Скрипт | Назначение | Класс |
|---|---|---|
| `backup-db.ts` (npm `backup`) | JSON-дамп таблиц | recurring |
| `restore-db.ts` (npm `restore`) | восстановление из дампа (destructive) | recovery ⚠ |
| `match-photos-to-sheets.ts` (npm `match-photos`) | матчинг фото ↔ Sheets | recurring ⚠(Sheets) |
| `upload-photos.ts` (npm `upload-photos`) | HMAC-загрузка zip фото на прод | recurring ⚠ |
| `import-avito-stats.ts` (npm `import:avito`) | импорт статистики Avito | recurring ⚠ |
| `audit-attributes.ts` / `audit-product-photos.ts` | аудиты (read-only) | recurring |
| `analyze-match-reports.ts` | сводка отчётов матчинга | dev/recurring |
| `zip-photos-for-upload.ts` | упаковка фото для загрузки | dev/recurring |
| `clear-sheet-photo-column.ts` | очистка колонки «Фото» в Sheet (dry-run по умолч.) | recurring ⚠(Sheet) |
| `add-check-constraints.ts` | CHECK-констрейнты (once) | migration ⚠ |
| `clear-test-products.ts` (npm `clear-products`) | удалить ВСЕ товары+варианты | migration/dev ⚠ |
| `encrypt-api-keys.ts` / `encrypt-existing-keys.ts` | шифрование ApiKey (once, перекрываются) | migration ⚠ |
| `encrypt-client-pii.ts` | шифрование Client PII (once) | migration ⚠ |
| `rotate-encryption-key.ts` | ре-шифрование после ротации ключа | migration/recurring ⚠ |
| `create-template.ts` | генерит `public/template.xlsx` | dev |
| `export-all-photo-links.ts`, `export-manual-photo-links.ts`, `export-owner-photo-guide.ts`, `export-unmatched-photos.ts` | экспорт-хелперы для ручной загрузки фото | dev |
| `restore-paths.ts` | переименование плоских имён фото в иерархию | dev |
| `test-enrich-sheets.ts` | тест AI-обогащения (пишет в Sheets) | dev / вероятно мёртв |
| `inspect-xlsx-export.cjs` | разовый разбор xlsx | вероятно мёртв |
| `verify-dist.cjs` | проверка сборки (часть `build`) | build |

---

## Итог для проектирования админки
- **ЖИВОЕ (показывать/дать управлять):** Client(+роллапы), Message, Order/OrderItem, Category, Product/Variant(`quantity`), HeroBanner, MarkupRule, Promotion, AvitoStat/Sale, SecurityLog, настройки витрины.
- **МЁРТВОЕ (рудименты склада — скрыть/деприкейтить, не удалять):** Reservation, Supplier, SupplierPrice, PriceChange, PriceAlias, AvitoItemStat; поля `Product.stock`/`reserved`; ручные пути StockMovement.
- **ВРУЧНУЮ-ЧЕРЕЗ-БОТА (перенести в веб):** баннеры, маркиза, категории, акции, тренды/хиты, настройки. **Код-only:** статические тексты витрины, раскладка секций главной, юр-документы.
- **УЖЕ СОБИРАЕТСЯ, НО НЕ ПОКАЗЫВАЕТСЯ (быстрые победы для дашборда):** Event (1491, только «за сегодня»), прибыль по Sale, `Client.birthDate/email`, простаивающие Рассылки, пустые Сегменты.
- **HTTP/веб-слой под админку — greenfield:** сейчас 0 мутирующих admin-эндпоинтов и 0 admin-UI; нужны новые аутентифицированные эндпоинты и отдельная вью/поддомен.
