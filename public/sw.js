// Viens jouer — a small service worker. No cache, no offline shell on purpose: the pages talk to the server all day, and a
// stale shell is worse than a spinner. It makes the app installable and it receives notifications.
//
// Notifications: the push carries NO text. It only wakes this worker, which asks the server what is new
// (GET /api/notifications?push=1, with the person's own session) and shows it. Nothing readable travels through Apple's,
// Google's or Mozilla's push service. A browser (iPhone above all) requires every push to show a notification, so when the
// server has nothing to say (already seen, signed out, offline) a plain « il y a du nouveau » is shown instead of nothing.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let items = []
      try {
        const res = await fetch('/api/notifications?push=1', { credentials: 'same-origin' })
        if (res.ok) items = (await res.json()).notifications || []
      } catch {
        /* offline or signed out: the plain notice below */
      }
      if (!items.length) {
        const fr = !String(self.navigator.language || 'fr').toLowerCase().startsWith('en')
        items = [{ id: 'news', title: 'Viens jouer', body: fr ? 'Il y a du nouveau.' : 'There is news.', url: '/rencontres' }]
      }
      await Promise.all(
        items.map((n) =>
          self.registration.showNotification(n.title, { body: n.body || '', tag: n.id, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: n.url || '/rencontres' } }),
        ),
      )
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/rencontres'
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        if ('focus' in w) {
          await w.focus()
          if ('navigate' in w) await w.navigate(url).catch(() => {})
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
