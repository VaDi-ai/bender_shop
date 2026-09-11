/**
 * CDP-QA закреплённой VPN-карточки в «Рекомендуем» (шаг 3) на проде.
 *
 * Порядок как в стоп-гейте #137: сначала всё проверяется на ВЫКЛЮЧЕННОЙ
 * поверхности (релиз обязан быть невидим и модалка — байт-в-байт прежней),
 * потом включается, проверяется живьём и возвращается обратно.
 *
 * Эталон «до» снят скриптом qa-promo-recs-snapshot.cjs ДО деплоя:
 * modal-recs-before-with.html и modal-recs-before-empty.html. Ветка «товар без
 * рекомендаций» и там и тут воспроизводится одинаковой заглушкой
 * resolveRecs → [] (на проде товара с пустой лентой нет).
 *
 * Карточка ничего не пишет в PromoSeen — она не про «видел». Поэтому число
 * строк сверяется до и после прогона и обязано совпасть.
 *
 * env: QA_BOT_TOKEN, QA_OWNER_ID, QA_MANAGER_ID, DATABASE_URL
 */
const crypto = require('crypto')
const fs = require('fs')
const { spawn } = require('child_process')
const pg = require(require('path').join(__dirname, '..', 'node_modules', 'pg', 'lib', 'index.js'))

const BASE = process.env.BASE || 'https://bendershop.store'
const DIR = 'reports/promo-vpn-recs-2026-09-11'
const OUT = DIR + '/ui'
const PORT = 9232
const PRODUCT_ID = Number(process.env.QA_PRODUCT_ID || 674)
const BOT_TOKEN = process.env.QA_BOT_TOKEN
const OWNER_ID = Number(process.env.QA_OWNER_ID)
const MANAGER_ID = Number(process.env.QA_MANAGER_ID || 0)
const DBURL = process.env.DATABASE_URL
if (!BOT_TOKEN || !OWNER_ID || !DBURL) { console.error('нужны QA_BOT_TOKEN / QA_OWNER_ID / DATABASE_URL'); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true })

const RECS_LINK = 'https://t.me/Bender_KVN_bot?start=ref_bs_recs'
const BTN_LINK = 'https://t.me/Bender_KVN_bot?start=ref_bs_home'
const QA_VISITOR = 990000000 + (Date.now() % 1000000)

function initData(userId, ageSeconds = 0) {
  const p = new URLSearchParams()
  p.set('user', JSON.stringify({ id: userId, first_name: 'QA' }))
  p.set('auth_date', String(Math.floor(Date.now() / 1000) - ageSeconds))
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  p.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'))
  return p.toString()
}

/**
 * Сетевой блип на проде не должен ронять стоп-гейт: прогон длинный, запросов
 * много, и единственный сброшенный коннект стоил бы полного перепрогона. Сам
 * ОТВЕТ не ретраится — только отсутствие ответа: ошибка уровня fetch.
 */
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
const promoView = () => withRetry('GET /api/promo/vpn', () =>
  fetch(BASE + '/api/promo/vpn', { cache: 'no-store' }).then(r => r.json()))

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

/** Сначала разметка витрины, потом состояние: про about:blank и заставку — урок #137. */
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
  // Промо-фетч уходит следом за товарами — дождёмся, иначе ловим гонку
  await waitFor(s, `vpnPromo !== null`, 20000, 'промо загружено')
  await pause(600)
  return { session: s, targetId: t.targetId }
}

/** Открыть товар и снять состояние секции «Рекомендуем». */
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
      cardBeforeGrid: card ? card.nextElementSibling && card.nextElementSibling.id === 'modalRecsGrid' : null,
      cardText: card ? card.textContent.replace(/\s+/g, ' ').trim() : null,
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

const report = { visitor: QA_VISITOR, productId: PRODUCT_ID, checks: [] }
const ok = (name, value) => {
  report.checks.push({ name, value })
  console.log(value.pass ? '✅' : '✖ ', name, JSON.stringify(value).slice(0, 260))
}
const baseline = name => fs.readFileSync(`${DIR}/${name}.html`, 'utf8')

