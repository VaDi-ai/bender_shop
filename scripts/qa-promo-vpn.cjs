/**
 * CDP-QA промо «2 недели VPN» на проде.
 *
 * Порядок сценария намеренно такой: сначала всё проверяется на ВЫКЛЮЧЕННОМ
 * промо (релиз должен быть невидим), потом промо включается, проверяется живьём
 * и возвращается в выключенное состояние. Строки, которые QA наставил в
 * PromoSeen, удаляются в конце — на проде после прогона не остаётся следов.
 *
 * env: QA_BOT_TOKEN, QA_OWNER_ID, QA_MANAGER_ID (менеджер для проверки 403),
 *      DATABASE_URL (нормализация PromoSeen).
 * Скрины → reports/promo-vpn-2026-09-10/ui/.
 */
const crypto = require('crypto')
const fs = require('fs')
const { spawn } = require('child_process')
const pg = require('/Users/va/Documents/Va/projects/bender-shop/node_modules/pg/lib/index.js')

const BASE = 'https://bendershop.store'
const OUT = 'reports/promo-vpn-2026-09-10/ui'
const PORT = 9230
const BOT_TOKEN = process.env.QA_BOT_TOKEN
const OWNER_ID = Number(process.env.QA_OWNER_ID)
const MANAGER_ID = Number(process.env.QA_MANAGER_ID || 0)
const DBURL = process.env.DATABASE_URL
if (!BOT_TOKEN || !OWNER_ID || !DBURL) { console.error('нужны QA_BOT_TOKEN / QA_OWNER_ID / DATABASE_URL'); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true })

/** Уникальный QA-посетитель: не пересекается с живыми людьми и легко чистится. */
const QA_VISITOR = 990000000 + (Date.now() % 1000000)

/** initData с заданным возрастом — так же, как её выдаёт Telegram при старте. */
function initData(userId, ageSeconds = 0) {
  const p = new URLSearchParams()
  p.set('user', JSON.stringify({ id: userId, first_name: 'QA' }))
  p.set('auth_date', String(Math.floor(Date.now() / 1000) - ageSeconds))
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'))
  return p.toString()
}

async function apiCall(userId, method, path, body, ageSeconds = 0) {
  const r = await fetch(BASE + '/admin/api' + path, {
    method,
    headers: { 'x-telegram-init-data': initData(userId, ageSeconds), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await r.json() } catch { /* пусто */ }
  return { status: r.status, data }
}

async function promoCall(method, path, opts = {}) {
  const headers = { 'content-type': 'application/json' }
  if (opts.initData !== undefined) headers['x-telegram-init-data'] = opts.initData
  const r = await fetch(BASE + path, { method, headers, body: method === 'POST' ? '{}' : undefined, cache: 'no-store' })
  let data = null
  try { data = await r.json() } catch { /* пусто */ }
  return { status: r.status, data }
}

// ── CDP ──────────────────────────────────────────────────────────────────────
let msgId = 0
const pending = new Map()
let ws
function send(method, params = {}, sessionId) {
  const id = ++msgId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
}
async function evalIn(s, expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s)
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
  return r.result?.value
}
async function waitFor(s, expr, ms = 20000, label = expr) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await evalIn(s, expr)) return; await new Promise(r => setTimeout(r, 300)) }
  throw new Error('waitFor timeout: ' + label)
}
const pause = ms => new Promise(r => setTimeout(r, ms))

async function openShop(userId, ageSeconds = 0) {
  const url = BASE + '/shop' + (userId ? '#tgWebAppData=' + encodeURIComponent(initData(userId, ageSeconds)) : '')
  const t = await send('Target.createTarget', { url })
  const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
  const s = a.sessionId
  await send('Page.enable', {}, s)
  await send('Runtime.enable', {}, s)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s)
  // Витрина открывается заставкой BENDER.EXE поверх всего (z-index 9000), и
  // без ожидания её ухода скрины ловят заставку, а не интерфейс.
  //
  // Сначала дожидаемся, что загрузилась ИМЕННО витрина: сразу после
  // createTarget документ может быть ещё about:blank, у которого readyState
  // уже 'complete', а getElementById возвращает null — на этом проверка
  // «заставки нет» проскакивала до навигации.
  await waitFor(s, `!!document.getElementById('tabbar')`, 30000, 'разметка витрины разобрана')
  // display:none ставится через 550 мс после fade-out — ждём именно его,
  // потому что во время анимации заставка ещё видна
  await waitFor(s, `(()=>{const l=document.getElementById('loader'); return !l || l.style.display === 'none'})()`, 30000, 'заставка убрана')
  await pause(1200)
  return { session: s, targetId: t.targetId }
}
async function shot(s, name) {
  const r = await send('Page.captureScreenshot', { format: 'png' }, s)
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'))
  console.log('📸', name)
}

