/**
 * CDP-QA Фазы C на проде: экран «Привязки прайса».
 * env: QA_BOT_TOKEN, QA_OWNER_ID, QA_MANAGER_TG (полный tg id QA-менеджера).
 * Скрины → reports/alias-ui-qa/. Все мутации восстанавливаются в конце.
 */
const crypto = require('crypto')
const fs = require('fs')
const { spawn } = require('child_process')

const BASE = 'https://bendershop.store'
const OUT = 'reports/alias-ui-qa'
const PORT = 9223
const BOT_TOKEN = process.env.QA_BOT_TOKEN
const OWNER_ID = Number(process.env.QA_OWNER_ID)
const MANAGER_TG = process.env.QA_MANAGER_TG
if (!BOT_TOKEN || !OWNER_ID) { console.error('нет QA_BOT_TOKEN/QA_OWNER_ID'); process.exit(1) }
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
async function shot(sessionId, name) {
  const r = await send('Page.captureScreenshot', { format: 'png' }, sessionId)
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'))
  console.log('📸', name)
}
async function openTab(userId) {
  const t = await send('Target.createTarget', { url: BASE + '/admin#tgWebAppData=' + encodeURIComponent(initData(userId)) })
  const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
  const s = a.sessionId
  await send('Page.enable', {}, s)
  await send('Runtime.enable', {}, s)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s)
  return s
}
const scrollToAliases = (s) => evalIn(s, `document.getElementById('alList').closest('.card').scrollIntoView({block:'start'}); true`)
const OVERRIDE = `window.confirm=()=>true; window.__alerts=window.__alerts||[]; window.alert=m=>{window.__alerts.push(String(m))}; true`


const row23has = (txt) => `[...document.querySelectorAll('#alList .sf-item')].some(el => el.textContent.includes('512gb midnight»') && el.textContent.includes('${txt}'))`
async function rebindAlias23(s, sku, expectTxt) {
  await waitFor(s, `!!document.querySelector('[data-al-rebind="23"]')`, 20000, 'rebind btn 23')
  await new Promise(r => setTimeout(r, 1500))   // дать доехать параллельным перерисовкам
  let opened = false
  for (let a = 0; a < 4 && !opened; a++) {
    await evalIn(s, `document.querySelector('[data-al-rebind="23"]').click(); true`)
    await new Promise(r => setTimeout(r, 600))
    opened = await evalIn(s, `!!document.querySelector('[data-al-panel="a23"] [data-al-search]')`)
  }
  if (!opened) throw new Error('panel 23 не открылась')
  await evalIn(s, `(()=>{ const el=document.querySelector('[data-al-panel="a23"] [data-al-search]'); el.value='${sku}'; el.dispatchEvent(new Event('input')) })(); true`)
  await waitFor(s, `!!document.querySelector('[data-al-panel="a23"] [data-al-pick]')`, 15000, 'pick ' + sku)
  await evalIn(s, `document.querySelector('[data-al-panel="a23"] [data-al-pick]').click(); true`)
  await waitFor(s, row23has(expectTxt), 20000, 'alias23 → ' + expectTxt)
}

