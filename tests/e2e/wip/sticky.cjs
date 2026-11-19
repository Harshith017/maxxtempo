const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub3.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/functions\/v1\//, r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}'}));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2000);
  await p.tap('.tab[data-view=gym]'); await p.waitForTimeout(400); await p.tap('[data-action=wkStart]'); await p.waitForTimeout(300);
  for (const q of ['bench','squat','row']) { await p.tap('[data-action=wkAddEx]'); await p.waitForTimeout(300); await p.fill('#xp_q',q); await p.waitForTimeout(300); await p.tap('#xp_res .exrow'); await p.waitForTimeout(300); }
  await p.evaluate(()=>window.scrollTo(0, 900)); await p.waitForTimeout(400);
  const r = await p.evaluate(()=>{ const t=document.querySelector('.top').getBoundingClientRect(), w=document.querySelector('.wkhead').getBoundingClientRect(); return {topBottom:t.bottom, wkTop:w.top, wkBottom:w.bottom}; });
  console.log(JSON.stringify(r)); await p.screenshot({path:__dirname+'/sticky.png'}); console.log(errs.join('|')); await b.close(); })();
