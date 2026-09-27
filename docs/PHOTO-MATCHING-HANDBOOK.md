# Handbook: матчинг фото → Google Sheets → мини-приложение

Живой документ: фиксирует **удачный пайплайн**, **ошибки**, **состояние парсера** и **очередь доработок**.  
Обновлялся после прогона **2026-05-26** (папка `Foto/`, 463 файла, `--write --clear-photos --min-confidence=70`).  
**Парсер v2** (тот же день): `lib/photo-match-normalize.ts`, titanium-цвета, `iphone 17 air`, flat Samsung `Galaxy …`.

---

## 1. Удачный цикл (работает)

```
Foto/  (распакованный сток, плоские имена Apple/Samsung)
  → npm run zip-photos-for-upload -- .\Foto .\photos-upload.zip
  → npm run upload-photos -- .\photos-upload.zip     # файлы на Volume / CDN
  → npm run match-photos -- ".\Foto" --sheet .\reports https://bendershop.store/photos --write --clear-photos --min-confidence=70
  → /sync в Telegram-боте
  → проверка в мини-приложении
```

### Команды и подводные камни

| Шаг | Команда / заметка |
|-----|-------------------|
| Zip | `npm run zip-photos-for-upload -- .\Foto .\photos-upload.zip` — папка **`Foto`** (латиница), не `Фото`. Без аргументов ищет `Foto` / `Фото` в корне репо. |
| Память Node | `match-photos` запускается как `node --max-old-space-size=8192 -r ts-node/register/transpile-only …` — **не** через `ts-node` bin (дочерний процесс без лимита → OOM ~900 MB). |
| Base URL | Обязательно `https://bendershop.store/photos`, флаг **`--sheet`** (не `--shees`). |
| Полная перезапись Q | **`--clear-photos`** обнуляет «Фото» у всех строк перед записью. Без него URL **дописываются** через запятую. |
| После match | **`/sync`** — иначе в БД/мини-приложении старые URL. |

### Лимиты (anti-дубли / anti-карусель)

- **≤ 6 URL на ячейку** Sheets (`appendPhotoCellUrl` в `scripts/match-photos-to-sheets.ts`); дубли `… 1.png` / `… 2.png` отсекаются по «хвосту» имени.
- **≤ 12 фото** на карточку товара после sync (`mergeVariantPhotoUrls` в `lib/sheets-sync.ts`).
- **≤ 12 фото** в UI карусели (`dedupeResolvedPhotos` в `webapp/index.html`); битые URL при hover **пропускаются**, не показывают Bender между нормальными кадрами.

---

## 2. Что сделано в коде (2026-05-26)

### Инфраструктура / CLI

- `scripts/zip-photos-for-upload.ts` — распознаёт `Foto`, `Фото`, `BENDER_PHOTO_STAGING`, понятные ошибки.
- `package.json` — `match-photos` с heap 8 GB; `zip-photos-from-env`.
- `scripts/analyze-match-reports.ts` — сводка по `reports/*.csv`.

### Парсер / матчинг

**`lib/photo-match-normalize.ts`** (тесты: `tests/photo-match-normalize.test.ts`):

- `canonicalFamily` — alias `iphone air` → `iphone 17 air`.
- `colorsCompatible` — Titanium Black ↔ black, pink gold, light gold.
- `parseSamsungGalaxySFamilyFromText` — S26 / S26+ / Ultra / FE.

**`scripts/match-photos-to-sheets.ts`:**

- **`parseAppleFlatMarketing`** — плоские `Apple iPhone 17 Black.png`, Watch с size 40–49mm, Mac/iMac.
- **`parseSamsungFlatMarketing`** — `Galaxy Buds 4 Black.png` без префикса `Samsung`.
- **`parseSamsungGalaxySFamilyFromText`** + guards S25/S25 FE.
- Шаг **`family+compatible color (78)`** для Ultra titanium.
- **`photoTitleBlob`** для flat-имён (fallback по названию).
- Лимит **6 URL** на ячейку.

### Sync / UI

- `lib/sheets-sync.ts` — фильтр placeholder URL (`no-photo`), cap merged photos.
- `webapp/index.html` — dedupe, skip 404 в hover-карусели.

---

## 3. Статистика последнего прогона

Источник: `npm run analyze-match-reports` после match с `--min-confidence=70`.

| Метрика | До v2 | После v2 (текущий) |
|---------|-------|---------------------|
| Файлов в `Foto/` | 463 | 463 |
| **Смэтчилось (уник. файлов)** | 145 (31%) | **247 (53%)** |
| **Orphans** | 317 (69%) | **215 (46%)** |
| Строк Sheets с фото | 432 (28.5%) | **493 (32.5%)** |
| `below threshold (45)` | 138 | **62** |
| Шаг `family+compatible color` | — | **72 файла** (conf 78) |

Строк без фото: **1025** (в основном бренды **без файлов** в `Foto/` — Xiaomi, JBL, TV…).

### Matched по confidence (v2)

| Confidence | Файлов | Причина |
|------------|--------|---------|
| 100 | 128 | exact |
| 78 | 79 | family + compatible color (titanium) |
| 75 | 19 | family + color |
| 70 | 14 | family prefix + color |
| 90 | 6 | sheet title (очень высокое) |

### Orphans по причине (v2)

| Причина | Файлов |
|---------|--------|
| `no match` | **153** |
| `below threshold (45)` | **62** |

