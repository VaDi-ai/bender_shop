/**
 * Раньше перехват navigation + fetch().catch(...) отдавал /offline.html при ЛЮБОЙ ошибке сети
 * (502, TLS, перезапуск Railway, короткий таймаут) — в Telegram это выглядело как «нет интернета».
 *
 * Политика сейчас: не подменять HTML; реальную ошибку загрузки API показывает витрина
 * («Не удалось загрузить товары» + кнопка). Старый кэш безопасно сносим после обновления.
 */
const LEGACY_CACHE = 'bender-v2'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k === LEGACY_CACHE).map(k => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})
