const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub-supabase.js', 'utf8');
const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json','utf8'));
const SKIP = new Set(['signOut','importData','pickPhoto','pickReport','importIndb','exportData','exportExcel','log','plan','review','ideas','qSubmit','qRetry','stop']);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport:{width:390,height:844}, colorScheme:'dark', acceptDownloads:true });
  const p = await ctx.newPage(); const errs=[]; let cur='';
  p.on('pageerror', e=>errs.push(`[${cur}] ${e.message}`)); p.on('console', m=>{ if(m.type()==='error' && !/Failed to load resource/.test(m.text())) errs.push(`[${cur}] console: ${m.text()}`); });
  p.on('dialog', d=>d.accept());
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)/, r => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body: stub }));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(1200);
  await p.fill('#logText', '2 roti, 1 katori dal, 200 g curd rice, 500 ml water, weight 74.2'); cur='log'; await p.click('[data-action=log]'); await p.waitForTimeout(500);
  const clicked = {};
  for (const view of ['today','gym','trends','profile']) {
    await p.click(`.tab[data-view=${view}]`); await p.waitForTimeout(250);
    for (let pass=0; pass<2; pass++) {
      for (const d of await p.$$('details.fold:not([open]) > summary')) { try { await d.click(); } catch {} }
      await p.waitForTimeout(150);
      const acts = await p.$$eval('[data-action]', els => els.map((e,i)=>({i, a:e.dataset.action, dis:e.disabled, vis:!!(e.offsetWidth||e.offsetHeight)})));
      for (const x of acts) {
        if (SKIP.has(x.a) || x.dis || !x.vis) continue;
        const key = view+':'+x.a; clicked[key]=(clicked[key]||0)+1; if (clicked[key]>3) continue;
        cur = key;
        try {
          const el = (await p.$$('[data-action]'))[x.i]; if (!el) continue;
          await el.click({ timeout:1500 });
          await p.waitForTimeout(120);
          if (await p.$('#dlg[open]')) { const btns = await p.$$('#dlg[open] button'); cur=key+'>dialog'; await p.keyboard.press('Escape'); await p.waitForTimeout(100); }
          const v = await p.$eval('.tab[aria-current=page]', e=>e.dataset.view).catch(()=>view);
          if (v!==view) { await p.click(`.tab[data-view=${view}]`); await p.waitForTimeout(150); }
        } catch (e) { if (!/detached|not visible|intercept|Timeout|outside of the viewport/.test(e.message)) errs.push(`[${cur}] click failed: ${e.message.split('\n')[0]}`); }
      }
    }
  }
  // settings menu
  cur='menu'; await p.click('#menuBtn'); for (const t of ['light','dark','auto']) await p.click(`[data-action=theme][data-t=${t}]`);
  await p.click('#prevDay'); await p.click('#nextDay'); await p.fill('#datePick','2026-09-20'); await p.dispatchEvent('#datePick','change'); await p.click('#menuClose');
  cur='pastday'; for (const view of ['today','gym','trends','profile']) { await p.click(`.tab[data-view=${view}]`); await p.waitForTimeout(150); }
  console.log('buttons exercised:', Object.keys(clicked).length, '\n', Object.keys(clicked).sort().join(', '));
  console.log('ERRORS:', errs.length ? '\n'+[...new Set(errs)].join('\n') : 'none');
  await b.close();
})();
