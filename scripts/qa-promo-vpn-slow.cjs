/**
 * Тот самый неторопливый посетитель, ради которого расширяли окно свежести.
 *
 * Открываем витрину со СВЕЖЕЙ подписью, честно ждём больше пяти минут (не
 * подделывая auth_date), и только потом жмём кнопку в браузере. С прежним
 * пятиминутным окном отметка бы не записалась и промо всплыло бы снова.
 *
 * Прогон включает промо на время проверки и возвращает всё как было: настройка
 * выключается, строки QA удаляются.
 *
 * env: QA_BOT_TOKEN, QA_OWNER_ID, DATABASE_URL. WAIT_SECONDS по умолчанию 390.
 */
const crypto = require('crypto')
const fs = require('fs')
const { spawn } = require('child_process')
const pg = require('/Users/va/Documents/Va/projects/bender-shop/node_modules/pg/lib/index.js')

const BASE = 'https://bendershop.store'
const OUT = 'reports/promo-vpn-2026-09-10/ui'
const PORT = 9231
const BOT_TOKEN = process.env.QA_BOT_TOKEN
const OWNER_ID = Number(process.env.QA_OWNER_ID)
const DBURL = process.env.DATABASE_URL
const WAIT_SECONDS = Number(process.env.WAIT_SECONDS || 390)   // > 5 минут с запасом
if (!BOT_TOKEN || !OWNER_ID || !DBURL) { console.error('нужны QA_BOT_TOKEN / QA_OWNER_ID / DATABASE_URL'); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true })

const SLOW_VISITOR = 991000000 + (Date.now() % 1000000)
const OK_LINK = 'https://t.me/Bender_KVN_bot?start=ref_bs_home'

