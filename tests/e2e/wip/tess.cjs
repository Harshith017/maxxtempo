const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({ignoreHTTPSErrors:true}); const p=await ctx.newPage();
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/(tesseract|@tesseract)/, async r => { const res = await fetch(r.request().url()); const buf = Buffer.from(await res.arrayBuffer()); const hd={'access-control-allow-origin':'*','content-type':res.headers.get('content-type')||'application/octet-stream'}; r.fulfill({status:res.status, headers:hd, body:buf}); });
  p.on('console', m=>console.log('C', m.type(), m.text().slice(0,250))); p.on('pageerror', e=>console.log('PE', e.message));
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(1500);
  const r = await p.evaluate(async()=>{ try {
    await new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; s.onload=res; s.onerror=()=>rej('script'); document.head.appendChild(s); });
    const w = await Tesseract.createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js', corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1', langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int', errorHandler:e=>console.log('EH', String(e))});
    return 'ok worker';
  } catch(e) { return 'ERR '+(e&&e.message||String(e)); } });
  console.log(r); await b.close(); })();
