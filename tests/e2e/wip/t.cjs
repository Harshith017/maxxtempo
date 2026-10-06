const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport:{width:390,height:800} });
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.route(/^https:/, async route => {
    const q = route.request();
    try {
      const res = await fetch(q.url(), { method:q.method(), headers:q.headers(), body:q.postDataBuffer()||undefined });
      const hd = {}; res.headers.forEach((v,k)=>{ if (!/encoding|length/.test(k)) hd[k]=v; });
      route.fulfill({ status:res.status, headers:hd, body:Buffer.from(await res.arrayBuffer()) });
    } catch (e) { console.log('relay fail', q.url().slice(0,80), e.message); route.abort(); }
  });
  await p.goto('http://localhost:8765/', { waitUntil:'networkidle' });
  await p.waitForSelector('#authPass', { timeout:15000 });
  await p.screenshot({ path: process.argv[2]+'/signin.png' });
  await p.fill('#authEmail','nobody-test@example.com'); await p.fill('#authPass','short');
  await p.click('[data-action=authSignUp]'); console.log('signup short:', await p.textContent('.status'));
  await p.fill('#authPass','wrongpassword1'); await p.click('[data-action=authPassword]');
  await p.waitForFunction(()=>/Wrong|Couldn/.test(document.querySelector('.status')?.textContent||''), null, {timeout:15000});
  console.log('signin bad:', await p.textContent('.status'));
  await p.screenshot({ path: process.argv[2]+'/signin-err.png' });
  console.log('page errors:', errs); await b.close();
})();
