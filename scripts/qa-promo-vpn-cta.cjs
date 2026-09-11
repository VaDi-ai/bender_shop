/**
 * CDP-QA доработки: видимая CTA «ЗАБРАТЬ →» в строке-подарке + фикс bs_order→bs_cart.
 * (поверх шага 4 — подарок в корзине, экран после оплаты, четыре тумблера)
 *
 * Порядок как в прошлых стоп-гейтах: всё на ВЫКЛЮЧЕННОМ (релиз невидим,
 * корзина и экран успеха байт-в-байт прежние), затем поверхности включаются
 * перебором и возвращаются в off.
 *
 * Заказ на проде НЕ создаётся. Payload-инвариант доказывается перехватом
 * window.fetch: тело POST /api/orders ассертится ДО отправки, сам POST не
 * уходит (подменяем fetch на стабовый ответ). Логику заказа шаг не меняет —
 * живой заказ = грязный прод, не нужен.
 *
 * env: QA_BOT_TOKEN, QA_OWNER_ID, QA_MANAGER_ID, DATABASE_URL
 */
const crypto = require('crypto')
const fs = require('fs')
const { spawn } = require('child_process')

const BASE = process.env.BASE || 'https://bendershop.store'
const DIR = 'reports/promo-vpn-cta-2026-09-11'
const OUT = DIR + '/ui'
const PORT = 9239
const BOT_TOKEN = process.env.QA_BOT_TOKEN
const OWNER_ID = Number(process.env.QA_OWNER_ID)
const MANAGER_ID = Number(process.env.QA_MANAGER_ID || 0)
if (!BOT_TOKEN || !OWNER_ID) { console.error('нужны QA_BOT_TOKEN / QA_OWNER_ID'); process.exit(2) }
fs.mkdirSync(OUT, { recursive: true })

const REFS = {
  '': 'https://k9x2m1.conntest.xyz:8443/portal/?ref=bs_home',
  recs: 'https://k9x2m1.conntest.xyz:8443/portal/?ref=bs_recs',
  cart: 'https://k9x2m1.conntest.xyz:8443/portal/?ref=bs_cart',
  order: 'https://k9x2m1.conntest.xyz:8443/portal/?ref=bs_cart',
}

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
      last = e; const c = e.cause && (e.cause.code || e.cause.message)
      console.log(`   ↻ ${label}: попытка ${i}/${tries} (${e.message}${c ? ' / ' + c : ''})`)
      await new Promise(r => setTimeout(r, 1500 * i))
    }
  }
  throw last
}
async function setPromo(fields) {
  return withRetry('PUT /settings/promo-vpn', async () => {
    const r = await fetch(BASE + '/admin/api/settings/promo-vpn', {
      method: 'PUT', headers: { 'x-telegram-init-data': initData(OWNER_ID), 'content-type': 'application/json' },
      body: JSON.stringify(fields),
    })
    let data = null; try { data = await r.json() } catch {}
    return { status: r.status, data }
  })
}
async function getPromoAdmin(uid = OWNER_ID) {
  return withRetry('GET /settings/promo-vpn', async () => {
    const r = await fetch(BASE + '/admin/api/settings/promo-vpn', { headers: { 'x-telegram-init-data': initData(uid) } })
    let data = null; try { data = await r.json() } catch {}
    return { status: r.status, data }
  })
}
const promoView = () => withRetry('GET /api/promo/vpn', () => fetch(BASE + '/api/promo/vpn', { cache: 'no-store' }).then(r => r.json()))

// ── CDP ──
let msgId = 0; const pending = new Map(); let ws
function send(m, p = {}, s) { const id = ++msgId; return new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p, ...(s ? { sessionId: s } : {}) })) }) }
async function ev(s, e) { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }, s); if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)); return r.result?.value }
async function waitFor(s, e, ms = 30000, l = e) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(s, e)) return; await new Promise(r => setTimeout(r, 300)) } throw new Error('waitFor timeout: ' + l) }
const pause = ms => new Promise(r => setTimeout(r, ms))

