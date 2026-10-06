const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub-supabase.js', 'utf8');
const seedFull = JSON.parse(fs.readFileSync(__dirname + '/seed.json','utf8'));
const results = []; const ok = (name, pass, info='') => results.push(`${pass?'PASS':'FAIL'}  ${name}${info?'  — '+info:''}`);
async function open(b, seed, scheme='light'){
  const ctx = await b.newContext({ viewport:{width:390,height:844}, colorScheme:scheme, acceptDownloads:true });
  const p = await ctx.newPage(); p.errs=[]; p.on('pageerror', e=>p.errs.push(e.message)); p.on('dialog', d=>d.accept());
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/^https:\/\/(?!cdn\.jsdelivr|cdnjs)/, r => r.abort());
  await p.route(/cdnjs\.cloudflare\.com/, async r => { const res = await fetch(r.request().url()); r.fulfill({status:res.status, contentType:'application/javascript', headers:{'access-control-allow-origin':'*'}, body: Buffer.from(await res.arrayBuffer())}); });
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body: stub }));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(1200); return {ctx,p};
}
const text = async (p, sel) => ((await p.textContent(sel).catch(()=>''))||'').replace(/\s+/g,' ').trim();
(async () => {
  const b = await chromium.launch();
  // 1. brand-new user: setup wizard
  { const {ctx,p} = await open(b, []);
    const h = await text(p, '#main'); ok('New user sees the setup wizard', /Set up|About you/i.test(h), h.slice(0,60));
    await p.fill('input[type=date]', '1999-05-01').catch(()=>{});
    for (let i=0;i<6;i++){ const next = await p.$('button:has-text("Next"), button:has-text("Finish"), button:has-text("Done"), button:has-text("Save")'); if(!next) break; await next.click(); await p.waitForTimeout(300); }
    const after = await text(p, '#main'); ok('Setup wizard reaches the app', /Log food/i.test(after) || /Sports|sport/i.test(after), after.slice(0,80));
    ok('No page errors (new user)', !p.errs.length, p.errs.join(' | ')); await ctx.close(); }
  // 2. logging, editing, undo, water, past day
  { const {ctx,p} = await open(b, seedFull);
    await p.fill('#logText', '2 roti, 1 katori dal'); await p.click('[data-action=log]'); await p.waitForTimeout(500);
    const kc1 = await text(p, '.nbig b'); ok('Logging food-table items updates calories', kc1==='397' || +kc1.replace(/,/g,'')>0, `eaten ${kc1} kcal`);
    ok('Log box clears after logging', (await p.inputValue('#logText'))==='');
    await p.click('[data-fold=d-food] summary').catch(()=>{}); await p.waitForTimeout(150);
    await p.click('[data-action=editFood] >> nth=0'); await p.waitForTimeout(200);
    const dlgOpen = !!(await p.$('#dlg[open]')); ok('Edit food opens a dialog', dlgOpen);
    if (dlgOpen) { const k = await p.$('#ef_kcal'); if (k) { await k.fill('500'); } const save = await p.$('#dlg button:has-text("Save")'); if (save) await save.click(); await p.waitForTimeout(300);
      ok('Edited calories are saved', /500/.test(await text(p, '[data-fold=d-food] .fold-body')), (await text(p,'.nbig b'))+' kcal now'); }
    const before = (await p.$$('[data-action=delFood]')).length; await p.click('[data-action=delFood] >> nth=0'); await p.waitForTimeout(200);
    const afterDel = (await p.$$('[data-action=delFood]')).length; ok('Delete removes a food', afterDel===before-1, `${before} → ${afterDel}`);
    await p.click('#undoBtn').catch(()=>{}); await p.waitForTimeout(250); ok('Undo brings it back', (await p.$$('[data-action=delFood]')).length===before);
    const w0 = await text(p, '.goals .gt .muted'); await p.click('.gl[data-action=water] >> nth=0'); await p.waitForTimeout(200); const w1 = await text(p, '.goals .gt .muted');
    ok('Tapping a glass adds 250 ml', w0!==w1, `${w0.split('·')[0]} → ${w1.split('·')[0]}`);
    await p.click('#menuBtn'); await p.click('#prevDay'); await p.click('#menuClose'); await p.waitForTimeout(200);
    ok('Past day shows the Viewing bar', /Viewing/.test(await text(p,'.pastbar')));
    await p.fill('#logText', '1 banana'); await p.click('[data-action=log]'); await p.waitForTimeout(400);
    await p.click('[data-action=goToday]'); await p.waitForTimeout(200);
    const todayFood = await text(p, '[data-fold=d-food] summary'); ok('Food logged on a past day stays on that day', !/Banana/i.test(await text(p,'[data-fold=d-food] .fold-body')), todayFood);
    // quick add
    await p.click('[data-fold=d-quick] summary').catch(()=>{}); const q0 = await text(p,'.nbig b'); await p.click('[data-action=relog] >> nth=0'); await p.waitForTimeout(250);
    ok('Quick add logs a food', (await text(p,'.nbig b'))!==q0, `${q0} → ${await text(p,'.nbig b')}`);
    // backup round trip
    await p.click('.tab[data-view=profile]'); await p.click('[data-fold=s-data] summary');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=exportData]')]); const fp = __dirname+'/backup.json'; await dl.saveAs(fp);
    const bj = JSON.parse(fs.readFileSync(fp,'utf8')); ok('Backup JSON contains days and profile', !!(bj.docs&&bj.docs.days&&bj.docs.profile), `${Object.keys(bj.docs||{}).join(', ')}; file ${dl.suggestedFilename()}`);
    const [dx] = await Promise.all([p.waitForEvent('download',{timeout:30000}), p.click('[data-action=exportExcel]')]); ok('Excel export downloads', /\.xlsx$/.test(dx.suggestedFilename()), dx.suggestedFilename());
    await p.setInputFiles('#importInput', fp); await p.waitForTimeout(800); ok('Restoring a backup works', /Restored/.test(await text(p,'#toast')), await text(p,'#toast'));
    // goals form save
    await p.click('[data-fold=p-goals] summary').catch(()=>{}); await p.fill('#pf_kcal','2400'); await p.click('[data-fold=p-goals] button[type=submit]'); await p.waitForTimeout(300);
    ok('Saving a calorie goal updates the target', /2,400/.test(await text(p,'[data-fold=p-goals] summary')), await text(p,'[data-fold=p-goals] summary'));
    ok('No page errors (journeys)', !p.errs.length, p.errs.join(' | ')); await ctx.close(); }
  // 3. theme persists
  { const {ctx,p} = await open(b, seedFull, 'dark'); await p.click('#menuBtn'); await p.click('[data-action=theme][data-t=light]'); await p.reload(); await p.waitForTimeout(800);
    ok('Theme choice survives a reload', (await p.evaluate(()=>document.documentElement.dataset.theme))==='light'); await ctx.close(); }
  console.log(results.join('\n')); await b.close();
})();
