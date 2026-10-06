const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub2.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
(async()=>{ const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}, bypassCSP:true})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/functions\/v1\/claude/, r => { const d=JSON.parse(r.request().postData()||'{}');
    const entry=(d.prompt||'').split('Entry: """')[1]||''; const res = d.task==='usage' ? {ok:true,ready:true,usage:{count:0,cap:30}} : {ok:true, json:{foods:[...(/chai/.test(entry)?[{name:'Masala chai',quantity:'1 cup',grams:150,kcal:90,protein_g:3,carbs_g:12,fat_g:3,sugar_g:10,added_sugar_g:7,confidence:'medium'}]:[]),{name:'Mango smoothie with dates',quantity:'1 glass',grams:300,kcal:250,protein_g:5,carbs_g:50,fat_g:3,sugar_g:40,added_sugar_g:18,confidence:'medium'}],exercises:[],activities:[],supplements:[],water_ml:0,notes:''}, usage:{count:1,cap:30}};
    r.fulfill({status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify(res)}); });
  await p.route(/functions\/v1\/(?!claude)/, r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true,"passkeys":[],"connected":false}'}));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2000);
  const axe = require('fs').readFileSync(__dirname+'/axe.min.js','utf8');
  for (const v of ['today','gym','trends','profile']) {
    await p.click(`.tab[data-view=${v}]`); await p.waitForTimeout(500);
    await p.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true)); await p.waitForTimeout(200);
    await p.addScriptTag({content:axe});
    const r = await p.evaluate(async()=>{ const x = await axe.run(document, {runOnly:['wcag2a','wcag2aa','best-practice']}); return x.violations.map(v=>`${v.impact} ${v.id} (${v.nodes.length}): ${v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(' ; ')}`); });
    console.log('['+v+']', r.length ? '\n  '+r.join('\n  ') : 'no violations');
  }
  console.log('errors', errs.length); await b.close(); })();
