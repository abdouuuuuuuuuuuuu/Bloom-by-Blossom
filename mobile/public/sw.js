// Blossom Mobile service worker: keeps the app shell (HTML, JS, CSS, fonts,
// icons) so it opens instantly and installs as an app. Shop data is never
// cached here: every order and product comes live from the shop database.
const CACHE = 'blossom-mobile-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return // Supabase etc. go straight to the network
  if (req.mode === 'navigate') {
    // Pages: fresh from the network (new versions show at once), cached copy when offline.
    event.respondWith(fetch(req).then((res) => {
      const copy = res.clone()
      caches.open(CACHE).then((c) => c.put('./index.html', copy))
      return res
    }).catch(() => caches.match('./index.html')))
    return
  }
  // Built files have content hashes in their names, so a cached copy is always right.
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && (url.pathname.includes('/assets/') || url.pathname.includes('/icons/'))) {
      const copy = res.clone()
      caches.open(CACHE).then((c) => c.put(req, copy))
    }
    return res
  })))
})
