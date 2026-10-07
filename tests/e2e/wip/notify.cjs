const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub4.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
const KEY='BFj5hW0KMNeX8ceBzgCSQV0ba6pjYTIv_nToin6gY4ogFWGxhvkCY_LVxFf5xYfFBD9cp7FrPBngpvhNkCkL4sE';
const fakes = standalone => `
  ${standalone ? "Object.defineProperty(navigator,'standalone',{get:()=>true});" : ''}
  window.__perm='default'; window.__asked=0;
  Object.defineProperty(Notification,'permission',{get:()=>window.__perm});
  Notification.requestPermission = async () => { window.__asked++; window.__perm='granted'; return 'granted'; };
  const reg = { pushManager:{ getSubscription: async()=>window.__sub||null, subscribe: async o => { window.__subOpts={len:o.applicationServerKey.length, uvo:o.userVisibleOnly}; return window.__sub={endpoint:'https://push.example/abc', toJSON(){return {endpoint:this.endpoint, keys:{p256dh:'P', auth:'A'}}}, unsubscribe: async()=>{ window.__sub=null; window.__unsub=1; return true; }}; } } };
  Object.defineProperty(navigator.serviceWorker,'ready',{get:()=>Promise.resolve(reg)});
`;
async function page(b, standalone, url='http://localhost:8765/'){
  const ctx=await b.newContext({viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog', d=>d.accept());
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};` + fakes(standalone));
  await p.route(/functions\/v1\//, r=>{ const body = r.request().postData()||''; const fn = r.request().url().split('/functions/v1/')[1];
    if (fn==='push') { const a = JSON.parse(body).action; (globalThis.__fn=globalThis.__fn||[]).push(a); return r.fulfill({status:200,contentType:'application/json',body: a==='key'?JSON.stringify({ok:true,key:KEY}):'{"ok":true,"sent":1}'}); }
    r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}'}); });
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto(url,{waitUntil:'load'}); await p.waitForTimeout(2000);
  return {p, errs};
}
const openNotify = async p => { await p.tap('.tab[data-view=profile]'); await p.waitForTimeout(300); await p.evaluate(()=>{ const d=document.querySelector('[data-fold="s-notify"]'); d.open=true; d.scrollIntoView(); }); await p.waitForTimeout(200); };
(async()=>{ const b=await chromium.launch();
  // 1. In the browser (not from the Home Screen): no switches, just how to add it
  { const {p, errs} = await page(b, false); await openNotify(p);
    const txt = await p.textContent('[data-fold="s-notify"]');
    ok('Browser tab: asks to add to Home Screen, no switches', /Add MaxxTempo to your Home Screen/.test(txt) && !(await p.$('[data-action=pushToggle]')), txt.slice(0,120));
    ok('Browser tab: fold says Home Screen app only', /Home Screen app only/.test(txt));
    ok('No page errors (browser)', !errs.length, errs.join(' | ')); await p.context().close(); }
  // 2. Home Screen app
  const {p, errs} = await page(b, true); await openNotify(p);
  const boxes = await p.$$('[data-action=pushToggle]');
  ok('Six switches, all off', boxes.length===6 && (await Promise.all(boxes.map(x=>x.isChecked()))).every(c=>!c), String(boxes.length));
  ok('Fold says off', /off/.test(await p.textContent('[data-fold="s-notify"] summary')));
  await p.evaluate(()=>{ window.__up=[]; window.__dels=[]; });
  await p.tap('[data-action=pushToggle][data-k=water]'); await p.waitForTimeout(800);
  const st = await p.evaluate(()=>({asked:window.__asked, sub:window.__subOpts, up:window.__up}));
  ok('Turning Water on asks permission once', st.asked===1);
  ok('Subscribes with the 65-byte server key, visible only', st.sub && st.sub.len===65 && st.sub.uvo===true, JSON.stringify(st.sub));
  const subRow = st.up.find(x=>x.__t==='push_subs');
  ok('Saves this phone with Water on and its time zone', subRow && subRow.prefs.water===true && subRow.endpoint==='https://push.example/abc' && subRow.p256dh==='P' && !!subRow.tz, JSON.stringify(subRow));
  const stRow = st.up.find(x=>x.__t==='push_state');
  ok('Sends today\'s numbers', stRow && stRow.date && stRow.protein_t>0 && stRow.kcal_t>0 && stRow.water_t>0 && stRow.steps_t>0, JSON.stringify(stRow));
  ok('Water switch stays on, fold says 1 on', await p.isChecked('[data-action=pushToggle][data-k=water]') && /1 on/.test(await p.textContent('[data-fold="s-notify"] summary')));
  ok('Status says on', /Water reminders on/.test(await p.textContent('[data-fold="s-notify"] .status')));
  await p.tap('[data-action=pushTest]'); await p.waitForTimeout(500);
  ok('Send a test works', /Sent/.test(await p.textContent('[data-fold="s-notify"] .status')));
  await p.tap('[data-action=pushToggle][data-k=rest]'); await p.waitForTimeout(600);
  ok('Rest on: permission not asked again', await p.evaluate(()=>window.__asked)===1);
  const prefs2 = await p.evaluate(()=>window.__up.filter(x=>x.__t==='push_subs').pop().prefs);
  ok('Saved choices now water + rest', prefs2.water && prefs2.rest && !prefs2.protein, JSON.stringify(prefs2));
  // rest timer → server alert
  await p.evaluate(()=>{ window.__up=[]; window.__dels=[]; });
  await p.tap('.tab[data-view=gym]'); await p.waitForTimeout(400); await p.tap('[data-action=wkStart]'); await p.waitForTimeout(300);
  await p.tap('[data-action=wkAddEx]'); await p.waitForTimeout(300); await p.fill('#xp_q','bench'); await p.waitForTimeout(300); await p.tap('#xp_res .exrow'); await p.waitForTimeout(300);
  await (await p.$$('[data-wk=weight]'))[0].fill('60'); await (await p.$$('[data-wk=reps]'))[0].fill('8'); await (await p.$$('.wdone'))[0].tap(); await p.waitForTimeout(800);
  const job = await p.evaluate(()=>window.__up.filter(x=>x.__t==='push_jobs').pop());
  const secs = job ? (Date.parse(job.send_at)-Date.now())/1000 : -1;
  ok('Starting rest sends its end time', job && secs>80 && secs<=90, `${secs}`);
  await p.tap('#restbar [data-action=restAdd][data-s="30"]'); await p.waitForTimeout(600);
  const job2 = await p.evaluate(()=>window.__up.filter(x=>x.__t==='push_jobs').pop());
  ok('+30s moves the alert later', job2 && Date.parse(job2.send_at) - Date.parse(job.send_at) > 25000, `${(Date.parse(job2.send_at)-Date.parse(job.send_at))/1000}`);
  await p.tap('#restbar [data-action=restStop]'); await p.waitForTimeout(600);
  ok('✕ cancels the alert', (await p.evaluate(()=>window.__dels)).includes('push_jobs'));
  // turn everything off
  await openNotify(p); await p.evaluate(()=>{ window.__dels=[]; });
  await p.tap('[data-action=pushToggle][data-k=water]'); await p.waitForTimeout(500);
  await p.tap('[data-action=pushToggle][data-k=rest]'); await p.waitForTimeout(700);
  const off = await p.evaluate(()=>({dels:window.__dels, unsub:window.__unsub, sub:window.__sub}));
  ok('All off: phone removed and unsubscribed', off.dels.includes('push_subs') && off.unsub===1 && !off.sub, JSON.stringify(off));
  ok('Fold says off again', /off/.test(await p.textContent('[data-fold="s-notify"] summary')));
  await p.screenshot({path:__dirname+'/notify.png', fullPage:false});
  ok('No page errors', !errs.length, errs.join(' | '));
  // 3. a tapped notification opens Train
  { const {p, errs} = await page(b, true, 'http://localhost:8765/?view=gym');
    ok('?view=gym opens Train and tidies the address', await p.evaluate(()=>document.querySelector('.tab[data-view=gym]').getAttribute('aria-current')==='page') && !(await p.url()).includes('view='), await p.url());
    ok('No page errors (link)', !errs.length, errs.join(' | ')); }
  console.log(out.join('\n')); await b.close(); })();
