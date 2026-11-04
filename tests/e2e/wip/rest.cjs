/* Rest: 1 min between sets, 3 min after the last set of an exercise; both adjustable. */
const { chromium } = require('playwright'); const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub3.js', 'utf8'); const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json', 'utf8'));
const out = []; const ok = (n, p, i = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport:{ width:390, height:844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)}; try{localStorage.setItem('fl:folds','["g-settings"]')}catch{}`);
  await p.route(/functions\/v1\//, r => r.fulfill({ status:200, contentType:'application/json', headers:{ 'access-control-allow-origin':'*' }, body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}' }));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body:stub }));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html');
    r.fulfill({ status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-[^"]*"/g, '') }); });
  await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(2500);
  await p.click('.tab[data-view=gym]'); await p.waitForTimeout(500);
  const set = (await p.textContent('body')).replace(/\s+/g,' ');
  ok('Settings show both rest times', /Rest between sets/.test(set) && /Rest after each exercise/.test(set) && /rest 1:00 min between sets, 3:00 min after each exercise/.test(set));
  await p.click('[data-action=wkStart]'); await p.waitForTimeout(400);
  await p.click('[data-action=wkAddEx]'); await p.waitForTimeout(400);
  await p.fill('#xp_q', 'lat pulldown'); await p.waitForTimeout(800); await p.click('#xp_res [data-i]'); await p.waitForTimeout(400);
  const rest = async () => (await p.textContent('#restbar')).replace(/\s+/g,' ');
  for (const j of [0,1]) { await p.fill(`[data-wk=weight][data-set="${j}"]`, '50'); await p.fill(`[data-wk=reps][data-set="${j}"]`, '10'); await p.click(`[data-action=wkDone][data-set="${j}"]`); await p.waitForTimeout(400); }
  const r1 = await rest(); ok('Between sets: 1:00', /Rest (1:00|0:59)/.test(r1), r1);
  await p.fill('[data-wk=weight][data-set="2"]', '50'); await p.fill('[data-wk=reps][data-set="2"]', '10'); await p.click('[data-action=wkDone][data-set="2"]'); await p.waitForTimeout(400);
  const r2 = await rest(); ok('After the last set: 3:00', /Rest (3:00|2:59)/.test(r2), r2);
  ok('No page errors', !errs.length, errs.join(' | '));
  console.log(out.join('\n')); await b.close();
})();
