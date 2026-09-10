/**
 * Стоп-гейт «Рекомендуем»: проверка на снимках витрины.
 *
 *   node scripts/recs-invariant-check.cjs <before.json> <after.json>
 *
 * Снимки — это ответ GET /api/products до и после деплоя.
 *
 * Почему не сырой diff двух файлов: между снимками проезжает синк, и остатки,
 * цены и состав вариантов законно меняются. Такой diff будет непустым всегда и
 * ничего не докажет. Поэтому:
 *
 *   (1) главный инвариант считается ВНУТРИ ОДНОГО снимка: у товара без ручных
 *       замен новая ветка resolveRecs() обязана дать ровно то же, что старая
 *       getRecommendations(). Синк на это повлиять не может — вход один и тот же;
 *   (2) по паре снимков сверяется только ФОРМА payload: набор ключей. Новый
 *       ключ recommendedIds имеет право появиться лишь у товаров с заменами;
 *   (3) у товаров с заменами проверяется, что закреплённое стоит на своём слоте.
 *
 * Обе функции берутся из живого webapp/index.html — проверяем код витрины, а не
 * его пересказ.
 */
const fs = require('fs')
const path = require('path')

const LIMIT = 4
const INDEX = path.join(__dirname, '..', 'webapp', 'index.html')

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`)
  if (start === -1) throw new Error(`webapp/index.html: не нашли function ${name}()`)
  let depth = 0
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1)
  }
  throw new Error(`webapp/index.html: не сошлись скобки у ${name}()`)
}

function loadClientRecs() {
  const src = fs.readFileSync(INDEX, 'utf8')
  const body = ['isBuyable', 'minVariantPrice', 'getRecommendations', 'resolveRecs']
    .map(n => extractFunction(src, n)).join('\n')
  return new Function(`${body}\nreturn { getRecommendations, resolveRecs }`)()
}

const read = f => JSON.parse(fs.readFileSync(f, 'utf8'))
const ids = list => list.map(p => p.id)

function main() {
  const [beforeFile, afterFile] = process.argv.slice(2)
  if (!beforeFile || !afterFile) {
    console.error('нужно два файла: <before.json> <after.json>')
    process.exit(2)
  }

  const before = read(beforeFile)
  const after = read(afterFile)
  const { getRecommendations, resolveRecs } = loadClientRecs()
  const problems = []

  // ── (1) Товар без замен: лента не изменилась ──────────────────────────────
  const plain = after.filter(p => !(p.recommendedIds && p.recommendedIds.length))
  for (const p of plain) {
    const was = ids(getRecommendations(p, after, LIMIT))
    const now = ids(resolveRecs(p, after, LIMIT))
    if (was.join(',') !== now.join(',')) {
      problems.push(`#${p.id} «${p.name}»: без замен лента поехала — было [${was}], стало [${now}]`)
    }
  }

  // ── (2) Форма payload: новый ключ только у товаров с заменами ─────────────
  const keysOf = p => Object.keys(p).filter(k => k !== 'recommendedIds').sort().join(',')
  const beforeById = new Map(before.map(p => [p.id, p]))
  let shapeChecked = 0
  for (const p of after) {
    const b = beforeById.get(p.id)
    if (!b) continue                        // товар появился между снимками — не наш случай
    shapeChecked++
    if (keysOf(b) !== keysOf(p)) {
      problems.push(`#${p.id} «${p.name}»: изменился состав полей payload`)
    }
    if ('recommendedIds' in p && !(p.recommendedIds && p.recommendedIds.length)) {
      problems.push(`#${p.id} «${p.name}»: пустой recommendedIds попал в payload — ключа быть не должно`)
    }
  }

  // ── (3) Товар с заменами: закреплённое стоит на своём месте ───────────────
  const pinnedProducts = after.filter(p => p.recommendedIds && p.recommendedIds.length)
  for (const p of pinnedProducts) {
    const lane = resolveRecs(p, after, LIMIT)
    p.recommendedIds.forEach((id, i) => {
      if (!id) return
      if (!after.some(x => x.id === id)) return   // закреплённого нет на витрине — слот законно уходит на авто
      if (!lane[i] || lane[i].id !== id) {
        problems.push(`#${p.id} «${p.name}»: закреплённый ${id} не встал на слот ${i + 1} (там ${lane[i] ? lane[i].id : '—'})`)
      }
    })
  }

  console.log(`Снимки: ${before.length} товаров до, ${after.length} после (сверено по форме: ${shapeChecked})`)
  console.log(`(1) без замен, лента не изменилась: ${plain.length - problems.filter(x => x.includes('лента поехала')).length}/${plain.length}`)
  console.log(`(3) товаров с ручными заменами: ${pinnedProducts.length}`)

  if (problems.length) {
    console.log(`\nНАРУШЕНИЯ (${problems.length}):`)
    for (const p of problems) console.log(' · ' + p)
    process.exit(1)
  }
  console.log('\nИнвариант держится.')
}

main()
