/* global self, caches, fetch, URL */
const CACHE_NAME = 'flighttrace-shell-v5'

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME)
  const indexResponse = await fetch('./index.html', { cache: 'no-store' })
  const html = await indexResponse.clone().text()
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => !path.startsWith('data:') && new URL(path, self.location.href).origin === self.location.origin)
  await cache.put('./index.html', indexResponse.clone())
  await cache.put('./', indexResponse)
  await cache.addAll([...new Set(['./app-icon.svg', './manifest.webmanifest', ...assets])])

  const workerAssets = []
  for (const scriptPath of assets.filter((path) => path.endsWith('.js'))) {
    const scriptResponse = await cache.match(scriptPath, { ignoreVary: true })
    if (!scriptResponse) continue
    const source = await scriptResponse.text()
    const scriptUrl = new URL(scriptPath, self.location.href)
    for (const match of source.matchAll(/[A-Za-z0-9._-]+\.worker-[A-Za-z0-9_-]+\.js/g)) {
      workerAssets.push(new URL(match[0], scriptUrl).href)
    }
  }
  await cache.addAll([...new Set(workerAssets)])
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url)
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return

  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((cached) => cached || fetch(event.request)))
    return
  }

  event.respondWith(caches.match(event.request, { ignoreSearch: true, ignoreVary: true }).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone()
      void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
    }
    return response
  })))
})
