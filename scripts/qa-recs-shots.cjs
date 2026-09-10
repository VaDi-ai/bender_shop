/**
 * Догон к qa-recs-ui.cjs: скрины БЛОКА «Рекомендуем» по его собственным
 * границам (первый прогон ловил пустой кадр — после ре-рендера карточка
 * уезжала из вьюпорта), плюс две проверки, которых там не было:
 *
 *   • закреплённый товар вне витрины подписан «нет на витрине»;
 *   • витрина с активной заменой: recommendedIds в payload, лента у покупателя
 *     ставит закреплённое на его слот, у соседних товаров ничего не поехало.
 *
 * env: QA_BOT_TOKEN, QA_OWNER_ID, QA_PRODUCT_ID, QA_PIN_VISIBLE (id видимого
 * товара), QA_PIN_HIDDEN (id товара не с витрины).
 */
const crypto = require('crypto')
const fs = require('fs')
const { spawn } = require('child_process')

const BASE = 'https://bendershop.store'
const OUT = 'reports/recs-2026-09-10/ui'
const PORT = 9225
const { QA_BOT_TOKEN: BOT_TOKEN } = process.env
const OWNER_ID = Number(process.env.QA_OWNER_ID)
const PRODUCT_ID = Number(process.env.QA_PRODUCT_ID)
const PIN_VISIBLE = Number(process.env.QA_PIN_VISIBLE)
const PIN_HIDDEN = Number(process.env.QA_PIN_HIDDEN)
if (!BOT_TOKEN || !OWNER_ID || !PRODUCT_ID || !PIN_VISIBLE || !PIN_HIDDEN) {
  console.error('нужны QA_BOT_TOKEN / QA_OWNER_ID / QA_PRODUCT_ID / QA_PIN_VISIBLE / QA_PIN_HIDDEN')
  process.exit(2)
}
fs.mkdirSync(OUT, { recursive: true })

function initData(userId) {
  const params = new URLSearchParams()
  params.set('user', JSON.stringify({ id: userId, first_name: 'QA' }))
  params.set('auth_date', String(Math.floor(Date.now() / 1000)))
  const dcs = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  params.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'))
  return params.toString()
}
async function apiCall(method, path, body) {
  const r = await fetch(BASE + '/admin/api' + path, {
    method,
    headers: { 'x-telegram-init-data': initData(OWNER_ID), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await r.json() } catch { /* empty */ }
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
async function waitFor(s, expr, ms = 20000, label = expr) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await evalIn(s, expr)) return; await new Promise(r => setTimeout(r, 300)) }
  throw new Error('waitFor timeout: ' + label)
}
const pause = ms => new Promise(r => setTimeout(r, ms))

/**
 * Скрин БЛОКА «Рекомендуем» — от его заголовка до следующего.
 *
 * Прокручивается не окно, а внутренний #main, поэтому captureBeyondViewport
 * тут бесполезен: за пределами вьюпорта у документа ничего нет. Поэтому на
 * время снимка вьюпорт растягивается по высоте, #main подкручивается к блоку,
 * и клип берётся уже по видимым координатам.
 */
const BLOCK_RECT = `(()=>{
  const caps=[...document.querySelectorAll('#pcCard .cap')]
  const i=caps.findIndex(c=>c.textContent.trim().startsWith('РЕКОМЕНДУЕМ'))
  if(i<0) return null
  const a=caps[i].getBoundingClientRect(), next=caps[i+1]
  const bottom = next ? next.getBoundingClientRect().top : a.bottom + 600
  return {top:a.top-8, height:Math.max(80,bottom-a.top+8), width:document.documentElement.clientWidth}
})()`

