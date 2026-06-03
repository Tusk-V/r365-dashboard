// Minimal service worker: presence makes the app installable. No caching, so
// it never serves stale assets — the network is always used.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* passthrough: no respondWith => default network */ });
