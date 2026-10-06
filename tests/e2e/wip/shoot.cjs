// usage: node shoot.cjs <outdir> <withProfile 0|1> [dark|light]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const [out, withProfile, scheme='dark'] = process.argv.slice(2);
const stub = fs.readFileSync(__dirname + '/stub-supabase.js', 'utf8');
const today = new Date(); const iso = d => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const profile = { name:'Harshith', sex:'male', age:27, birth:'1999-05-01', height_cm:176, weight_kg:74, activity:'moderate', goal:'lose', goal_rate:0.5, maint_source:'auto', eat_back:true, steps_goal:10000, stack:[], sports:{} };
const seed = withProfile==='1' ? [{ collection:'profile', id:'me', data: profile }] : [];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport:{width:390,height:844}, colorScheme:scheme, deviceScaleFactor:1 });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/^https:\/\/(?!cdn\.jsdelivr|fonts)/, r => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body: stub }));
  await p.route(/supabase\.co\/functions/, r => r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, ready:true, usage:{count:3,cap:30} }) }));
  await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(1500);
  const shot = async (name, full=true) => { await p.screenshot({ path:`${out}/${name}.png`, fullPage:full }); console.log('shot', name); };
  if (withProfile!=='1') { await shot('setup-1'); console.log('errors', errs); await b.close(); return; }
  await shot('today-empty');
  const ta = await p.$('#logText');
  if (ta) { await ta.fill('2 roti, 1 katori dal, 200 g curd rice, 500 ml water'); await p.click('[data-action=submitLog], #logBtn, button:has-text("Log")').catch(e=>console.log('no log btn', e.message)); await p.waitForTimeout(800); }
  await shot('today-logged'); await shot('today-viewport', false);
  console.log('log box after logging:', JSON.stringify(await p.$eval('#logText', e=>e.value).catch(()=>null)));
  await p.evaluate(()=>window.scrollTo(0,600)); await p.waitForTimeout(200); await shot('today-scrolled', false); await p.evaluate(()=>window.scrollTo(0,0));
  for (const [v,label] of [['gym','TRAIN'],['coach','COACH'],['trends','TRENDS'],['profile','PROFILE']]) {
    await p.click(`.tab[data-view=${v}]`); await p.waitForTimeout(500); await shot(v);
  }
  console.log('errors', errs); await b.close();
})();
