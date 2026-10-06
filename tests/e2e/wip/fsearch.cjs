const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub2.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
(async()=>{ const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/functions\/v1\//, r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30}}'}));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2500);
  await p.click('[data-action=foodSearch]');
  for (const q of ['oats','almonds','milk','banana','chicken breast','egg','rice','peanut butter','paneer','whey','olive oil','dark chocolate']) {
    await p.fill('#fq',''); await p.fill('#fq', q); await p.waitForTimeout(700);
    const r = await p.$$eval('#fres .exrow', xs=>xs.slice(0,3).map(x=>x.textContent.replace(/\s+/g,' ').replace(/ · \d+ kcal\/100 g/,'').trim()));
    console.log(q.padEnd(15), r.join(' | ')); }
  await b.close(); })();