### Orphans — что осталось

| Family | Файлов | Почему |
|--------|--------|--------|
| galaxy z flip 7 | 28 | Часто **нет SKU** в листе |
| galaxy z fold 7 | 21 | То же |
| galaxy s25 ultra | 17 | Остаточные цвета (silverblue и т.д.) |
| galaxy buds 4 pro | 14 | Часть pink gold / family-only |
| imac 24 m4 | 4 | Цвета orange/pink нет в листе → conf 45 |
| Apple Mac * | ~8 | Имя без color-tail (v2.1 правит) |

---

## 4. Известные ошибки (история)

| # | Симптом | Причина | Статус |
|---|---------|---------|--------|
| 1 | OOM ~900 MB при match | `ts-node` spawn child без `--max-old-space-size` | **Исправлено** — register/transpile-only |
| 2 | `Directory not found: Фото` | Папка названа `Foto` (латиница) | **Исправлено** — авто-поиск `Foto` |
| 3 | Samsung OK, Apple нет | Плоские имена не парсились | **Исправлено** — `parseAppleFlatMarketing` |
| 4 | Одна S26-картинка на S26+/Ultra | S26+ не выделялся в family | **Исправлено** |
| 5 | S25 Navy → S25 FE | Широкий prefix-match | **Исправлено** — guard |
| 6 | Много точек карусели, Bender после нормальных фото | 7+ URL на ячейку + 404 на CDN + hover без skip | **Частично** — cap + skip 404; нужен upload |
| 7 | `--shees` / `hp.store/photos` | Опечатка CLI | Документировано, `assertValidPhotoBaseUrl` |
| 8 | 68% стока orphans | Цвета, family alias, порог 70 | **Снижено до 46%** — v2 |
| 9 | Z Flip/Fold в orphans | Нет строк в каталоге | **Данные**, не парсер |

---

## 5. Очередь доработок парсера (приоритет)

### P0 — сделано в v2

- [x] iPhone Air → `iphone 17 air` (`canonicalFamily`)
- [x] Titanium colors (`colorsCompatible` + шаг confidence 78)
- [x] Watch size 40–49mm в flat-именах
- [x] Flat Samsung `Galaxy …` без префикса `Samsung`
- [x] `photoTitleBlob` для flat файлов

### P1 — следующий прирост

1. **Galaxy Z Flip 7 / Fold 7** (~49 orphans) — проверить, есть ли строки в листе; если да — цвета `blue shadow`, `mint` vs колонка «Цвет».
2. **Mac mini / Studio** без цвета в имени файла (`Apple Mac mini M4.png`) — парсер v2.1 допускает Mac без color-tail; нужен **family-only** или цвет по единственному SKU в листе.
3. **Galaxy Buds 4** (не Pro) — если нет строк в каталоге, orphans ожидаемы.
4. **iMac** orange/pink/purple/yellow — только family-only (45) если в листе нет этих цветов.

### P2 — данные / сток

- **1025 unmatched rows** — в основном бренды **без файлов** в `Foto/`. Нужен новый сток, не парсер.
- **Z Flip 7 / Fold 7** — добавить строки в Sheets или убрать фото из стока.

---

## 6. Отчёты и анализ

После каждого `match-photos`:

```powershell
npm run match-photos -- ".\Foto" --sheet .\reports https://bendershop.store/photos --write --clear-photos --min-confidence=70
npm run analyze-match-reports
```

| Файл | Содержимое |
|------|------------|
| `reports/matched.csv` | Файл → confidence, reason, row_indices |
| `reports/orphans.csv` | Файл → parsed brand/family/color, причина отказа |
| `reports/unmatched_rows.csv` | Строки листа, которым **не** достался ни один URL в этом прогоне |

Ручная выборка orphans:

```powershell
Select-String -Path reports\orphans.csv -Pattern "below threshold"
Select-String -Path reports\orphans.csv -Pattern "no match" | Select-Object -First 30
```

---

## 7. Чеклист перед «всё работает»

- [ ] Zip + upload: `curl -I "https://bendershop.store/photos/Apple%20iPhone%2017%20Black.png"` → **200**
- [ ] Match с `--clear-photos` и корректным `https://…/photos`
- [ ] `/sync` в боте
- [ ] `npm run analyze-match-reports` — зафиксировать % в этом handbook
- [ ] В мини-приложении: нет «леса» точек; нет Bender между рабочими кадрами

---

## 8. Связанные файлы

| Файл | Роль |
|------|------|
| `scripts/match-photos-to-sheets.ts` | Парсеры, match engine, запись Q |
| `scripts/analyze-match-reports.ts` | Сводка CSV |
| `lib/photo-flat-name.ts` | Плоское имя для URL / zip |
| `lib/photo-match-normalize.ts` | family/цвет для ключей матча |
| `lib/sheets-sync.ts` | `/sync`, merge photos, filter placeholders |
| `tests/photo-match-normalize.test.ts` | unit-тесты нормализации |
| `webapp/index.html` | Карусель, dedupe, 404 |
| `docs/DEPLOYMENT.md` | Деплой Volume, upload, match (кратко) |

---

*После правок парсера: `npm run match-photos … --write --clear-photos` → `npm run analyze-match-reports` → `/sync`. Оставшиеся orphans — в первую очередь Z-серия и отсутствие SKU в листе.*
