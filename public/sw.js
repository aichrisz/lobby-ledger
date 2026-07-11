const CACHE = 'lobby-ledger-v1' // bump on every release

// Precache the app shell AND the hashed assets it references. The first page
// load is not controlled by this worker, so runtime caching alone would leave
// the JS/CSS/fonts uncached and an offline reload would render a blank page.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(['./'])
      const shell = await c.match('./')
      const html = await shell.text()
      const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1])
      await c.addAll(assets)
      for (const asset of assets.filter((a) => a.endsWith('.css'))) {
        const cssUrl = new URL(asset, self.location.href)
        const css = await (await c.match(cssUrl)).text()
        const fonts = [...css.matchAll(/url\((\.\/[^)]+\.woff2?)\)/g)]
          .map((m) => new URL(m[1], cssUrl).href)
        await c.addAll(fonts)
      }
    }),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./')),
    )
    return
  }
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
          }
          return res
        }),
    ),
  )
})
