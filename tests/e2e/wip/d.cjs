const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ proxy:{ server: process.env.HTTPS_PROXY, bypass:'<-loopback>' } }); const p = await b.newPage();
  p.on('requestfailed', r=>console.log('FAIL', r.url().slice(0,90), r.failure()?.errorText));
  p.on('console', m=>console.log('console', m.text().slice(0,150)));
  const r = await p.goto('http://127.0.0.1:8765/', { waitUntil:'load', timeout:20000 }).catch(e=>console.log('goto', e.message));
  await p.waitForTimeout(4000); console.log((await p.textContent('main, body')).slice(0,200)); await b.close();
})();
