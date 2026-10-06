const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const stub = fs.readFileSync(__dirname + '/stub-supabase.js', 'utf8');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport:{width:390,height:844} }); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.addInitScript(`window.__SEED__=[];`); await p.route(/^https:\/\/(?!cdn\.jsdelivr)/, r => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body: stub }));
  await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(1200);
  console.log('buttons:', await p.$$eval('#main button', bs=>bs.map(x=>`${x.textContent.trim()}[${x.dataset.action||''}]`).join(' | ')));
  console.log('inputs:', await p.$$eval('#main input, #main select', xs=>xs.map(x=>`${x.name||x.id}:${x.type||x.tagName}=${x.value}`).join(' | ')));
  const dob = await p.$('#main input[type=date]'); if (dob) await dob.fill('1999-05-01');
  for (let i=0;i<5;i++){ const btn = await p.$('#main button.btn:not(.ghost):not(.linkbtn)'); if(!btn) break; const t=(await btn.textContent()).trim(); await btn.click(); await p.waitForTimeout(400);
    console.log(`clicked "${t}" →`, ((await p.textContent('#main'))||'').replace(/\s+/g,' ').slice(0,110)); }
  await p.screenshot({path:__dirname+'/setup-end.png'}); console.log('errors', errs); await b.close();
})();
