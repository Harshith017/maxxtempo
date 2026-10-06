const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub2.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8')); const axe = fs.readFileSync(__dirname+'/axe.min.js','utf8');
(async()=>{ const b=await chromium.launch(); const scheme=process.argv[2]||'light';
  const ctx=await b.newContext({viewport:{width:360,height:780}, colorScheme:scheme, bypassCSP:true}); const p=await ctx.newPage();
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/functions\/v1\//, r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}'}));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2500);
  const pairs = {}; let total=0;
  for (const v of ['today','gym','trends','profile']) { await p.click(`.tab[data-view=${v}]`); await p.waitForTimeout(400); await p.$$eval('details', ds=>ds.forEach(d=>d.open=true)); await p.waitForTimeout(300);
    await p.addScriptTag({content:axe}); const res = await p.evaluate(async()=>{ const r = await axe.run('#main', {runOnly:['color-contrast']}); return r.violations.flatMap(v=>v.nodes.map(n=>{ const d=(n.any[0]||{}).data||{}; return `${d.fgColor} on ${d.bgColor} = ${d.contrastRatio} (need ${d.expectedContrastRatio}) ${n.target.join(' ').slice(-40)}`; })); });
    for (const x of res) { total++; const k=x.split(' = ')[0]; pairs[k]=(pairs[k]||{n:0,ex:x}); pairs[k].n++; } }
  console.log(scheme, 'contrast failures:', total); for (const [k,v] of Object.entries(pairs).sort((a,b)=>b[1].n-a[1].n)) console.log(String(v.n).padStart(4), v.ex);
  await b.close(); })();
