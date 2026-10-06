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
  await p.click('.tab[data-view=gym]'); await p.waitForTimeout(400); await p.click('[data-action=wkStart]'); await p.waitForTimeout(300);
  for (const q of ['squat','deadlift','bicep curl','lat pulldown']) { await p.click('[data-action=wkAddEx]'); await p.waitForTimeout(300); await p.fill('#xp_q',q); await p.waitForTimeout(350); await p.click('#xp_res .exrow'); await p.waitForTimeout(250); }
  const n = (await p.$$('.wkex')).length; for (let i=0;i<n;i++) { await (await p.$$('[data-wk=weight]'))[i*3].fill('40'); await (await p.$$('[data-wk=reps]'))[i*3].fill('8'); await (await p.$$('.wdone'))[i*3].click(); await p.waitForTimeout(120); }
  await p.click('[data-action=wkFinish]'); await p.waitForTimeout(800); await p.click('#ws_ok'); await p.waitForTimeout(400);
  const cells = (await p.$$('section[aria-label="Gym progress"] .excell')).length; const btn = await p.$('section[aria-label="Gym progress"] [data-action=allEx]');
  ok('5 shown, newest first', cells===5 && /Squat|Deadlift|Curl|Pulldown/i.test(await p.textContent('section[aria-label="Gym progress"] .excell >> nth=0')), String(cells));
  ok('Show all button is the last thing in the panel', !!btn && await p.evaluate(b=>!b.nextElementSibling, btn) && /Show all [67] exercises/.test(await btn.textContent()), btn && await btn.textContent());
  const tot=+((await btn.textContent()).match(/[0-9]+/)[0]); await btn.click(); await p.waitForTimeout(250); ok('Show all expands to every exercise', (await p.$$('section[aria-label="Gym progress"] .excell')).length===tot, String(tot)); { const t=+((await btn.textContent()).match(/\d+/)[0]); await p.waitForTimeout(10); }
  await (await p.$('section[aria-label="Gym progress"]')).screenshot({path:__dirname+'/gp5.png'});
  ok('No page errors', !errs.length, errs.join(' | ')); await b.close(); })();
