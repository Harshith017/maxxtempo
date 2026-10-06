/* MaxxTempo — backend adapters.
   FL.makeDb: a small document store with the same shape the app used on
   claude.ai (doc().set/delete, collection().get/orderBy/limit/onSnapshot),
   backed by the Supabase `docs` table. Writes land in a local cache first
   (IndexedDB), so the app works offline; a queue syncs them to Supabase and
   realtime pushes changes made on another device.
   FL.makeAI: calls the `claude` edge function. */
(function (root) {
  'use strict';

  /* ---------- tiny IndexedDB key-value ---------- */
  const idb = (() => {
    let dbp = null;
    const open = () => dbp ||= new Promise((res, rej) => {
      const r = indexedDB.open('fuel-lift', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const tx = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction('kv', mode); const st = t.objectStore('kv'); const out = fn(st);
      t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error);
    }));
    return {
      get: k => tx('readonly', st => st.get(k)).catch(() => undefined),
      set: (k, v) => tx('readwrite', st => st.put(v, k)).catch(() => {}),
      del: k => tx('readwrite', st => st.delete(k)).catch(() => {}),
    };
  })();

  const clone = v => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

  /* ---------- merging edits made on two devices ----------
     Each document is saved whole, so a phone and a laptop editing the same day would
     overwrite each other. Instead each pending write remembers the version it started
     from (base). If the server has changed since, the three are merged: whatever only
     one side changed is kept, lists of items (foods, water, sets, sports…) are merged
     item by item, and only a field both sides changed takes this device's version. */
  const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, key) => (o[key] = x[key], o), {}) : x);
  const same = (a, b) => canon(a) === canon(b);
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  // A supplement from the daily stack is one per stack per day, whichever device added it.
  const itemKey = x => isObj(x) ? (x.stack_id ? 'stack:' + x.stack_id : x.id != null ? 'id:' + x.id : 'v:' + canon(x)) : 'v:' + canon(x);
  const keyed = a => Array.isArray(a) && a.every(x => isObj(x) && (x.id != null || x.stack_id));
  function mergeList(b, o, t) {
    const B = new Map((b || []).map(x => [itemKey(x), x])), T = new Map(t.map(x => [itemKey(x), x])), O = new Set(o.map(itemKey));
    const out = [];
    for (const x of o) {
      const k = itemKey(x);
      if (B.has(k) && !T.has(k) && same(x, B.get(k))) continue;          // removed on the other device
      out.push(T.has(k) && B.has(k) ? merge3(B.get(k), x, T.get(k)) : x);
    }
    for (const x of t) { const k = itemKey(x); if (!O.has(k) && !B.has(k)) out.push(x); }   // added on the other device
    return out;
  }
  function merge3(base, ours, theirs) {
    if (theirs === undefined || theirs === null) return ours;
    if (same(ours, theirs)) return ours;
    if (Array.isArray(ours) && Array.isArray(theirs) && keyed(ours.concat(theirs))) return mergeList(Array.isArray(base) ? base : [], ours, theirs);
    if (!isObj(ours) || !isObj(theirs)) return same(theirs, base) ? ours : same(ours, base) ? theirs : ours;
    const b = isObj(base) ? base : {}, out = {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(ours), ...Object.keys(theirs)])) {
      const v = same(ours[k], b[k]) ? theirs[k] : same(theirs[k], b[k]) ? ours[k] : merge3(b[k], ours[k], theirs[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  function makeDb(sb, uid, hooks = {}) {
    const cache = new Map();          // collection -> Map(id -> data)
    const listeners = new Set();
    let pending = [];                 // [{op, c, id, data}]
    let flushing = false, persistT = null, loaded = false, synced = false;
    const KEY = 'cache:' + uid, PKEY = 'pending:' + uid;
    const col = c => { if (!cache.has(c)) cache.set(c, new Map()); return cache.get(c); };
    const status = s => hooks.onStatus && hooks.onStatus(s);

    function persist() {
      clearTimeout(persistT);
      persistT = setTimeout(() => {
        const obj = {}; for (const [c, m] of cache) obj[c] = Object.fromEntries(m);
        idb.set(KEY, obj); idb.set(PKEY, pending);
      }, 400);
    }
    function snapFor(l) {
      const m = col(l.c);
      if (l.id !== undefined) {
        const d = m.get(l.id);
        return { exists: d !== undefined, id: l.id, data: () => clone(d), metadata: { fromCache: !synced } };
      }
      let docs = [...m.entries()].map(([id, d]) => ({ id, d }));
      if (l.order) {
        const [f, dir] = l.order;
        docs.sort((a, b) => { const x = a.d[f], y = b.d[f]; const r = x < y ? -1 : x > y ? 1 : 0; return dir === 'desc' ? -r : r; });
      }
      if (l.lim) docs = docs.slice(0, l.lim);
      return { docs: docs.map(x => ({ id: x.id, data: () => clone(x.d) })), metadata: { fromCache: !synced } };
    }
    const notify = c => { for (const l of listeners) if (!c || l.c === c) { try { l.cb(snapFor(l)); } catch (e) { console.error(e); } } };

    function applyLocal(op, c, id, data) {
      if (op === 'set') col(c).set(id, clone(data)); else col(c).delete(id);
    }
    function queue(op, c, id, data, base) {
      // A doc already waiting keeps the version it started from: that's what the server had.
      const prev = pending.find(p => p.c === c && p.id === id);
      pending = pending.filter(p => p !== prev);
      const entry = { op, c, id, data: op === 'set' ? clone(data) : null };
      if (op === 'set') { entry.b = 1; entry.base = prev ? prev.base : base === undefined ? null : clone(base); if (prev && !prev.b) entry.b = 0; }
      pending.push(entry);
      idb.set(PKEY, pending);   // right away: this is the only copy until it syncs
      persist(); flush();
    }
    async function flush() {
      if (flushing || !pending.length) { if (!pending.length) status(navigator.onLine ? 'synced' : 'offline'); return; }
      if (!navigator.onLine) { status('offline'); return; }
      flushing = true; status('saving');
      try {
        while (pending.length) {
          const p = pending[0];
          let data = p.data;
          if (p.op === 'set' && p.b) {
            // Changed on another device since? Merge rather than overwrite.
            const { data: row, error: e1 } = await sb.from('docs').select('data').match({ user_id: uid, collection: p.c, id: p.id }).maybeSingle();
            if (e1) throw e1;
            if (row && !same(row.data, p.base)) {
              data = merge3(p.base, p.data, row.data);
              if (!same(data, p.data)) { const live = pending.find(x => x.c === p.c && x.id === p.id && x !== p); if (!live) { col(p.c).set(p.id, clone(data)); notify(p.c); } }
            }
          }
          const q = p.op === 'set'
            ? sb.from('docs').upsert({ user_id: uid, collection: p.c, id: p.id, data })
            : sb.from('docs').delete().match({ user_id: uid, collection: p.c, id: p.id });
          const { error } = await q;
          if (error) {
            // Too big or rejected by the database: drop it so the queue can move on.
            if (/docs_size|check constraint|violates/i.test(error.message || '')) { pending = pending.filter(x => x !== p); hooks.onError && hooks.onError('too_large', p); continue; }
            throw error;
          }
          // Remove exactly this write: a newer edit made while it was sending stays queued.
          pending = pending.filter(x => x !== p); idb.set(PKEY, pending); persist();
        }
        status('synced');
      } catch (e) {
        status(navigator.onLine ? 'error' : 'offline');
        setTimeout(flush, 15000);
      } finally { flushing = false; }
    }

    async function pull() {
      const fresh = new Map();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('docs').select('collection,id,data').eq('user_id', uid).order('collection').order('id').range(from, from + 999);
        if (error) throw error;
        for (const r of data) { if (!fresh.has(r.collection)) fresh.set(r.collection, new Map()); fresh.get(r.collection).set(r.id, r.data); }
        if (data.length < 1000) break;
      }
      // Local writes that haven't reached the server yet stay on top.
      for (const p of pending) { if (!fresh.has(p.c)) fresh.set(p.c, new Map()); if (p.op === 'set') fresh.get(p.c).set(p.id, p.data); else fresh.get(p.c).delete(p.id); }
      cache.clear(); for (const [c, m] of fresh) cache.set(c, m);
      synced = true; persist(); notify();
    }

    const api = {
      async start() {
        const saved = await idb.get(KEY); pending = (await idb.get(PKEY)) || [];
        if (saved) for (const c of Object.keys(saved)) cache.set(c, new Map(Object.entries(saved[c])));
        loaded = true; notify();
        try { await pull(); } catch { status('offline'); }
        flush();
        sb.channel('docs-' + uid)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'user_id=eq.' + uid }, pl => {
            const row = pl.new && pl.new.collection ? pl.new : pl.old;
            if (!row || !row.collection || row.user_id !== uid) return;
            if (pending.some(p => p.c === row.collection && p.id === row.id)) return; // our own write is newer
            if (pl.eventType === 'DELETE') col(row.collection).delete(row.id); else col(row.collection).set(row.id, row.data);
            persist(); notify(row.collection);
          }).subscribe();
        // First launch offline: load everything from the server once we're back online.
        addEventListener('online', () => { if (!synced) pull().catch(() => {}); flush(); });
        let hiddenAt = 0;
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) { hiddenAt = Date.now(); return; }
          if (Date.now() - hiddenAt > 120000) pull().catch(() => {});
          flush();
        });
      },
      doc(path) {
        const [c, id] = path.split('/');
        return {
          async set(data) { const base = col(c).get(id); applyLocal('set', c, id, data); notify(c); queue('set', c, id, data, base); },
          async delete() { applyLocal('del', c, id); notify(c); queue('del', c, id); },
          onSnapshot(cb) { const l = { c, id, cb }; listeners.add(l); if (loaded) cb(snapFor(l)); return () => listeners.delete(l); },
        };
      },
      collection(c) {
        const q = { c, order: null, lim: 0 };
        const chain = {
          orderBy(f, dir) { q.order = [f, dir || 'asc']; return chain; },
          limit(n) { q.lim = n; return chain; },
          async get() { return snapFor(q); },
          onSnapshot(cb) { const l = { ...q, cb }; listeners.add(l); if (loaded) cb(snapFor(l)); return () => listeners.delete(l); },
        };
        return chain;
      },
      /* Forget this person's data on this device (sign-out on a shared phone). */
      async forget() { cache.clear(); pending = []; await idb.del(KEY); await idb.del(PKEY); },
      dump() { const obj = {}; for (const [c, m] of cache) obj[c] = Object.fromEntries(m); return clone(obj); },
      pendingCount: () => pending.length,
      flush,
    };
    return api;
  }

  /* ---------- Claude through the edge function ---------- */
  const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); });

  function makeAI(sb, cfg, hooks = {}) {
    const url = cfg.API_URL + '/functions/v1/claude';
    async function call(body, signal) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw { code: 'session_expired' };
      let res;
      try {
        res = await fetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, apikey: cfg.SUPABASE_ANON_KEY }, body: JSON.stringify(body) });
      } catch (e) { throw { code: e && e.name === 'AbortError' ? 'cancelled' : (navigator.onLine ? 'unavailable' : 'offline') }; }
      let out = null; try { out = await res.json(); } catch {}
      if (out && out.usage && hooks.onUsage) hooks.onUsage(out.usage);
      if (!res.ok || !out || !out.ok) throw { code: (out && out.code) || (res.status === 401 ? 'session_expired' : 'unavailable') };
      return out;
    }
    return {
      /* opts: {task, images: Blob[], documents: Blob[] (PDF), signal} */
      async json(prompt, opts = {}) {
        const images = await Promise.all((opts.images || []).map(async b => ({ media_type: b.type || 'image/jpeg', data: await blobToB64(b) })));
        const documents = await Promise.all((opts.documents || []).map(async b => ({ media_type: 'application/pdf', data: await blobToB64(b) })));
        const out = await call({ task: opts.task || 'log', prompt, images, documents }, opts.signal);
        return out.json;
      },
      async usage() { const out = await call({ task: 'usage' }); if (out.ready === false) throw { code: 'server_config' }; return out.usage; },
      async limits() { return { images: { maxCount: 5 }, pdf: true }; },
    };
  }

  root.FL = { makeDb, makeAI, idb, merge3 };
})(this);
