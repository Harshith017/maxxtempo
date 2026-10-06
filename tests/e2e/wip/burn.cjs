const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'); const stub=fs.readFileSync(__dirname+'/stub-supabase.js','utf8'); const seed=JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`); await p.route(/^https:\/\/(?!cdn\.jsdelivr)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(1300);
  const cell = async()=> (await p.textContent('.stat3')).replace(/\s+/g,' ');
  console.log('today:', await cell()); await p.screenshot({path:'burn-today.png', clip:{x:0,y:0,width:390,height:640}});
  for (let i=1;i<=6;i++){ await p.click('#menuBtn'); await p.click('#prevDay'); await p.click('#menuClose'); await p.waitForTimeout(200); console.log(`-${i}d:`, await cell()); }
  await p.click('[data-view=trends]').catch(()=>{}); await p.waitForTimeout(400);
  console.log('errors:', errs.length); await b.close(); })();
