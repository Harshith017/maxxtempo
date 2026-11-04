/* Finish tapped long after the last set: the workout is timed to the last ticked set. */
const { chromium } = require('playwright'); const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub3.js', 'utf8'); const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json', 'utf8'));
const out = []; const ok = (n, p, i = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport:{ width:390, height:844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.clock.install();
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/functions\/v1\//, r => r.fulfill({ status:200, contentType:'application/json', headers:{ 'access-control-allow-origin':'*' }, body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}' }));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body:stub }));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html');
    r.fulfill({ status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-[^"]*"/g, '') }); });
  await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.clock.runFor(3000);
  await p.click('.tab[data-view=gym]'); await p.clock.runFor(500);
  await p.click('[data-action=wkStart]'); await p.clock.runFor(500);
  await p.click('[data-action=wkAddEx]'); await p.clock.runFor(500);
  await p.fill('#xp_q', 'lat pulldown'); await p.clock.runFor(1000); await p.click('#xp_res [data-i]'); await p.clock.runFor(500);
  for (const j of [0,1,2]) { await p.clock.runFor(10*60000); await p.fill(`[data-wk=weight][data-set="${j}"]`, '50'); await p.fill(`[data-wk=reps][data-set="${j}"]`, '10'); await p.click(`[data-action=wkDone][data-set="${j}"]`); await p.clock.runFor(300); }
  await p.clock.runFor(90*60000);           // forgot to tap Finish for 1.5 h
  await p.click('[data-action=wkFinish]'); await p.clock.runFor(1500);
  const t = (await p.textContent('#dlg')).replace(/\s+/g,' ');
  ok('Workout timed to the last set (~31 min, not ~2 h)', /Time ?3[01] min/.test(t) && /Timed to your last set/.test(t), t.slice(0,200));
  ok('No page errors', !errs.length, errs.join(' | '));
  console.log(out.join('\n')); await b.close();
})();
