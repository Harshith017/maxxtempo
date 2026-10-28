'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = { new: 'New', assigned: 'Assigned', in_progress: 'In progress', waiting: 'Waiting', resolved: 'Resolved', closed: 'Closed' };
const state = { push: 'unknown', canInstall: null, user: null, view: 'cases', users: [], filters: { status: 'open', type: '', assignee: '', q: '' }, openCase: null, bell: false, notifs: [], unread: 0, seen: 0 };

async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.user) { state.user = null; render(); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function toast(msg) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.append(t); setTimeout(() => t.remove(), 3500);
}
const ago = (ms) => { const m = Math.floor((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
const isAdmin = () => state.user?.role === 'admin';
const userOpts = (sel, blank) => (blank ? `<option value="">${blank}</option>` : '') +
  state.users.filter((u) => u.active).map((u) => `<option value="${u.id}" ${u.id == sel ? 'selected' : ''}>${esc(u.name)}</option>`).join('');

// ---------- notifications (poll; also pop a browser notification for new reminders) ----------
async function pollNotifs() {
  if (!state.user) return;
  try {
    const d = await api('GET', '/api/notifications');
    const fresh = d.items.filter((n) => !n.read_at && n.id > state.seen);
    if (state.seen) fresh.forEach((n) => {
      toast(n.message);
      if (state.push !== 'on' && 'Notification' in window && Notification.permission === 'granted') new Notification('Ops Desk', { body: n.message, tag: 'case-' + n.case_id });
    });
    state.seen = Math.max(state.seen, ...d.items.map((n) => n.id), 0);
    const changed = d.unread !== state.unread;
    state.notifs = d.items; state.unread = d.unread;
    if (changed || fresh.length) { renderHeader(); if (state.view === 'cases' && !state.openCase) loadCases(); }
  } catch {}
}

// ---------- rendering ----------
function render() {
  if (!state.user) return renderLogin();
  $('#app').innerHTML = `<header></header><div id="banner"></div><main></main>`;
  renderHeader(); renderBanner(); renderView();
}
function renderLogin(err = '') {
  $('#app').innerHTML = `<form class="card login"><h2>Ops Desk</h2>
    <label>Email</label><input name="email" type="email" required autofocus style="width:100%">
    <label>Password</label><input name="password" type="password" required style="width:100%">
    <div class="err">${esc(err)}</div><button class="btn primary" style="width:100%">Sign in</button></form>`;
  $('form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await api('POST', '/api/login', { email: f.get('email'), password: f.get('password') }); await boot(); }
    catch (x) { renderLogin(x.message); }
  };
}
function renderHeader() {
  const h = $('header'); if (!h) return;
  const tab = (v, l) => `<button data-v="${v}" class="${state.view === v ? 'on' : ''}">${l}</button>`;
  h.innerHTML = `<h1>Ops Desk</h1><nav>${tab('cases', 'Cases')}${tab('mine', 'My queue')}${isAdmin() ? tab('dash', 'Overview') + tab('team', 'Team') : ''}</nav>
    <button class="btn primary" id="new">+ New case</button>
    <button class="btn bell" id="bell" title="Notifications">🔔${state.unread ? `<span class="n">${state.unread}</span>` : ''}</button>
    <span style="color:var(--mute)">${esc(state.user.name)}</span><button class="btn" id="out">Sign out</button>`;
  h.querySelectorAll('nav button').forEach((b) => b.onclick = () => { state.view = b.dataset.v; state.openCase = null; state.bell = false; render(); });
  $('#new').onclick = () => { state.view = 'new'; state.openCase = null; render(); };
  $('#bell').onclick = () => { state.bell = !state.bell; renderBell(); };
  $('#out').onclick = async () => { await api('POST', '/api/logout'); state.user = null; state.seen = 0; render(); };
  renderBell();
}
function renderBell() {
  $('.pop')?.remove();
  if (!state.bell) return;
  const el = document.createElement('div'); el.className = 'card pop';
  el.innerHTML = `<div class="row" style="justify-content:space-between"><b>Notifications</b><button class="btn" id="all">Mark all read</button></div>` +
    (state.notifs.length ? state.notifs.map((n) => `<div class="notif ${n.read_at ? '' : 'unread'}" data-id="${n.id}" data-case="${n.case_id || ''}">${esc(n.message)}<small>${ago(n.created_at)}</small></div>`).join('') : '<p style="color:var(--mute)">Nothing yet.</p>');
  document.body.append(el);
  $('#all', el).onclick = async () => { await api('POST', '/api/notifications/read', {}); await pollNotifs(); renderBell(); };
  el.querySelectorAll('.notif').forEach((n) => n.onclick = async () => {
    await api('POST', '/api/notifications/read', { id: n.dataset.id }); state.bell = false;
    if (n.dataset.case) { state.view = 'cases'; state.openCase = +n.dataset.case; }
    await pollNotifs(); render();
  });
}
function renderView() {
  const m = $('main');
  if (state.openCase) return renderCase(m);
  ({ cases: renderCases, mine: renderCases, new: renderNew, dash: renderDash, team: renderTeam }[state.view])(m);
}

function caseRow(c) {
  return `<div class="card case" data-id="${c.id}">
    <span class="type">${c.type}</span>
    <div><b>#${c.id} · ${esc(c.order_ref)}</b> — ${esc(c.customer)}<div>${esc(c.summary.slice(0, 120))}</div></div>
    <div><span class="tag ${c.priority}">${c.priority}</span><span class="tag ${c.status}">${STATUS[c.status]}</span>${c.overdue ? `<span class="tag overdue">${c.status === 'assigned' ? 'not started' : 'no update'} ${c.idle_minutes} min</span>` : ''}</div>
    <div class="meta">${c.assignee_name ? 'Assigned to ' + esc(c.assignee_name) : '<b style="color:var(--amber)">Unassigned</b>'} · opened ${ago(c.created_at)} by ${esc(c.created_by_name)}</div></div>`;
}
async function renderCases(m) {
  const mine = state.view === 'mine', f = state.filters;
  m.innerHTML = `<div class="filters">
    <input id="q" placeholder="Search order, customer, #id" value="${esc(f.q)}">
    <select id="type"><option value="">All types</option>${['exchange', 'return', 'escalation'].map((t) => `<option ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <select id="status"><option value="open" ${f.status === 'open' ? 'selected' : ''}>Open</option><option value="">All</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    ${mine ? '' : `<select id="assignee">${userOpts(f.assignee, 'Anyone')}<option value="none" ${f.assignee === 'none' ? 'selected' : ''}>Unassigned</option></select>`}
  </div><div id="list"></div>`;
  for (const k of ['q', 'type', 'status', 'assignee']) { const el = $('#' + k, m); if (el) el.oninput = () => { f[k] = el.value; clearTimeout(renderCases.t); renderCases.t = setTimeout(loadCases, 200); }; }
  loadCases();
}
async function loadCases() {
  const list = $('#list'); if (!list) return;
  const f = state.filters, p = new URLSearchParams();
  if (f.q) p.set('q', f.q); if (f.type) p.set('type', f.type); if (f.status) p.set('status', f.status);
  if (state.view === 'mine') p.set('assignee', state.user.id); else if (f.assignee) p.set('assignee', f.assignee);
  try {
    const cases = await api('GET', '/api/cases?' + p);
    list.innerHTML = cases.length ? cases.map(caseRow).join('') : '<p style="color:var(--mute)">No cases match.</p>';
    list.querySelectorAll('.case').forEach((c) => c.onclick = () => { state.openCase = +c.dataset.id; renderView(); });
  } catch (e) { list.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

function renderNew(m) {
  m.innerHTML = `<form class="card"><h2>New case</h2>
    <div class="row"><div><label>Type</label><select name="type"><option>exchange</option><option>return</option><option>escalation</option></select></div>
    <div><label>Priority</label><select name="priority"><option>low</option><option selected>normal</option><option>high</option><option>urgent</option></select></div>
    ${isAdmin() ? `<div><label>Assign to</label><select name="assignee_id">${userOpts('', 'Decide later')}</select></div>` : ''}</div>
    <label>Order / reference</label><input name="order_ref" required><label>Customer</label><input name="customer" required>
    <label>Phone / email (optional)</label><input name="contact"><label>What happened / what's needed</label><textarea name="summary" required></textarea>
    <div class="err"></div><button class="btn primary">Create case</button></form>`;
  $('form').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target)); if (!body.assignee_id) delete body.assignee_id;
    try { const c = await api('POST', '/api/cases', body); state.view = 'cases'; state.openCase = c.id; render(); }
    catch (x) { $('.err').textContent = x.message; }
  };
}

async function renderCase(m) {
  let c; try { c = await api('GET', '/api/cases/' + state.openCase); } catch (e) { m.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  const canWork = isAdmin() || c.assignee_id === state.user.id;
  const nextBtns = canWork ? [['in_progress', c.status === 'assigned' ? 'Start' : 'In progress'], ['waiting', 'Waiting on customer'], ['resolved', 'Resolve'], ['closed', 'Close']]
    .filter(([s]) => s !== c.status && c.assignee_id).map(([s, l]) => `<button class="btn ${s === 'resolved' ? 'primary' : ''}" data-s="${s}">${l}</button>`).join('') : '';
  m.innerHTML = `<button class="btn" id="back">← Back</button>
    <div class="card" style="margin-top:12px"><div class="row" style="justify-content:space-between"><h2 style="margin:0"><span class="type">${c.type}</span> #${c.id} · ${esc(c.order_ref)}</h2>
      <div><span class="tag ${c.priority}">${c.priority}</span><span class="tag ${c.status}">${STATUS[c.status]}</span>${c.overdue ? `<span class="tag overdue">${c.idle_minutes} min idle</span>` : ''}</div></div>
      <p><b>${esc(c.customer)}</b> ${c.contact ? '· ' + esc(c.contact) : ''}</p><p style="white-space:pre-wrap">${esc(c.summary)}</p>
      <p style="color:var(--mute)">Opened ${ago(c.created_at)} by ${esc(c.created_by_name)} · Assigned to ${c.assignee_name ? esc(c.assignee_name) : 'nobody'}</p>
      ${isAdmin() && !['resolved', 'closed'].includes(c.status) ? `<div class="row"><select id="asg">${userOpts(c.assignee_id, 'Pick assignee…')}</select><button class="btn primary" id="assign">${c.assignee_id ? 'Reassign' : 'Assign'}</button></div>` : ''}
      ${isAdmin() && ['resolved', 'closed'].includes(c.status) ? `<button class="btn" data-s="in_progress">Reopen</button>` : ''}
    </div>
    ${canWork && c.assignee_id && !['resolved', 'closed'].includes(c.status) ? `<div class="card"><label>Update (optional note with a status change)</label><textarea id="note"></textarea><div class="row">${nextBtns}<button class="btn" id="post">Post update only</button></div><div class="err" id="err"></div></div>` : `<div class="card"><label>Add a comment</label><textarea id="note"></textarea><button class="btn" id="post">Comment</button><div class="err" id="err"></div></div>`}
    <div class="card"><h3 style="margin-top:0">Timeline</h3>${c.events.slice().reverse().map((e) => `<div class="ev"><small>${esc(e.user_name || 'system')} · ${ago(e.created_at)}</small><div style="white-space:pre-wrap">${esc(e.body)}</div></div>`).join('')}</div>`;
  const act = (fn) => async () => { try { await fn(); await renderCase(m); pollNotifs(); } catch (e) { const er = $('#err'); if (er) er.textContent = e.message; else toast(e.message); } };
  $('#back').onclick = () => { state.openCase = null; render(); };
  m.querySelectorAll('[data-s]').forEach((b) => b.onclick = act(() => api('POST', `/api/cases/${c.id}/status`, { status: b.dataset.s, note: $('#note')?.value || '' })));
  $('#post') && ($('#post').onclick = act(() => api('POST', `/api/cases/${c.id}/notes`, { body: $('#note').value })));
  $('#assign') && ($('#assign').onclick = act(() => api('POST', `/api/cases/${c.id}/assign`, { assignee_id: $('#asg').value })));
}

async function renderDash(m) {
  const s = await api('GET', '/api/stats');
  const n = (t) => s.by_type.find((x) => x.type === t)?.n || 0;
  m.innerHTML = `<div class="grid">${[['Unassigned', s.unassigned], ['Open exchanges', n('exchange')], ['Open returns', n('return')], ['Open escalations', n('escalation')]].map(([l, v]) => `<div class="card stat"><b>${v}</b>${l}</div>`).join('')}</div>
    <div class="card"><h3 style="margin-top:0">Workload</h3><table><tr><th>Person</th><th>Open</th><th>Not started</th><th>Overdue (30+ min idle)</th></tr>
    ${s.per_agent.map((a) => `<tr><td>${esc(a.name)}</td><td>${a.open_cases}</td><td>${a.not_started}</td><td style="${a.overdue ? 'color:var(--red);font-weight:600' : ''}">${a.overdue}</td></tr>`).join('')}</table></div>`;
}

async function renderTeam(m) {
  state.users = await api('GET', '/api/users');
  m.innerHTML = `<form class="card" id="add"><h3 style="margin-top:0">Add teammate</h3><div class="row">
    <input name="name" placeholder="Name" required><input name="email" type="email" placeholder="Email" required>
    <input name="password" type="text" placeholder="Temp password (8+)" required minlength="8"><select name="role"><option>agent</option><option>admin</option></select>
    <button class="btn primary">Add</button></div><div class="err"></div></form>
    <div class="card"><table>${state.users.map((u) => `<tr><td>${esc(u.name)}<br><small style="color:var(--mute)">${esc(u.email)}</small></td><td>${u.role}</td><td>${u.active ? 'Active' : 'Disabled'}</td>
      <td>${u.id === state.user.id ? '' : `<button class="btn" data-id="${u.id}" data-act="${u.active ? 'off' : 'on'}">${u.active ? 'Deactivate' : 'Reactivate'}</button> <button class="btn" data-id="${u.id}" data-act="pw">Reset password</button>`}</td></tr>`).join('')}</table></div>`;
  $('#add').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('POST', '/api/users', Object.fromEntries(new FormData(e.target))); renderTeam(m); } catch (x) { $('.err', m).textContent = x.message; }
  };
  m.querySelectorAll('[data-act]').forEach((b) => b.onclick = async () => {
    const body = b.dataset.act === 'pw' ? { password: prompt('New password (8+ characters):') } : { active: b.dataset.act === 'on' };
    if (b.dataset.act === 'pw' && !body.password) return;
    try { await api('PATCH', '/api/users/' + b.dataset.id, body); renderTeam(m); } catch (x) { toast(x.message); }
  });
}

// ---------- installable app + background push ----------
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function refreshPush() {
  if (!pushSupported()) state.push = 'unsupported';
  else if (Notification.permission === 'denied') state.push = 'denied';
  else {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    state.push = (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
  }
  renderBanner();
}
async function enablePush() {
  try {
    if (await Notification.requestPermission() !== 'granted') return refreshPush();
    const reg = await navigator.serviceWorker.ready;
    const { key } = await api('GET', '/api/push/key');
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)) });
    await api('POST', '/api/push/subscribe', { subscription: sub.toJSON() });
    toast('Alerts are on for this device');
  } catch (e) { toast('Could not enable alerts: ' + e.message); }
  refreshPush();
}
function renderBanner() {
  const b = $('#banner'); if (!b) return;
  const parts = [];
  if (state.push === 'off') parts.push(`<span>Get case reminders on this device, even when the app is closed.</span><button class="btn primary" id="pushon">Turn on alerts</button>`);
  else if (state.push === 'denied') parts.push(`<span>Alerts are blocked. Allow notifications for this site in your browser settings to get reminders.</span>`);
  if (state.canInstall) parts.push(`<span>Install Ops Desk as an app.</span><button class="btn" id="install">Install</button>`);
  b.innerHTML = parts.length ? `<div class="banner">${parts.join('')}</div>` : '';
  $('#pushon')?.addEventListener('click', enablePush);
  $('#install')?.addEventListener('click', async () => { const e = state.canInstall; state.canInstall = null; e.prompt(); await e.userChoice; renderBanner(); });
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.canInstall = e; renderBanner(); });
window.addEventListener('appinstalled', () => { state.canInstall = null; renderBanner(); });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(refreshPush).catch(() => {});
  // tapping a push notification while the app is already open
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.caseId && state.user) { state.view = 'cases'; state.openCase = e.data.caseId; render(); } });
}
const hashCase = () => { const m = location.hash.match(/^#case=(\d+)/); if (m) { state.view = 'cases'; state.openCase = +m[1]; history.replaceState(null, '', location.pathname); } };

async function boot() {
  hashCase();
  try {
    const me = await api('GET', '/api/me'); state.user = me.user; state.unread = me.unread;
    state.users = await api('GET', '/api/users');
  } catch { state.user = null; }
  render(); pollNotifs(); refreshPush();
}
setInterval(pollNotifs, 20000);
boot();
