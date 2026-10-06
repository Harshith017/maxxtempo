const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const relay = async r => { try { const q=r.request(); const res = await fetch(q.url(), { method:q.method(), headers:q.headers(), body:q.postDataBuffer()||undefined }); const h={}; res.headers.forEach((v,k)=>{ if(!/encoding|length/.test(k)) h[k]=v; }); r.fulfill({status:res.status, headers:h, body:Buffer.from(await res.arrayBuffer())}); } catch(e){ r.abort(); } };
(async()=>{ const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  const errs=[], csp=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(/Content Security|integrity/i.test(m.text())) csp.push(m.text().slice(0,120)); });
  await p.route(/^https:\/\//, relay); await p.goto('https://harshith017.github.io/maxxtempo/?v='+Date.now(),{waitUntil:'load'}); await p.waitForTimeout(3000);
  console.log('supabase lib:', await p.evaluate(()=>!!window.supabase), '| sign-in:', /Sign in/i.test(await p.textContent('#main')), '| Face ID btn:', !!(await p.$('[data-action=faceIdSignIn]')), '| errors:', errs.length, '| csp:', csp.length, csp.join('|'));
  await p.screenshot({path:'live-sec.png'}); await b.close(); })();
