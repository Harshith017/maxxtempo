/* Ops Desk service worker: opens instantly/offline after the first visit, and shows alerts.
   Bump VERSION when shipping changes. */
const VERSION = 'ops-desk-v3';
const SHELL = ['./', 'index.html', 'style.css', 'config.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon.svg'];
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).then(() => c.add(LIB).catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('ops-desk-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const own = url.origin === location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname);
  if (!own && req.url !== LIB) return; // the database and sign-in always go to the network
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    if (!own) return (await cache.match(req)) || fetch(req); // pinned library never changes
    try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; }
    catch { return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./')) || Response.error(); }
  }));
});

self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data.json(); } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Ops Desk', {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png',
    tag: d.caseId ? 'case-' + d.caseId : 'ops-desk', renotify: true, data: { caseId: d.caseId || null },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const caseId = e.notification.data && e.notification.data.caseId;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => c.url.startsWith(self.registration.scope));
    if (w) { w.postMessage({ caseId }); return w.focus(); }
    return self.clients.openWindow('./' + (caseId ? '#case=' + caseId : ''));
  }));
});
