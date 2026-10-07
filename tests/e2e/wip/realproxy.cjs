const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const ok=(n,p,i='')=>console.log(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
(async()=>{ const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage(); const errs=[], hosts=new Set();
  p.on('pageerror',e=>errs.push(e.message)); p.on('console', m=>{ if (m.type()==='error') errs.push('console: '+m.text()); });
  // Relay real network traffic (this sandbox's browser can't reach the internet directly).
  await p.route(/^https:\/\//, async r => { const req = r.request(), u = new URL(req.url()); hosts.add(u.hostname);
    try { const h = {...req.headers()}; delete h['accept-encoding'];
      const res = await fetch(req.url(), { method: req.method(), headers: h, body: ['GET','HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() });
      const hd = {}; res.headers.forEach((v,k)=>{ if(!/encoding|length/.test(k)) hd[k]=v; });
      r.fulfill({ status: res.status, headers: hd, body: Buffer.from(await res.arrayBuffer()) }); } catch (e) { r.abort(); } });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(3500);
  ok('Sign-in screen loads with the real Supabase library', !!(await p.$('#authEmail')));
  await p.fill('#authEmail','nobody@example.invalid'); await p.fill('#authPass','wrong-password-1'); await p.click('[data-action=authPassword]'); await p.waitForTimeout(4000);
  const msg = (await p.textContent('.status')).trim();
  ok('A sign-in reaches Supabase through the Worker (wrong password answer)', /Wrong password for nobody@example\.invalid/.test(msg), msg);
  ok('The app talked to the Worker, never to supabase.co', hosts.has('maxxtempo-api.harshithhb17.workers.dev') && ![...hosts].some(h=>/supabase\.co$/.test(h)), [...hosts].join(', '));
  ok('No errors (CSP, CORS or script)', !errs.filter(e=>!/401|400|Failed to load resource/.test(e)).length, errs.join(' | '));
  await b.close(); })();
