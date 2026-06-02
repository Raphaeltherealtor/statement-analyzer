// v15 — Tax Checklist gets a flat "Curate transactions" view with
// search + filter + per-row checkbox + inline category dropdown. The
// per-row expansion in the Checklist view also gets the category
// dropdown for in-line fixes without leaving the page.
const CACHE_NAME = 'statement-analyzer-v15'
const STATIC_ASSETS = ['/favicon.ico', '/icon-192x192.png', '/icon-512x512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return

  // API routes: pure network, never cached.
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request))
    return
  }

  // Network-first for everything else so a new deploy is picked up immediately
  // when the user is online. Cache is only consulted as an offline fallback.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() =>
        caches.match(event.request).then((cached) =>
          cached || new Response('Offline', { status: 503, statusText: 'Offline' })
        )
      )
  )
})
