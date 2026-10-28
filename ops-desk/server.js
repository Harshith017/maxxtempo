'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { open } = require('./db');
const { notify, runReminders, webhookSender, REMINDER_MS, OPEN } = require('./reminders');

const TYPES = ['exchange', 'return', 'escalation'];
const STATUSES = ['new', 'assigned', 'in_progress', 'waiting', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const SESSION_MS = 7 * 24 * 3600 * 1000;
const PUBLIC = path.join(__dirname, 'public');

// ---------- helpers ----------
const hashPassword = (pw) => {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
};
const checkPassword = (pw, stored) => {
  const [salt, hash] = stored.split(':');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(got, Buffer.from(hash, 'hex'));
};
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (msg, status = 400) => { throw new HttpError(status, msg); };
const str = (v, max, field, required = true) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) bad(`${field} is required`);
  if (s.length > max) bad(`${field} is too long`);
  return s;
};
const oneOf = (v, list, field) => (list.includes(v) ? v : bad(`${field} must be one of ${list.join(', ')}`));

function createApp({ dbFile = path.join(__dirname, 'ops.db'), now = () => Date.now(), webhookUrl = process.env.WEBHOOK_URL } = {}) {
  const db = open(dbFile);
  const send = webhookSender(webhookUrl);
  const q = (sql, ...a) => db.prepare(sql).all(...a);
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);

  // ---------- bootstrap ----------
  function bootstrapAdmin() {
    if (one('SELECT 1 x FROM users')) return null;
    const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    run('INSERT INTO users (name,email,password_hash,role,created_at) VALUES (?,?,?,?,?)',
      'Admin', email, hashPassword(password), 'admin', now());
    return { email, password, generated: !process.env.ADMIN_PASSWORD };
  }

  // ---------- data access ----------
  const publicUser = (u) => u && { id: u.id, name: u.name, email: u.email, role: u.role, active: !!u.active };
  const CASE_SQL = `SELECT c.*, a.name AS assignee_name, cb.name AS created_by_name
    FROM cases c LEFT JOIN users a ON a.id = c.assignee_id JOIN users cb ON cb.id = c.created_by`;
  const decorate = (c) => {
    const t = now();
    const open = c.assignee_id && OPEN.includes(c.status);
    return {
      ...c,
      // minutes since the assignee last did anything; the UI flags cases past the reminder window
      idle_minutes: open ? Math.floor((t - c.last_activity_at) / 60000) : null,
      overdue: !!open && t - c.last_activity_at >= REMINDER_MS,
    };
  };
  const addEvent = (caseId, userId, kind, body = '') =>
    run('INSERT INTO events (case_id,user_id,kind,body,created_at) VALUES (?,?,?,?,?)', caseId, userId, kind, body, now());

  function getCase(id) {
    const c = one(`${CASE_SQL} WHERE c.id = ?`, id);
    return c || bad('Case not found', 404);
  }
  function canWork(user, c) { return user.role === 'admin' || c.assignee_id === user.id; }

  // ---------- routes ----------
  const routes = [];
  const route = (method, pattern, opts, fn) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ method, re, keys, ...opts, fn });
  };

  route('POST', '/api/login', { public: true }, ({ body, res, ip }) => {
    const hit = (loginAttempts.get(ip) || []).filter((t) => now() - t < 15 * 60000);
    if (hit.length >= 10) bad('Too many attempts, try again in a few minutes', 429);
    const u = one('SELECT * FROM users WHERE email = ? AND active = 1', str(body.email, 200, 'email').toLowerCase());
    if (!u || !checkPassword(str(body.password, 200, 'password'), u.password_hash)) {
      loginAttempts.set(ip, [...hit, now()]);
      bad('Wrong email or password', 401);
    }
    const token = crypto.randomBytes(32).toString('base64url');
    run('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)', token, u.id, now() + SESSION_MS);
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}`);
    return { user: publicUser(u) };
  });
  const loginAttempts = new Map();

  route('POST', '/api/logout', {}, ({ req, res }) => {
    run('DELETE FROM sessions WHERE token = ?', cookie(req, 'sid'));
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return { ok: true };
  });

  route('GET', '/api/me', {}, ({ user }) => ({
    user: publicUser(user), reminder_minutes: REMINDER_MS / 60000,
    unread: one('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL', user.id).n,
  }));

  // users
  route('GET', '/api/users', {}, ({ user }) =>
    q('SELECT * FROM users ORDER BY active DESC, name').filter((u) => user.role === 'admin' || u.active).map(publicUser));
  route('POST', '/api/users', { admin: true }, ({ body }) => {
    const email = str(body.email, 200, 'email').toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) bad('email looks wrong');
    const pw = str(body.password, 200, 'password');
    if (pw.length < 8) bad('password must be at least 8 characters');
    if (one('SELECT 1 x FROM users WHERE email = ?', email)) bad('That email already has an account', 409);
    const r = run('INSERT INTO users (name,email,password_hash,role,created_at) VALUES (?,?,?,?,?)',
      str(body.name, 100, 'name'), email, hashPassword(pw), oneOf(body.role || 'agent', ['admin', 'agent'], 'role'), now());
    return publicUser(one('SELECT * FROM users WHERE id = ?', r.lastInsertRowid));
  });
  route('PATCH', '/api/users/:id', { admin: true }, ({ params, body, user }) => {
    const u = one('SELECT * FROM users WHERE id = ?', params.id) || bad('User not found', 404);
    if (u.id === user.id && (body.active === false || (body.role && body.role !== 'admin')))
      bad("You can't deactivate or demote yourself");
    if (body.role) run('UPDATE users SET role = ? WHERE id = ?', oneOf(body.role, ['admin', 'agent'], 'role'), u.id);
    if (typeof body.active === 'boolean') {
      run('UPDATE users SET active = ? WHERE id = ?', body.active ? 1 : 0, u.id);
      if (!body.active) run('DELETE FROM sessions WHERE user_id = ?', u.id);
    }
    if (body.password) {
      if (String(body.password).length < 8) bad('password must be at least 8 characters');
      run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(String(body.password)), u.id);
      run('DELETE FROM sessions WHERE user_id = ?', u.id);
    }
    return publicUser(one('SELECT * FROM users WHERE id = ?', u.id));
  });

  // cases
  route('GET', '/api/cases', {}, ({ query }) => {
    const where = [], args = [];
    if (query.type) { where.push('c.type = ?'); args.push(oneOf(query.type, TYPES, 'type')); }
    if (query.status === 'open') where.push("c.status NOT IN ('resolved','closed')");
    else if (query.status) { where.push('c.status = ?'); args.push(oneOf(query.status, STATUSES, 'status')); }
    if (query.assignee === 'none') where.push('c.assignee_id IS NULL');
    else if (query.assignee) { where.push('c.assignee_id = ?'); args.push(Number(query.assignee)); }
    if (query.q) {
      where.push('(c.order_ref LIKE ? OR c.customer LIKE ? OR c.summary LIKE ? OR CAST(c.id AS TEXT) = ?)');
      const like = `%${query.q}%`; args.push(like, like, like, query.q.replace(/^#/, ''));
    }
    const sql = `${CASE_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY (c.status IN ('resolved','closed')), CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      c.created_at DESC LIMIT 500`;
    return q(sql, ...args).map(decorate);
  });

  route('POST', '/api/cases', {}, ({ body, user }) => {
    const type = oneOf(body.type, TYPES, 'type');
    const t = now();
    let assignee = null;
    if (body.assignee_id) {
      if (user.role !== 'admin') bad('Only admins can assign cases', 403);
      assignee = one('SELECT * FROM users WHERE id = ? AND active = 1', Number(body.assignee_id)) || bad('Assignee not found');
    }
    const r = run(`INSERT INTO cases (type,order_ref,customer,contact,summary,priority,status,assignee_id,created_by,created_at,updated_at,last_activity_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      type, str(body.order_ref, 100, 'order reference'), str(body.customer, 150, 'customer'),
      str(body.contact, 200, 'contact', false), str(body.summary, 2000, 'summary'),
      oneOf(body.priority || (type === 'escalation' ? 'high' : 'normal'), PRIORITIES, 'priority'),
      assignee ? 'assigned' : 'new', assignee?.id ?? null, user.id, t, t, t);
    const id = Number(r.lastInsertRowid);
    addEvent(id, user.id, 'created', `Opened ${type}`);
    if (assignee) {
      addEvent(id, user.id, 'assigned', `Assigned to ${assignee.name}`);
      notify(db, { userId: assignee.id, caseId: id, kind: 'assigned', message: `New ${type} #${id} assigned to you (${body.order_ref}).`, now: t });
    } else if (type === 'escalation') {
      for (const a of q("SELECT id FROM users WHERE role = 'admin' AND active = 1"))
        notify(db, { userId: a.id, caseId: id, kind: 'escalation', message: `New escalation #${id} needs an owner (${body.order_ref}).`, now: t });
    }
    return decorate(getCase(id));
  });

  route('GET', '/api/cases/:id', {}, ({ params }) => {
    const c = getCase(params.id);
    const events = q(`SELECT e.*, u.name AS user_name FROM events e LEFT JOIN users u ON u.id = e.user_id WHERE case_id = ? ORDER BY e.id`, c.id);
    return { ...decorate(c), events };
  });

  route('POST', '/api/cases/:id/assign', { admin: true }, ({ params, body, user }) => {
    const c = getCase(params.id), t = now();
    if (['resolved', 'closed'].includes(c.status)) bad('Reopen the case before reassigning it');
    const a = one('SELECT * FROM users WHERE id = ? AND active = 1', Number(body.assignee_id)) || bad('Assignee not found');
    run(`UPDATE cases SET assignee_id=?, status='assigned', started_at=NULL, updated_at=?, last_activity_at=?, last_reminded_at=NULL WHERE id=?`, a.id, t, t, c.id);
    addEvent(c.id, user.id, 'assigned', `Assigned to ${a.name}`);
    notify(db, { userId: a.id, caseId: c.id, kind: 'assigned', message: `${c.type.toUpperCase()} #${c.id} (${c.order_ref}) assigned to you.`, now: t });
    return decorate(getCase(c.id));
  });

  route('POST', '/api/cases/:id/status', {}, ({ params, body, user }) => {
    const c = getCase(params.id), t = now();
    if (!canWork(user, c)) bad('Only the assignee or an admin can update this case', 403);
    const status = oneOf(body.status, STATUSES, 'status');
    if (['new', 'assigned'].includes(status) && user.role !== 'admin') bad('Only admins can move a case back to new/assigned', 403);
    if (['in_progress', 'waiting', 'resolved'].includes(status) && !c.assignee_id) bad('Assign the case first');
    const note = str(body.note, 2000, 'note', false);
    // Only the assignee's own actions reset the reminder clock; an admin nudging the case doesn't silence it.
    const mine = c.assignee_id === user.id;
    run(`UPDATE cases SET status=?, updated_at=?,
           last_activity_at = CASE WHEN ? THEN ? ELSE last_activity_at END,
           last_reminded_at = CASE WHEN ? THEN NULL ELSE last_reminded_at END,
           started_at = COALESCE(started_at, CASE WHEN ? = 'in_progress' THEN ? END),
           resolved_at = CASE WHEN ? IN ('resolved','closed') THEN ? ELSE NULL END WHERE id=?`,
      status, t, mine ? 1 : 0, t, mine ? 1 : 0, status, t, status, t, c.id);
    addEvent(c.id, user.id, 'status', `${c.status} → ${status}${note ? `: ${note}` : ''}`);
    return decorate(getCase(c.id));
  });

  route('POST', '/api/cases/:id/notes', {}, ({ params, body, user }) => {
    const c = getCase(params.id), t = now();
    const text = str(body.body, 2000, 'note');
    // anyone on the team can comment; only the assignee's notes count as an "update"
    addEvent(c.id, user.id, 'note', text);
    if (c.assignee_id === user.id && OPEN.includes(c.status))
      run('UPDATE cases SET updated_at=?, last_activity_at=?, last_reminded_at=NULL WHERE id=?', t, t, c.id);
    return decorate(getCase(c.id));
  });

  // notifications
  route('GET', '/api/notifications', {}, ({ user }) => ({
    items: q('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', user.id),
    unread: one('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL', user.id).n,
  }));
  route('POST', '/api/notifications/read', {}, ({ user, body }) => {
    if (body.id) run('UPDATE notifications SET read_at=? WHERE id=? AND user_id=? AND read_at IS NULL', now(), Number(body.id), user.id);
    else run('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL', now(), user.id);
    return { ok: true };
  });

  // dashboard
  route('GET', '/api/stats', { admin: true }, () => {
    const t = now();
    const perAgent = q(`SELECT u.id, u.name,
        SUM(c.id IS NOT NULL) AS open_cases,
        SUM(c.status = 'assigned') AS not_started,
        SUM(c.id IS NOT NULL AND ? - c.last_activity_at >= ?) AS overdue
      FROM users u LEFT JOIN cases c ON c.assignee_id = u.id AND c.status IN ('assigned','in_progress','waiting')
      WHERE u.active = 1 GROUP BY u.id ORDER BY overdue DESC, u.name`, t, REMINDER_MS);
    return {
      unassigned: one("SELECT COUNT(*) n FROM cases WHERE assignee_id IS NULL AND status NOT IN ('resolved','closed')").n,
      by_type: q("SELECT type, COUNT(*) n FROM cases WHERE status NOT IN ('resolved','closed') GROUP BY type"),
      per_agent: perAgent,
    };
  });

  // ---------- http plumbing ----------
  function cookie(req, name) {
    const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
    return m ? m.slice(name.length + 1) : null;
  }
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
  const json = (res, status, data) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 100_000) { reject(new HttpError(413, 'Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
  });

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    if (!url.pathname.startsWith('/api/')) {
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = path.resolve(PUBLIC, rel);
      if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); return res.end('Not found');
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      return res.end(fs.readFileSync(file));
    }
    try {
      const r = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!r) throw new HttpError(404, 'Not found');
      const m = url.pathname.match(r.re);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      if (req.method !== 'GET' && !(req.headers['content-type'] || '').startsWith('application/json') && req.headers['content-length'] !== '0' && req.headers['content-length'])
        throw new HttpError(415, 'JSON only');
      let user = null;
      if (!r.public) {
        const s = one('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.active = 1', cookie(req, 'sid') || '', now());
        if (!s) throw new HttpError(401, 'Please sign in');
        user = s;
        if (r.admin && user.role !== 'admin') throw new HttpError(403, 'Admins only');
      }
      const body = req.method === 'GET' ? {} : await readBody(req);
      const out = r.fn({ req, res, user, params, body, query: Object.fromEntries(url.searchParams), ip: req.socket.remoteAddress });
      json(res, 200, out);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      json(res, e.status || 500, { error: e instanceof HttpError ? e.message : 'Something went wrong' });
    }
  }

  const server = http.createServer(handle);
  const tick = () => runReminders(db, now(), { send });
  return { server, db, bootstrapAdmin, tick, close: () => { server.close(); db.close(); } };
}

module.exports = { createApp };

if (require.main === module) {
  const app = createApp();
  const admin = app.bootstrapAdmin();
  if (admin) {
    console.log(`\nFirst run – admin account created:\n  email:    ${admin.email}\n  password: ${admin.password}${admin.generated ? '  (generated, change it under Team)' : ''}\n`);
  }
  const port = Number(process.env.PORT) || 3000;
  app.server.listen(port, () => console.log(`Ops Desk on http://localhost:${port}  (reminders every ${REMINDER_MS / 60000} min)`));
  setInterval(() => { try { app.tick(); } catch (e) { console.error('reminder run failed', e); } }, 60 * 1000).unref?.();
  app.tick();
}
