/* Gym sets have no RPE column; set type, kg, reps and done still work and save. */
const { chromium } = require('playwright'); const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub3.js', 'utf8'); const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json', 'utf8'));
const out = []; const ok = (n, p, i = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport:{ width:390, height:844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/functions\/v1\//, r => r.fulfill({ status:200, contentType:'application/json', headers:{ 'access-control-allow-origin':'*' }, body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}' }));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body:stub }));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html');
    r.fulfill({ status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-[^"]*"/g, '') }); });
  await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(2500);
  await p.click('.tab[data-view=gym]'); await p.waitForTimeout(500);
  await p.click('[data-action=wkStart]'); await p.waitForTimeout(500);
  await p.click('[data-action=wkAddEx]'); await p.waitForTimeout(500);
  const box = await p.$('#xp_q'); if (box) { await box.fill('incline dumbbell press'); await p.waitForTimeout(800); await p.click('#xp_res [data-i]'); await p.waitForTimeout(500); }
  const head = (await p.textContent('.wkgrid').catch(()=>'')).replace(/\s+/g,' ');
  ok('Set grid has no RPE', /Set.*Prev.*kg.*Reps/.test(head) && !/RPE/i.test(head) && !(await p.$('.wrpe')), head.slice(0,80));
  await p.fill('[data-wk=weight][data-set="0"]', '20'); await p.fill('[data-wk=reps][data-set="0"]', '10');
  await p.click('[data-action=wkDone][data-set="0"]'); await p.waitForTimeout(300);
  await p.screenshot({ path: process.env.SHOT || '/tmp/norpe.png' });
  ok('Set saves with kg and reps', await p.evaluate(() => { const w = JSON.parse(localStorage.getItem('mt:workout')||'null'); const s = w && w.exercises[0].sets[0]; return !!s && s.weight==='20' && s.reps==='10' && s.done && !('rpe' in s); }));
  ok('No page errors', !errs.length, errs.join(' | '));
  console.log(out.join('\n')); await b.close();
})();
