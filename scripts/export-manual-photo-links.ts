/**
 * Ссылки на не смэтченные фото + инструкция для ручной вставки в Google Sheets (колонка Q «Фото»).
 *
 *   npx ts-node scripts/export-manual-photo-links.ts [out_dir] [reports_dir] [base_url]
 *
 * out_dir по умолчанию: Foto/_unmatched
 * base_url по умолчанию: https://bendershop.store/photos
 */
import fs from 'fs'
import path from 'path'

const DEFAULT_BASE = 'https://bendershop.store/photos'

function parseOrphan(line: string) {
  const m = /^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"$/.exec(line)
  if (!m) return null
  return {
    filename: m[1]!,
    brand: m[2]!,
    family: m[3]!,
    size: m[4]!,
    color: m[5]!,
    reason: m[6]!,
  }
}

function csvEscape(s: string) {
  return `"${s.replace(/"/g, '""')}"`
}

function photoUrl(base: string, filename: string) {
  return `${base.replace(/\/$/, '')}/${encodeURIComponent(filename)}`
}

function searchHint(family: string, color: string, filename: string): string {
  const parts = [family, color].filter(Boolean)
  if (parts.length) return parts.join(' + ')
  const stem = filename.replace(/\.(png|webp|jpe?g)$/i, '').replace(/\s+\d+$/, '').trim()
  return stem.slice(0, 60)
}

function explainCategory(reason: string, family: string, brand: string, filename: string): string {
  if (/^below threshold/i.test(reason)) return 'low_confidence'
  if (/^apple\s+/i.test(filename) && !family) return 'apple_flat_no_color'
  if (/^ultra\s+3\b/i.test(filename)) return 'watch_short_name'
  if (/^samsung\s+tv\b/i.test(filename)) return 'samsung_tv'
  if (family) return 'no_sheet_row'
  return 'parse_weak'
}

function buildInstructionMd(baseUrl: string, csvName: string, rowCount: number): string {
  return `# Ручная вставка фото в Google Sheets

Дата выгрузки: ${new Date().toISOString().slice(0, 10)}  
Фото без автоматического матча: **${rowCount}**  
Базовый URL: \`${baseUrl}\`

---

## ⚠️ «Cannot GET /photos/» в браузере — это нормально

Открывать **только** \`${baseUrl}/\` (без имени файла) **нельзя** — сервер не показывает список папки, будет *Cannot GET /photos/*.

Рабочая ссылка **всегда с именем файла**, как в колонке \`photo_url\` CSV, например:

\`${photoUrl(baseUrl, 'Apple iPhone 17 Black.png')}\`

Проверяйте **конкретный** \`photo_url\` из CSV, не «голый» каталог.

---

## Перед началом

1. **Файлы должны быть залиты на сервер** (иначе ссылка даст 404):
   \`\`\`powershell
   npm run zip-photos-for-upload -- .\\Foto .\\photos-upload.zip
   npm run upload-photos -- .\\photos-upload.zip
   \`\`\`
2. Проверка одной ссылки в браузере: откройте любой \`photo_url\` из таблицы — должна открыться картинка.
3. Рабочий файл со ссылками: **\`${csvName}\`** (откройте в Excel / Google Таблицах).

---

## Куда вставлять

| Что | Значение |
|-----|----------|
| Таблица | Каталог Bender Shop (Google Sheets) |
| Колонка | **Q — «Фото»** |
| Формат ячейки | Один или несколько URL через запятую и пробел |
| Лимит | **Не больше 6 URL** в одной ячейке (как в автоматическом матче) |

**Пример одного фото:**
\`\`\`
${photoUrl(baseUrl, 'Apple iPhone 17 Black.png')}
\`\`\`

**Пример нескольких ракурсов (2–6 URL):**
\`\`\`
${photoUrl(baseUrl, 'Samsung Galaxy S25 Ultra Black 1.png')}, ${photoUrl(baseUrl, 'Samsung Galaxy S25 Ultra Black 2.png')}
\`\`\`

---

## Пошагово

1. Откройте Google Таблицу каталога.
2. В \`${csvName}\` найдите строку с нужным \`filename\` / \`photo_url\`.
3. По колонке **\`search_in_sheet\`** найдите товар в каталоге (**Ctrl+F**): совпадут **название**, **бренд**, **цвет**.
4. Убедитесь, что это **та же модель и цвет** (см. \`family\`, \`color\` в CSV).
5. Вставьте \`photo_url\` в колонку **Q «Фото»**:
   - ячейка **пустая** → вставьте URL целиком;
   - в ячейке **уже есть** URL → допишите через \`, \` (запятая + пробел), не дублируя тот же адрес;
   - для серии \`… 1.png\`, \`… 2.png\` — можно добавить до 6 разных ракурсов в **одну** строку товара.
6. Сохраните таблицу.
7. В Telegram-боте выполните **\`/sync\`** — иначе мини-приложение не увидит новые фото.
8. Проверьте карточку товара в мини-приложении.

---

## Если строки товара нет в таблице

Колонка \`on_disk\` = \`no\` — файла нет в \`Foto/\`, ссылку вставлять рано (сначала положите файл и залейте upload).

Если товара нет в каталоге — **сначала добавьте строку** (название, бренд, цвет), потом вставьте URL.  
Категории \`samsung_tv\`, часть Z Flip/Fold — часто **нет SKU в листе**; фото можно не вставлять, пока не появится строка.

---

## Переименование файлов (чтобы потом смэтчилось автоматически)

| Проблема | Как назвать файл |
|----------|------------------|
| Mac без цвета | \`Apple MacBook Air 13 Silver.png\` (цвет в конце) |
| Apple Watch Ultra | \`Apple Watch Ultra 3 49 Black Milanese.png\` (префикс Apple Watch) |
| Опечатка Samsung | \`Samsung Galaxy S25 …\` (Galaxy с большой G) |

После переименования: снова upload → \`npm run match-photos\` → \`/sync\`.

---

## Колонки в \`${csvName}\`

| Колонка | Описание |
|---------|----------|
| \`photo_url\` | Готовая ссылка для вставки в Q |
| \`filename\` | Имя файла на диске |
| \`search_in_sheet\` | Подсказка для поиска строки (Ctrl+F) |
| \`family\`, \`color\`, \`size\` | Как распознал парсер |
| \`category\`, \`fix_hint\` | Почему не смэтчилось / что исправить |
| \`on_disk\` | yes — файл в Foto/; no — только в старом отчёте |

---

*Автогенерация: \`npx ts-node scripts/export-manual-photo-links.ts\`*
`
}

