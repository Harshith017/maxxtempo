'use strict';
// App shell is cached so the app opens instantly/offline; API calls always go to the network.
const CACHE = 'ops-desk-v1';
const SHELL = ['/', '/style.css', '/app.js', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // network first so updates show up; fall back to cache when offline
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});

self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(d.title || 'Ops Desk', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png',
    tag: d.caseId ? 'case-' + d.caseId : undefined, renotify: true, data: { caseId: d.caseId || null },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const caseId = e.notification.data?.caseId;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list[0];
    if (w) { w.postMessage({ caseId }); return w.focus(); }
    return self.clients.openWindow(caseId ? `/#case=${caseId}` : '/');
  }));
});
