/**
 * CDP-QA перевода VPN-поверхностей на веб-портал (PR-1) на проде.
 *
 * Порядок как в стоп-гейтах #137/#139: сначала всё на ВЫКЛЮЧЕННОМ промо (релиз
 * невидим, модалка байт-в-байт прежней), потом временно включаем на стенде,
 * проверяем адреса и способ открытия, возвращаем в выключенное.
 *
 * Новое против #139:
 *   • адреса ведут на портал (?ref=bs_home / ?ref=bs_recs) — сверяем точно;
 *   • способ открытия выбирается по хосту: портал → tg.openLink (внешний
 *     браузер), t.me → tg.openTelegramLink. Перехватываем ОБА и смотрим, какой
 *     из них позвали;
 *   • живая проверка сертификата: реально открываем портал-URL в отдельной
 *     вкладке БЕЗ --ignore-certificate-errors и фиксируем, есть ли TLS-интерстишл.
 *
 * env: QA_BOT_TOKEN, QA_OWNER_ID, QA_MANAGER_ID, DATABASE_URL
 */
const crypto = require('crypto')
const fs = require('fs')
const { spawn } = require('child_process')
const pg = require(require('path').join(__dirname, '..', 'node_modules', 'pg', 'lib', 'index.js'))

const BASE = process.env.BASE || 'https://bendershop.store'
const DIR = 'reports/promo-vpn-portal-2026-09-11'
const OUT = DIR + '/ui'
const PORT = 9234
const PRODUCT_ID = Number(process.env.QA_PRODUCT_ID || 674)
const BTN_LINK = 'https://k9x2m1.conntest.xyz:8443/portal/?ref=bs_home'
const RECS_LINK = 'https://k9x2m1.conntest.xyz:8443/portal/?ref=bs_recs'
const BOT_TOKEN = process.env.QA_BOT_TOKEN
const OWNER_ID = Number(process.env.QA_OWNER_ID)
const MANAGER_ID = Number(process.env.QA_MANAGER_ID || 0)
const DBURL = process.env.DATABASE_URL
if (!BOT_TOKEN || !OWNER_ID || !DBURL) { console.error('нужны QA_BOT_TOKEN / QA_OWNER_ID / DATABASE_URL'); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true })

const QA_VISITOR = 990000000 + (Date.now() % 1000000)

function initData(userId) {
  const p = new URLSearchParams()
  p.set('user', JSON.stringify({ id: userId, first_name: 'QA' }))
  p.set('auth_date', String(Math.floor(Date.now() / 1000)))
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'))
  return p.toString()
}

async function withRetry(label, fn, tries = 3) {
  let last
  for (let i = 1; i <= tries; i++) {
    try { return await fn() } catch (e) {
      last = e
      const cause = e.cause && (e.cause.code || e.cause.message)
      console.log(`   ↻ ${label}: попытка ${i}/${tries} не дошла (${e.message}${cause ? ' / ' + cause : ''})`)
      await new Promise(r => setTimeout(r, 1500 * i))
    }
  }
  throw last
}
async function apiCall(userId, method, path, body) {
  return withRetry(`${method} ${path}`, async () => {
    const r = await fetch(BASE + '/admin/api' + path, {
      method,
      headers: { 'x-telegram-init-data': initData(userId), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    let data = null
    try { data = await r.json() } catch { /* пусто */ }
    return { status: r.status, data }
  })
}
const promoView = () => withRetry('GET /api/promo/vpn', () => fetch(BASE + '/api/promo/vpn', { cache: 'no-store' }).then(r => r.json()))

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
async function waitFor(s, expr, ms = 30000, label = expr) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await evalIn(s, expr)) return; await new Promise(r => setTimeout(r, 300)) }
  throw new Error('waitFor timeout: ' + label)
}
const pause = ms => new Promise(r => setTimeout(r, ms))

