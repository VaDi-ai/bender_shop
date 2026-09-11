/**
 * Снимок прода ДО шага 3 (закреплённая VPN-карточка в «Рекомендуем»).
 *
 * Эталон, с которым потом сверяется инвариант «при выключенном промо модалка
 * байт-в-байт прежняя»: `#modalRecs.outerHTML` в двух состояниях — у товара с
 * рекомендациями и у товара без них.
 *
 * Товара с пустой лентой на проде нет (все 39 получают 3-4 позиции), поэтому
 * вторая ветка воспроизводится заглушкой `resolveRecs → []` прямо в странице.
 * Заглушка одинаковая до и после деплоя, так что сравнение остаётся честным:
 * меняется только код витрины, а не условия съёмки.
 *
 * Ходит анонимом: initData не передаётся, в PromoSeen ничего не пишется,
 * следов на проде снимок не оставляет.
 *
 *   node scripts/qa-promo-recs-snapshot.cjs
 */
const fs = require('fs')
const { spawn } = require('child_process')

const BASE = process.env.BASE || 'https://bendershop.store'
const OUT = process.env.OUT || 'reports/promo-vpn-recs-2026-09-11'
const PORT = 9231
const PRODUCT_ID = Number(process.env.QA_PRODUCT_ID || 674)
fs.mkdirSync(OUT, { recursive: true })

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

/**
 * Витрина открывается заставкой BENDER.EXE поверх всего, а сразу после
 * createTarget документ ещё about:blank — у него readyState уже 'complete' и
 * getElementById возвращает null. Поэтому ждём сначала разметку витрины и
 * только потом состояние (урок стоп-гейта #137).
 */
async function openShop() {
  const t = await send('Target.createTarget', { url: BASE + '/shop' })
  const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
  const s = a.sessionId
  await send('Page.enable', {}, s)
  await send('Runtime.enable', {}, s)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s)
  await waitFor(s, `!!document.getElementById('tabbar')`, 30000, 'разметка витрины разобрана')
  await waitFor(s, `(()=>{const l=document.getElementById('loader'); return !l || l.style.display === 'none'})()`, 30000, 'заставка убрана')
  await waitFor(s, `Array.isArray(allProducts) && allProducts.length > 0`, 30000, 'товары загружены')
  await pause(800)
  return { session: s, targetId: t.targetId }
}

async function snapModal(s, name) {
  await evalIn(s, `openProductModal(${PRODUCT_ID}); true`)
  await pause(900)
  const html = await evalIn(s, `document.getElementById('modalRecs').outerHTML`)
  fs.writeFileSync(`${OUT}/${name}.html`, html)
  const r = await send('Page.captureScreenshot', { format: 'png' }, s)
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'))
  const meta = await evalIn(s, `(() => {
    const cards = [...document.querySelectorAll('#modalRecsGrid .modal-rec-card')]
    return {
      sectionDisplay: document.getElementById('modalRecs').style.display,
      cards: cards.length,
      widths: cards.map(c => Math.round(c.getBoundingClientRect().width)),
      vpnRecCard: document.getElementById('vpnRecCard') === null ? null : 'есть',
      recsHtmlLength: document.getElementById('modalRecs').outerHTML.length,
    }
  })()`)
  await evalIn(s, `closeProductModal(); true`)
  await pause(400)
  console.log(' ', name, JSON.stringify(meta))
  return meta
}

async function main() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
      `--user-data-dir=${process.env.TMPDIR || '/tmp'}/qa-recs-snap-${Date.now()}`], { stdio: 'ignore' })

  const snapshot = { takenAt: new Date().toISOString(), base: BASE, productId: PRODUCT_ID }
  try {
    let v = null
    for (let i = 0; i < 40 && !v; i++) { v = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json()).catch(() => null); if (!v) await pause(300) }
    ws = new WebSocket(v.webSocketDebuggerUrl)
    ws.onmessage = e => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) }
    }
    await new Promise(r => { ws.onopen = r })

    snapshot.promoEndpoint = await fetch(BASE + '/api/promo/vpn', { cache: 'no-store' }).then(r => r.json())
    console.log('GET /api/promo/vpn:', JSON.stringify(snapshot.promoEndpoint))

    const shop = await openShop()
    snapshot.productName = await evalIn(shop.session, `allProducts.find(p => p.id === ${PRODUCT_ID}).name`)
    console.log('Товар:', snapshot.productName)

    console.log('Снимки #modalRecs.outerHTML:')
    snapshot.withRecs = await snapModal(shop.session, 'modal-recs-before-with')

    // Ветка «лента пуста»: на проде такого товара нет, подменяем подбор
    await evalIn(shop.session, `window.__origResolveRecs = resolveRecs; resolveRecs = function () { return [] }; true`)
    snapshot.emptyRecs = await snapModal(shop.session, 'modal-recs-before-empty')
    await evalIn(shop.session, `resolveRecs = window.__origResolveRecs; true`)

    await send('Target.closeTarget', { targetId: shop.targetId })
  } finally {
    try { ws && ws.close() } catch { /* пусто */ }
    chrome.kill()
  }

  fs.writeFileSync(`${OUT}/snapshot-before.json`, JSON.stringify(snapshot, null, 2))
  console.log('\nСнимок записан в', OUT)
}

main().catch(e => { console.error('Снимок упал:', e.message); process.exit(1) })
