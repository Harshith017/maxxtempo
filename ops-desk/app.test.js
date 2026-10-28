'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./server');

const MIN = 60000;

async function setup() {
  let t = 1_700_000_000_000;
  const app = createApp({ dbFile: ':memory:', now: () => t });
  process.env.ADMIN_PASSWORD = 'adminpass1';
  app.bootstrapAdmin();
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const client = () => {
    let sid = '';
    return async (method, path, body) => {
      const res = await fetch(base + path, {
        method, headers: { 'content-type': 'application/json', cookie: sid },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) sid = set.split(';')[0];
      return { status: res.status, data: await res.json() };
    };
  };
  return { app, client, advance: (m) => { t += m * MIN; } };
}

test('assign → reminders every 30 min until the assignee acts', async () => {
  const { app, client, advance } = await setup();
  const admin = client(), agent = client();
  await admin('POST', '/api/login', { email: 'admin@example.com', password: 'adminpass1' });
  const u = await admin('POST', '/api/users', { name: 'Asha', email: 'asha@x.com', password: 'password1', role: 'agent' });
  await agent('POST', '/api/login', { email: 'asha@x.com', password: 'password1' });

  const c = (await admin('POST', '/api/cases', { type: 'return', order_ref: 'A1', customer: 'Ravi', summary: 'Damaged', assignee_id: u.data.id })).data;
  assert.equal(c.status, 'assigned');
  assert.equal((await agent('GET', '/api/notifications')).data.unread, 1); // assignment notice

  advance(29); assert.equal(app.tick().length, 0);
  advance(1); assert.equal(app.tick().length, 1);       // 30 min, not started
  advance(29); assert.equal(app.tick().length, 0);
  advance(1); assert.equal(app.tick().length, 1);       // repeats
  assert.equal((await agent('GET', '/api/notifications')).data.unread, 3);

  await agent('POST', `/api/cases/${c.id}/status`, { status: 'in_progress' }); // starting resets the clock
  advance(29); assert.equal(app.tick().length, 0);
  advance(1); assert.equal(app.tick().length, 1);       // now "no update"
  await agent('POST', `/api/cases/${c.id}/notes`, { body: 'Called customer' });
  advance(29); assert.equal(app.tick().length, 0);

  await agent('POST', `/api/cases/${c.id}/status`, { status: 'resolved' });
  advance(120); assert.equal(app.tick().length, 0);      // done → silence
  app.close();
});

test('permissions: only admins assign; only assignee/admin update; admin activity does not silence reminders', async () => {
  const { app, client, advance } = await setup();
  const admin = client(), a = client(), b = client();
  await admin('POST', '/api/login', { email: 'admin@example.com', password: 'adminpass1' });
  const ua = (await admin('POST', '/api/users', { name: 'A', email: 'a@x.com', password: 'password1' })).data;
  await admin('POST', '/api/users', { name: 'B', email: 'b@x.com', password: 'password1' });
  await a('POST', '/api/login', { email: 'a@x.com', password: 'password1' });
  await b('POST', '/api/login', { email: 'b@x.com', password: 'password1' });

  const c = (await b('POST', '/api/cases', { type: 'escalation', order_ref: 'E1', customer: 'X', summary: 's' })).data;
  assert.equal(c.status, 'new');
  assert.equal((await b('POST', `/api/cases/${c.id}/assign`, { assignee_id: ua.id })).status, 403);
  assert.equal((await b('POST', '/api/cases', { type: 'return', order_ref: 'R', customer: 'X', summary: 's', assignee_id: ua.id })).status, 403);
  assert.equal((await admin('GET', '/api/notifications')).data.unread, 1); // escalation needs owner

  await admin('POST', `/api/cases/${c.id}/assign`, { assignee_id: ua.id });
  assert.equal((await b('POST', `/api/cases/${c.id}/status`, { status: 'in_progress' })).status, 403);
  advance(30);
  await admin('POST', `/api/cases/${c.id}/notes`, { body: 'chasing' });
  assert.equal(app.tick().length, 1);
  assert.equal((await a('GET', '/api/users')).status, 200);
  assert.equal((await a('GET', '/api/stats')).status, 403);
  assert.equal((await client()('GET', '/api/cases')).status, 401);
  app.close();
});

test('deactivated users stop getting reminders and lose their session', async () => {
  const { app, client, advance } = await setup();
  const admin = client(), a = client();
  await admin('POST', '/api/login', { email: 'admin@example.com', password: 'adminpass1' });
  const ua = (await admin('POST', '/api/users', { name: 'A', email: 'a@x.com', password: 'password1' })).data;
  await a('POST', '/api/login', { email: 'a@x.com', password: 'password1' });
  await admin('POST', '/api/cases', { type: 'exchange', order_ref: 'X', customer: 'C', summary: 's', assignee_id: ua.id });
  await admin('PATCH', `/api/users/${ua.id}`, { active: false });
  advance(60); assert.equal(app.tick().length, 0);
  assert.equal((await a('GET', '/api/me')).status, 401);
  const s = (await admin('GET', '/api/stats')).data;
  assert.equal(s.unassigned, 0);
  app.close();
});