async function openShop(userId) {
  const url = BASE + '/shop' + (userId ? '#tgWebAppData=' + encodeURIComponent(initData(userId)) : '')
  const t = await send('Target.createTarget', { url })
  const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
  const s = a.sessionId
  await send('Page.enable', {}, s)
  await send('Runtime.enable', {}, s)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s)
  await waitFor(s, `!!document.getElementById('tabbar')`, 30000, 'разметка витрины разобрана')
  await waitFor(s, `(()=>{const l=document.getElementById('loader'); return !l || l.style.display === 'none'})()`, 30000, 'заставка убрана')
  await waitFor(s, `Array.isArray(allProducts) && allProducts.length > 0`, 30000, 'товары загружены')
  await waitFor(s, `vpnPromo !== null`, 20000, 'промо загружено')
  await pause(600)
  return { session: s, targetId: t.targetId }
}

/** Перехват обоих способов открытия: какой позвали и с каким URL. */
async function armOpenSpies(s) {
  await evalIn(s, `
    window.__opened = { openLink: null, openTelegramLink: null, winOpen: null }
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.openLink = function (u) { window.__opened.openLink = u }
      window.Telegram.WebApp.openTelegramLink = function (u) { window.__opened.openTelegramLink = u }
    }
    window.open = function (u) { window.__opened.winOpen = u; return null }
    true
  `)
}
const readSpies = s => evalIn(s, `window.__opened`)

async function modalState(s, { emptyRecs = false } = {}) {
  if (emptyRecs) await evalIn(s, `window.__orig = window.__orig || resolveRecs; resolveRecs = function () { return [] }; true`)
  await evalIn(s, `openProductModal(${PRODUCT_ID}); true`)
  await pause(900)
  const state = await evalIn(s, `(() => {
    const section = document.getElementById('modalRecs')
    const cards = [...document.querySelectorAll('#modalRecsGrid .modal-rec-card')]
    const card = document.getElementById('vpnRecCard')
    return {
      outerHTML: section.outerHTML,
      sectionDisplay: section.style.display,
      cards: cards.length,
      widths: cards.map(c => Math.round(c.getBoundingClientRect().width)),
      vpnCardIsNull: card === null,
      cardBeforeGrid: card ? (card.nextElementSibling && card.nextElementSibling.id === 'modalRecsGrid') : null,
    }
  })()`)
  return state
}
async function closeModal(s, { restoreRecs = false } = {}) {
  await evalIn(s, `closeProductModal(); true`)
  if (restoreRecs) await evalIn(s, `if (window.__orig) resolveRecs = window.__orig; true`)
  await pause(400)
}
async function shot(s, name) {
  const r = await send('Page.captureScreenshot', { format: 'png' }, s)
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'))
  console.log('📸', name)
}

/**
 * Живая проверка сертификата портала. Отдельная вкладка, БЕЗ подавления
 * cert-ошибок: если браузер ругается — увидим это и в errorText навигации, и на
 * скрине. Слушаем Security.certificateError и loadingFailed.
 */
async function certProbe(url) {
  const t = await send('Target.createTarget', { url: 'about:blank' })
  const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
  const s = a.sessionId
  const evt = { certificateError: null, loadingFailed: null, responseStatus: null, responseSecurity: null }
  await send('Page.enable', {}, s)
  await send('Network.enable', {}, s)
  await send('Security.enable', {}, s)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s)
  const onEvt = (m) => {
    if (m.sessionId !== s) return
    if (m.method === 'Security.certificateError') { evt.certificateError = m.params; send('Security.handleCertificateError', { eventId: m.params.eventId, action: 'cancel' }, s).catch(() => {}) }
    if (m.method === 'Network.loadingFailed' && m.params.type === 'Document') evt.loadingFailed = m.params
    if (m.method === 'Network.responseReceived' && m.params.type === 'Document') {
      evt.responseStatus = m.params.response.status
      evt.responseSecurity = m.params.response.securityState
    }
  }
  ws.addEventListener('message', e => onEvt(JSON.parse(e.data)))
  let navErr = null
  try { const nav = await send('Page.navigate', { url }, s); navErr = nav.errorText || null } catch (e) { navErr = e.message }
  await pause(6000)
  const dom = await evalIn(s, `({ url: location.href, readyState: document.readyState, title: document.title, textLen: (document.body ? document.body.innerText.length : 0), bodySnippet: (document.body ? document.body.innerText.slice(0, 200) : '') })`).catch(e => ({ evalError: e.message }))
  await shot(s, '08-portal-cert-probe')
  await send('Target.closeTarget', { targetId: t.targetId })
  return { url, navErr, ...evt, dom }
}

