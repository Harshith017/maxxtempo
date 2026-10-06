const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub2.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
(async()=>{ const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}, ignoreHTTPSErrors:true})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.context().route(/cdn\.jsdelivr\.net\/npm\/(tesseract|@tesseract)/, async r => { const res = await fetch(r.request().url()); const buf = Buffer.from(await res.arrayBuffer()); r.fulfill({status:res.status, headers:{'access-control-allow-origin':'*','content-type':res.headers.get('content-type')||'application/octet-stream'}, body:buf}); });
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/functions\/v1\/claude/, r => { const d=JSON.parse(r.request().postData()||'{}');
    const entry=(d.prompt||'').split('Entry: """')[1]||''; const res = d.task==='usage' ? {ok:true,ready:true,usage:{count:0,cap:30}} : {ok:true, json:{foods:[...(/chai/.test(entry)?[{name:'Masala chai',quantity:'1 cup',grams:150,kcal:90,protein_g:3,carbs_g:12,fat_g:3,sugar_g:10,added_sugar_g:7,confidence:'medium'}]:[]),{name:'Mango smoothie with dates',quantity:'1 glass',grams:300,kcal:250,protein_g:5,carbs_g:50,fat_g:3,sugar_g:40,added_sugar_g:18,confidence:'medium'}],exercises:[],activities:[],supplements:[],water_ml:0,notes:''}, usage:{count:1,cap:30}};
    r.fulfill({status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify(res)}); });
  await p.route(/functions\/v1\/(?!claude)/, r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true,"passkeys":[],"connected":false}'}));
  await p.route(/world\.openfoodfacts\.org/, r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"status":0}'}));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)(?!world\.openfoodfacts)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  // a nutrition label image, rendered here
  const lp = await b.newPage({viewport:{width:520,height:420}});
  await lp.setContent(`<div style="font:600 22px Arial;padding:18px;border:3px solid #000;width:440px;background:#fff;color:#000">NUTRITIONAL INFORMATION<table style="font:20px Arial;width:100%;margin-top:8px;border-collapse:collapse">
   <tr><td></td><td>Per 100 g</td><td>Per serve (30 g)</td></tr><tr><td>Energy (kcal)</td><td>545</td><td>164</td></tr><tr><td>Protein (g)</td><td>6.5</td><td>2.0</td></tr>
   <tr><td>Carbohydrate (g)</td><td>52.0</td><td>15.6</td></tr><tr><td>Total Sugars (g)</td><td>2.1</td><td>0.6</td></tr><tr><td>Total Fat (g)</td><td>34.5</td><td>10.4</td></tr>
   <tr><td>Saturated Fat (g)</td><td>15.2</td><td>4.6</td></tr><tr><td>Sodium (mg)</td><td>650</td><td>195</td></tr></table></div>`);
  await lp.screenshot({path:__dirname+'/label.png'}); await lp.close();
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2000);
  p.on('console', m => { if (/ocr|error|fail|tesseract|worker|wasm/i.test(m.text())) console.log('CONSOLE', m.type(), m.text().slice(0,300)); });
  const csp = []; p.on('console', m => { if (/Content Security Policy|Refused/.test(m.text())) csp.push(m.text().slice(0,160)); });
  await p.click('[data-action=scan]'); await p.waitForTimeout(500);
  await p.fill('#codein','8901234567897'); await p.click('#codeform button'); await p.waitForTimeout(1500);
  ok('Not found → label form', await p.isVisible('#lbform'), (await p.textContent('#dlg')).replace(/\s+/g,' ').slice(0,120));
  await p.setInputFiles('#lb_file', __dirname+'/label.png');
  for (let i=0;i<90;i++) { await p.waitForTimeout(1000); const m = await p.textContent('#lb_msg'); if (/Read \d|Couldn/.test(m)) break; }
  const m = await p.textContent('#lb_msg'); ok('On-phone reader read the label', /Read \d+ values/.test(m), m);
  const val = k => p.$eval(`[data-lb=${k}]`, e=>e.value);
  const got = {kcal:await val('kcal'), protein:await val('protein'), carbs:await val('carbs'), fat:await val('fat'), sat_fat:await val('sat_fat'), sodium:await val('sodium')};
  ok('Values are the per 100 g column', got.kcal==='545' && got.protein==='6.5' && got.carbs==='52' && got.fat==='34.5' && got.sat_fat==='15.2' && got.sodium==='650', JSON.stringify(got));
  ok('No CSP blocks', !csp.length, csp.join(' | '));
  await p.fill('#lb_name','Test Bhujia'); await p.fill('#lb_serv','30'); await p.click('#lbform button[type=submit]'); await p.waitForTimeout(800);
  const up = await p.evaluate(()=>(window.__up||[]).find(x=>x&&x.code==='8901234567897'));
  ok('Shared with the group', !!up && up.per.kcal===545 && up.units.serving===30, JSON.stringify(up||{}).slice(0,160));
  ok('Then the portion dialog', await p.isVisible('#pform'), (await p.textContent('#dlg')).replace(/\s+/g,' ').slice(0,100));
  console.log(out.join('\n')); out.length=0;
  await p.click('#pform button[type=submit]'); await p.waitForTimeout(800);
  ok('Logged, saved to food list', /Logged Test Bhujia · 164 kcal.*saved to your food list/.test(await p.textContent('#logStatus')), await p.textContent('#logStatus'));
  // wrong energy is questioned
  await p.click('[data-action=foodSearch]'); await p.waitForTimeout(300); await p.click('#flabel'); await p.waitForTimeout(300);
  await p.fill('#lb_name','Odd snack'); for (const [k,v] of [['kcal','100'],['protein','10'],['carbs','50'],['fat','20']]) await p.fill(`[data-lb=${k}]`, v);
  await p.click('#lbform button[type=submit]'); await p.waitForTimeout(300); ok('Mismatched calories questioned', /don’t match/.test(await p.textContent('#lb_msg')));
  ok('No page errors', !errs.length, errs.join(' | ')); console.log(out.join('\n')); await b.close(); })();