const TALL = 1800
async function shotBlock(s, name) {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: TALL, deviceScaleFactor: 2, mobile: true }, s)
  await pause(250)
  // подкрутить внутренний скроллер так, чтобы блок начинался у верхней кромки
  await evalIn(s, `(()=>{const r=${BLOCK_RECT}; if(r) document.getElementById('main').scrollTop += r.top - 12; })(); true`)
  await pause(350)
  const rect = await evalIn(s, BLOCK_RECT)
  if (!rect) throw new Error('блок «Рекомендуем» не найден')
  if (rect.height < 200) throw new Error(`блок подозрительно низкий (${Math.round(rect.height)}px) — вероятно, экран скрыт`)
  const r = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: Math.max(0, rect.top), width: rect.width, height: Math.min(rect.height, TALL - 20), scale: 2 },
  }, s)
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'))
  console.log('📸', name, `${Math.round(rect.width)}×${Math.round(rect.height)}`)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s)
  await pause(150)
}

async function openCard(s, id) {
  await evalIn(s, `openProductCard(${id}); true`)
  await waitFor(s, `document.getElementById('pcCard').textContent.includes('РЕКОМЕНДУЕМ')`, 20000, 'карточка ' + id)
  await pause(400)
}
const slots = s => evalIn(s, `(()=>{
  const caps=[...document.querySelectorAll('#pcCard .cap')]
  const cap=caps.find(c=>c.textContent.trim().startsWith('РЕКОМЕНДУЕМ'))
  const out=[]; let el=cap.nextElementSibling
  while(el && !el.classList.contains('cap')){ if(el.classList.contains('sf-item')) out.push(el.textContent.replace(/\\s+/g,' ').trim()); el=el.nextElementSibling }
  return out })()`)

/** Переключает экран и УБЕЖДАЕТСЯ, что он показан: клики по скрытому DOM
 *  проходят молча, и тогда проверки идут вхолостую, а скрины выходят пустыми. */
async function goScreen(s, id) {
  await evalIn(s, `go('${id}'); true`)
  await waitFor(s, `(()=>{const el=document.getElementById('${id}'); return !!el && el.classList.contains('on') && getComputedStyle(el).display!=='none'})()`, 15000, 'экран ' + id + ' показан')
}

const report = { checks: [] }
const ok = (name, value) => { report.checks.push({ name, value }); console.log(value.pass ? '✅' : '✖ ', name, JSON.stringify(value)) }

