const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub4.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
(async()=>{ const b=await chromium.launch(); for (const scheme of ['light','dark']) { const ctx=await b.newContext({viewport:{width:390,height:844}, colorScheme:scheme, deviceScaleFactor:2}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog', d=>d.type()==='prompt'?d.accept('Push day'):d.accept());
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/functions\/v1\//, r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}'}));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2000);
  await p.click('.tab[data-view=trends]'); await p.waitForTimeout(500); await p.click('[data-action=musclePeriod][data-p="30"]'); await p.waitForTimeout(400);
  const el = await p.$('svg.bodymap'); await el.scrollIntoViewIfNeeded(); await el.screenshot({path:__dirname+`/bm-${scheme}.png`});
  const tips = await p.$$eval('svg.bodymap .mus title', xs=>[...new Set(xs.map(x=>x.textContent))]);
  ok(`${scheme}: body map renders with tooltips`, tips.length>=8, tips.join(' | '));
  ok(`${scheme}: no page errors`, !errs.length, errs.join(' | ')); await ctx.close(); }
  console.log(out.join('\n')); await b.close(); })();
