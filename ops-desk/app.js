'use strict';
/* Ops Desk: exchanges, returns and escalations. Static page + Supabase (see supabase/schema.sql). */
const CFG = window.OPS_CONFIG;
const REMIND_MIN = 30;
const OPEN = ['assigned', 'in_progress', 'waiting'];
const STATUS = { new: 'New', assigned: 'Assigned', in_progress: 'In progress', waiting: 'Waiting', resolved: 'Resolved', closed: 'Closed' };
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ms = (t) => new Date(t).getTime();
const ago = (t) => { const m = Math.floor((Date.now() - ms(t)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
const idleMin = (c) => Math.floor((Date.now() - ms(c.last_activity_at)) / 60000);
const isOpen = (c) => c.assignee && OPEN.includes(c.status);
const overdue = (c) => isOpen(c) && idleMin(c) >= REMIND_MIN;

let sb = null;
const state = { me: null, members: [], cases: [], view: 'cases', openCase: null, f: { status: 'open', type: '', who: '', q: '' }, notifs: [], unread: 0, bell: false, push: 'unknown', canInstall: null, channel: null };
const isAdmin = () => state.me?.role === 'admin';
const nameOf = (id) => state.members.find((m) => m.user_id === id)?.name || '—';

function toast(msg) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.append(t); setTimeout(() => t.remove(), 4000);
}
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// ---------- connecting (direct, or through the relay where supabase.co is blocked) ----------
async function reachable(base) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(base.replace(/\/$/, '') + '/auth/v1/health', { headers: { apikey: CFG.SUPABASE_ANON_KEY }, signal: ctl.signal });
    clearTimeout(t); return r.status < 500;
  } catch { return false; }
}
async function connect() {
  let base = CFG.SUPABASE_URL;
  if (CFG.SUPABASE_PROXY_URL && !(await reachable(base)) && (await reachable(CFG.SUPABASE_PROXY_URL))) base = CFG.SUPABASE_PROXY_URL;
  // own storage key: MaxxTempo runs on the same site and keeps its sign-in under the default key
  sb = supabase.createClient(base, CFG.SUPABASE_ANON_KEY, { auth: { storageKey: 'ops-desk-auth', persistSession: true, autoRefreshToken: true } });
}

