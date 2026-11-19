// Screenshots of the main views, light and dark: node shots.cjs <prefix>
const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub3.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const pre = process.argv[2] || 'before', only = process.argv[3];
(async()=>{ const b=await chromium.launch();
  for (const scheme of ['light','dark']) {
    const ctx=await b.newContext({viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true, isMobile:true, colorScheme:scheme}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
    await p.route(/functions\/v1\//, r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}'}));
    await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
    await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
    await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-[^"]*"/,'')}); });
    await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2200);
    for (const v of ['today','gym','trends','group','profile']) {
      if (only && v!==only) continue;
      await p.tap(`.tab[data-view=${v}]`).catch(async()=>{ await p.evaluate(x=>document.querySelector(`[data-view=${x}]`)?.click(), v); }); await p.waitForTimeout(600);
      await p.screenshot({path:`${__dirname}/${pre}-${v}-${scheme}.png`, fullPage:true});
    }
    const bm = await p.$('.bodymap'); if (!bm) { await p.tap('.tab[data-view=trends]').catch(()=>{}); await p.waitForTimeout(500); }
    const bm2 = await p.$('.bodymap'); if (bm2) { await bm2.scrollIntoViewIfNeeded(); await bm2.screenshot({path:`${__dirname}/${pre}-bodymap-${scheme}.png`}); }
    if (errs.length) console.log(scheme, 'errors:', errs.join(' | '));
    await ctx.close();
  }
  await b.close(); console.log('done'); })();
