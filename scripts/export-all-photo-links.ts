/**
 * Все ссылки на фото из стока Foto/ (Apple + Samsung) — один файл для ручной загрузки.
 *   npx ts-node scripts/export-all-photo-links.ts [foto_dir] [out_dir] [base_url]
 */
import fs from 'fs'
import path from 'path'

const DEFAULT_BASE = 'https://bendershop.store/photos'
const SKIP_DIRS = new Set(['_unmatched'])

function photoUrl(base: string, filename: string) {
  return `${base.replace(/\/$/, '')}/${encodeURIComponent(filename)}`
}

function detectBrand(filename: string): 'Apple' | 'Samsung' | 'Other' {
  const n = filename.toLowerCase()
  if (/^apple\s|^ultra\s+3\b|^iphone\s/i.test(filename)) return 'Apple'
  if (/^samsung\s|^galaxy\s/i.test(filename)) return 'Samsung'
  if (/\bapple\b|\biphone\b|\bipad\b|\bmacbook\b|\bimac\b|\bwatch\b/i.test(n)) return 'Apple'
  if (/\bsamsung\b|\bgalaxy\b/i.test(n)) return 'Samsung'
  return 'Other'
}

/** Группа карусели: одна модель+цвет, индексы 1–12 в конце — ракурсы. */
function carouselGroupKey(filename: string): string {
  const stem = filename.replace(/\.(png|webp|jpe?g)$/i, '').trim()
  return stem.replace(/\s+(?:[1-9]|1[0-2])$/i, '').trim().toLowerCase()
}

function csvEscape(s: string) {
  return `"${s.replace(/"/g, '""')}"`
}

function collectPhotos(fotoDir: string): string[] {
  const out: string[] = []
  for (const name of fs.readdirSync(fotoDir)) {
    const full = path.join(fotoDir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue
      for (const sub of fs.readdirSync(full)) {
        if (/\.(png|webp|jpe?g)$/i.test(sub)) out.push(sub)
      }
      continue
    }
    if (/\.(png|webp|jpe?g)$/i.test(name)) out.push(name)
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }))
}

function buildOwnerMd(
  baseUrl: string,
  groups: Map<string, { files: string[]; brand: string }>,
  sortedKeys: string[],
  stats: { apple: number; samsung: number; other: number; total: number },
): string {
  const blocks: string[] = []
  let carouselCount = 0
  let singleCount = 0

  for (const key of sortedKeys) {
    const g = groups.get(key)!
    const title = g.files[0]!
      .replace(/\.(png|webp|jpe?g)$/i, '')
      .replace(/\s+(?:[1-9]|1[0-2])$/i, '')
      .trim()

    if (g.files.length === 1) {
      singleCount++
      blocks.push(`### ${title}\n\n${photoUrl(baseUrl, g.files[0]!)}\n`)
    } else {
      carouselCount++
      const ready = g.files.map(f => photoUrl(baseUrl, f)).join(', ')
      blocks.push(
        `### ${title} — карусель (${g.files.length} фото)\n\n` +
          `**В ячейку Q вставить одной строкой:**\n\n\`\`\`\n${ready}\n\`\`\`\n`,
      )
    }
  }

  return `# Все фото стока — ссылки для ручной вставки

**Дата:** ${new Date().toLocaleDateString('ru-RU')}  
**Всего файлов:** ${stats.total} (Apple: ${stats.apple}, Samsung: ${stats.samsung}, прочее: ${stats.other})  
**Позиций для вставки:** ${sortedKeys.length} (${singleCount} одно фото, ${carouselCount} карусели)  
**База URL:** \`${baseUrl}\`

Полный CSV со всеми ссылками: \`all_photo_links.csv\` (в этой же папке).

---

## Как вставлять

| | |
|---|---|
| **Куда** | Google Таблица каталога → колонка **Q «Фото»** |
| **Одно фото** | Одна ссылка в ячейку |
| **Карусель** | Несколько ссылок в **одну** ячейку через \`, \` (запятая + пробел), **до 6** |
| **Проверка** | Вставьте ссылку в браузер — должна открыться картинка (не \`Cannot GET /photos/\`) |
| **После правок** | Команда \`/sync\` в Telegram-боте |

**Не открывайте** \`${baseUrl}/\` без имени файла — это не каталог.

---

## Все ссылки

${blocks.join('\n---\n\n')}

---

*Автогенерация: \`npx ts-node scripts/export-all-photo-links.ts\`*
`
}

function main() {
  const fotoDir = path.resolve(process.argv[2] ?? 'Foto')
  const outDir = path.resolve(process.argv[3] ?? path.join('Foto', '_export'))
  const baseUrl = (process.argv[4] ?? process.env.PHOTO_PUBLIC_BASE_URL ?? DEFAULT_BASE).trim()

  if (!fs.existsSync(fotoDir)) {
    console.error(`Нет папки: ${fotoDir}`)
    process.exit(1)
  }

  const files = collectPhotos(fotoDir)
  fs.mkdirSync(outDir, { recursive: true })

  const groups = new Map<string, { files: string[]; brand: string }>()
  let apple = 0
  let samsung = 0
  let other = 0

  for (const f of files) {
    const brand = detectBrand(f)
    if (brand === 'Apple') apple++
    else if (brand === 'Samsung') samsung++
    else other++

    const key = carouselGroupKey(f)
    const g = groups.get(key) ?? { files: [], brand }
    g.files.push(f)
    groups.set(key, g)
  }

  for (const [, g] of groups) {
    g.files.sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }))
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => a.localeCompare(b, 'ru'))

  const csvRows: string[] = [
    'photo_url,filename,brand,carousel_group,is_carousel,paste_ready_row',
  ]

  for (const key of sortedKeys) {
    const g = groups.get(key)!
    const pasteReady =
      g.files.length > 1 ? g.files.map(f => photoUrl(baseUrl, f)).join(', ') : photoUrl(baseUrl, g.files[0]!)
    for (const f of g.files) {
      csvRows.push(
        [
          csvEscape(photoUrl(baseUrl, f)),
          csvEscape(f),
          csvEscape(g.brand),
          csvEscape(key),
          g.files.length > 1 ? 'yes' : 'no',
          csvEscape(pasteReady),
        ].join(','),
      )
    }
  }

  const csvPath = path.join(outDir, 'all_photo_links.csv')
  fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8')

  const mdPath = path.join(outDir, 'ВСЕ_ФОТО_ССЫЛКИ.md')
  fs.writeFileSync(
    mdPath,
    buildOwnerMd(baseUrl, groups, sortedKeys, { apple, samsung, other, total: files.length }),
    'utf8',
  )

  // Плоский список только URL — для копипаста
  const urlsOnlyPath = path.join(outDir, 'all_photo_urls_only.txt')
  fs.writeFileSync(
    urlsOnlyPath,
    files.map(f => photoUrl(baseUrl, f)).join('\n'),
    'utf8',
  )

  console.log(
    JSON.stringify(
      {
        fotoDir,
        outDir,
        md: mdPath,
        csv: csvPath,
        urlsOnly: urlsOnlyPath,
        totalFiles: files.length,
        apple,
        samsung,
        other,
        groups: sortedKeys.length,
        baseUrl,
      },
      null,
      2,
    ),
  )
}

main()
