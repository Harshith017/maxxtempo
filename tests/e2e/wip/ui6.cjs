const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub2.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const out=[]; const ok=(n,p,i='')=>console.log(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
(async()=>{ const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  const calls=[]; let delay=0;
  await p.route(/functions\/v1\/claude/, async r => { const d=JSON.parse(r.request().postData()||'{}'); calls.push(d.task);
    if (d.task==='usage') return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,ready:true,usage:{count:0,cap:30}})});
    if (delay) await new Promise(z=>setTimeout(z,delay));
    if (d.task==='log') { const entry=(d.prompt||'').split('Entry: """')[1]||'';
      return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,json:{foods:[],exercises:[],activities:/kabaddi/i.test(entry)?[{sport:'Kabaddi',entry:'kabaddi 1 hour'}]:[],supplements:[],water_ml:0,notes:''},usage:{count:1,cap:30}})}); }
    return r.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:false,code:'busy'})}); });
  await p.route(/functions\/v1\/(?!claude)/, r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true,"passkeys":[],"connected":false}'}));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2000);
  const main = async()=> (await p.textContent('#main')).replace(/\s+/g,' ');
  const hide = async k => { await p.click(`[data-action=toggleHide][data-key=${k}]`); await p.waitForTimeout(250); };
  // 4. food suggestions on Today
  const term = 'chic';
  await p.click('#logText'); await p.type('#logText', '2 ' + term, {delay:20}); await p.waitForTimeout(300);
  const sug = await p.$$eval('#fsugg .exrow', xs=>xs.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
  ok('Typing shows foods logged before', sug.length>0 && sug.length<=6 && sug.every(s=>s.toLowerCase().includes(term)), `“${term}” → ${sug.slice(0,3).join(' | ')}`);
  const cnt = async () => +(((await p.textContent('[data-fold=d-food] summary')).match(/(\d+) items?/)||[0,0])[1]); const before = await cnt();
  await p.fill('#logText', '1 banana, ' + term); await p.dispatchEvent('#logText','input'); await p.waitForTimeout(250);
  await p.click('#fsugg .exrow >> nth=0'); await p.waitForTimeout(400);
  const after = await cnt();
  ok('Tap adds it straight away and keeps the rest of the text', after===before+1 && (await p.inputValue('#logText'))==='1 banana, ', `${before}→${after} “${await p.inputValue('#logText')}”`);
  ok('Suggestions hide when nothing is being typed', await p.evaluate(()=>document.querySelector('#fsugg').hidden));
  await p.fill('#logText','zzqx'); await p.dispatchEvent('#logText','input'); await p.waitForTimeout(150);
  ok('No match, no list', await p.evaluate(()=>document.querySelector('#fsugg').hidden)); await p.fill('#logText','');
  // 6. vitamins on Today, with hide
  ok('Vitamins & minerals at the bottom of Today', /Vitamins & minerals/.test(await main()) && (await p.$$('section[aria-label="Vitamins and minerals"] .fr')).length>=10);
  await hide('mic'); ok('…and it hides', !(await p.$('section[aria-label="Vitamins and minerals"] .fr'))); await hide('mic');
  ok('Small hints gone on Today', !/tap a glass|aim 7 h|Add steps and sleep by typing|days you untick/.test(await main()));
  // Train
  await p.click('.tab[data-view=gym]'); await p.waitForTimeout(400);
  const cells = (await p.$$('section[aria-label="Gym progress"] .excell')).length, allBtn = await p.$('section[aria-label="Gym progress"] [data-action=allEx]');
  const total = allBtn ? +((await allBtn.textContent()).match(/\d+/)[0]) : cells;
  ok('Gym progress shows at most 5', cells===Math.min(5,total), `${cells} of ${total}`);
  if (total>5) { const btn = await p.$('section[aria-label="Gym progress"] [data-action=allEx]'); const isLast = await p.evaluate(b=>!b.nextElementSibling, btn);
    ok('“Show all exercises” button at the bottom', !!btn && isLast && /Show all \d+ exercises/.test(await btn.textContent()));
    await btn.click(); await p.waitForTimeout(250); ok('Show all expands', (await p.$$('section[aria-label="Gym progress"] .excell')).length===total); await p.click('[data-action=allEx]'); await p.waitForTimeout(200); }
  await hide('gp'); ok('Gym progress hides', !(await p.$('section[aria-label="Gym progress"] .excell'))); await hide('gp');
  await hide('tt'); ok('Today’s training hides', !(await p.$('[data-action=addSport]'))); await hide('tt');
  ok('Today’s training shows again', !!(await p.$('[data-action=addSport]')));
  ok('Small hints gone on Train', !/Tap an exercise for its full chart|Changes compare|Save your usual sessions|Tap one for how to do it/.test(await main()));
  // Trends
  await p.click('.tab[data-view=trends]'); await p.waitForTimeout(500);
  ok('Vitamins no longer in Trends', !(await p.$('[data-fold=t-micros]')));
  const wk = async () => (await p.$$('section.panel.wk')).length; const n7 = await wk();
  await hide('w7'); ok('Last 7 days hides', n7>=6 && await wk()===0, `${n7} → ${await wk()}`); await hide('w7');
  ok('Small hints gone on Trends', !/Goal: 3\+ workouts|only your name and these weekly|smoothed weight trend/.test(await main()));
  // persists after reload
  await hide('w7'); await p.reload(); await p.waitForTimeout(2200); await p.click('.tab[data-view=trends]'); await p.waitForTimeout(400);
  ok('Hidden stays hidden after reload', await wk()===0); await hide('w7');
  await p.click('.tab[data-view=today]'); await p.waitForTimeout(300); await p.screenshot({path:__dirname+'/today-ui6.png', fullPage:true});
  ok('No page errors', !errs.length, errs.join(' | ')); await b.close(); })();
