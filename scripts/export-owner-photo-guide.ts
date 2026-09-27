/**
 * Один файл для владельца: инструкция + ссылки (карусели собраны в одну строку для копирования).
 *   npx ts-node scripts/export-owner-photo-guide.ts [csv_path] [out_path]
 */
import fs from 'fs'
import path from 'path'

function parseCsvLine(line: string): string[] {
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
  return cols
}

/** Группа карусели: одна модель+цвет, номера 1.png / 2.png — ракурсы. */
function carouselGroupKey(it: { filename: string }): string {
  const stem = it.filename.replace(/\.(png|webp|jpe?g)$/i, '').trim()
  // Снимаем только «галерейный» индекс 1–12 в конце, не диагональ 13/15/17 и т.д.
  const base = stem.replace(/\s+(?:[1-9]|1[0-2])$/i, '').trim()
  return base.toLowerCase()
}

function main() {
  const csvPath = path.resolve(process.argv[2] ?? path.join('Foto', '_unmatched', 'photo_links_for_manual.csv'))
  const outPath = path.resolve(process.argv[3] ?? path.join('Foto', '_unmatched', 'ДЛЯ_ВЛАДЕЛЬЦА.md'))

  if (!fs.existsSync(csvPath)) {
    console.error(`Нет файла: ${csvPath}`)
    process.exit(1)
  }

  const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/).slice(1)
  type Item = { url: string; filename: string; search: string; onDisk: boolean }
  const items: Item[] = []

  for (const line of lines) {
    const c = parseCsvLine(line)
    if (c.length < 11) continue
    const url = c[0]!
    if (!url.startsWith('http')) continue
    items.push({
      url,
      filename: c[1]!,
      search: c[2]!,
      onDisk: c[10] === 'yes',
    })
  }

  const groups = new Map<string, Item[]>()
  for (const it of items) {
    const key = carouselGroupKey(it)
    const list = groups.get(key) ?? []
    list.push(it)
    groups.set(key, list)
  }

  for (const [, list] of groups) {
    list.sort((a, b) => a.filename.localeCompare(b.filename, 'ru', { numeric: true }))
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => a.localeCompare(b, 'ru'))

  const blocks: string[] = []
  let carouselCount = 0
  let singleCount = 0

  for (const key of sortedKeys) {
    const list = groups.get(key)!
    const search = list[0]!.search
    const title =
      list[0]!.filename
        .replace(/\.(png|webp|jpe?g)$/i, '')
        .replace(/\s+(?:[1-9]|1[0-2])$/i, '')
        .trim() || search

    if (list.length === 1) {
      singleCount++
      blocks.push(`### ${title}\n\n${list[0]!.url}\n`)
    } else {
      carouselCount++
      const ready = list.map(x => x.url).join(', ')
      blocks.push(
        `### ${title} — карусель (${list.length} фото)\n\n` +
          `**В ячейку Q вставить всё одной строкой** (через запятую и пробел):\n\n` +
          `\`\`\`\n${ready}\n\`\`\`\n\n` +
          `По отдельности:\n` +
          list.map(x => `- ${x.url}`).join('\n') +
          '\n',
      )
    }
  }

  const md = `# Фото вручную — для владельца

**Дата:** ${new Date().toLocaleDateString('ru-RU')}  
**Сколько позиций:** ${sortedKeys.length} (${singleCount} одно фото, ${carouselCount} карусели)  
**Всего ссылок:** ${items.length}

Папка с картинками для сверки: \`Foto/_unmatched/\` (рядом с этим файлом).

---

## Краткая инструкция

### 1. Где вставлять

| | |
|---|---|
| **Таблица** | Google Таблица каталога Bender Shop |
| **Колонка** | **Q** — заголовок **«Фото»** |
| **Что вставлять** | Ссылку из этого файла (см. ниже) |

### 2. Одно фото

Скопируйте **одну** ссылку → вставьте в ячейку Q нужной строки товара.

Пример:
\`\`\`
https://bendershop.store/photos/Apple%20iPhone%2017%20Black.png
\`\`\`

### 3. Карусель (несколько ракурсов)

Если у товара несколько файлов (\`… 1.png\`, \`… 2.png\`, …) — в **одну** ячейку Q вставляете **все ссылки подряд**:

- разделитель: **запятая + пробел** → \`, \`
- **не больше 6 ссылок** в одной ячейке

Пример карусели из 3 фото:
\`\`\`
https://bendershop.store/photos/Samsung%20Galaxy%20S25%20Ultra%20Black%201.png, https://bendershop.store/photos/Samsung%20Galaxy%20S25%20Ultra%20Black%202.png, https://bendershop.store/photos/Samsung%20Galaxy%20S25%20Ultra%20Black%203.png
\`\`\`

В этом файле для каруселей блок **«вставить всё одной строкой»** уже собран — можно копировать целиком.

### 4. Как найти строку товара

1. Откройте таблицу каталога.  
2. **Ctrl+F** (поиск).  
3. Ищите по названию из заголовка блока ниже (например \`galaxy z fold 7\`, \`MacBook Air 13\`, цвет).  
4. Убедитесь, что **модель и цвет** совпадают — иначе фото попадёт не на тот товар.

### 5. Если в ячейке Q уже есть ссылка

- Не затирайте старую без нужды.  
- Новые допишите **через** \`, \` (запятая, пробел).  
- Тот же URL второй раз не вставляйте.

### 6. Как проверить, что ссылка рабочая

1. Скопируйте ссылку из этого файла.  
2. Вставьте в **адресную строку браузера** и Enter.  
3. Должна открыться **картинка**, не текст «Cannot GET /photos/».

**Важно:** адрес \`https://bendershop.store/photos/\` **без имени файла** открывать бессмысленно — всегда нужна полная ссылка с \`.png\` в конце.

Если **404** (страница не найдена) — фото ещё не залито на сервер, напишите технарю (нужен upload).

### 7. После правок таблицы

В Telegram-боте магазина отправьте команду:

\`\`\`
/sync
\`\`\`

Без этого мини-приложение может не показать новые фото.

### 8. Проверка в магазине

Откройте мини-приложение → найдите товар → листайте фото. Должны быть все ракурсы из карусели.

---

## Ссылки по товарам

${blocks.join('\n---\n\n')}

---

*Если товара в таблице нет — сначала добавьте строку, потом вставляйте фото. Телевизоры Samsung TV в каталоге часто отсутствуют — можно пропустить.*
`

  fs.writeFileSync(outPath, md, 'utf8')
  console.log(JSON.stringify({ outPath, groups: sortedKeys.length, links: items.length, carouselCount, singleCount }, null, 2))
}

main()