function initData(userId) {
  const p = new URLSearchParams()
  p.set('user', JSON.stringify({ id: userId, first_name: 'QA' }))
  p.set('auth_date', String(Math.floor(Date.now() / 1000)))
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'))
  return p.toString()
}
async function apiCall(method, path, body) {
  const r = await fetch(BASE + '/admin/api' + path, {
    method,
    headers: { 'x-telegram-init-data': initData(OWNER_ID), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await r.json() } catch { /* пусто */ }
  return { status: r.status, data }
}

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
async function waitFor(s, expr, ms = 25000, label = expr) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await evalIn(s, expr)) return; await new Promise(r => setTimeout(r, 400)) }
  throw new Error('waitFor timeout: ' + label)
}
const pause = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  const db = new pg.Client({ connectionString: DBURL, ssl: { rejectUnauthorized: false } })
  await db.connect()
  const rowsOf = async id => (await db.query('select "promoKey" from "PromoSeen" where "telegramUserId" = $1', [String(id)])).rows

  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', `--user-data-dir=${process.env.TMPDIR || '/tmp'}/qa-slow-${Date.now()}`],
    { stdio: 'ignore' })

  const original = (await apiCall('GET', '/settings/promo-vpn')).data
  const report = { visitor: SLOW_VISITOR, waitSeconds: WAIT_SECONDS }

  try {
    let v = null
    for (let i = 0; i < 40 && !v; i++) { v = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json()).catch(() => null); if (!v) await pause(300) }
    ws = new WebSocket(v.webSocketDebuggerUrl)
    ws.onmessage = e => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) }
    }
    await new Promise(r => { ws.onopen = r })

    await apiCall('PUT', '/settings/promo-vpn', { enabled: true, link: OK_LINK, offerText: '2 недели VPN бесплатно' })

    // Витрина открывается СЕЙЧАС — подпись свежая, как у настоящего человека
    const openedAt = Date.now()
    const t = await send('Target.createTarget', { url: BASE + '/shop#tgWebAppData=' + encodeURIComponent(initData(SLOW_VISITOR)) })
    const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
    const s = a.sessionId
    await send('Page.enable', {}, s); await send('Runtime.enable', {}, s)
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s)
    await waitFor(s, `!!document.getElementById('tabbar')`, 30000, 'разметка витрины разобрана')
    await waitFor(s, `(()=>{const l=document.getElementById('loader'); return !l || l.style.display === 'none'})()`, 30000, 'заставка убрана')
    await waitFor(s, `!!document.getElementById('vpnFab')`, 30000, 'кнопка появилась')
    const ageAtOpen = await evalIn(s, `(()=>{const p=new URLSearchParams(window.Telegram.WebApp.initData); return Math.floor(Date.now()/1000)-Number(p.get('auth_date'))})()`)
    console.log(`Витрина открыта, возраст подписи: ${ageAtOpen} с. Ждём ${WAIT_SECONDS} с, вкладка живёт…`)

    // Настоящее ожидание. Вкладка не перезагружается — tg.initData у неё та же,
    // что и при старте, ровно как у человека, который листает каталог
    const t0 = Date.now()
    while ((Date.now() - t0) / 1000 < WAIT_SECONDS) {
      await pause(30_000)
      const left = Math.max(0, WAIT_SECONDS - Math.round((Date.now() - t0) / 1000))
      console.log(`   … осталось ${left} с`)
    }

    const ageNow = await evalIn(s, `(()=>{const p=new URLSearchParams(window.Telegram.WebApp.initData); return Math.floor(Date.now()/1000)-Number(p.get('auth_date'))})()`)
    console.log(`Подписи теперь ${ageNow} с — это ${(ageNow / 60).toFixed(1)} мин, старое окно было 300 с`)
    report.signatureAgeAtClick = ageNow

    // Ловим ответ сервера на отметку — важно, что это НЕ 401
    await evalIn(s, `window.__seenStatus=null; (()=>{const f=window.fetch; window.fetch=async(...a)=>{const r=await f(...a); if(String(a[0]).includes('/promo/vpn/seen')) window.__seenStatus=r.status; return r}})(); true`)
    await evalIn(s, `window.__tgLink=null; if(window.Telegram&&window.Telegram.WebApp){window.Telegram.WebApp.openTelegramLink=function(u){window.__tgLink=u}} true`)
    await evalIn(s, `document.getElementById('vpnFab').click(); true`)
    await pause(3000)

    const status = await evalIn(s, `window.__seenStatus`)
    const rows = await rowsOf(SLOW_VISITOR)
    report.seenStatus = status
    report.rowWritten = rows.length === 1

    const shotBuf = await send('Page.captureScreenshot', { format: 'png' }, s)
    fs.writeFileSync(`${OUT}/08-slow-visitor-click.png`, Buffer.from(shotBuf.data, 'base64'))

    const pass = status === 200 && rows.length === 1 && ageNow > 300
    console.log(pass ? '✅' : '✖ ', `неторопливый посетитель (${ageNow} с после открытия): POST ${status}, строк ${rows.length}`)
    report.pass = pass
    await send('Target.closeTarget', { targetId: t.targetId })
  } finally {
    await apiCall('PUT', '/settings/promo-vpn', { enabled: original.enabled, link: original.link, offerText: original.offerText })
    const cfg = (await apiCall('GET', '/settings/promo-vpn')).data
    const del = await db.query('delete from "PromoSeen" where "telegramUserId" = $1', [String(SLOW_VISITOR)])
    const left = (await db.query('select count(*)::int n from "PromoSeen"')).rows[0].n
    console.log(`↩️  промо enabled=${cfg.enabled}; 🧹 удалено QA-строк: ${del.rowCount}; осталось в PromoSeen: ${left}`)
    report.restored = { enabled: cfg.enabled, qaRowsDeleted: del.rowCount, promoSeenTotal: left }
    fs.writeFileSync(`${OUT}/report-slow.json`, JSON.stringify(report, null, 2))
    await db.end()
    try { ws && ws.close() } catch { /* пусто */ }
    chrome.kill()
  }
  process.exit(report.pass ? 0 : 1)
}

main().catch(e => { console.error('QA упал:', e.message); process.exit(1) })