async function openShop(userId) {
  const url = BASE + '/shop' + (userId ? '#tgWebAppData=' + encodeURIComponent(initData(userId)) : '')
  const t = await send('Target.createTarget', { url })
  const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true }); const s = a.sessionId
  await send('Page.enable', {}, s); await send('Runtime.enable', {}, s)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s)
  await waitFor(s, `!!document.getElementById('tabbar')`, 30000, 'разметка')
  await waitFor(s, `(()=>{const l=document.getElementById('loader');return !l||l.style.display==='none'})()`, 30000, 'заставка')
  await waitFor(s, `Array.isArray(allProducts)&&allProducts.length>0`, 30000, 'товары')
  await waitFor(s, `vpnPromo!==null`, 20000, 'промо')
  return { session: s, targetId: t.targetId }
}
/** Кладёт первый покупаемый товар в корзину и открывает её. */
async function addItemAndOpenCart(s) {
  const added = await ev(s, `(()=>{
    for (const p of allProducts) {
      if (p.variants && p.variants.length) { const v=p.variants.find(x=>x.inStock&&Number(x.price)>0); if(v){addToCart(p.id,v.id);return{id:p.id}} }
      else if (Number(p.price)>0 && p.quantity>0){addToCart(p.id);return{id:p.id}}
    } return null })()`)
  await ev(s, `openCart(); true`); await pause(700)
  return added
}
async function shot(s, name) { const r = await send('Page.captureScreenshot', { format: 'png' }, s); fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64')); console.log('📸', name) }

const report = { checks: [] }
const ok = (name, value) => { report.checks.push({ name, value }); console.log(value.pass ? '✅' : '✖ ', name, JSON.stringify(value).slice(0, 320)) }
const baseline = f => fs.readFileSync(`${DIR}/${f}`, 'utf8')
// Все четыре off — исходное и финальное состояние
const ALL_OFF = { enabled: false, link: REFS[''], offerText: '2 недели VPN бесплатно', recsEnabled: false, recsLink: REFS.recs, cartEnabled: false, cartLink: REFS.cart, orderEnabled: false, orderLink: REFS.order }

async function main() {
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', `--user-data-dir=${process.env.TMPDIR || '/tmp'}/qa-cart-${Date.now()}`], { stdio: 'ignore' })
  const original = (await getPromoAdmin()).data
  console.log('Настройка на старте:', JSON.stringify(original))

  try {
    let v = null
    for (let i = 0; i < 40 && !v; i++) { v = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json()).catch(() => null); if (!v) await pause(300) }
    ws = new WebSocket(v.webSocketDebuggerUrl)
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result) } }
    await new Promise(r => { ws.onopen = r })

    // ── 1. ВСЁ ВЫКЛЮЧЕНО ────────────────────────────────────────────────────
    await setPromo(ALL_OFF)   // гарантируем известное off-состояние
    const offView = await promoView()
    ok('всё выключено: адресов наружу нет', {
      pass: !offView.enabled && !offView.recs.enabled && !offView.cart.enabled && !offView.order.enabled
        && !offView.link && !offView.cart.link && !offView.order.link,
      body: offView,
    })
    let shop = await openShop(OWNER_ID)
    const added = await addItemAndOpenCart(shop.session)
    const cartOff = await ev(shop.session, `({html:document.getElementById('cartList').outerHTML, gift:document.getElementById('vpnCartRow')===null, sub:subtotal(), rows:document.querySelectorAll('#cartList .cart-item').length})`)
    const successOff = await ev(shop.session, `({html:document.getElementById('orderSuccess').outerHTML, block:document.getElementById('vpnOrderBlock')===null})`)
    await shot(shop.session, '01-cart-off')
    ok('корзина байт-в-байт прежняя, строки-подарка нет', { pass: cartOff.html === baseline('cartlist-before.html') && cartOff.gift === true, identical: cartOff.html === baseline('cartlist-before.html'), giftIsNull: cartOff.gift, sub: cartOff.sub })
    ok('#orderSuccess байт-в-байт прежний, блока нет', { pass: successOff.html === baseline('ordersuccess-before.html') && successOff.block === true, identical: successOff.html === baseline('ordersuccess-before.html') })
    await send('Target.closeTarget', { targetId: shop.targetId })

    // ── 2. НЕЗАВИСИМОСТЬ ПЕРЕБОРОМ ──────────────────────────────────────────
    // Включаем ровно ОДНУ поверхность, проверяем что три другие остались off и
    // невидимы, и что у включённой верный ?ref.
    const surfaces = [
      { key: '',      field: 'enabled',      link: 'link' },
      { key: 'recs',  field: 'recsEnabled',  link: 'recsLink' },
      { key: 'cart',  field: 'cartEnabled',  link: 'cartLink' },
      { key: 'order', field: 'orderEnabled', link: 'orderLink' },
    ]
    for (const su of surfaces) {
      const body = { ...ALL_OFF, [su.field]: true }
      await setPromo(body)
      const view = await promoView()
      const others = surfaces.filter(x => x.key !== su.key)
      // видимость на витрине
      let visible = null, ref = null
      const s2 = await openShop(OWNER_ID)
      if (su.key === '') { await waitFor(s2.session, `!!document.getElementById('vpnFab')`, 15000, 'fab'); visible = await ev(s2.session, `!document.getElementById('vpnFab').hidden`); ref = view.link }
      else if (su.key === 'recs') { await ev(s2.session, `openProductModal(${674}); true`); await pause(800); visible = await ev(s2.session, `document.getElementById('vpnRecCard')!==null`); ref = view.recs.link; await ev(s2.session, `closeProductModal(); true`) }
      else if (su.key === 'cart') { await addItemAndOpenCart(s2.session); visible = await ev(s2.session, `document.getElementById('vpnCartRow')!==null`); ref = view.cart.link }
      else if (su.key === 'order') { visible = await ev(s2.session, `(()=>{ if(typeof showOrderSuccess!=='function')return false; showOrderSuccess(1,[{name:'x',qty:1}],'100','cash','pickup',null,null); const el=document.getElementById('vpnOrderBlock'); const ok=el!==null; document.getElementById('orderSuccess').style.display='none'; if(el)el.remove(); return ok })()`); ref = view.order.link }
      const othersOff = others.every(o => {
        const val = o.key === '' ? view.enabled : view[o.key].enabled
        return val === false
      })
      await shot(s2.session, `02-only-${su.key || 'button'}`)
      ok(`включена только «${su.key || 'кнопка'}»: видна, три другие off`, {
        pass: visible === true && othersOff === true && ref === REFS[su.key],
        surfaceVisible: visible, othersOff, ref,
      })
      await send('Target.closeTarget', { targetId: s2.session ? s2.targetId : s2.targetId })
    }

    // ── 3. ПОДАРОК ВНЕ СУММЫ И ВНЕ PAYLOAD (перехват fetch, без заказа) ──────
    await setPromo({ ...ALL_OFF, cartEnabled: true, cartLink: REFS.cart })
    shop = await openShop(OWNER_ID)
    await addItemAndOpenCart(shop.session)
    const proof = await ev(shop.session, `(() => {
      const withGift = !!document.getElementById('vpnCartRow')
      const subWith = subtotal()
      // items так, как их собирает checkout()
      const itemsWith = cart.map(i => { const it = { productId:i.id, name:i.name, price:i.price, qty:i.qty }; if(i.variantId) it.variantId=i.variantId; return it })
      // снимем подарок и пересчитаем — ничего не должно измениться
      const row = document.getElementById('vpnCartRow'); if (row) row.remove()
      const subWithout = subtotal()
      const itemsWithout = cart.map(i => ({ productId:i.id, name:i.name, price:i.price, qty:i.qty, ...(i.variantId?{variantId:i.variantId}:{}) }))
      const hasGiftInItems = itemsWith.some(it => /vpn|подарок|бендер/i.test(it.name) || Number(it.price)===0)
      return { withGift, subWith, subWithout, subEqual: subWith===subWithout, itemsCount: itemsWith.length, itemsEqual: JSON.stringify(itemsWith)===JSON.stringify(itemsWithout), hasGiftInItems }
    })()`)
    ok('подарок виден, но вне subtotal() и вне items заказа', {
      pass: proof.withGift === true && proof.subEqual === true && proof.itemsEqual === true && proof.hasGiftInItems === false,
      ...proof,
    })

    // Видимая CTA «ЗАБРАТЬ →» и тап именно по ней (клик всплывает к строке)
    const cta = await ev(shop.session, `(() => {
      window.__opened = null
      if (window.Telegram && window.Telegram.WebApp) { window.Telegram.WebApp.openLink = u => window.__opened = { via:'openLink', u }; window.Telegram.WebApp.openTelegramLink = u => window.__opened = { via:'openTelegramLink', u } }
      const el = document.querySelector('#vpnCartRow .vgift-cta')
      const visible = !!el && !!el.offsetParent && el.textContent.trim().length > 0
      const text = el ? el.textContent.trim() : null
      if (el) el.click()   // клик по CTA, без своего обработчика — всплывает к строке
      return { visible, text, opened: window.__opened }
    })()`)
    await shot(shop.session, '04-cart-cta')
    ok('в строке видна CTA «ЗАБРАТЬ →», тап по ней ведёт на ?ref=bs_cart', {
      pass: cta.visible === true && cta.opened && cta.opened.via === 'openLink' && cta.opened.u === REFS.cart,
      text: cta.text, opened: cta.opened,
    })

    // Перехват fetch: ассерт тела POST /api/orders ДО отправки, сам POST не шлём
    const intercepted = await ev(shop.session, `(async () => {
      // вернём товар обратно (мы его удалили из DOM выше, но cart цел) и подарок
      renderCartBody()
      const orig = window.fetch
      let captured = null
      window.fetch = function (url, opts) {
        if (typeof url === 'string' && url.includes('/api/orders') && opts && opts.method === 'POST') {
          captured = JSON.parse(opts.body)
          // НЕ отправляем реальный заказ — отдаём стаб успешного ответа
          return Promise.resolve(new Response(JSON.stringify({ orderId: 0, ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
        }
        return orig(url, opts)
      }
      // заполнить обязательные поля формы, чтобы checkout() дошёл до fetch
      document.querySelector('.pay-btn')?.click()
      const cb = document.getElementById('consentCheckbox'); if (cb) cb.checked = true
      const nm = document.getElementById('cfName'); if (nm) nm.value = 'QA Тест'
      const ph = document.getElementById('cfPhone'); if (ph) ph.value = '+7 (999) 111-22-33'
      await checkout()
      window.fetch = orig
      if (!captured) return { sent: false }
      const names = captured.items.map(i => i.name)
      const giftInPayload = captured.items.some(i => /vpn|подарок|бендер/i.test(i.name) || Number(i.price)===0)
      return { sent: true, itemCount: captured.items.length, names, giftInPayload, totalAmount: captured.totalAmount }
    })()`)
    ok('перехваченный POST /api/orders НЕ содержит подарок', {
      pass: intercepted.sent === true && intercepted.giftInPayload === false,
      ...intercepted,
    })
    // экран успеха (стаб вернул orderId:0) — при cart on, но order off, блока быть НЕ должно
    const successNoOrder = await ev(shop.session, `document.getElementById('vpnOrderBlock')===null`)
    ok('order off → блока на экране успеха нет, хотя подарок в корзине был', { pass: successNoOrder === true, blockIsNull: successNoOrder })
    await send('Target.closeTarget', { targetId: shop.targetId })

    // ── 4. ЭКРАН ПОСЛЕ ЗАКАЗА → ?ref=bs_cart ───────────────────────────────
    await setPromo({ ...ALL_OFF, orderEnabled: true, orderLink: REFS.order })
    shop = await openShop(OWNER_ID)
    const orderTap = await ev(shop.session, `(() => {
      window.__opened=null
      if(window.Telegram&&window.Telegram.WebApp){window.Telegram.WebApp.openLink=u=>window.__opened={via:'openLink',u};window.Telegram.WebApp.openTelegramLink=u=>window.__opened={via:'openTelegramLink',u}}
      showOrderSuccess(1,[{name:'x',qty:1}],'100','cash','pickup',null,null)
      const el=document.getElementById('vpnOrderBlock'); const present=el!==null
      if(el){ el.querySelector('#vpnOrderCta').click() }
      const opened=window.__opened
      document.getElementById('orderSuccess').style.display='none'; if(el)el.remove()
      return { present, opened }
    })()`)
    await shot(shop.session, '03-order-screen')
    ok('экран после заказа ведёт на ?ref=bs_cart через openLink', {
      pass: orderTap.present === true && orderTap.opened && orderTap.opened.u === REFS.order && orderTap.opened.via === 'openLink',
      ...orderTap,
    })
    await send('Target.closeTarget', { targetId: shop.targetId })

    // ── 4b. Нигде нет bs_order ──────────────────────────────────────────────
    const pv = await promoView()
    const admin = (await getPromoAdmin()).data
    const blob = JSON.stringify(pv) + JSON.stringify(admin)
    ok('ни в отдаче, ни в настройке нет метки bs_order', {
      pass: !/bs_order/.test(blob),
      inView: /bs_order/.test(JSON.stringify(pv)), inAdmin: /bs_order/.test(JSON.stringify(admin)),
      orderLink: admin.orderLink,
    })

    // ── 5. МЕНЕДЖЕР НИ ОДИН ТУМБЛЕР НЕ ВКЛЮЧАЕТ ─────────────────────────────
    if (MANAGER_ID) {
      const r = await withRetry('PUT as manager', async () => {
        const res = await fetch(BASE + '/admin/api/settings/promo-vpn', { method: 'PUT', headers: { 'x-telegram-init-data': initData(MANAGER_ID), 'content-type': 'application/json' }, body: JSON.stringify({ ...ALL_OFF, cartEnabled: true, orderEnabled: true }) })
        let data = null; try { data = await res.json() } catch {}
        return { status: res.status, data }
      })
      ok('менеджер тумблеры не включает (403)', { pass: r.status === 403, status: r.status })
    }
  } finally {
    // Вернуть исходное (в снапшоте — что было на старте прогона)
    const restore = await setPromo({
      enabled: original.enabled, link: original.link, offerText: original.offerText,
      recsEnabled: original.recsEnabled, recsLink: original.recsLink,
      cartEnabled: original.cartEnabled, cartLink: original.cartLink,
      orderEnabled: original.orderEnabled, orderLink: original.orderLink,
    })
    const finalCfg = (await getPromoAdmin()).data
    const finalView = await promoView()
    console.log(`↩️  вернули (статус ${restore.status}):`, JSON.stringify({ enabled: finalCfg.enabled, recsEnabled: finalCfg.recsEnabled, cartEnabled: finalCfg.cartEnabled, orderEnabled: finalCfg.orderEnabled }))
    report.restored = { setting: finalCfg, storefront: finalView }
    try { ws && ws.close() } catch {}
    chrome.kill()
  }

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  const failed = report.checks.filter(c => !c.value.pass)
  console.log(`\nПроверок: ${report.checks.length}, провалено: ${failed.length}`)
  failed.forEach(f => console.log(' ✖', f.name, JSON.stringify(f.value).slice(0, 400)))
  process.exit(failed.length ? 1 : 0)
}
main().catch(e => { const c = e.cause && (e.cause.code || e.cause.message); console.error('QA упал:', e.message, c ? '| ' + c : ''); process.exit(1) })