const report = { visitor: QA_VISITOR, checks: [] }
const ok = (name, value) => {
  report.checks.push({ name, value })
  console.log(value.pass ? '✅' : '✖ ', name, JSON.stringify(value))
}

const OK_LINK = 'https://t.me/Bender_KVN_bot?start=ref_bs_home'

async function main() {
  const db = new pg.Client({ connectionString: DBURL, ssl: { rejectUnauthorized: false } })
  await db.connect()
  const seenRows = async () => (await db.query('select count(*)::int n from "PromoSeen"')).rows[0].n
  const visitorRow = async (id) =>
    (await db.query('select "promoKey", "seenAt" from "PromoSeen" where "telegramUserId" = $1', [String(id)])).rows

  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', `--user-data-dir=${process.env.TMPDIR || '/tmp'}/qa-promo-${Date.now()}`],
    { stdio: 'ignore' })

  const before = await apiCall(OWNER_ID, 'GET', '/settings/promo-vpn')
  const original = before.data
  console.log('Настройка на старте:', JSON.stringify(original))
  console.log('Строк в PromoSeen до прогона:', await seenRows())
  console.log('QA-посетитель:', QA_VISITOR)

  try {
    let v = null
    for (let i = 0; i < 40 && !v; i++) { v = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json()).catch(() => null); if (!v) await pause(300) }
    ws = new WebSocket(v.webSocketDebuggerUrl)
    ws.onmessage = e => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) }
    }
    await new Promise(r => { ws.onopen = r })

    // ── 1. ПРОМО ВЫКЛЮЧЕНО: релиз невидим ──────────────────────────────────
    ok('промо на проде выключено (дефолт релиза)', { pass: original.enabled === false, enabled: original.enabled })

    const offView = await promoCall('GET', '/api/promo/vpn')
    ok('выключенное промо не отдаёт ни ссылки, ни enabled', {
      pass: offView.data.enabled === false && !offView.data.link,
      body: offView.data,
    })

    const off = await openShop(QA_VISITOR)
    const fabOff = await evalIn(off.session, `document.getElementById('vpnFab') === null`)
    const tplOff = await evalIn(off.session, `!!document.getElementById('vpnPromoTpl')`)
    await shot(off.session, '01-promo-off-home')
    ok('#vpnFab === null при выключенном промо', { pass: fabOff === true && tplOff === true, fabIsNull: fabOff, templatePresent: tplOff })
    await send('Target.closeTarget', { targetId: off.targetId })

    // ── 2. Права и валидация ссылки ────────────────────────────────────────
    if (MANAGER_ID) {
      const asManager = await apiCall(MANAGER_ID, 'PUT', '/settings/promo-vpn', { enabled: true, link: OK_LINK })
      ok('менеджер не сохраняет настройку (403)', { pass: asManager.status === 403, status: asManager.status, error: asManager.data && asManager.data.error })
    }

    const badLinks = ['https://evil.com/x', 'http://t.me/x', 'https://t.me.evil.com/x', 'https://t.me@evil.com/x']
    const badResults = []
    for (const link of badLinks) {
      const r = await apiCall(OWNER_ID, 'PUT', '/settings/promo-vpn', { enabled: true, link })
      badResults.push({ link, status: r.status })
    }
    ok('чужой хост отклоняется на записи (422)', { pass: badResults.every(r => r.status === 422), results: badResults })

    const afterBad = await apiCall(OWNER_ID, 'GET', '/settings/promo-vpn')
    ok('после отказов настройка не изменилась', {
      pass: afterBad.data.enabled === original.enabled && afterBad.data.link === original.link,
      now: { enabled: afterBad.data.enabled, link: afterBad.data.link },
    })

    // ── 3. Мусорная подпись не должна быть critical ────────────────────────
    const garbage = await promoCall('GET', '/api/promo/vpn', { initData: 'user=%7B%22id%22%3A1%7D&auth_date=1&hash=deadbeef' })
    // Только ASCII: заголовок с кириллицей fetch вообще не кодирует
    const garbagePost = await promoCall('POST', '/api/promo/vpn/seen', { initData: 'garbage-not-signed' })
    await pause(1500)
    const sec = await db.query(
      `select event, details, "createdAt" from "SecurityLog"
       where event = 'promo_invalid_signature' and "createdAt" > now() - interval '5 minutes'
       order by "createdAt" desc limit 5`)
    // «Critical» нигде не хранится: severity в SecurityLog нет, алерт решает
    // список CRITICAL_EVENTS в коде. Поэтому здесь проверяем ФАКТ записи, а
    // отсутствие события в списке прибито юнит-тестом (tests/promo-vpn.test.ts).
    const critical = await db.query(
      `select count(*)::int n from "SecurityLog"
       where event = 'invalid_telegram_signature' and "createdAt" > now() - interval '5 minutes'`)
    ok('мусорный заголовок: GET деградирует в анонима, POST 401', {
      pass: garbage.status === 200 && garbage.data.seen === false && garbagePost.status === 401,
      get: garbage.status, post: garbagePost.status,
    })
    ok('промо пишет СВОЁ событие, critical-событие витрины не задето', {
      pass: sec.rows.length >= 2 && critical.rows[0].n === 0,
      promoRows: sec.rows.length,
      criticalRowsLast5min: critical.rows[0].n,
      scopes: sec.rows.map(r => { try { return JSON.parse(r.details).scope } catch { return '?' } }),
    })

    // ── 4. ВКЛЮЧАЕМ ПРОМО ──────────────────────────────────────────────────
    const on = await apiCall(OWNER_ID, 'PUT', '/settings/promo-vpn', { enabled: true, link: OK_LINK, offerText: '2 недели VPN бесплатно' })
    ok('владелец включил промо', { pass: on.status === 200 && on.data.enabled === true, status: on.status })

    const shop = await openShop(QA_VISITOR)
    await waitFor(shop.session, `!!document.getElementById('vpnFab')`, 20000, 'кнопка появилась')
    const fabVisible = await evalIn(shop.session, `!document.getElementById('vpnFab').hidden`)
    await shot(shop.session, '02-promo-on-fab')
    ok('кнопка появилась на «Главной»', { pass: fabVisible === true, visible: fabVisible })

    // на другой вкладке кнопки быть не должно
    await evalIn(shop.session, `switchTab('catalog'); true`)
    await pause(600)
    const fabOnCatalog = await evalIn(shop.session, `document.getElementById('vpnFab').hidden`)
    await shot(shop.session, '03-promo-other-tab')
    ok('на «Каталоге» кнопки нет', { pass: fabOnCatalog === true, hidden: fabOnCatalog })
    await evalIn(shop.session, `switchTab('home'); true`)
    await pause(600)

    // клик → отсчёт → шторка
    await evalIn(shop.session, `window.__tgLink=null; if(window.Telegram&&window.Telegram.WebApp){window.Telegram.WebApp.openTelegramLink=function(u){window.__tgLink=u}} true`)
    await evalIn(shop.session, `document.getElementById('vpnFab').click(); true`)
    await pause(400)
    const counting = await evalIn(shop.session, `document.getElementById('vpnCount').classList.contains('on') && document.getElementById('vpnNum').textContent`)
    await shot(shop.session, '04-countdown')
    ok('клик → затемнение и отсчёт', { pass: !!counting, num: counting })

    await waitFor(shop.session, `document.getElementById('vpnSheet').classList.contains('up')`, 12000, 'шторка поднялась')
    await pause(600)
    await shot(shop.session, '05-offer-sheet')
    const sheetText = await evalIn(shop.session, `document.getElementById('vpnSheet').textContent.replace(/\\s+/g,' ').trim()`)
    ok('шторка с оффером', { pass: /2 недели VPN бесплатно/.test(sheetText), text: sheetText.slice(0, 120) })

    const fabGoneAfterClick = await evalIn(shop.session, `document.getElementById('vpnFab').hidden`)
    ok('кнопка спряталась сразу по клику (оптимистично)', { pass: fabGoneAfterClick === true })

    // диплинк
    await evalIn(shop.session, `document.getElementById('vpnClaim').click(); true`)
    await pause(700)
    const link = await evalIn(shop.session, `window.__tgLink`)
    await shot(shop.session, '06-deeplink-opened')
    ok('CTA открывает диплинк t.me', { pass: link === OK_LINK, link })

    // флаг записался
    await pause(1200)
    const rows = await visitorRow(QA_VISITOR)
    ok('флаг «видел» записан по этому посетителю', { pass: rows.length === 1 && rows[0].promoKey === 'vpn_2weeks', rows })

    // перезагрузка → кнопки нет
    await send('Target.closeTarget', { targetId: shop.targetId })
    const again = await openShop(QA_VISITOR)
    await pause(2000)
    const fabAfterReload = await evalIn(again.session, `document.getElementById('vpnFab') === null`)
    await shot(again.session, '07-after-reload-no-fab')
    ok('после перезагрузки кнопки нет — флаг сохранился', { pass: fabAfterReload === true, fabIsNull: fabAfterReload })
    await send('Target.closeTarget', { targetId: again.targetId })

    // ── 5. Неторопливый посетитель: подпись старше 5 минут ─────────────────
    // Сервер судит по auth_date, поэтому «прошло 6 минут» и подпись, выданная
    // 6 минут назад, для него одно и то же. Живое ожидание идёт отдельным
    // прогоном (qa-promo-vpn-slow.cjs), здесь — детерминированная проверка.
    const SLOW = QA_VISITOR + 1
    const slowStale = await promoCall('POST', '/api/promo/vpn/seen', { initData: initData(SLOW, 6 * 60) })
    const slowRows = await visitorRow(SLOW)
    ok('клик через 6 минут после открытия витрины пишет флаг (24ч-окно)', {
      pass: slowStale.status === 200 && slowRows.length === 1,
      status: slowStale.status, rows: slowRows.length,
    })

    const VERY_SLOW = QA_VISITOR + 2
    const almostDay = await promoCall('POST', '/api/promo/vpn/seen', { initData: initData(VERY_SLOW, 23 * 3600) })
    ok('23 часа — ещё пишет', { pass: almostDay.status === 200, status: almostDay.status })

    const TOO_OLD = QA_VISITOR + 3
    const tooOld = await promoCall('POST', '/api/promo/vpn/seen', { initData: initData(TOO_OLD, 25 * 3600) })
    const tooOldRows = await visitorRow(TOO_OLD)
    ok('старше суток — 401, окно не бесконечное', { pass: tooOld.status === 401 && tooOldRows.length === 0, status: tooOld.status })

    // ── 6. Ссылка наружу — только t.me ─────────────────────────────────────
    const onView = await promoCall('GET', '/api/promo/vpn')
    let host = null
    try { host = new URL(onView.data.link).hostname } catch { /* ниже */ }
    ok('витрине отдаётся только t.me', { pass: host === 't.me', link: onView.data.link, host })
  } finally {
    // ── Возврат прода в исходное: промо выключено, следов QA нет ───────────
    const restore = await apiCall(OWNER_ID, 'PUT', '/settings/promo-vpn', {
      enabled: original.enabled, link: original.link, offerText: original.offerText,
    })
    const finalCfg = (await apiCall(OWNER_ID, 'GET', '/settings/promo-vpn')).data
    const del = await db.query(
      `delete from "PromoSeen" where "telegramUserId" = any($1::text[])`,
      [[QA_VISITOR, QA_VISITOR + 1, QA_VISITOR + 2, QA_VISITOR + 3].map(String)])
    const left = (await db.query('select count(*)::int n from "PromoSeen"')).rows[0].n
    console.log(`↩️  промо: ${JSON.stringify({ enabled: finalCfg.enabled, link: finalCfg.link })} (статус ${restore.status})`)
    console.log(`🧹 удалено QA-строк из PromoSeen: ${del.rowCount}; осталось всего: ${left}`)
    report.restored = { enabled: finalCfg.enabled, link: finalCfg.link, qaRowsDeleted: del.rowCount, promoSeenTotal: left }
    await db.end()
    try { ws && ws.close() } catch { /* пусто */ }
    chrome.kill()
  }

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  const failed = report.checks.filter(c => !c.value.pass)
  console.log(`\nПроверок: ${report.checks.length}, провалено: ${failed.length}`)
  failed.forEach(f => console.log(' ✖', f.name, JSON.stringify(f.value)))
  process.exit(failed.length ? 1 : 0)
}

main().catch(e => { console.error('QA упал:', e.message); process.exit(1) })
