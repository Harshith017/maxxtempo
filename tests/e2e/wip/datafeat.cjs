const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub2.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
const relay = async r => { try { const q=r.request(); const res = await fetch(q.url(), { method:q.method(), headers:q.headers() }); const h={}; res.headers.forEach((v,k)=>{ if(!/encoding|length/.test(k)) h[k]=v; }); r.fulfill({status:res.status, headers:h, body:Buffer.from(await res.arrayBuffer())}); } catch(e){ r.abort(); } };
(async()=>{ const b=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const ctx=await b.newContext({viewport:{width:390,height:844}, permissions:['camera']}); const p=await ctx.newPage(); const errs=[], csp=[], ai=[], off=[];
  p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(/scanner/.test(m.text())) console.log('SCANLOG', m.text()); if(/Content Security|integrity/i.test(m.text())) csp.push(m.text().slice(0,150)); });
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/functions\/v1\/claude/, r => { const d=JSON.parse(r.request().postData()||'{}'); if (d.task!=='usage') ai.push(d.task); r.fulfill({status:200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify(d.task==='usage'?{ok:true,ready:true,usage:{count:0,cap:30}}:{ok:false,code:'unavailable'})}); });
  await p.route(/world\.openfoodfacts\.org|raw\.githubusercontent\.com|static\.exercisedb\.dev|wger\.de/, r => { if (/openfoodfacts/.test(r.request().url())) off.push(r.request().url()); return relay(r); });
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1\/claude)(?!world\.openfoodfacts)(?!raw\.githubusercontent)(?!static\.exercisedb)(?!wger\.de)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@zxing/, relay);
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(3000);
  // 1. library exercise + INDB recipe, logged locally
  await p.fill('#logText','1 cup garam chai'); await p.click('[data-action=log]'); await p.waitForTimeout(800); const st0 = (await p.textContent('.status')).replace(/\s+/g,' ');
  await p.click('.tab[data-view=gym]'); await p.waitForTimeout(250); await p.click('[data-action=wkStart]'); await p.waitForTimeout(300); await p.click('[data-action=wkAddEx]'); await p.waitForTimeout(300);
  await p.fill('#xp_q','zercher'); await p.waitForTimeout(400); await p.click('#xp_res .exrow'); await p.waitForTimeout(300);
  await (await p.$$('[data-wk=weight]'))[0].fill('60'); await (await p.$$('[data-wk=reps]'))[0].fill('5'); await (await p.$$('.wdone'))[0].click(); await p.waitForTimeout(200);
  await p.click('[data-action=wkFinish]'); await p.waitForTimeout(800); await p.click('#ws_ok'); await p.waitForTimeout(300);
  const st = st0 + ' / ' + (await p.textContent('section[aria-label="Training on this day"]')).replace(/\s+/g,' ');
  ok('Library exercise + INDB recipe logged without AI', !ai.length && /no AI used/.test(st) && /Zercher/.test(st), st.slice(0,120));
  await p.click('.tab[data-view=today]'); await p.waitForTimeout(250);
  // 2. how-to
  await p.click('.tab[data-view=gym]'); await p.waitForTimeout(250);
  await p.click('section[aria-label="Training on this day"] details.howfold[data-how="Zercher Squats"] > summary'); await p.waitForTimeout(800);
  const how = (await p.textContent('section[aria-label="Training on this day"] details.howfold[open]')).replace(/\s+/g,' '); const img = await p.getAttribute('details.howfold[open] .howimg','src').catch(()=>null);
  ok('How-to shows steps and credit', /From .*(free-exercise-db|wger|ExerciseDB)/.test(how) && (await p.$$('details.howfold[open] .howsteps li')).length>=2, how.slice(0,120));
  ok('How-to has a picture or animation', !!img, img||'');
  await p.waitForTimeout(1500); ok('Picture actually loads under CSP', await p.evaluate(()=>{ const i=document.querySelector('details.howfold[open] .howimg'); return !!(i && i.complete && i.naturalWidth>0); }));
  // 3. library search in Train
  await p.click('.tab[data-view=gym]'); await p.waitForTimeout(300); await p.click('[data-fold=g-lib] summary'); await p.waitForTimeout(200);
  await p.fill('#exq','incline db'); await p.waitForTimeout(200);
  const rs = (await p.$$eval('#exres .exrow', xs=>xs.map(x=>x.textContent.trim()))); ok('Library search finds exercises', rs.length>3 && rs.some(x=>/Incline Dumbbell Press/.test(x)), rs.slice(0,3).join(' | '));
  // 4. food search → USDA → portion → log
  await p.click('.tab[data-view=today]'); await p.waitForTimeout(300);
  await p.click('[data-action=foodSearch]'); await p.fill('#fq','almonds'); await p.waitForTimeout(1500);
  const fr = await p.$$eval('#fres .exrow', xs=>xs.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
  ok('Food search returns USDA/built-in results', fr.length>0, fr.slice(0,3).join(' | '));
  const iU = fr.findIndex(x=>/USDA/.test(x)); await p.click(`#fres .exrow >> nth=${Math.max(0,iU)}`); await p.waitForTimeout(200);
  await p.fill('#pq','30'); await p.selectOption('#pu','g'); await p.fill('#pq','30'); await p.waitForTimeout(100);
  const prev = await p.textContent('#pprev'); await p.click('#pform button[type=submit]'); await p.waitForTimeout(600);
  const st2 = (await p.textContent('.status')).replace(/\s+/g,' ');
  ok('Portion logged from search', /Logged .* kcal\. No AI used/.test(st2), prev.replace(/\s+/g,' ') + ' → ' + st2.slice(0,80));
  // 5. barcode by number (Nutella), then again from my foods
  await p.click('[data-action=scan]'); await p.waitForTimeout(3500);
  const smsg = await p.textContent('#scanmsg'); ok('Camera scanner starts (ZXing loaded, camera on)', /Point the camera/.test(smsg), smsg);
  await p.fill('#codein','3017620422003'); await p.click('#codeform button'); await p.waitForTimeout(4000);
  const pd = (await p.textContent('#dlg')).replace(/\s+/g,' ');
  ok('Open Food Facts product found', /Nutella/i.test(pd) && /Open Food Facts/.test(pd), pd.slice(0,120));
  const defQ = await p.inputValue('#pq'), defU = await p.inputValue('#pu'); const units = await p.$$eval('#pu option', o=>o.map(x=>x.textContent)); await p.click('#pform button[type=submit]'); await p.waitForTimeout(600);
  const bst=(await p.textContent('.status')).replace(/\s+/g,' '); ok('Barcode product logged (default 100 g, not the whole jar)', defQ==='100' && defU==='g' && /Logged Nutella · 5[0-9]{2} kcal/i.test(bst), defQ+' '+defU+' → '+bst.slice(0,60));
  const nOff = off.length; await p.click('[data-action=scan]'); await p.waitForTimeout(1500); await p.fill('#codein','3017620422003'); await p.click('#codeform button'); await p.waitForTimeout(800);
  ok('Second scan of same barcode uses my food list (no lookup)', off.length===nOff && /from your food list/.test(await p.textContent('#dlg')));
  await p.keyboard.press('Escape');
  // 6. credits
  await p.click('.tab[data-view=profile]'); await p.waitForTimeout(200);
  for (const k of ['p-settings','s-sources']) { const el=await p.$(`[data-fold=${k}] > summary`); if (el) { await el.click(); await p.waitForTimeout(150);} }
  ok('Data sources credits shown', /Open Food Facts/.test(await p.textContent('[data-fold=s-sources]')) );
  ok('No AI calls at all', !ai.length, ai.join(','));
  ok('No CSP/integrity problems', !csp.length, csp.join(' | '));
  ok('No page errors', !errs.length, errs.join(' | '));
  console.log(out.join('\n')); await b.close(); })();
