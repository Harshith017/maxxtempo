const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport:{width:390,height:844}, colorScheme:'dark' });
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.route(/^https:/, async route => { const q=route.request();
    try { const res = await fetch(q.url(), { method:q.method(), headers:q.headers(), body:q.postDataBuffer()||undefined });
      const hd={}; res.headers.forEach((v,k)=>{ if(!/encoding|length/.test(k)) hd[k]=v; }); route.fulfill({status:res.status, headers:hd, body:Buffer.from(await res.arrayBuffer())}); } catch(e) { route.abort(); } });
  await p.goto('https://harshith017.github.io/maxxtempo/', { waitUntil:'networkidle' });
  p.on('console', m=>console.log('console:', m.type(), m.text().slice(0,200))); p.on('requestfailed', r=>console.log('failed:', r.url().slice(0,100))); await p.waitForTimeout(6000); console.log('main:', (await p.textContent('#main')).replace(/\s+/g,' ').slice(0,300));
  console.log('brand:', await p.textContent('.brand'), '| title:', await p.title(), '| errors:', errs);
  await p.screenshot({ path: process.argv[2]+'/live-new.png' }); await b.close();
})();