function main() {
  const outDir = path.resolve(process.argv[2] ?? path.join('Foto', '_unmatched'))
  const reportsDir = path.resolve(process.argv[3] ?? './reports')
  const baseUrl = (process.argv[4] ?? process.env.PHOTO_PUBLIC_BASE_URL ?? DEFAULT_BASE).trim()

  const orphansPath = path.join(reportsDir, 'orphans.csv')
  const manifestPath = path.join(outDir, 'unmatched_photos_manifest.csv')
  const fotoDir = path.resolve(path.dirname(outDir) === outDir ? 'Foto' : path.dirname(outDir))

  fs.mkdirSync(outDir, { recursive: true })

  type Row = {
    filename: string
    photoUrl: string
    brand: string
    family: string
    size: string
    color: string
    matchReason: string
    category: string
    fixHint: string
    searchInSheet: string
    onDisk: string
  }

  const rows: Row[] = []
  const seen = new Set<string>()

  const fixByCategory: Record<string, string> = {
    low_confidence:
      'Строка в листе, скорее всего, есть — вставьте URL вручную по search_in_sheet; проверьте цвет в колонке «Цвет».',
    apple_flat_no_color:
      'Переименуйте файл: цвет в конце имени, либо вставьте URL вручную, если цвет в таблице один.',
    watch_short_name: 'Переименуйте с префиксом Apple Watch или вставьте в строку Ultra 3 вручную.',
    samsung_tv: 'В каталоге обычно нет SKU под TV — вставлять только если строка есть.',
    no_sheet_row: 'В листе нет подходящей строки (family+color) — найдите похожий SKU или добавьте строку.',
    parse_weak: 'Слабый разбор имени — уточните название файла или вставьте по полному названию товара.',
    not_indexed: 'Перезапустите match-photos после добавления файла в Foto/.',
  }

  if (fs.existsSync(manifestPath)) {
    const lines = fs.readFileSync(manifestPath, 'utf8').trim().split(/\r?\n/).slice(1)
    for (const line of lines) {
      const cols: string[] = []
      let i = 0
      while (i < line.length) {
        if (line[i] === '"') {
          let j = i + 1
          let cell = ''
          while (j < line.length) {
            if (line[j] === '"' && line[j + 1] === '"') {
              cell += '"'
              j += 2
            } else if (line[j] === '"') {
              j++
              break
            } else {
              cell += line[j++]
            }
          }
          cols.push(cell)
          i = j + 1
          if (line[i] === ',') i++
        } else {
          const j = line.indexOf(',', i)
          const end = j === -1 ? line.length : j
          cols.push(line.slice(i, end))
          i = end + 1
        }
      }
      if (cols.length < 9) continue
      const filename = cols[0]!
      if (seen.has(filename)) continue
      seen.add(filename)
      const onDisk = cols[9] === 'yes'
      const category = cols[7]!
      rows.push({
        filename,
        photoUrl: onDisk ? photoUrl(baseUrl, filename) : '',
        brand: cols[1]!,
        family: cols[2]!,
        size: cols[3]!,
        color: cols[4]!,
        matchReason: cols[5]!,
        category,
        fixHint: cols[8]! || fixByCategory[category] || '',
        searchInSheet: searchHint(cols[2]!, cols[4]!, filename),
        onDisk: onDisk ? 'yes' : 'no',
      })
    }
  } else if (fs.existsSync(orphansPath)) {
    for (const line of fs.readFileSync(orphansPath, 'utf8').trim().split(/\r?\n/).slice(1)) {
      const o = parseOrphan(line)
      if (!o || seen.has(o.filename)) continue
      seen.add(o.filename)
      const category = explainCategory(o.reason, o.family, o.brand, o.filename)
      const onDisk = fs.existsSync(path.join(fotoDir, o.filename))
      rows.push({
        filename: o.filename,
        photoUrl: onDisk ? photoUrl(baseUrl, o.filename) : '',
        brand: o.brand,
        family: o.family,
        size: o.size,
        color: o.color,
        matchReason: o.reason,
        category,
        fixHint: fixByCategory[category] ?? '',
        searchInSheet: searchHint(o.family, o.color, o.filename),
        onDisk: onDisk ? 'yes' : 'no',
      })
    }
  } else {
    console.error('Нет unmatched_photos_manifest.csv и orphans.csv — сначала export-unmatched-photos')
    process.exit(1)
  }

  // Файлы в папке _unmatched, не попавшие в manifest
  if (fs.existsSync(outDir)) {
    for (const f of fs.readdirSync(outDir)) {
      if (!/\.(png|webp|jpe?g)$/i.test(f) || seen.has(f)) continue
      seen.add(f)
      rows.push({
        filename: f,
        photoUrl: photoUrl(baseUrl, f),
        brand: '',
        family: '',
        size: '',
        color: '',
        matchReason: 'not in manifest',
        category: 'not_indexed',
        fixHint: fixByCategory.not_indexed!,
        searchInSheet: searchHint('', '', f),
        onDisk: 'yes',
      })
    }
  }

  rows.sort((a, b) => {
    const c = a.category.localeCompare(b.category, 'ru')
    if (c !== 0) return c
    return a.family.localeCompare(b.family, 'ru') || a.filename.localeCompare(b.filename, 'ru')
  })

  const csvName = 'photo_links_for_manual.csv'
  const csvPath = path.join(outDir, csvName)
  const header =
    'photo_url,filename,search_in_sheet,brand,family,size,color,category,match_reason,fix_hint,on_disk'
  const csvLines = [
    header,
    ...rows.map(r =>
      [
        csvEscape(r.photoUrl || '(файла нет на диске — сначала upload)'),
        csvEscape(r.filename),
        csvEscape(r.searchInSheet),
        csvEscape(r.brand),
        csvEscape(r.family),
        csvEscape(r.size),
        csvEscape(r.color),
        csvEscape(r.category),
        csvEscape(r.matchReason),
        csvEscape(r.fixHint),
        r.onDisk,
      ].join(','),
    ),
  ]
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8')

  const mdName = 'ИНСТРУКЦИЯ_РУЧНАЯ_ВСТАВКА_ФОТО.md'
  const mdPath = path.join(outDir, mdName)
  fs.writeFileSync(mdPath, buildInstructionMd(baseUrl, csvName, rows.length), 'utf8')

  const withUrl = rows.filter(r => r.photoUrl).length
  console.log(
    JSON.stringify(
      {
        outDir,
        instruction: mdPath,
        linksCsv: csvPath,
        totalRows: rows.length,
        rowsWithUrl: withUrl,
        rowsMissingOnDisk: rows.filter(r => r.onDisk === 'no').length,
        baseUrl,
      },
      null,
      2,
    ),
  )
}

main()