// ---------- data ----------
async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { state.me = null; return; }
  state.me = must(await sb.from('members').select('*').eq('user_id', session.user.id).maybeSingle()) || { missing: true, email: session.user.email };
}
async function loadMembers() { state.members = must(await sb.from('members').select('*').order('active', { ascending: false }).order('name')); }
async function loadCases() { state.cases = must(await sb.from('cases').select('*').order('created_at', { ascending: false }).limit(1000)); }
async function loadNotifs() {
  state.notifs = must(await sb.from('notifications').select('*').order('id', { ascending: false }).limit(50));
  state.unread = state.notifs.filter((n) => !n.read_at).length;
}
async function refresh() {
  await Promise.all([loadMembers(), loadCases(), loadNotifs()]);
  renderHeader(); renderBanner(); repaint();
}
// redraw what's on screen without touching forms someone may be typing in
function repaint() {
  if (state.openCase || !$('#main')) return;
  if ((state.view === 'cases' || state.view === 'mine') && $('#list')) state.paint();
  else if (state.view === 'overview') renderOverview();
}
function subscribe() {
  state.channel?.unsubscribe();
  let t; const soon = () => { clearTimeout(t); t = setTimeout(() => refresh().catch(() => {}), 300); };
  state.channel = sb.channel('ops')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, (p) => { soon(); if (state.openCase && p.new?.id === state.openCase) renderCase(); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${state.me.user_id}` }, (p) => {
      if (state.push !== 'on' || document.visibilityState === 'visible') toast(p.new.message);
      soon();
    })
    .subscribe();
}

// ---------- screens ----------
function renderSignIn(err = '') {
  $('#app').innerHTML = `<form class="card narrow" id="signin"><div class="brand"><img src="icon-192.png" alt=""><h1>Ops Desk</h1></div>
    <p class="muted">Exchanges, returns and escalations.</p>
    <label for="em">Email</label><input id="em" type="email" autocomplete="username" required>
    <label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required>
    <div class="err">${esc(err)}</div><button class="btn primary wide">Sign in</button>
    <p class="muted small">No account? Ask your admin to add you. Forgot your password? Your admin can set a new one.</p></form>`;
  $('#signin').onsubmit = async (e) => {
    e.preventDefault();
    const b = $('#signin button'); b.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: $('#em').value.trim(), password: $('#pw').value });
    if (error) return renderSignIn(/invalid/i.test(error.message) ? 'Wrong email or password' : error.message);
    start();
  };
}
function renderSetPassword(err = '') {
  $('#app').innerHTML = `<form class="card narrow" id="setpw"><h2>Choose your password</h2>
    <p class="muted">You signed in with a temporary password. Pick your own to continue.</p>
    <label for="p1">New password (8+ characters)</label><input id="p1" type="password" autocomplete="new-password" minlength="8" required>
    <label for="p2">Again</label><input id="p2" type="password" autocomplete="new-password" minlength="8" required>
    <div class="err">${esc(err)}</div><button class="btn primary wide">Save password</button></form>`;
  $('#setpw').onsubmit = async (e) => {
    e.preventDefault();
    if ($('#p1').value !== $('#p2').value) return renderSetPassword("The two passwords don't match");
    const { error } = await sb.auth.updateUser({ password: $('#p1').value });
    if (error) return renderSetPassword(error.message);
    await sb.rpc('password_changed'); start();
  };
}
function renderBlocked() {
  $('#app').innerHTML = `<div class="card narrow"><h2>No access</h2><p>${esc(state.me.email || 'This account')} isn't an active Ops Desk member. Ask your admin.</p><button class="btn" id="out">Sign out</button></div>`;
  $('#out').onclick = signOut;
}

function render() {
  $('#app').innerHTML = `<header id="hdr"></header><div id="banner"></div><main id="main"></main>`;
  renderHeader(); renderBanner(); renderView();
}
function renderHeader() {
  const h = $('#hdr'); if (!h) return;
  const tab = (v, l) => `<button data-v="${v}" class="${state.view === v && !state.openCase ? 'on' : ''}">${l}</button>`;
  const mine = state.cases.filter((c) => c.assignee === state.me.user_id && isOpen(c)).length;
  h.innerHTML = `<div class="brand"><img src="icon-192.png" alt=""><b>Ops Desk</b></div>
    <nav>${tab('cases', 'Cases')}${tab('mine', `My queue${mine ? ` <span class="count">${mine}</span>` : ''}`)}${isAdmin() ? tab('overview', 'Overview') + tab('team', 'Team') : ''}</nav>
    <div class="tools"><button class="btn primary" id="new">+ New</button>
    <button class="btn bell" id="bell" aria-label="Notifications">🔔${state.unread ? `<span class="n">${state.unread}</span>` : ''}</button>
    <button class="btn ghost" id="out" title="Sign out">${esc(state.me.name)} ⎋</button></div>`;
  h.querySelectorAll('nav button').forEach((b) => b.onclick = () => go(b.dataset.v));
  $('#new').onclick = () => go('new');
  $('#bell').onclick = () => { state.bell = !state.bell; renderBell(); };
  $('#out').onclick = signOut;
  renderBell();
}
function go(view, caseId = null) { state.view = view; state.openCase = caseId; state.bell = false; render(); window.scrollTo(0, 0); }
function renderBell() {
  $('.pop')?.remove();
  if (!state.bell) return;
  const el = document.createElement('div'); el.className = 'card pop';
  el.innerHTML = `<div class="row between"><b>Notifications</b><button class="btn small" id="allread">Mark all read</button></div>` +
    (state.notifs.length ? state.notifs.map((n) => `<button class="notif ${n.read_at ? '' : 'unread'}" data-id="${n.id}" data-case="${n.case_id || ''}">${esc(n.message)}<small>${ago(n.created_at)}</small></button>`).join('') : '<p class="muted">Nothing yet.</p>');
  document.body.append(el);
  $('#allread', el).onclick = async () => { await sb.rpc('mark_read', { p_id: null }); await loadNotifs(); renderHeader(); };
  el.querySelectorAll('.notif').forEach((n) => n.onclick = async () => {
    await sb.rpc('mark_read', { p_id: +n.dataset.id }); await loadNotifs();
    if (n.dataset.case) go('cases', +n.dataset.case); else { state.bell = false; renderHeader(); }
  });
}
function renderBanner() {
  const b = $('#banner'); if (!b) return;
  const parts = [];
  const late = state.cases.filter((c) => c.assignee === state.me.user_id && overdue(c));
  if (late.length) parts.push(`<div class="banner warn"><span><b>${late.length} case${late.length > 1 ? 's' : ''} waiting on you</b> for 30+ minutes.</span><button class="btn" id="seemine">Open my queue</button></div>`);
  if (state.push === 'off') parts.push(`<div class="banner"><span>Get reminders on this device, even when Ops Desk is closed.</span><button class="btn primary" id="pushon">Turn on alerts</button></div>`);
  if (state.push === 'denied') parts.push(`<div class="banner"><span>Alerts are blocked for this site. Allow notifications in your browser's site settings to get reminders.</span></div>`);
  if (state.canInstall) parts.push(`<div class="banner"><span>Install Ops Desk as an app on this device.</span><button class="btn" id="install">Install</button></div>`);
  b.innerHTML = parts.join('');
  $('#seemine')?.addEventListener('click', () => go('mine'));
  $('#pushon')?.addEventListener('click', enablePush);
  $('#install')?.addEventListener('click', async () => { const e = state.canInstall; state.canInstall = null; e.prompt(); await e.userChoice; renderBanner(); });
}
function renderView() {
  if (state.openCase) return renderCase();
  ({ cases: renderCases, mine: renderCases, new: renderNew, overview: renderOverview, team: renderTeam }[state.view] || renderCases)();
}

const userOpts = (sel, blank) => (blank ? `<option value="">${blank}</option>` : '') +
  state.members.filter((m) => m.active).map((m) => `<option value="${m.user_id}" ${m.user_id === sel ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
const PRI = { urgent: 0, high: 1, normal: 2, low: 3 };

function caseRow(c) {
  const late = overdue(c);
  return `<button class="case card ${late ? 'late' : ''}" data-id="${c.id}">
    <div class="row between"><span class="type t-${c.type}">${c.type}</span><span class="tags"><span class="tag p-${c.priority}">${c.priority}</span><span class="tag s-${c.status}">${STATUS[c.status]}</span></span></div>
    <div class="title"><span class="num">#${c.id}</span> ${esc(c.order_ref)} · ${esc(c.customer)}</div>
    <div class="sum">${esc(c.summary.slice(0, 140))}</div>
    <div class="meta">${c.assignee ? esc(nameOf(c.assignee)) : '<b class="warn-text">Unassigned</b>'} · opened ${ago(c.created_at)}${late ? ` · <b class="late-text">${c.status === 'assigned' ? 'not started' : 'no update'} ${idleMin(c)} min</b>` : ''}</div></button>`;
}
function renderCases() {
  const mine = state.view === 'mine', f = state.f, m = $('#main');
  m.innerHTML = `<div class="filters">
    <input id="fq" type="search" placeholder="Search order, customer, #number" value="${esc(f.q)}">
    <select id="ftype"><option value="">All types</option>${['exchange', 'return', 'escalation'].map((t) => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}s</option>`).join('')}</select>
    <select id="fstatus"><option value="open" ${f.status === 'open' ? 'selected' : ''}>Open</option><option value="" ${f.status === '' ? 'selected' : ''}>All</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    ${mine ? '' : `<select id="fwho">${userOpts(f.who, 'Anyone')}<option value="none" ${f.who === 'none' ? 'selected' : ''}>Unassigned</option></select>`}
  </div><div id="list" class="list"></div>`;
  const paint = () => {
    const q = f.q.trim().toLowerCase().replace(/^#/, '');
    const rows = state.cases.filter((c) =>
      (!mine || c.assignee === state.me.user_id) &&
      (!f.type || c.type === f.type) &&
      (f.status === 'open' ? !['resolved', 'closed'].includes(c.status) : !f.status || c.status === f.status) &&
      (mine || !f.who || (f.who === 'none' ? !c.assignee : c.assignee === f.who)) &&
      (!q || String(c.id) === q || [c.order_ref, c.customer, c.summary, c.contact].some((s) => s.toLowerCase().includes(q))))
      .sort((a, b) => (overdue(b) - overdue(a)) || (PRI[a.priority] - PRI[b.priority]) || (ms(b.created_at) - ms(a.created_at)));
    $('#list').innerHTML = rows.length ? rows.map(caseRow).join('') :
      `<div class="empty">${state.cases.length ? 'No cases match these filters.' : 'No cases yet. Tap <b>+ New</b> to log the first exchange, return or escalation.'}</div>`;
    $('#list').querySelectorAll('.case').forEach((el) => el.onclick = () => go(state.view, +el.dataset.id));
  };
  state.paint = paint;
  for (const [id, k] of [['fq', 'q'], ['ftype', 'type'], ['fstatus', 'status'], ['fwho', 'who']]) { const el = $('#' + id); if (el) el.oninput = () => { f[k] = el.value; paint(); }; }
  paint();
}

function renderNew() {
  $('#main').innerHTML = `<form class="card" id="nc"><h2>New case</h2>
    <div class="seg" role="radiogroup">${['exchange', 'return', 'escalation'].map((t, i) => `<label><input type="radio" name="type" value="${t}" ${i ? '' : 'checked'}><span class="t-${t}">${t}</span></label>`).join('')}</div>
    <div class="grid2"><div><label for="ref">Order / reference</label><input id="ref" required maxlength="100"></div>
    <div><label for="cust">Customer</label><input id="cust" required maxlength="150"></div>
    <div><label for="contact">Phone or email (optional)</label><input id="contact" maxlength="200"></div>
    <div><label for="pri">Priority</label><select id="pri"><option value="">Default</option><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></div></div>
    <label for="sum">What happened, what's needed</label><textarea id="sum" required maxlength="2000"></textarea>
    ${isAdmin() ? `<label for="asg">Assign to</label><select id="asg">${userOpts('', 'Decide later')}</select>` : ''}
    <div class="err"></div><div class="row"><button class="btn primary">Create case</button><button type="button" class="btn ghost" id="cancel">Cancel</button></div></form>`;
  $('#cancel').onclick = () => go('cases');
  $('#nc').onsubmit = async (e) => {
    e.preventDefault(); const b = $('#nc .primary'); b.disabled = true;
    try {
      const id = must(await sb.rpc('create_case', {
        p_type: $('input[name=type]:checked').value, p_order_ref: $('#ref').value, p_customer: $('#cust').value,
        p_contact: $('#contact').value, p_summary: $('#sum').value, p_priority: $('#pri').value || null, p_assignee: $('#asg')?.value || null,
      }));
      await loadCases(); go('cases', id); toast(`Case #${id} created`);
    } catch (x) { $('#nc .err').textContent = x.message; b.disabled = false; }
  };
}

async function renderCase() {
  const m = $('#main');
  const c = must(await sb.from('cases').select('*').eq('id', state.openCase).maybeSingle());
  if (!c) { m.innerHTML = '<div class="empty">Case not found.</div>'; return; }
  const events = must(await sb.from('case_events').select('*').eq('case_id', c.id).order('id', { ascending: false }));
  const canWork = isAdmin() || c.assignee === state.me.user_id;
  const done = ['resolved', 'closed'].includes(c.status);
  const actions = canWork && c.assignee && !done ? [['in_progress', c.status === 'assigned' ? 'Start' : 'In progress'], ['waiting', 'Waiting on customer'], ['resolved', 'Resolve'], ['closed', 'Close']]
    .filter(([s]) => s !== c.status).map(([s, l]) => `<button class="btn ${s === 'resolved' || (s === 'in_progress' && c.status === 'assigned') ? 'primary' : ''}" data-s="${s}">${l}</button>`).join('') : '';
  m.innerHTML = `<button class="btn ghost" id="back">← Back</button>
    <article class="card detail">
      <div class="row between"><span class="type t-${c.type}">${c.type}</span><span class="tags"><span class="tag p-${c.priority}">${c.priority}</span><span class="tag s-${c.status}">${STATUS[c.status]}</span>${overdue(c) ? `<span class="tag late">${idleMin(c)} min idle</span>` : ''}</span></div>
      <h2><span class="num">#${c.id}</span> ${esc(c.order_ref)}</h2>
      <p><b>${esc(c.customer)}</b>${c.contact ? ` · <span class="sel">${esc(c.contact)}</span>` : ''}</p>
      <p class="pre">${esc(c.summary)}</p>
      <p class="muted small">Opened ${ago(c.created_at)} by ${esc(nameOf(c.created_by))} · ${c.assignee ? 'Assigned to <b>' + esc(nameOf(c.assignee)) + '</b>' : 'Not assigned'}</p>
      ${isAdmin() && !done ? `<div class="row"><select id="asg">${userOpts(c.assignee, 'Pick a teammate…')}</select><button class="btn primary" id="assign">${c.assignee ? 'Reassign' : 'Assign'}</button></div>` : ''}
      ${isAdmin() && done ? `<button class="btn" data-s="in_progress">Reopen</button>` : ''}
    </article>
    <section class="card"><label for="note">${canWork && c.assignee && !done ? 'Update (optional note with a status change)' : 'Comment'}</label><textarea id="note" maxlength="2000"></textarea>
      <div class="row">${actions}<button class="btn" id="post">${canWork && !done ? 'Post update' : 'Comment'}</button></div><div class="err" id="err"></div></section>
    <section class="card"><h3>Timeline</h3>${events.map((e) => `<div class="ev"><small>${esc(nameOf(e.user_id))} · ${ago(e.created_at)}</small><div class="pre">${esc(e.body)}</div></div>`).join('')}</section>`;
  const act = (fn) => async (ev) => {
    ev.target.disabled = true;
    try { await fn(); await loadCases(); await renderCase(); renderHeader(); renderBanner(); }
    catch (x) { $('#err').textContent = x.message; ev.target.disabled = false; }
  };
  $('#back').onclick = () => go(state.view);
  m.querySelectorAll('[data-s]').forEach((b) => b.onclick = act(async () => must(await sb.rpc('set_status', { p_case: c.id, p_status: b.dataset.s, p_note: $('#note').value }))));
  $('#post').onclick = act(async () => must(await sb.rpc('add_note', { p_case: c.id, p_body: $('#note').value })));
  $('#assign') && ($('#assign').onclick = act(async () => { if (!$('#asg').value) throw new Error('Pick a teammate first'); must(await sb.rpc('assign_case', { p_case: c.id, p_assignee: $('#asg').value })); }));
}

function renderOverview() {
  const open = state.cases.filter((c) => !['resolved', 'closed'].includes(c.status));
  const n = (t) => open.filter((c) => c.type === t).length;
  const tiles = [['Unassigned', open.filter((c) => !c.assignee).length, 'warn'], ['Overdue', open.filter(overdue).length, 'late'],
    ['Open exchanges', n('exchange'), ''], ['Open returns', n('return'), ''], ['Open escalations', n('escalation'), '']];
  const people = state.members.filter((m) => m.active).map((m) => {
    const mine = open.filter((c) => c.assignee === m.user_id);
    return { m, open: mine.length, notStarted: mine.filter((c) => c.status === 'assigned').length, late: mine.filter(overdue).length };
  }).sort((a, b) => b.late - a.late || b.open - a.open);
  $('#main').innerHTML = `<div class="tiles">${tiles.map(([l, v, k]) => `<div class="tile ${v && k ? k : ''}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    <section class="card"><h3>Workload</h3><div class="scroll"><table><thead><tr><th>Person</th><th>Open</th><th>Not started</th><th>Overdue (30+ min idle)</th></tr></thead><tbody>
    ${people.map((p) => `<tr><td>${esc(p.m.name)}</td><td>${p.open}</td><td>${p.notStarted}</td><td class="${p.late ? 'late-text' : ''}">${p.late}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function renderTeam() {
  $('#main').innerHTML = `<form class="card" id="add"><h3>Add a teammate</h3>
    <div class="grid2"><div><label for="tn">Name</label><input id="tn" required maxlength="100"></div>
    <div><label for="te">Email</label><input id="te" type="email" required></div>
    <div><label for="tp">Temporary password (8+)</label><input id="tp" required minlength="8" autocomplete="off"></div>
    <div><label for="tr">Role</label><select id="tr"><option value="agent">Agent: works assigned cases</option><option value="admin">Admin: assigns and manages team</option></select></div></div>
    <p class="muted small">Send them the link, their email and this password. They choose their own password when they first sign in.</p>
    <div class="err"></div><button class="btn primary">Add teammate</button></form>
    <section class="card"><h3>Team</h3><div class="scroll"><table><tbody>${state.members.map((m) => `<tr class="${m.active ? '' : 'off'}">
      <td><b>${esc(m.name)}</b><br><small class="muted">${esc(m.email)}</small></td><td>${m.role}${m.active ? '' : ' · disabled'}</td>
      <td class="acts">${m.user_id === state.me.user_id ? '<small class="muted">you</small>' : `
        <button class="btn small" data-act="role" data-id="${m.user_id}" data-v="${m.role === 'admin' ? 'agent' : 'admin'}">Make ${m.role === 'admin' ? 'agent' : 'admin'}</button>
        <button class="btn small" data-act="active" data-id="${m.user_id}" data-v="${!m.active}">${m.active ? 'Disable' : 'Enable'}</button>
        <button class="btn small" data-act="pw" data-id="${m.user_id}">New password</button>`}</td></tr>
      <tr class="pwrow" id="pw-${m.user_id}" hidden><td colspan="3"><div class="row"><input placeholder="Temporary password (8+)" minlength="8"><button class="btn primary small" data-save="${m.user_id}">Set</button></div></td></tr>`).join('')}</tbody></table></div></section>`;
  $('#add').onsubmit = async (e) => {
    e.preventDefault(); const b = $('#add .primary'); b.disabled = true;
    const { data, error } = await sb.functions.invoke('ops', { body: { action: 'add_member', name: $('#tn').value, email: $('#te').value, password: $('#tp').value, role: $('#tr').value } });
    const msg = error ? (await error.context?.json?.().catch(() => null))?.error || error.message : null;
    if (msg || !data?.ok) { $('#add .err').textContent = msg || 'Could not add them'; b.disabled = false; return; }
    toast(`${$('#tn').value} added`); await loadMembers(); renderTeam();
  };
  $('#main').querySelectorAll('[data-act]').forEach((b) => b.onclick = async () => {
    const id = b.dataset.id;
    if (b.dataset.act === 'pw') { $('#pw-' + id).hidden = !$('#pw-' + id).hidden; return; }
    const args = { p_user: id, p_role: b.dataset.act === 'role' ? b.dataset.v : null, p_active: b.dataset.act === 'active' ? b.dataset.v === 'true' : null };
    const { error } = await sb.rpc('update_member', args);
    if (error) return toast(error.message);
    await loadMembers(); renderTeam();
  });
  $('#main').querySelectorAll('[data-save]').forEach((b) => b.onclick = async () => {
    const pw = b.previousElementSibling.value;
    const { data, error } = await sb.functions.invoke('ops', { body: { action: 'reset_password', user_id: b.dataset.save, password: pw } });
    const msg = error ? (await error.context?.json?.().catch(() => null))?.error || error.message : null;
    toast(msg || (data?.ok ? 'Password set. They choose a new one when they sign in.' : 'Could not set it'));
    if (!msg) $('#pw-' + b.dataset.save).hidden = true;
  });
}

// ---------- install + alerts on this device ----------
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function refreshPush() {
  if (!pushSupported()) state.push = 'unsupported';
  else if (Notification.permission === 'denied') state.push = 'denied';
  else {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub && state.me?.user_id) await saveSub(sub); // keep the server's copy current (keys rotate)
    state.push = sub && Notification.permission === 'granted' ? 'on' : 'off';
  }
  renderBanner();
}
async function saveSub(sub) {
  const j = sub.toJSON();
  await sb.from('push_subs').upsert({ endpoint: j.endpoint, user_id: state.me.user_id, p256dh: j.keys.p256dh, auth: j.keys.auth });
}
async function enablePush() {
  try {
    if (await Notification.requestPermission() !== 'granted') return refreshPush();
    const reg = await navigator.serviceWorker.ready;
    const { data, error } = await sb.functions.invoke('ops', { body: { action: 'key' } });
    if (error || !data?.key) throw new Error('the server did not answer');
    const key = Uint8Array.from(atob(data.key.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
    await saveSub(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
    toast('Alerts are on for this device');
  } catch (e) { toast('Could not turn on alerts: ' + e.message); }
  refreshPush();
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.canInstall = e; renderBanner(); });
window.addEventListener('appinstalled', () => { state.canInstall = null; renderBanner(); });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // tapping an alert while Ops Desk is already open
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.caseId && state.me?.active) go('cases', e.data.caseId); });
}

async function signOut() {
  try {
    const sub = pushSupported() && await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) { await sb.from('push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  } catch {}
  state.channel?.unsubscribe();
  await sb.auth.signOut(); state.me = null; renderSignIn();
}

async function start() {
  try {
    await loadMe();
    if (!state.me) return renderSignIn();
    if (state.me.missing || !state.me.active) return renderBlocked();
    if (state.me.must_change_password) return renderSetPassword();
    const m = location.hash.match(/^#case=(\d+)/);
    if (m) { state.openCase = +m[1]; history.replaceState(null, '', location.pathname); }
    await refresh(); render(); subscribe(); refreshPush();
  } catch (e) {
    $('#app').innerHTML = `<div class="card narrow"><h2>Can't reach Ops Desk</h2><p>${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Try again</button></div>`;
  }
}
// overdue badges move with the clock; re-check every minute and when the app comes back to the front
setInterval(() => { if (state.me?.active && $('#main')) { repaint(); renderBanner(); } }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.me?.active) refresh().catch(() => {}); });

connect().then(start);
