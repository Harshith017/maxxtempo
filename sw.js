/* MaxxTempo service worker: the app opens offline after the first visit.
   Bump VERSION when shipping changes. */
const VERSION = 'fuel-lift-v66';
const SHELL = ['./', 'index.html', 'boot.js', 'config.js', 'calc.js', 'foods.js', 'exercises.js', 'sports.js', 'label.js', 'restaurants.js', 'wefit.js', 'backend.js', 'app.js', 'manifest.json', 'icon-192.png', 'icon-180.png', 'icon-512.png'];
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL).then(() => c.add(LIB).catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // Never cache the database, sign-in or Claude.
  if (/supabase\.co$/.test(url.hostname) || url.pathname.includes('/functions/')) return;
  const own = url.origin === self.location.origin;
  const cdn = /^(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);
  if (!own && !cdn) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    // The app's own files: network first, so updates (and config.js) apply on
    // the next open; the cache is the offline fallback.
    // Built-in databases are versioned (?v=), so they're served from the cache once fetched.
    if (own && url.pathname.includes('/data/')) {
      const hit = await cache.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res;
    }
    if (own) {
      try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; }
      catch { return (await cache.match(req, { ignoreSearch: true })) || Response.error(); }
    }
    // Pinned libraries and fonts never change: cache first.
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    // Opaque copies can't be integrity-checked, so only fonts are kept that way.
    if (res && (res.ok || (res.type === 'opaque' && req.destination !== 'script'))) cache.put(req, res.clone());
    return res;
  }));
});

// Notifications the person turned on in Settings (sent by supabase/functions/push).
self.addEventListener('push', e => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch { m = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || 'MaxxTempo', {
    body: m.body || '', tag: m.tag || 'maxxtempo', icon: 'icon-192.png', data: { view: m.view || '' },
  }));
});
// Tapping one opens the app (or brings it forward) on the right page.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const view = (e.notification.data && e.notification.data.view) || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => w.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'open', view }); return c.focus(); }
    return self.clients.openWindow('./' + (view ? '?view=' + encodeURIComponent(view) : ''));
  }));
});