async function main() {
  const db = new pg.Client({ connectionString: DBURL, ssl: { rejectUnauthorized: false } })
  await db.connect()
  const seenRows = async () => (await db.query('select count(*)::int n from "PromoSeen"')).rows[0].n
  const rowsOf = async id =>
    (await db.query('select "promoKey" from "PromoSeen" where "telegramUserId" = $1', [String(id)])).rows

  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
      `--user-data-dir=${process.env.TMPDIR || '/tmp'}/qa-recs-${Date.now()}`], { stdio: 'ignore' })

  const original = (await apiCall(OWNER_ID, 'GET', '/settings/promo-vpn')).data
  const seenBefore = await seenRows()
  console.log('Настройка на старте:', JSON.stringify(original))
  console.log('Строк в PromoSeen до прогона:', seenBefore)

  try {
    let v = null
    for (let i = 0; i < 40 && !v; i++) { v = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json()).catch(() => null); if (!v) await pause(300) }
    ws = new WebSocket(v.webSocketDebuggerUrl)
    ws.onmessage = e => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) }
    }
    await new Promise(r => { ws.onopen = r })

    // ── 1. ВЫКЛЮЧЕНО: релиз невидим ─────────────────────────────────────────
    ok('карточка на проде выключена (дефолт релиза)', {
      pass: original.recsEnabled === false, recsEnabled: original.recsEnabled,
    })
    const offView = await promoView()
    ok('выключенная карточка не отдаёт адреса', {
      pass: offView.recs && offView.recs.enabled === false && !offView.recs.link, recs: offView.recs,
    })

    let shop = await openShop(QA_VISITOR)
    const withOff = await modalState(shop.session)
    await shot(shop.session, '01-recs-off-with-list')
    ok('модалка байт-в-байт прежняя (товар с рекомендациями)', {
      pass: withOff.outerHTML === baseline('modal-recs-before-with') && withOff.vpnCardIsNull === true,
      identical: withOff.outerHTML === baseline('modal-recs-before-with'),
      vpnCardIsNull: withOff.vpnCardIsNull, cards: withOff.cards, widths: withOff.widths,
    })
    await closeModal(shop.session)

    const emptyOff = await modalState(shop.session, { emptyRecs: true })
    await shot(shop.session, '02-recs-off-empty-list')
    ok('товар без рекомендаций так же прячет секцию', {
      pass: emptyOff.outerHTML === baseline('modal-recs-before-empty') && emptyOff.sectionDisplay === 'none',
      identical: emptyOff.outerHTML === baseline('modal-recs-before-empty'),
      sectionDisplay: emptyOff.sectionDisplay, vpnCardIsNull: emptyOff.vpnCardIsNull,
    })
    await closeModal(shop.session, { restoreRecs: true })
    await send('Target.closeTarget', { targetId: shop.targetId })

    // ── 2. Права и валидация адреса карточки ───────────────────────────────
    if (MANAGER_ID) {
      const asManager = await apiCall(MANAGER_ID, 'PUT', '/settings/promo-vpn', {
        enabled: original.enabled, link: original.link, recsEnabled: true, recsLink: RECS_LINK,
      })
      ok('менеджер не включает карточку (403)', {
        pass: asManager.status === 403, status: asManager.status, error: asManager.data && asManager.data.error,
      })
    }
    const badResults = []
    for (const link of ['https://evil.com/x', 'http://t.me/x', 'https://t.me.evil.com/x', 'https://t.me@evil.com/x']) {
      const r = await apiCall(OWNER_ID, 'PUT', '/settings/promo-vpn', {
        enabled: original.enabled, link: original.link, recsEnabled: true, recsLink: link,
      })
      badResults.push({ link, status: r.status })
    }
    const afterBad = (await apiCall(OWNER_ID, 'GET', '/settings/promo-vpn')).data
    ok('чужой хост карточки отклонён на записи (422)', { pass: badResults.every(r => r.status === 422), results: badResults })
    ok('после отказов настройка не изменилась', {
      pass: afterBad.recsEnabled === original.recsEnabled && afterBad.enabled === original.enabled,
      now: { enabled: afterBad.enabled, recsEnabled: afterBad.recsEnabled },
    })

    // ── 3. ВКЛЮЧАЕМ ТОЛЬКО КАРТОЧКУ: кнопка остаётся выключенной ───────────
    const onRecs = await apiCall(OWNER_ID, 'PUT', '/settings/promo-vpn', {
      enabled: false, link: BTN_LINK, offerText: original.offerText, recsEnabled: true, recsLink: RECS_LINK,
    })
    ok('владелец включил карточку, кнопку не трогая', {
      pass: onRecs.status === 200 && onRecs.data.recsEnabled === true && onRecs.data.enabled === false,
      status: onRecs.status, recsEnabled: onRecs.data && onRecs.data.recsEnabled, enabled: onRecs.data && onRecs.data.enabled,
    })

    shop = await openShop(QA_VISITOR)
    ok('выключенная кнопка не мешает карточке: #vpnFab === null', {
      pass: (await evalIn(shop.session, `document.getElementById('vpnFab') === null`)) === true,
    })

    const withOn = await modalState(shop.session)
    await shot(shop.session, '03-recs-on-card-above-list')
    ok('карточка стоит НАД лентой', {
      pass: withOn.vpnCardIsNull === false && withOn.cardBeforeGrid === true,
      cardBeforeGrid: withOn.cardBeforeGrid, text: withOn.cardText,
    })
    ok('лента не пострадала: те же 4 карточки по 160 px', {
      pass: withOn.cards === 4 && withOn.widths.length === 4 && withOn.widths.every(w => w === 160),
      cards: withOn.cards, widths: withOn.widths,
    })

    // тап по карточке → диплинк, без таймера и без записи в PromoSeen
    await evalIn(shop.session, `window.__tgLink = null; if (window.Telegram && window.Telegram.WebApp) { window.Telegram.WebApp.openTelegramLink = function (u) { window.__tgLink = u } } true`)
    await evalIn(shop.session, `document.getElementById('vpnRecCard').click(); true`)
    await pause(900)
    const tapped = await evalIn(shop.session, `({ link: window.__tgLink, overlay: !!document.getElementById('vpnOv'), stillThere: !!document.getElementById('vpnRecCard') })`)
    await shot(shop.session, '04-recs-deeplink-opened')
    ok('тап открывает ref_bs_recs, без таймера и шторки', {
      pass: tapped.link === RECS_LINK && tapped.overlay === false, ...tapped,
    })

    // Карточка не про «видел» — писать в PromoSeen ей нечего и незачем.
    // Считаем по СВОЕМУ посетителю, а не общий счётчик: ниже по сценарию мы
    // намеренно жмём кнопку #137 другим посетителем, и она строку пишет по
    // замыслу. Общий счётчик смешал бы эти два факта в один
    await pause(1200)
    const cardRows = await rowsOf(QA_VISITOR)
    ok('карточка ничего не пишет в PromoSeen', {
      pass: cardRows.length === 0 && (await seenRows()) === seenBefore,
      cardVisitor: QA_VISITOR, rowsOfCardVisitor: cardRows.length, total: await seenRows(), wasBefore: seenBefore,
    })
    await closeModal(shop.session)

    // товар без рекомендаций: секция открывается ТОЛЬКО ради карточки
    const emptyOn = await modalState(shop.session, { emptyRecs: true })
    await shot(shop.session, '05-recs-on-empty-list')
    ok('без рекомендаций секция открыта только с карточкой', {
      pass: emptyOn.sectionDisplay === '' && emptyOn.vpnCardIsNull === false && emptyOn.cards === 0,
      sectionDisplay: emptyOn.sectionDisplay, cards: emptyOn.cards,
    })
    await closeModal(shop.session, { restoreRecs: true })
    await send('Target.closeTarget', { targetId: shop.targetId })

    // ── 4. ОБЕ ВКЛЮЧЕНЫ: кнопка #137 работает как работала ─────────────────
    const onBoth = await apiCall(OWNER_ID, 'PUT', '/settings/promo-vpn', {
      enabled: true, link: BTN_LINK, offerText: original.offerText, recsEnabled: true, recsLink: RECS_LINK,
    })
    ok('включены обе поверхности', { pass: onBoth.status === 200 && onBoth.data.enabled === true && onBoth.data.recsEnabled === true })

    const both = await openShop(QA_VISITOR + 1)
    await waitFor(both.session, `!!document.getElementById('vpnFab')`, 20000, 'кнопка появилась')
    await evalIn(both.session, `window.__tgLink = null; if (window.Telegram && window.Telegram.WebApp) { window.Telegram.WebApp.openTelegramLink = function (u) { window.__tgLink = u } } true`)
    await evalIn(both.session, `document.getElementById('vpnFab').click(); true`)
    await pause(500)
    const counting = await evalIn(both.session, `document.getElementById('vpnCount').classList.contains('on') && document.getElementById('vpnNum').textContent`)
    await shot(both.session, '06-button-still-works')
    await waitFor(both.session, `document.getElementById('vpnSheet').classList.contains('up')`, 12000, 'шторка поднялась')
    await evalIn(both.session, `document.getElementById('vpnClaim').click(); true`)
    await pause(700)
    const btnLink = await evalIn(both.session, `window.__tgLink`)
    ok('кнопка #137 работает как работала: отсчёт, шторка, ref_bs_home', {
      pass: !!counting && btnLink === BTN_LINK, num: counting, link: btnLink,
    })
    await evalIn(both.session, `vpnClose(); true`)
    await pause(500)
    const cardWithButton = await modalState(both.session)
    ok('обе поверхности уживаются в одной сессии', {
      pass: cardWithButton.vpnCardIsNull === false && cardWithButton.cards === 4,
      vpnCardIsNull: cardWithButton.vpnCardIsNull, cards: cardWithButton.cards,
    })
    await closeModal(both.session)
    await send('Target.closeTarget', { targetId: both.targetId })

    // ── 5. Кнопка включена, карточка выключена — обратная независимость ────
    const onlyButton = await apiCall(OWNER_ID, 'PUT', '/settings/promo-vpn', {
      enabled: true, link: BTN_LINK, offerText: original.offerText, recsEnabled: false, recsLink: RECS_LINK,
    })
    const onlyBtnShop = await openShop(QA_VISITOR + 2)
    const noCard = await modalState(onlyBtnShop.session)
    ok('карточка выключена, кнопка жива: узла карточки нет, модалка прежняя', {
      pass: onlyButton.status === 200 && noCard.vpnCardIsNull === true
        && noCard.outerHTML === baseline('modal-recs-before-with'),
      vpnCardIsNull: noCard.vpnCardIsNull,
      identical: noCard.outerHTML === baseline('modal-recs-before-with'),
      fab: await evalIn(onlyBtnShop.session, `!!document.getElementById('vpnFab')`),
    })
    await closeModal(onlyBtnShop.session)
    await send('Target.closeTarget', { targetId: onlyBtnShop.targetId })

  } finally {
    const restore = await apiCall(OWNER_ID, 'PUT', '/settings/promo-vpn', {
      enabled: original.enabled, link: original.link, offerText: original.offerText,
      recsEnabled: original.recsEnabled, recsLink: original.recsLink,
    })
    const finalCfg = (await apiCall(OWNER_ID, 'GET', '/settings/promo-vpn')).data
    const finalView = await promoView()
    // Кнопка #137 по замыслу пишет «видел» — строку за собой убираем, как и в
    // стоп-гейте #137: после прогона на проде следов QA остаться не должно
    const del = await db.query(
      'delete from "PromoSeen" where "telegramUserId" = any($1::text[])',
      [[QA_VISITOR, QA_VISITOR + 1, QA_VISITOR + 2].map(String)])
    const left = await seenRows()
    console.log(`↩️  вернули: ${JSON.stringify({ enabled: finalCfg.enabled, recsEnabled: finalCfg.recsEnabled })} (статус ${restore.status})`)
    console.log(`🧹 удалено QA-строк из PromoSeen: ${del.rowCount}; осталось всего: ${left} (было ${seenBefore})`)
    report.restored = {
      enabled: finalCfg.enabled, recsEnabled: finalCfg.recsEnabled,
      storefront: finalView, qaRowsDeleted: del.rowCount,
      promoSeenTotal: left, promoSeenWasBefore: seenBefore,
    }
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

main().catch(e => {
  const cause = e.cause && (e.cause.code || e.cause.message)
  console.error('QA упал:', e.message, cause ? '| причина: ' + cause : '')
  process.exit(1)
})
