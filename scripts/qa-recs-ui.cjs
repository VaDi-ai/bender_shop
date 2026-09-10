/**
 * CDP-QA «Рекомендуем» на проде: три экрана, у которых нет E2E.
 *
 *   (а) поиск товара в карточке — находит и открывает карточку;
 *   (б) поиск в «Хиты/Новинки» — находит, чип «уже хит» и кнопка «В хиты» на месте;
 *   (в) блок «Рекомендуем» — подбор с метками, замена встаёт на свой слот,
 *       «Вернуть авто» и «Сбросить всё» работают;
 *   (г) усечение выдачи: «Показаны 20 из N — уточните запрос».
 *
 * env: QA_BOT_TOKEN, QA_OWNER_ID, QA_PRODUCT_ID (товар для блока «Рекомендуем»).
 * Скрины → reports/recs-2026-09-10/ui/. Все мутации откатываются в конце:
 * товар возвращается на тот массив замен, с которым пришёл.
 */
const crypto = require('crypto')
const fs = require('fs')
const { spawn } = require('child_process')

const BASE = 'https://bendershop.store'
const OUT = 'reports/recs-2026-09-10/ui'
const PORT = 9224
const BOT_TOKEN = process.env.QA_BOT_TOKEN
const OWNER_ID = Number(process.env.QA_OWNER_ID)
const PRODUCT_ID = Number(process.env.QA_PRODUCT_ID)
if (!BOT_TOKEN || !OWNER_ID || !PRODUCT_ID) { console.error('нужны QA_BOT_TOKEN / QA_OWNER_ID / QA_PRODUCT_ID'); process.exit(2) }
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

async function apiCall(userId, method, path, body) {
  const r = await fetch(BASE + '/admin/api' + path, {
    method,
    headers: { 'x-telegram-init-data': initData(userId), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await r.json() } catch { /* empty */ }
  return { status: r.status, data }
}

// ── CDP через нативный WebSocket ──────────────────────────────────────────────
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
async function evalIn(sessionId, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
  return r.result?.value
}
async function waitFor(sessionId, expression, timeoutMs = 20000, label = expression) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (await evalIn(sessionId, expression)) return
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('waitFor timeout: ' + label)
}
const pause = ms => new Promise(r => setTimeout(r, ms))
async function shot(sessionId, name) {
  const r = await send('Page.captureScreenshot', { format: 'png' }, sessionId)
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'))
  console.log('📸', name)
}
async function openTab(url) {
  const t = await send('Target.createTarget', { url })
  const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
  const s = a.sessionId
  await send('Page.enable', {}, s)
  await send('Runtime.enable', {}, s)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s)
  return s
}
const openAdmin = () => openTab(BASE + '/admin#tgWebAppData=' + encodeURIComponent(initData(OWNER_ID)))
const OVERRIDE = `window.confirm=()=>true; window.__alerts=window.__alerts||[]; window.alert=m=>{window.__alerts.push(String(m))}; true`

/** Вбивает запрос в поле поиска и ждёт результатов (дебаунс 250 мс). */
async function typeSearch(s, inputSel, q, expect, boxSel) {
  // Контейнер чистится ДО ввода: дебаунс 250 мс, и без этого проверка успевает
  // прочитать выдачу предыдущего запроса и «пройти» на чужих данных.
  if (boxSel) await evalIn(s, `document.querySelector('${boxSel}').innerHTML=''; true`)
  await evalIn(s, `(()=>{ const el=document.querySelector('${inputSel}'); el.value=${JSON.stringify(q)}; el.dispatchEvent(new Event('input')) })(); true`)
  await waitFor(s, expect, 15000, `поиск «${q}» → ${expect}`)
}

/** Переключает экран и УБЕЖДАЕТСЯ, что он показан: клики по скрытому DOM
 *  проходят молча, и тогда проверки идут вхолостую, а скрины выходят пустыми. */
async function goScreen(s, id) {
  await evalIn(s, `go('${id}'); true`)
  await waitFor(s, `(()=>{const el=document.getElementById('${id}'); return !!el && el.classList.contains('on') && getComputedStyle(el).display!=='none'})()`, 15000, 'экран ' + id + ' показан')
}

