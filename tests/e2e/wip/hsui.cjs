const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub2.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const pad=n=>String(n).padStart(2,'0'), d=new Date(), today=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const y=new Date(Date.now()-86400000), yday=`${y.getFullYear()}-${pad(y.getMonth()+1)}-${pad(y.getDate())}`;
const d2=new Date(Date.now()-2*86400000), day2=`${d2.getFullYear()}-${pad(d2.getMonth()+1)}-${pad(d2.getDate())}`;
seed.push({collection:'health', id:today, data:{date:today, steps:8412, active_kcal:513, sleep_min:435, synced_at:new Date().toISOString(), source:'shortcut'}});
seed.push({collection:'health', id:day2, data:{date:day2, steps:12000, synced_at:new Date().toISOString(), source:'shortcut'}});
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://localhost:8765'});
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  let connected=false, calls=[];
  await p.route(/functions\/v1\/health-sync/, async r => { const a=JSON.parse(r.request().postData()||'{}').action; calls.push(a);
    const body = a==='status' ? {ok:true, connected, last_sync_at: connected?new Date().toISOString():null} : a==='create-key' ? (connected=true, {ok:true, key:'mt_'+'k'.repeat(32)}) : a==='revoke' ? (connected=false,{ok:true}) : {ok:false};
    r.fulfill({status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify(body)}); });
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1\/health-sync)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub})); await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'').replace(/connect-src [^;]*/, m=>m)}); });
  p.on('dialog', dlg=>dlg.accept());
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(1500);
  const goals = (await p.textContent('.goals')).replace(/\s+/g,' ');
  ok('Today shows synced steps', /8,412 of/.test(goals), goals.match(/Steps[^A-Z]*/)?.[0]);
  ok('Today shows synced sleep', /7h 15m|7 h 15/.test(goals), goals.match(/Sleep[^·]*/)?.[0]);
  ok('Synced note shown', /Synced from Apple Health at/.test(goals));
  const st = (await p.textContent('.stat3')).replace(/\s+/g,' '); ok('Burned uses Health active energy', /513/.test(st) && /active \(Health\)/.test(st), st);
  // a past day with only synced data, and one where synced overrides typed steps
  await p.click('#menuBtn'); await p.click('#prevDay'); await p.click('#prevDay'); await p.click('#menuClose'); await p.waitForTimeout(200);
  const g2 = (await p.textContent('.goals')).replace(/\s+/g,' '); ok('Synced steps win over typed steps', /12,000 of/.test(g2), g2.match(/Steps[^A-Z]*/)?.[0]);
  ok('Typed sleep kept where nothing synced', /Sleep [0-9]/.test(g2) && !/not logged/.test(g2.match(/Sleep[^·]*/)?.[0]||''), g2.match(/Sleep[^·]*/)?.[0]);
  // settings
  await p.click('.tab[data-view=profile]'); await p.waitForTimeout(200);
  for (const k of ['p-settings','s-connect']) { const el = await p.$(`[data-fold=${k}] > summary`); if (el) { await el.click(); await p.waitForTimeout(150); } }
  let hs = (await p.textContent('.hsync').catch(()=>'')).replace(/\s+/g,' ');
  ok('Settings offers automatic sync', /Set up automatic sync/.test(hs), hs.slice(0,90));
  await p.click('[data-action=hsCreate]'); await p.waitForTimeout(400);
  hs = (await p.textContent('.hsync')).replace(/\s+/g,' ');
  ok('New key shown once, with steps open', /mt_kkkk/.test(hs) && await p.isVisible('.hsteps'), '');
  await p.click('[data-action=hsCopy][data-what=key]'); await p.waitForTimeout(200);
  ok('Copy key works', (await p.evaluate(()=>navigator.clipboard.readText()))==='mt_'+'k'.repeat(32));
  await p.click('[data-action=hsCopy][data-what=address]'); await p.waitForTimeout(200);
  ok('Copy address works', /functions\/v1\/health-sync$/.test(await p.evaluate(()=>navigator.clipboard.readText())));
  await p.screenshot({path:'hs-key.png', fullPage:false}); await p.$eval('.hsync', el=>el.scrollIntoView()); await p.screenshot({path:'hs-key.png'});
  // reload: key hidden, status On
  await p.reload({waitUntil:'load'}); await p.waitForTimeout(1500); await p.click('.tab[data-view=profile]'); await p.waitForTimeout(200);
  hs = (await p.textContent('.hsync')).replace(/\s+/g,' ');
  ok('After reload: On with last sync, key not shown', /On/.test(hs) && /Last sync: today/.test(hs) && !/mt_kkkk/.test(hs), hs.slice(0,120));
  await p.click('[data-action=hsRevoke]'); await p.waitForTimeout(300);
  ok('Turn off works', /Set up automatic sync/.test(await p.textContent('.hsync')));
  ok('No page errors', !errs.length, errs.join(' | ')); console.log('calls', calls.join(','));
  console.log(out.join('\n')); await b.close(); })();