async function main() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', `--user-data-dir=${process.env.TMPDIR || '/tmp'}/qa-shots-${Date.now()}`],
    { stdio: 'ignore' })
  const original = (await apiCall('GET', '/products/' + PRODUCT_ID)).data.recommendations.manual.slice()
  console.log('замен на старте:', JSON.stringify(original))

  try {
    let v = null
    for (let i = 0; i < 40 && !v; i++) { v = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json()).catch(() => null); if (!v) await pause(300) }
    ws = new WebSocket(v.webSocketDebuggerUrl)
    ws.onmessage = e => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) }
    }
    await new Promise(r => { ws.onopen = r })

    const t = await send('Target.createTarget', { url: BASE + '/admin#tgWebAppData=' + encodeURIComponent(initData(OWNER_ID)) })
    const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
    const s = a.sessionId
    await send('Page.enable', {}, s); await send('Runtime.enable', {}, s)
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s)
    await waitFor(s, `window.adminMe && window.adminMe.role==='owner'`, 30000, 'owner gate')
    await evalIn(s, `window.confirm=()=>true; true`)
    await goScreen(s, 's-goods')
    await waitFor(s, `!!document.getElementById('pcSearch')`, 15000, 'экран товаров')

    // 1. Чистый авто-подбор
    await apiCall('PUT', `/products/${PRODUCT_ID}/recommendations`, { ids: [] })
    await openCard(s, PRODUCT_ID)
    const auto = await slots(s)
    await shotBlock(s, '10-block-auto')
    ok('лента на авто: 4 позиции с метками', { pass: auto.length === 4 && auto.every(x => /авто ·/.test(x)), slots: auto })

    // 2. Замена на ВИДИМЫЙ товар — слот 3
    await apiCall('PUT', `/products/${PRODUCT_ID}/recommendations`, { ids: [0, 0, PIN_VISIBLE, 0] })
    await openCard(s, PRODUCT_ID)
    const pinned = await slots(s)
    await shotBlock(s, '11-block-pinned-visible')
    ok('замена видима, стоит на 3-м слоте, соседи не поехали', {
      pass: /вручную/.test(pinned[2]) && pinned[2].startsWith('3.') && pinned[0] === auto[0] && pinned[1] === auto[1],
      slot3: pinned[2],
    })

    // 3. Замена на товар НЕ с витрины — должна быть видна с оговоркой
    await apiCall('PUT', `/products/${PRODUCT_ID}/recommendations`, { ids: [0, PIN_HIDDEN, 0, 0] })
    await openCard(s, PRODUCT_ID)
    const hidden = await slots(s)
    await shotBlock(s, '12-block-pinned-off-storefront')
    ok('закреплённый вне витрины виден и подписан', {
      pass: /вручную/.test(hidden[1]) && /нет на витрине/.test(hidden[1]),
      slot2: hidden[1],
    })

    // 4. Витрина с активной заменой (пин на видимый товар)
    await apiCall('PUT', `/products/${PRODUCT_ID}/recommendations`, { ids: [0, 0, PIN_VISIBLE, 0] })
    await pause(1000)
    const payload = await fetch(BASE + '/api/products', { cache: 'no-store' }).then(r => r.json())
    fs.writeFileSync(`${OUT}/storefront-with-pin.json`, JSON.stringify(payload))
    const me = payload.find(p => p.id === PRODUCT_ID)
    const others = payload.filter(p => p.id !== PRODUCT_ID)
    ok('в payload ключ только у товара с заменой', {
      pass: Array.isArray(me.recommendedIds) && me.recommendedIds.length > 0 && others.every(p => !('recommendedIds' in p)),
      mine: me.recommendedIds, othersWithKey: others.filter(p => 'recommendedIds' in p).length,
    })

    // Лента покупателя считается кодом самой витрины
    const src = fs.readFileSync('webapp/index.html', 'utf8')
    const ex = n => { const st = src.indexOf(`function ${n}(`); let d = 0; for (let i = src.indexOf('{', st); i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) return src.slice(st, i + 1) } }
    const fns = new Function(['isBuyable', 'minVariantPrice', 'getRecommendations', 'resolveRecs'].map(ex).join('\n') + '\nreturn {getRecommendations, resolveRecs}')()
    const lane = fns.resolveRecs(me, payload, 4).map(p => p.id)
    ok('на витрине закреплённое стоит на своём слоте', { pass: lane[2] === PIN_VISIBLE, lane })
    const untouched = others.every(p =>
      fns.resolveRecs(p, payload, 4).map(x => x.id).join() === fns.getRecommendations(p, payload, 4).map(x => x.id).join())
    ok('у остальных товаров лента не изменилась', { pass: untouched, checked: others.length })
  } finally {
    await apiCall('PUT', `/products/${PRODUCT_ID}/recommendations`, { ids: original })
    const back = (await apiCall('GET', '/products/' + PRODUCT_ID)).data.recommendations.manual
    console.log('↩️  восстановлено:', JSON.stringify(back))
    report.restored = { expected: original, actual: back, equal: JSON.stringify(back) === JSON.stringify(original) }
    try { ws && ws.close() } catch { /* empty */ }
    chrome.kill()
  }

  fs.writeFileSync(`${OUT}/report-shots.json`, JSON.stringify(report, null, 2))
  const failed = report.checks.filter(c => !c.value.pass)
  console.log(`\nПроверок: ${report.checks.length}, провалено: ${failed.length}`)
  process.exit(failed.length ? 1 : 0)
}

main().catch(e => { console.error('QA упал:', e.message); process.exit(1) })