const report = { checks: [], screens: [] }
const ok = (name, value) => { report.checks.push({ name, value }); console.log(value === true || (value && value.pass) ? '✅' : 'ℹ️ ', name, JSON.stringify(value)) }

async function main() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', `--user-data-dir=${process.env.TMPDIR || '/tmp'}/qa-recs-${Date.now()}`],
    { stdio: 'ignore' })

  // Исходное состояние товара — чтобы вернуть всё как было
  const before = await apiCall(OWNER_ID, 'GET', '/products/' + PRODUCT_ID)
  if (before.status !== 200) throw new Error('карточка не открылась: ' + before.status)
  const originalManual = before.data.recommendations.manual.slice()
  console.log(`Товар #${PRODUCT_ID} «${before.data.name}», замен на старте: ${JSON.stringify(originalManual)}`)

  // Эталон авто-подбора снимается с ЧИСТОГО товара. Если прогон стартует на
  // товаре с уже закреплёнными позициями, «эталоном» станет лента с заменой, и
  // проверки «вернуть авто» / «сбросить всё» будут сравниваться не с тем.
  // В конце вернём ровно то, с чем пришли.
  if (originalManual.length) {
    console.log('⚠️  товар пришёл с заменами — снимаю их на время прогона')
    await apiCall(OWNER_ID, 'PUT', `/products/${PRODUCT_ID}/recommendations`, { ids: [] })
  }

  try {
    let version = null
    for (let i = 0; i < 40 && !version; i++) {
      version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json()).catch(() => null)
      if (!version) await pause(300)
    }
    ws = new WebSocket(version.webSocketDebuggerUrl)
    ws.onmessage = e => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id); pending.delete(m.id)
        m.error ? reject(new Error(m.error.message)) : resolve(m.result)
      }
    }
    await new Promise(r => { ws.onopen = r })

    const s = await openAdmin()
    await waitFor(s, `window.adminMe && window.adminMe.role==='owner'`, 30000, 'owner gate')
    await evalIn(s, OVERRIDE)

    // ── (а) Поиск в карточке товара ────────────────────────────────────────
    await goScreen(s, 's-goods')
    await waitFor(s, `!!document.getElementById('pcSearch')`, 15000, 'экран товаров')
    await typeSearch(s, '#pcSearch', 'iphone', `document.querySelectorAll('#pcResults [data-pc-open]').length > 0`, '#pcResults')
    await shot(s, '01-card-search')
    ok('(а) поиск в карточке находит товары', {
      pass: true,
      rows: await evalIn(s, `document.querySelectorAll('#pcResults .sf-item').length`),
      firstName: await evalIn(s, `document.querySelector('#pcResults .nm').textContent`),
    })

    // ── (г) Усечение выдачи видно ──────────────────────────────────────────
    await typeSearch(s, '#pcSearch', 'pro', `/Показаны 20 из \\d+/.test(document.getElementById('pcResults').textContent)`, '#pcResults')
    const truncText = await evalIn(s, `(document.getElementById('pcResults').textContent.match(/Показаны \\d+ из \\d+ — уточните запрос/) || [''])[0]`)
    await shot(s, '02-card-search-truncated')
    ok('(г) усечение подписано', { pass: /Показаны 20 из \d+/.test(truncText), text: truncText })

    // Открываем карточку из результатов поиска
    await typeSearch(s, '#pcSearch', String(before.data.sku), `document.querySelectorAll('#pcResults [data-pc-open]').length > 0`, '#pcResults')
    await evalIn(s, `document.querySelector('#pcResults [data-pc-open]').click(); true`)
    await waitFor(s, `document.getElementById('pcCard').textContent.includes('РЕКОМЕНДУЕМ')`, 20000, 'карточка открылась')
    ok('(а) карточка открывается из результатов', { pass: true, title: await evalIn(s, `document.querySelector('#pcCard .cap').textContent`) })

    // ── (в) Блок «Рекомендуем»: авто-подбор с метками ──────────────────────
    await evalIn(s, `document.getElementById('pcCard').scrollIntoView({block:'start'}); true`)
    const slotsInfo = () => evalIn(s, `(()=>{
      const cap=[...document.querySelectorAll('#pcCard .cap')].find(c=>c.textContent.trim().startsWith('РЕКОМЕНДУЕМ'))
      const out=[]; let el=cap.nextElementSibling
      while(el && !el.classList.contains('cap')){ if(el.classList.contains('sf-item')) out.push(el.querySelector('.nm').textContent+' :: '+el.querySelector('.mt').textContent); el=el.nextElementSibling }
      return out })()`)
    const auto = await slotsInfo()
    await evalIn(s, `[...document.querySelectorAll('#pcCard .cap')].find(c=>c.textContent.trim().startsWith('РЕКОМЕНДУЕМ')).scrollIntoView({block:'start'}); true`)
    await shot(s, '03-recs-auto')
    ok('(в) авто-подбор с метками', {
      pass: auto.length > 0 && auto.every(x => x.includes('авто ·')) && !auto.some(x => x.includes('вручную')),
      slots: auto,
    })

    // ── (в) Замена третьей позиции ─────────────────────────────────────────
    await evalIn(s, `document.querySelector('[data-rec-pick="3"]').click(); true`)
    await waitFor(s, `!!document.querySelector('#recPick-3 input')`, 10000, 'пикер слота 3 открылся')
    await evalIn(s, `(()=>{ const el=document.querySelector('#recPick-3 input'); el.value='airpods'; el.dispatchEvent(new Event('input')) })(); true`)
    await waitFor(s, `document.querySelectorAll('#recPick-3 [data-rec-set]').length > 0`, 15000, 'нашлось чем заменить')
    await evalIn(s, `document.querySelector('#recPick-3').scrollIntoView({block:'center'}); true`)
    await shot(s, '04-recs-picker-open')
    const pickedName = await evalIn(s, `document.querySelector('#recPick-3 .nm').textContent`)
    const pickedId = await evalIn(s, `Number(document.querySelector('#recPick-3 [data-rec-set]').dataset.recSet)`)
    await evalIn(s, `document.querySelector('#recPick-3 [data-rec-set]').click(); true`)
    await waitFor(s, `document.getElementById('pcCard').textContent.includes('вручную')`, 20000, 'замена применилась')
    await evalIn(s, `[...document.querySelectorAll('#pcCard .cap')].find(c=>c.textContent.trim().startsWith('РЕКОМЕНДУЕМ')).scrollIntoView({block:'start'}); true`)
    await shot(s, '05-recs-replaced-slot3')
    const afterSwap = await slotsInfo()
    const stored = (await apiCall(OWNER_ID, 'GET', '/products/' + PRODUCT_ID)).data.recommendations
    ok('(в) замена встала на свой слот', {
      pass: afterSwap[2] && afterSwap[2].includes('вручную') && afterSwap[2].includes('3.'),
      slot3: afterSwap[2], picked: pickedName, manual: stored.manual,
    })
    ok('(в) в БД лежат замены по слотам', { pass: stored.manual[2] === pickedId && stored.manual.slice(0, 2).every(x => x === 0), manual: stored.manual })

    // ── (в) «Вернуть авто» на слоте ────────────────────────────────────────
    await evalIn(s, `document.querySelector('[data-rec-auto="3"]').click(); true`)
    await waitFor(s, `!document.getElementById('pcCard').textContent.includes('вручную')`, 20000, '«вернуть авто» сработал')
    await evalIn(s, `[...document.querySelectorAll('#pcCard .cap')].find(c=>c.textContent.trim().startsWith('РЕКОМЕНДУЕМ')).scrollIntoView({block:'start'}); true`)
    await shot(s, '06-recs-back-to-auto')
    const backAuto = await slotsInfo()
    ok('(в) «Вернуть авто» вернул исходную ленту', {
      pass: JSON.stringify(backAuto) === JSON.stringify(auto),
      same: JSON.stringify(backAuto) === JSON.stringify(auto),
    })

    // ── (в) «Сбросить всё на авто» ─────────────────────────────────────────
    await evalIn(s, `document.querySelector('[data-rec-pick="1"]').click(); true`)
    await waitFor(s, `!!document.querySelector('#recPick-1 input')`, 10000, 'пикер слота 1')
    await evalIn(s, `(()=>{ const el=document.querySelector('#recPick-1 input'); el.value='airpods'; el.dispatchEvent(new Event('input')) })(); true`)
    await waitFor(s, `document.querySelectorAll('#recPick-1 [data-rec-set]').length > 0`, 15000, 'кандидаты слота 1')
    await evalIn(s, `document.querySelector('#recPick-1 [data-rec-set]').click(); true`)
    await waitFor(s, `!!document.getElementById('recReset')`, 20000, 'кнопка сброса появилась')
    await evalIn(s, OVERRIDE)
    await evalIn(s, `document.getElementById('recReset').click(); true`)
    await waitFor(s, `!document.getElementById('recReset')`, 20000, 'сброс применился')
    await evalIn(s, `[...document.querySelectorAll('#pcCard .cap')].find(c=>c.textContent.trim().startsWith('РЕКОМЕНДУЕМ')).scrollIntoView({block:'start'}); true`)
    await shot(s, '07-recs-reset')
    const afterReset = await slotsInfo()
    const storedAfterReset = (await apiCall(OWNER_ID, 'GET', '/products/' + PRODUCT_ID)).data.recommendations
    ok('(в) «Сбросить всё» вернул чистое авто', {
      pass: JSON.stringify(afterReset) === JSON.stringify(auto) && storedAfterReset.manual.length === 0,
      manual: storedAfterReset.manual,
    })

    // ── (б) «Хиты/Новинки» ─────────────────────────────────────────────────
    await goScreen(s, 's-shop')
    await waitFor(s, `!!document.getElementById('hitAddBtn')`, 20000, 'экран витрины')
    await evalIn(s, `document.getElementById('hitAddBtn').click(); true`)
    await waitFor(s, `!!document.getElementById('hitSearch')`, 10000, 'поиск хитов открылся')
    await typeSearch(s, '#hitSearch', 'iphone', `document.querySelectorAll('#hitResults .sf-item').length > 0`, '#hitResults')
    await evalIn(s, `document.getElementById('hitSearchWrap').scrollIntoView({block:'center'}); true`)
    await shot(s, '08-hits-search')
    ok('(б) поиск в «Хитах» находит', {
      pass: await evalIn(s, `document.querySelectorAll('#hitResults .sf-item').length > 0`),
      rows: await evalIn(s, `document.querySelectorAll('#hitResults .sf-item').length`),
      hasHitButton: await evalIn(s, `document.querySelectorAll('#hitResults [data-hit-on]').length > 0`),
      hasAlreadyHitChip: await evalIn(s, `document.getElementById('hitResults').textContent.includes('уже хит')`),
    })
    // Широкий запрос — усечение должно быть подписано и здесь
    await typeSearch(s, '#hitSearch', 'pro', `/Показаны 20 из \\d+/.test(document.getElementById('hitResults').textContent)`, '#hitResults')
    await evalIn(s, `document.getElementById('hitSearchWrap').scrollIntoView({block:'center'}); true`)
    await shot(s, '09-hits-search-truncated')
    ok('(б) усечение подписано и в «Хитах»', {
      pass: await evalIn(s, `/Показаны 20 из \\d+/.test(document.getElementById('hitResults').textContent)`),
      text: await evalIn(s, `(document.getElementById('hitResults').textContent.match(/Показаны \\d+ из \\d+ — уточните запрос/)||[''])[0]`),
    })

    report.alerts = await evalIn(s, `window.__alerts || []`)
  } finally {
    // Возврат состояния: товар должен уйти с тем же массивом, с которым пришёл
    const restore = await apiCall(OWNER_ID, 'PUT', `/products/${PRODUCT_ID}/recommendations`, { ids: originalManual })
    const final = (await apiCall(OWNER_ID, 'GET', '/products/' + PRODUCT_ID)).data.recommendations.manual
    console.log('↩️  восстановлено:', JSON.stringify(final), 'статус', restore.status)
    report.restored = { expected: originalManual, actual: final, equal: JSON.stringify(final) === JSON.stringify(originalManual) }
    try { ws && ws.close() } catch { /* empty */ }
    chrome.kill()
  }

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  const failed = report.checks.filter(c => c.value && c.value.pass === false)
  console.log(`\nПроверок: ${report.checks.length}, провалено: ${failed.length}`)
  failed.forEach(f => console.log(' ✖', f.name, JSON.stringify(f.value)))
  process.exit(failed.length ? 1 : 0)
}

main().catch(e => { console.error('QA упал:', e.message); process.exit(1) })
