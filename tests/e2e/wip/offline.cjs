const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
let stub = fs.readFileSync(__dirname+'/stub2.js','utf8').replace("maybeSingle(){ return Promise.resolve({data: one, error:null}); }", "maybeSingle(){ return window.__OFFLINE ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve({data: one, error:null}); }");
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext(); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(`window.__SEED__=[{"collection":"profile","id":"me","data":{"name":"H"}}]; window.__OFFLINE = localStorage.getItem('offlinetest')==='1';`);
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)/, r=>r.abort()); await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(1200); console.log('online first:', /Log food/.test(await p.textContent('#main')));
  await p.evaluate(()=>localStorage.setItem('offlinetest','1')); await p.reload(); await p.waitForTimeout(1200);
  console.log('then offline, cached approval opens the app:', /Log food/.test(await p.textContent('#main')), errs); await b.close(); })();
