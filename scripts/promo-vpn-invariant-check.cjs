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
 *   (4) отдаваемая ссылка (если промо включат) ведёт строго на t.me.
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
    if (promo.link) {
      let host = null
      try { host = new URL(promo.link).hostname } catch { /* ниже */ }
      const proto = (() => { try { return new URL(promo.link).protocol } catch { return null } })()
      if (host !== 't.me' || proto !== 'https:') {
        problems.push(`витрине отдаётся не-Telegram адрес: ${promo.link}`)
      }
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

  if (problems.length) {
    console.log(`\nНАРУШЕНИЯ (${problems.length}):`)
    for (const p of problems) console.log(' · ' + p)
    process.exit(1)
  }
  console.log('\nИнвариант держится.')
}

main()