async function main() {
  const report = {}
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', `--user-data-dir=${process.env.TMPDIR || '/tmp'}/qa-chrome-${Date.now()}`],
    { stdio: 'ignore' })
  try {
    let version = null
    for (let i = 0; i < 40 && !version; i++) {
      version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json()).catch(() => null)
      if (!version) await new Promise(r => setTimeout(r, 300))
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

    // ── Owner: список ─────────────────────────────────────────────────────
    const s = await openTab(OWNER_ID)
    await waitFor(s, `window.adminMe && window.adminMe.role==='owner'`, 25000, 'owner gate')
    await evalIn(s, `go('s-prices'); true`)
    await waitFor(s, `document.getElementById('alList') && !document.getElementById('alList').textContent.includes('Загрузка')`, 20000, 'alList loaded')
    await waitFor(s, `!document.getElementById('alAuto').textContent.includes('Загрузка')`, 20000, 'alAuto loaded')
    await scrollToAliases(s)
    await shot(s, '01-owner-aliases')
    report.listLoaded = await evalIn(s, `document.querySelectorAll('#alList .sf-item').length`)
    report.autoRows = await evalIn(s, `document.querySelectorAll('#alAuto .sf-item').length`)
    await evalIn(s, OVERRIDE)

    // ── Перепривязка алиаса 23 → вариант 395 (sku cl90o) через UI ────────
    await rebindAlias23(s, 'cl90o', '512GB Sky Blue')
    await evalIn(s, OVERRIDE)
    await scrollToAliases(s)
    await shot(s, '02-alias23-rebound-to-skyblue')

    // ── Обратно → 394 (sku cl3u7) ─────────────────────────────────────────
    await rebindAlias23(s, 'cl3u7', '512GB Midnight')
    await evalIn(s, OVERRIDE)
    await scrollToAliases(s)
    await shot(s, '03-alias23-rebound-back')

    // ── Конфликт: строка 749 (не узнана) → 401, алиас руками → 413, откат ──
    const link = await apiCall(OWNER_ID, 'POST', '/aliases', { supplierPriceId: 749, variantId: 401 })
    report.linkRow749 = { status: link.status, rematched: link.data?.rematched }
    const la = await apiCall(OWNER_ID, 'GET', '/aliases?q=' + encodeURIComponent('air 13 m5 1tb silver'))
    const silverAlias = (la.data || []).find(a => a.alias === 'macbook air 13 m5 1tb silver')
    report.silverAliasId = silverAlias?.id
    await apiCall(OWNER_ID, 'PUT', `/aliases/${silverAlias.id}`, { variantId: 413 }) // теперь алиас ≠ строка → конфликт
    await evalIn(s, `loadAliases(); true`)
    await waitFor(s, `!!document.querySelector('[data-al-rollback="${silverAlias.id}"]')`, 20000, 'silver alias row')
    await evalIn(s, OVERRIDE)
    await evalIn(s, `window.__alerts=[]; document.querySelector('[data-al-rollback="${silverAlias.id}"]').click(); true`)
    await waitFor(s, `window.__alerts.length > 0`, 20000, 'conflict alert')
    report.conflictAlert = await evalIn(s, `window.__alerts[0]`)
    await scrollToAliases(s)
    await shot(s, '04-rollback-conflict')
    await apiCall(OWNER_ID, 'PUT', `/aliases/${silverAlias.id}`, { variantId: 401 }) // чиним алиас на правильный

    // ── Откат эффекта алиаса 23 через UI (строка 740 вернётся в «не узнал») ─
    await evalIn(s, `window.__alerts=[]; document.querySelector('[data-al-rollback="23"]').click(); true`)
    await waitFor(s, `window.__alerts.length > 0`, 20000, 'rollback alert')
    report.rollbackAlert = await evalIn(s, `window.__alerts[0]`)
    await scrollToAliases(s)
    await shot(s, '05-rollback-alias23')
    // восстановить: строка 740 → 394 (тот же rebind-эндпоинт)
    const restore = await apiCall(OWNER_ID, 'POST', '/aliases/rebind', { supplierPriceId: 740, variantId: 394 })
    report.restoreRow740 = { status: restore.status, rowUpdated: restore.data?.rowUpdated, rematched: restore.data?.rematched }

    // ── Менеджер: owner-кнопок нет ────────────────────────────────────────
    if (MANAGER_TG) {
      await apiCall(OWNER_ID, 'PUT', `/team/${MANAGER_TG}`, { isActive: true })
      const m = await openTab(Number(MANAGER_TG))
      await waitFor(m, `window.adminMe && window.adminMe.role==='manager'`, 25000, 'manager gate')
      await evalIn(m, `go('s-prices'); true`)
      await waitFor(m, `document.getElementById('alList') && !document.getElementById('alList').textContent.includes('Загрузка')`, 20000, 'manager alList')
      await scrollToAliases(m)
      report.managerButtons = await evalIn(m, `({forget: !!document.querySelector('[data-al-forget]'), rollback: !!document.querySelector('[data-al-rollback]'), rebind: !!document.querySelector('[data-al-rebind]')})`)
      await shot(m, '06-manager-aliases')
      await apiCall(OWNER_ID, 'PUT', `/team/${MANAGER_TG}`, { isActive: false })
      report.managerDeactivated = true
    }

    // ── Финальное состояние ───────────────────────────────────────────────
    const fin = await apiCall(OWNER_ID, 'GET', '/aliases?q=' + encodeURIComponent('512gb midnight'))
    report.finalAlias23 = (fin.data || []).filter(a => [22, 23].includes(a.id)).map(a => ({ id: a.id, variantId: a.variantId, fullName: a.fullName }))
    fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
    console.log('REPORT:', JSON.stringify(report, null, 2))
  } finally {
    chrome.kill()
  }
}

main().catch(e => { console.error('QA FAIL:', e.message); process.exit(1) })
