/* Group food list: foods the AI read for one person are shared as name + per-100 g
   values only, and typing them later logs instantly for everyone without AI. */
const { chromium } = require('playwright'); const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub3.js', 'utf8')
  .replace("from(t){ return t==='shared_foods'", "from(t){ return t==='group_foods' ? q(window.__GROUP__||[]) : t==='shared_foods'");
const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json', 'utf8'));
const out = []; const ok = (n, p, i = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const GROUP = [{ key:'mess-chicken-curry', name:'Mess chicken curry', aliases:['mess curry'], units:{ serving:250 }, verified:false,
  per:{ kcal:150, protein:12, carbs:5, fat:9, fiber:1, sugar:2, added_sugar:0, micros:{} } }];
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport:{ width:390, height:844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); let aiCalls = 0;
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)}; window.__GROUP__=${JSON.stringify(GROUP)}; try{localStorage.setItem('fl:folds','["s-sports"]')}catch{}`);
  await p.route(/functions\/v1\/claude/, r => { const d = JSON.parse(r.request().postData() || '{}'); if (d.task !== 'usage') aiCalls++;
    const res = d.task === 'usage' ? { ok:true, ready:true, usage:{ count:0, cap:30 } } : { ok:true, usage:{ count:1, cap:30 }, json:{ foods:[
      { name:/rajma/.test(d.prompt||'') ? 'Hostel rajma' : 'Amma special sambar', quantity:'1 bowl', grams:200, kcal:180, protein_g:9, carbs_g:24, fat_g:5, sugar_g:3, added_sugar_g:0, confidence:'medium' }],
      exercises:[], activities:[], supplements:[], water_ml:0, notes:'' } };
    r.fulfill({ status:200, contentType:'application/json', headers:{ 'access-control-allow-origin':'*' }, body:JSON.stringify(res) }); });
  await p.route(/functions\/v1\/(?!claude)/, r => r.fulfill({ status:200, contentType:'application/json', headers:{ 'access-control-allow-origin':'*' }, body:'{"ok":true,"passkeys":[],"connected":false}' }));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body:stub }));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html');
    r.fulfill({ status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-[^"]*"/g, '') }); });
  await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(3000);
  const rpcs = fn => p.evaluate(f => window.__rpc.filter(x => x[0] === f), fn);

  // 1. A food someone else's AI read logs instantly, with no AI call.
  await p.fill('#logText', '1 mess chicken curry'); await p.click('[data-action=log]'); await p.waitForTimeout(1200);
  const st1 = (await p.textContent('#main')).replace(/\s+/g, ' ');
  ok('Group food logs without AI', aiCalls === 0 && /Mess chicken curry/.test(st1) && /375 kcal/.test(st1), `ai=${aiCalls}`);

  // 2. One-off share of foods learned before (seed) + new AI-read food is shared: name + per 100 g only.
  await p.fill('#logText', '1 bowl amma special sambar'); await p.click('[data-action=log]'); await p.waitForTimeout(1500);
  const sh = (await rpcs('share_food')).map(x => x[1]); const s = sh.find(a => /amma special sambar/i.test(a.p_name));
  ok('AI-read food is shared', !!s && s.p_per.kcal === 90 && s.p_units.serving === 200, JSON.stringify(s || sh.slice(-1)));
  const leaked = s && Object.keys(s).filter(k => !['p_key','p_name','p_aliases','p_per','p_units','p_verified'].includes(k));
  ok('Nothing about the person or day is sent', s && !leaked.length && !/date|meal|time|grams|user/.test(JSON.stringify(s.p_per)), JSON.stringify(leaked));

  // 3. Turning sharing off stops it.
  await p.click('.tab[data-view=profile]'); await p.waitForTimeout(600);
  const box = p.locator('[data-action=shareFoodsToggle]');
  ok('Switch is shown and on by default', await box.count() === 1 && await box.isChecked());
  await box.uncheck(); await p.waitForTimeout(400); await p.click('.tab[data-view=today]'); await p.waitForTimeout(400);
  const before = (await rpcs('share_food')).length;
  await p.fill('#logText', '1 bowl hostel rajma'); await p.click('[data-action=log]'); await p.waitForTimeout(1500);
  ok('Nothing shared when switched off', (await rpcs('share_food')).length === before && aiCalls === 2, `ai=${aiCalls}`);

  ok('No page errors', !errs.length, errs.join(' | '));
  console.log(out.join('\n')); await b.close();
})();
