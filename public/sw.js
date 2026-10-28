// Viens jouer — a pass-through service worker. No cache, no offline shell on purpose: the pages talk to
// the server all day, and a stale shell is worse than a spinner. It only makes the app installable.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
