const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub2.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const out=[]; const ok=(n,p,i='')=>console.log(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
(async()=>{ const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  const calls=[]; let delay=0;
  await p.route(/functions\/v1\/claude/, async r => { const d=JSON.parse(r.request().postData()||'{}'); calls.push(d.task);
    if (d.task==='usage') return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,ready:true,usage:{count:0,cap:30}})});
    if (delay) await new Promise(z=>setTimeout(z,delay));
    if (d.task==='log') { const entry=(d.prompt||'').split('Entry: """')[1]||'';
      return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,json:{foods:[],exercises:[],activities:/kabaddi/i.test(entry)?[{sport:'Kabaddi',entry:'kabaddi 1 hour'}]:[],supplements:[],water_ml:0,notes:''},usage:{count:1,cap:30}})}); }
    return r.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:false,code:'busy'})}); });
  await p.route(/functions\/v1\/(?!claude)/, r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true,"passkeys":[],"connected":false}'}));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2000);
  const st = async()=> (await p.textContent('#logStatus').catch(()=>''))||'';
  const main = async()=> (await p.textContent('#main')).replace(/\s+/g,' ');
  const log = async (t, w=900) => { calls.length=0; await p.fill('#logText',t,{timeout:5000}).catch(async e=>{console.log('FILL FAIL', (await p.textContent('#main')).replace(/\s+/g,' ').slice(0,600)); throw e;}); await p.click('[data-action=log]'); await p.waitForTimeout(w); };
  await p.click('[data-fold=d-food] summary').catch(()=>{});
  const row = async () => ((await main()).match(/Yoga Bar High Protein Oats Dark Chocolate[^✕]{0,80}/)||[''])[0];
  for (const [t, re] of [['yoga bar high protein oats 50g', /1 food · 182 kcal/], ['1 serving yoga bar oats', /1 food · 182 kcal/], ['yogabar dark chocolate oats 40 g', /1 food · 146 kcal/], ['yoga bar oats with 250ml milk', /2 foods/]]) {
    await log(t); const s = await st(); ok(`“${t}”`, !calls.filter(c=>c!=='usage').length && re.test(s), `${s} | ${await row()}`);
  }
  await p.click('[data-action=foodSearch]'); await p.waitForTimeout(300); await p.fill('#fq','yoga bar'); await p.waitForTimeout(600);
  const rows = await p.$$eval('#fres .exrow', xs=>xs.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
  ok('Find food: “yoga bar” first result', /^Yoga Bar High Protein Oats Dark Chocolate · 364 kcal/.test(rows[0]||''), rows.slice(0,3).join(' | '));
  await p.click('#fres .exrow >> nth=0'); await p.waitForTimeout(300);
  ok('Portion starts at 1 serving = 182 kcal, P 13', /182 kcal/.test(await p.textContent('#pprev')) && /protein 13 g/.test(await p.textContent('#pprev')), await p.textContent('#pprev'));
  ok('No page errors', !errs.length, errs.join(' | ')); await b.close(); })();
