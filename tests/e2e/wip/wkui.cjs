const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub3.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog', d=>d.type()==='prompt'?d.accept('Push day'):d.accept());
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/functions\/v1\//, r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}'}));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2000);
  await p.click('.tab[data-view=gym]'); await p.waitForTimeout(400);
  ok('Start button on Train', await p.isVisible('[data-action=wkStart]'));
  await p.click('[data-action=wkStart]'); await p.waitForTimeout(400);
  ok('Live workout shows', await p.isVisible('.wklive') && /0:0\d/.test(await p.textContent('#wkClock')));
  await p.click('[data-action=wkAddEx]'); await p.waitForTimeout(300); await p.fill('#xp_q','bench'); await p.waitForTimeout(300);
  const first = await p.textContent('#xp_res .exrow'); await p.click('#xp_res .exrow'); await p.waitForTimeout(400);
  ok('Exercise added with sets and Previous', (await p.$$('.wkex')).length===1 && (await p.$$('.wdone')).length>=3, first.trim());
  const prev = await p.textContent('.wprev'); ok('Previous shows last time', /×|reps/.test(prev), prev);
  ok('Plates button on a barbell lift', await p.isVisible('[data-action=wkPlates]'));
  await p.click('[data-action=wkWarmup]'); await p.waitForTimeout(300);
  const types = await p.$$eval('.wtype', xs=>xs.map(x=>x.textContent.trim())); ok('Warm-up sets added (W)', types.filter(t=>t==='W').length>=1, types.join(','));
  // tick first working set using placeholders
  const wi = types.findIndex(t=>t!=='W'); const dones = await p.$$('.wdone'); await dones[wi].click(); await p.waitForTimeout(300); await (await p.$$('.wdone'))[0].click(); await p.waitForTimeout(300);
  ok('Set ticked with last time numbers', (await p.$$('.wdone.on')).length===2);
  ok('Rest timer starts', await p.isVisible('#restbar'));
  // set type cycle + RPE + heavier set → PR
  const w2 = (await p.$$('[data-wk=weight]'))[wi+1]; await w2.fill('200'); const r2 = (await p.$$('[data-wk=reps]'))[wi+1]; await r2.fill('3');
  await (await p.$$('.wrpe'))[wi+1].selectOption('9');
  await (await p.$$('.wdone'))[wi+1].click(); await p.waitForTimeout(300);
  ok('Live PR', (await p.$$('.wdone.pr')).length===1 && /personal record/.test(await p.textContent('#toast')), await p.textContent('#toast'));
  await (await p.$$('.wtype'))[wi+2].click(); await p.waitForTimeout(200);
  ok('Set type cycles to W', (await (await p.$$('.wtype'))[wi+2].textContent()).trim()==='W');
  // second exercise + superset
  await p.click('[data-action=wkAddEx]'); await p.waitForTimeout(300); await p.fill('#xp_q','lateral raise'); await p.waitForTimeout(300); await p.click('#xp_res .exrow'); await p.waitForTimeout(300);
  await (await p.$$('[data-action=wkSuperset]'))[0].click(); await p.waitForTimeout(200);
  ok('Superset label', /Superset A/.test(await p.textContent('.wklive')));
  // survives reload
  await p.reload(); await p.waitForTimeout(2200); await p.click('.tab[data-view=gym]'); await p.waitForTimeout(400);
  ok('Workout survives reload', (await p.$$('.wkex')).length===2 && (await p.$$('.wdone.on')).length===3);
  // plates dialog
  await p.click('[data-action=wkPlates]'); await p.waitForTimeout(200); await p.fill('#pl_kg','100'); await p.waitForTimeout(100);
  ok('Plate calculator 100 kg = 25 + 15 each side', /Each side:\s*25 \+ 15 kg/.test(await p.textContent('#pl_out')), (await p.textContent('#pl_out')).replace(/\s+/g,' '));
  await p.click('#pl_close');
  // finish
  await p.click('[data-action=wkFinish]'); await p.waitForTimeout(600);
  const sum = (await p.textContent('#dlg')).replace(/\s+/g,' ');
  ok('Summary with PR', /Workout done/.test(sum) && /New personal records/.test(sum), sum.slice(0,200));
  await p.click('#ws_save'); await p.waitForTimeout(400);
  ok('Saved as routine', /Push day/.test(await p.textContent('#main')) && await p.isVisible('[data-action=wkStartRoutine]'));
  const tr = (await p.textContent('section[aria-label="Training on this day"]')).replace(/\s+/g,' ');
  ok('Logged into today’s training with W and RPE', /W /.test(tr) && /@9/.test(tr) && /200 × 3/.test(tr), tr.slice(0,240));
  // start the routine
  await p.click('[data-action=wkStartRoutine]'); await p.waitForTimeout(400);
  ok('Routine starts with its exercises', (await p.$$('.wkex')).length===1 && /Push day/.test(await p.inputValue('.wkname')));
  await p.click('[data-action=wkDiscard]'); await p.waitForTimeout(300);
  // routine editor
  await p.click('[data-action=routineEdit]'); await p.waitForTimeout(300);
  ok('Routine editor opens', await p.isVisible('#rtform'));
  await p.click('#rt_add'); await p.waitForTimeout(300); await p.fill('#xp_q','squat'); await p.waitForTimeout(300); await p.click('#xp_res .exrow'); await p.waitForTimeout(300);
  await p.click('#rtform button[type=submit]'); await p.waitForTimeout(300);
  ok('Routine updated with 2 exercises', /Squat/.test(await p.textContent('.routines')));
  await p.screenshot({path:__dirname+'/wk-start.png'});
  await p.click('[data-action=wkStartRoutine]'); await p.waitForTimeout(400); await p.screenshot({path:__dirname+'/wk-live.png', fullPage:true});
  ok('No page errors', !errs.length, errs.join(' | ')); console.log(out.join('\n')); await b.close(); })();
