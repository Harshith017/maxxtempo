const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub7.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
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
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'').replace(process.env.PROXY ? /connect-src 'self'/ : /^$/, "connect-src 'self' https://maxxtempo-api.example.workers.dev wss://maxxtempo-api.example.workers.dev")}); });
  if (process.env.PROXY) await p.route(/localhost:8765\/config\.js/, async r => { const t = await (await fetch('http://localhost:8765/config.js')).text(); r.fulfill({contentType:'application/javascript', body:t.replace("SUPABASE_PROXY_URL: ''", "SUPABASE_PROXY_URL: 'https://maxxtempo-api.example.workers.dev/'")}); });
  const fnHits=[]; p.on('request', q => { if (/functions\/v1/.test(q.url())) fnHits.push(q.url()); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2000);
  const cc = await p.evaluate(()=>window.__cc);
  if (process.env.PROXY) {
    ok('Client talks to the Worker', cc.url==='https://maxxtempo-api.example.workers.dev', cc.url);
    ok('Session key stays the project one (no sign-out)', cc.opts.auth.storageKey==='sb-idmvlecpdgtiyjeikphi-auth-token', cc.opts.auth.storageKey);
    ok('Edge functions go through the Worker', fnHits.length>0 && fnHits.every(u=>u.startsWith('https://maxxtempo-api.example.workers.dev/functions/v1/')), fnHits.slice(0,2).join(' '));
  } else {
    ok('No Worker set: client talks to Supabase directly', cc.url==='https://idmvlecpdgtiyjeikphi.supabase.co', cc.url);
    ok('Same session key as before', cc.opts.auth.storageKey==='sb-idmvlecpdgtiyjeikphi-auth-token');
    ok('Edge functions go to Supabase', fnHits.length>0 && fnHits.every(u=>u.startsWith('https://idmvlecpdgtiyjeikphi.supabase.co/functions/v1/')), fnHits.slice(0,2).join(' '));
  }
  ok('No page errors', !errs.length, errs.join(' | ')); await b.close(); })();
