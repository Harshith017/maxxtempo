const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub2.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`); const ai=[];
const relay = async r => { try { const q=r.request(); const res = await fetch(q.url()); const h={}; res.headers.forEach((v,k)=>{ if(!/encoding|length/.test(k)) h[k]=v; }); r.fulfill({status:res.status, headers:h, body:Buffer.from(await res.arrayBuffer())}); } catch(e){ r.abort(); } };
(async()=>{ const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/functions\/v1\/claude/, r => { const d=JSON.parse(r.request().postData()||'{}'); if (d.task!=='usage') ai.push({task:d.task, img:(d.images||[]).length, prompt:(d.prompt||'').slice(0,60)});
    const res = d.task==='usage' ? {ok:true,ready:true,usage:{count:0,cap:30}} : {ok:true, json:{name:'Multivitamin Men', dose:'1 tablet', vitamin_d_mcg:10, vitamin_b12_mcg:2.4, zinc_mg:11, vitamin_c_mg:90, iron_mg:8, note:'Also has biotin'}, usage:{count:1,cap:30}};
    r.fulfill({status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify(res)}); });
  await p.route(/functions\/v1\/(?!claude)/, r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true,"passkeys":[],"connected":false}'}));
  await p.route(/world\.openfoodfacts\.org/, relay);
  await p.route(/cdn\.jsdelivr\.net\/npm\/@zxing/, relay);
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)(?!world\.openfoodfacts)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2000);
  ok('Supplement example removed from Today', !/creatine 5g, vitamin D3/.test(await p.textContent('#main')));
  await p.click('.tab[data-view=profile]'); await p.waitForTimeout(300); await p.click('[data-fold=p-supps] > summary'); await p.waitForTimeout(200);
  const today = await p.evaluate(()=>{ const d=new Date(); return d.getDay(); });
  const other = (today+3)%7;
  // 1. Vitamin D3 weekly on today's weekday, filled with no AI
  await p.click('[data-action=editSupp][data-id=""]'); await p.fill('#su_name','Vitamin D3 60,000 IU'); await p.fill('#su_dose','1 capsule'); await p.press('#su_dose','Tab'); await p.waitForTimeout(150);
  ok('Vitamin D filled from the name (no AI)', (await p.inputValue('[data-mk="vitamin_d_mcg"]'))==='1500' && !ai.length, await p.inputValue('[data-mk="vitamin_d_mcg"]'));
  await p.selectOption('#su_ft','days'); await p.click(`#su_days .wd:nth-child(${today+1})`); await p.screenshot({path:'supp-form.png'}); await p.click('#suForm button[type=submit]'); await p.waitForTimeout(500);
  // 2. Magnesium on another weekday
  await p.click('[data-action=editSupp][data-id=""]'); await p.fill('#su_name','Magnesium 200 mg'); await p.press('#su_name','Tab'); await p.selectOption('#su_ft','days'); await p.click(`#su_days .wd:nth-child(${other+1})`); await p.click('#suForm button[type=submit]'); await p.waitForTimeout(500);
  // 3. Multivitamin via label photo (AI)
  await p.click('[data-action=editSupp][data-id=""]'); const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#su_photo')]); await fc.setFiles(__dirname+'/label.png'); await p.waitForTimeout(1500);
  ok('Label photo fills name, dose and values (AI, with image)', (await p.inputValue('#su_name'))==='Multivitamin Men' && (await p.inputValue('[data-mk="zinc_mg"]'))==='11' && ai.some(x=>x.img===1), await p.textContent('#su_msg'));
  await p.click('#suForm button[type=submit]'); await p.waitForTimeout(500);
  const list = (await p.textContent('[data-fold=p-supps]')).replace(/\s+/g,' ');
  ok('List shows schedule and nutrients', /Vitamin D3 60,000 Iu.*Weekly on \w{3}.*Vitamin D 1,500 mcg/i.test(list) && /Multivitamin Men.*Every day/.test(list), list.slice(0,220));
  const todayTicks = await p.$$eval('[data-fold=p-supps] .stk b', x=>x.map(y=>y.textContent));
  ok('Today shows only what is due', todayTicks.includes('Vitamin D3 60,000 IU') && todayTicks.includes('Multivitamin Men') && !todayTicks.some(x=>/Magnesium/.test(x)), todayTicks.join(', '));
  // 4. Look it up by name (AI, text)
  await p.click('[data-action=editSupp][data-id=""]'); await p.fill('#su_name','Centrum Men'); await p.click('#su_ai'); await p.waitForTimeout(800);
  ok('Look it up fills values', (await p.inputValue('[data-mk="vitamin_c_mg"]'))==='90' && ai.some(x=>x.img===0 && /Look up the nutrients/.test(x.prompt)));
  // 5. Barcode in the supplement form (Open Food Facts), then cancel
  await p.click('#su_scan'); await p.waitForTimeout(2500); await p.fill('#codein','3017620422003'); await p.click('#codeform button'); await p.waitForTimeout(3500);
  ok('Barcode returns to the supplement form', await p.isVisible('#suForm') && /Open Food Facts/.test(await p.textContent('#su_msg')), await p.textContent('#su_msg'));
  await p.click('#su_cancel'); await p.waitForTimeout(200);
  ok('Cancel saves nothing', !/Centrum/.test(await p.textContent('[data-fold=p-supps]')));
  // 6. edit + remove
  await p.click('[data-fold=p-supps] [data-action=editSupp] >> nth=0'); await p.selectOption('#su_ft','every'); await p.fill('#su_n','14'); await p.click('#suForm button[type=submit]'); await p.waitForTimeout(400);
  ok('Edit to every 14 days', /Every 14 days/.test(await p.textContent('[data-fold=p-supps]')));
  const n0 = (await p.$$('[data-fold=p-supps] .item [data-action=rmStack]')).length; await p.click('[data-fold=p-supps] .item [data-action=rmStack] >> nth=0'); await p.waitForTimeout(400);
  ok('Remove works', (await p.$$('[data-fold=p-supps] .item [data-action=rmStack]')).length===n0-1);
  // 7. Trends counts vitamin D today
  ok('No page errors', !errs.length, errs.join(' | '));
  console.log(out.join('\n')); await b.close(); })();
