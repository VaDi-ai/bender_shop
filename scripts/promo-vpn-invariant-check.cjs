/**
 * Стоп-гейт VPN-промо: проверка на снимках витрины.
 *
 *   node scripts/promo-vpn-invariant-check.cjs <before.json> <after.json>
 *
 * Снимки — ответ GET /api/products до и после деплоя.
 *
 * Что проверяется:
 *   (1) payload каталога не изменился по ФОРМЕ — промо не имеет права ничего
 *       туда добавить. Значения (цены, остатки) между снимками правит синк, их
 *       сравнивать бессмысленно, поэтому сверяется набор ключей;
 *   (2) живая ручка /api/promo/vpn отвечает и, пока промо выключено, не отдаёт
 *       ни ссылки, ни признака включённости;
 *   (3) POST /api/promo/vpn/seen без подписи отвечает 401 — писать строку по
 *       telegram-id можно только с доказанной личностью;
 *   (4) отдаваемые ссылки (если поверхность включат) ведут только на адреса
 *       из белого списка (t.me или веб-портал VPN на его порту 8443);
 *   (5) карточка в «Рекомендуем» отдаётся отдельным полем `recs` и, пока она
 *       выключена, не отдаёт адреса — как и кнопка.
 *
 * Проверки (2)-(4) ходят на живой прод, поэтому нужен его адрес:
 *   BASE=https://bendershop.store node scripts/promo-vpn-invariant-check.cjs …
 */
const fs = require('fs')

const BASE = process.env.BASE || 'https://bendershop.store'
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'))

async function main() {
  const [beforeFile, afterFile] = process.argv.slice(2)
  if (!beforeFile || !afterFile) {
    console.error('нужно два файла: <before.json> <after.json>')
    process.exit(2)
  }
  const before = read(beforeFile)
  const after = read(afterFile)
  const problems = []

  // ── (1) Форма payload каталога не поехала ────────────────────────────────
  const keysOf = p => Object.keys(p).sort().join(',')
  const beforeById = new Map(before.map(p => [p.id, p]))
  let checked = 0
  for (const p of after) {
    const b = beforeById.get(p.id)
    if (!b) continue
    checked++
    if (keysOf(b) !== keysOf(p)) problems.push(`#${p.id} «${p.name}»: изменился состав полей payload`)
  }
  const promoKeys = after.filter(p => Object.keys(p).some(k => /promo|vpn/i.test(k)))
  if (promoKeys.length) problems.push(`в /api/products просочились промо-поля у ${promoKeys.length} товаров`)

  // ── (2) Ручка состояния промо ────────────────────────────────────────────
  let promo = null
  try {
    const r = await fetch(BASE + '/api/promo/vpn', { cache: 'no-store' })
    if (!r.ok) problems.push(`GET /api/promo/vpn ответил ${r.status}`)
    else promo = await r.json()
  } catch (e) {
    problems.push('GET /api/promo/vpn недоступен: ' + e.message)
  }

  if (promo) {
    if (typeof promo.enabled !== 'boolean') problems.push('в ответе промо нет булева enabled')
    if (promo.seen !== false) problems.push('аноним получил seen != false — помечать его нечем')
    if (!promo.enabled && promo.link) problems.push('промо выключено, но ссылка всё равно отдаётся')
    // ── (4) Ссылка только на Telegram ──────────────────────────────────────
    // Тот же белый список, что в lib/promo-vpn.ts isAllowedPromoLink: точный
    // хост + строгий порт. Держим копией, а не импортом: скрипт .cjs гоняется
    // отдельно от сборки и не должен тянуть ts-модуль
    const allowed = (url) => {
      let u = null
      try { u = new URL(url) } catch { return false }
      if (u.protocol !== 'https:') return false
      if (u.hostname === 't.me' && u.port === '') return true
      if (u.hostname === 'k9x2m1.conntest.xyz' && u.port === '8443') return true
      return false
    }
    const onlyAllowed = (url, what) => {
      if (!url) return
      if (!allowed(url)) problems.push(`витрине отдаётся адрес не из белого списка ${what}: ${url}`)
    }
    onlyAllowed(promo.link, 'кнопки')

    // ── (5) Карточка в «Рекомендуем» — своя поверхность ─────────────────────
    if (!promo.recs || typeof promo.recs.enabled !== 'boolean') {
      problems.push('в ответе промо нет recs.enabled — витрина не узнает про карточку')
    } else {
      if (!promo.recs.enabled && promo.recs.link) problems.push('карточка выключена, но адрес всё равно отдаётся')
      onlyAllowed(promo.recs.link, 'карточки')
    }
  }

  // ── (3) Запись требует подписи ───────────────────────────────────────────
  let seenStatus = null
  try {
    const r = await fetch(BASE + '/api/promo/vpn/seen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    seenStatus = r.status
    if (r.status !== 401) problems.push(`POST /seen без подписи ответил ${r.status}, ожидался 401`)
  } catch (e) {
    problems.push('POST /api/promo/vpn/seen недоступен: ' + e.message)
  }

  console.log(`Снимки: ${before.length} товаров до, ${after.length} после (сверено по форме: ${checked})`)
  console.log(`(1) промо-полей в каталоге: ${promoKeys.length}`)
  console.log(`(2) GET /api/promo/vpn: ${promo ? JSON.stringify(promo) : 'нет ответа'}`)
  console.log(`(3) POST /seen без подписи: ${seenStatus}`)
  console.log(`(5) карточка в «Рекомендуем»: ${promo && promo.recs ? JSON.stringify(promo.recs) : 'поля нет'}`)

  if (problems.length) {
    console.log(`\nНАРУШЕНИЯ (${problems.length}):`)
    for (const p of problems) console.log(' · ' + p)
    process.exit(1)
  }
  console.log('\nИнвариант держится.')
}

main()