const report = { visitor: QA_VISITOR, productId: PRODUCT_ID, portal: { btn: BTN_LINK, recs: RECS_LINK }, checks: [] }
const ok = (name, value) => { report.checks.push({ name, value }); console.log(value.pass ? '✅' : '✖ ', name, JSON.stringify(value).slice(0, 300)) }
const baseline = name => fs.readFileSync(`${DIR}/${name}.html`, 'utf8')

async function main() {
  const db = new pg.Client({ connectionString: DBURL, ssl: { rejectUnauthorized: false } })
  await db.connect()
  const seenRows = async () => (await db.query('select count(*)::int n from "PromoSeen"')).rows[0].n
  const rowsOf = async id => (await db.query('select "promoKey" from "PromoSeen" where "telegramUserId" = $1', [String(id)])).rows

  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', `--user-data-dir=${process.env.TMPDIR || '/tmp'}/qa-portal-${Date.now()}`], { stdio: 'ignore' })

  const original = (await apiCall(OWNER_ID, 'GET', '/settings/promo-vpn')).data
  const seenBefore = await seenRows()
  console.log('Настройка на старте:', JSON.stringify(original))
  console.log('Строк в PromoSeen до прогона:', seenBefore)

  try {
    let v = null
    for (let i = 0; i < 40 && !v; i++) { v = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json()).catch(() => null); if (!v) await pause(300) }
    ws = new WebSocket(v.webSocketDebuggerUrl)
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) } }
    await new Promise(r => { ws.onopen = r })

    // ── 1. ВЫКЛЮЧЕНО: релиз невидим, модалка прежняя ───────────────────────
    ok('обе поверхности на проде выключены (дефолт релиза)', { pass: original.enabled === false && original.recsEnabled === false, enabled: original.enabled, recsEnabled: original.recsEnabled })
    const offView = await promoView()
    ok('выключенное промо не отдаёт адресов', { pass: offView.enabled === false && !offView.link && offView.recs && offView.recs.enabled === false && !offView.recs.link, body: offView })

    let shop = await openShop(QA_VISITOR)
    const withOff = await modalState(shop.session)
    await shot(shop.session, '01-off-with-list')
    ok('модалка байт-в-байт прежняя (товар с рекомендациями)', { pass: withOff.outerHTML === baseline('modal-recs-before-with') && withOff.vpnCardIsNull === true, identical: withOff.outerHTML === baseline('modal-recs-before-with'), cards: withOff.cards, widths: withOff.widths })
    await closeModal(shop.session)
    const emptyOff = await modalState(shop.session, { emptyRecs: true })
    await shot(shop.session, '02-off-empty-list')
    ok('товар без рекомендаций так же прячет секцию', { pass: emptyOff.outerHTML === baseline('modal-recs-before-empty') && emptyOff.sectionDisplay === 'none', identical: emptyOff.outerHTML === baseline('modal-recs-before-empty') })
    await closeModal(shop.session, { restoreRecs: true })
    await send('Target.closeTarget', { targetId: shop.targetId })

    // ── 2. Валидатор: портал ok, обманки 422, отравленный на чтении → off ──
    if (MANAGER_ID) {
      const asManager = await apiCall(MANAGER_ID, 'PUT', '/settings/promo-vpn', { enabled: false, link: BTN_LINK, recsEnabled: true, recsLink: RECS_LINK })
      ok('менеджер настройку не сохраняет (403)', { pass: asManager.status === 403, status: asManager.status })
    }
    const bad = [
      'https://k9x2m1.conntest.xyz/portal/',            // без порта
      'https://k9x2m1.conntest.xyz:9443/portal/',       // другой порт
      'http://k9x2m1.conntest.xyz:8443/portal/',        // не https
      'https://k9x2m1.conntest.xyz.evil.com:8443/',     // сабдомен-обманка
      'https://user@evil.com/',                         // userinfo-трюк
    ]
    const badResults = []
    for (const link of bad) {
      const r = await apiCall(OWNER_ID, 'PUT', '/settings/promo-vpn', { enabled: false, link, recsEnabled: false, recsLink: RECS_LINK })
      badResults.push({ link, status: r.status })
    }
    ok('обманки отклонены на записи (422)', { pass: badResults.every(r => r.status === 422), results: badResults })
    const afterBad = (await apiCall(OWNER_ID, 'GET', '/settings/promo-vpn')).data
    ok('после отказов настройка не изменилась', { pass: afterBad.enabled === original.enabled && afterBad.recsEnabled === original.recsEnabled, now: { enabled: afterBad.enabled, recsEnabled: afterBad.recsEnabled } })

    // ── 3. Включаем обе на портал-адреса ───────────────────────────────────
    const on = await apiCall(OWNER_ID, 'PUT', '/settings/promo-vpn', { enabled: true, link: BTN_LINK, offerText: original.offerText, recsEnabled: true, recsLink: RECS_LINK })
    ok('владелец включил обе на портал-адреса', { pass: on.status === 200 && on.data.enabled === true && on.data.recsEnabled === true && on.data.link === BTN_LINK && on.data.recsLink === RECS_LINK, link: on.data && on.data.link, recsLink: on.data && on.data.recsLink })
    const onView = await promoView()
    ok('витрине отдаются точные портал-адреса с верными ref', { pass: onView.link === BTN_LINK && onView.recs.link === RECS_LINK, link: onView.link, recsLink: onView.recs.link })

    shop = await openShop(QA_VISITOR)
    // кнопка → openLink (портал), не openTelegramLink
    await armOpenSpies(shop.session)
    await waitFor(shop.session, `!!document.getElementById('vpnFab')`, 20000, 'кнопка появилась')
    await evalIn(shop.session, `document.getElementById('vpnFab').click(); true`)
    await waitFor(shop.session, `document.getElementById('vpnSheet').classList.contains('up')`, 12000, 'шторка')
    await evalIn(shop.session, `document.getElementById('vpnClaim').click(); true`)
    await pause(600)
    const btnSpy = await readSpies(shop.session)
    await shot(shop.session, '03-button-portal')
    ok('кнопка: портал открыт через openLink, НЕ openTelegramLink', { pass: btnSpy.openLink === BTN_LINK && btnSpy.openTelegramLink === null, ...btnSpy })
    await evalIn(shop.session, `vpnClose(); true`); await pause(400)

    // карточка → openLink (портал)
    await armOpenSpies(shop.session)
    const withOn = await modalState(shop.session)
    await shot(shop.session, '04-card-above-list')
    ok('карточка над лентой, лента те же 4 по 160 px', { pass: withOn.vpnCardIsNull === false && withOn.cardBeforeGrid === true && withOn.cards === 4 && withOn.widths.every(w => w === 160), cardBeforeGrid: withOn.cardBeforeGrid, cards: withOn.cards, widths: withOn.widths })
    await evalIn(shop.session, `document.getElementById('vpnRecCard').click(); true`)
    await pause(600)
    const cardSpy = await readSpies(shop.session)
    ok('карточка: портал открыт через openLink, НЕ openTelegramLink', { pass: cardSpy.openLink === RECS_LINK && cardSpy.openTelegramLink === null, ...cardSpy })
    const cardRows = await rowsOf(QA_VISITOR)
    ok('карточка ничего не пишет в PromoSeen', { pass: cardRows.length === 0, rowsOfCardVisitor: cardRows.length })
    await closeModal(shop.session)
    await send('Target.closeTarget', { targetId: shop.targetId })

    // ── 4. t.me по-прежнему открывается через openTelegramLink ─────────────
    const tme = await apiCall(OWNER_ID, 'PUT', '/settings/promo-vpn', { enabled: true, link: 'https://t.me/Bender_KVN_bot?start=ref_bs_home', offerText: original.offerText, recsEnabled: false, recsLink: RECS_LINK })
    const tmeShop = await openShop(QA_VISITOR + 1)
    await armOpenSpies(tmeShop.session)
    await waitFor(tmeShop.session, `!!document.getElementById('vpnFab')`, 20000, 'кнопка t.me')
    await evalIn(tmeShop.session, `document.getElementById('vpnFab').click(); true`)
    await waitFor(tmeShop.session, `document.getElementById('vpnSheet').classList.contains('up')`, 12000, 'шторка t.me')
    await evalIn(tmeShop.session, `document.getElementById('vpnClaim').click(); true`)
    await pause(600)
    const tmeSpy = await readSpies(tmeShop.session)
    ok('t.me по-прежнему открывается через openTelegramLink', { pass: tmeSpy.openTelegramLink === 'https://t.me/Bender_KVN_bot?start=ref_bs_home' && tmeSpy.openLink === null, ...tmeSpy })
    void tme
    await evalIn(tmeShop.session, `vpnClose(); true`); await pause(300)
    await send('Target.closeTarget', { targetId: tmeShop.targetId })

    // ── 5. Живая проверка сертификата портала ──────────────────────────────
    console.log('Проба сертификата портала (без подавления cert-ошибок)…')
    const cert = await certProbe(BTN_LINK)
    report.certProbe = cert
    const interstitial = !!cert.certificateError || (cert.navErr && /ERR_CERT|SSL|ERR_/.test(cert.navErr)) || cert.responseSecurity === 'insecure'
    ok('эмпирика сертификата (факт, не приговор проверки)', {
      pass: true,   // это НАБЛЮДЕНИЕ, а не gate — фиксируем факт для владельца
      interstitialLikely: interstitial,
      navErr: cert.navErr, certError: cert.certificateError && cert.certificateError.errorType,
      responseStatus: cert.responseStatus, security: cert.responseSecurity,
      loadedTitle: cert.dom && cert.dom.title, finalUrl: cert.dom && cert.dom.url,
    })
    console.log(interstitial
      ? '⚠️  ПОРТАЛ: браузер, похоже, показывает TLS/security-предупреждение — см. 08-portal-cert-probe.png'
      : 'ℹ️  ПОРТАЛ: явного TLS-интерстишла не зафиксировано — см. 08-portal-cert-probe.png')
  } finally {
    const restore = await apiCall(OWNER_ID, 'PUT', '/settings/promo-vpn', { enabled: original.enabled, link: original.link, offerText: original.offerText, recsEnabled: original.recsEnabled, recsLink: original.recsLink })
    const finalCfg = (await apiCall(OWNER_ID, 'GET', '/settings/promo-vpn')).data
    const finalView = await promoView()
    const del = await db.query('delete from "PromoSeen" where "telegramUserId" = any($1::text[])', [[QA_VISITOR, QA_VISITOR + 1, QA_VISITOR + 2].map(String)])
    const left = await seenRows()
    console.log(`↩️  вернули: ${JSON.stringify({ enabled: finalCfg.enabled, recsEnabled: finalCfg.recsEnabled, link: finalCfg.link, recsLink: finalCfg.recsLink })} (статус ${restore.status})`)
    console.log(`🧹 удалено QA-строк из PromoSeen: ${del.rowCount}; осталось всего: ${left} (было ${seenBefore})`)
    report.restored = { setting: finalCfg, storefront: finalView, qaRowsDeleted: del.rowCount, promoSeenTotal: left, promoSeenWasBefore: seenBefore }
    await db.end()
    try { ws && ws.close() } catch { /* пусто */ }
    chrome.kill()
  }

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  const failed = report.checks.filter(c => !c.value.pass)
  console.log(`\nПроверок: ${report.checks.length}, провалено: ${failed.length}`)
  failed.forEach(f => console.log(' ✖', f.name, JSON.stringify(f.value).slice(0, 400)))
  process.exit(failed.length ? 1 : 0)
}

main().catch(e => { const c = e.cause && (e.cause.code || e.cause.message); console.error('QA упал:', e.message, c ? '| причина: ' + c : ''); process.exit(1) })
