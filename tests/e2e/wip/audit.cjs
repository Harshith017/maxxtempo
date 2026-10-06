const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub2.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8')); const axe = fs.readFileSync(__dirname+'/axe.min.js','utf8');
(async()=>{ const b=await chromium.launch();
  for (const scheme of ['light','dark']) {
    const ctx=await b.newContext({viewport:{width:360,height:780}, colorScheme:scheme, bypassCSP:true}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
    await p.route(/functions\/v1\//, r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}'}));
    await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
    await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
    await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
    const t0=Date.now(); await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForSelector('#logText',{timeout:15000}).catch(()=>{}); const ready=Date.now()-t0; await p.waitForTimeout(2000);
    console.log(`\n=== ${scheme} (first screen ready in ${ready} ms locally)`);
    for (const v of ['today','gym','trends','profile']) {
      await p.click(`.tab[data-view=${v}]`); await p.waitForTimeout(400);
      // open every fold so hidden content is audited too
      await p.$$eval('details', ds=>ds.forEach(d=>d.open=true)); await p.waitForTimeout(300);
      const r = await p.evaluate(()=>{ const W=document.documentElement.clientWidth; const over=[...document.querySelectorAll('#main *')].filter(e=>{const b=e.getBoundingClientRect(); return b.width>0 && b.right>W+1 && getComputedStyle(e).position!=='fixed' && !e.closest('.tablewrap,.exres,.chips,.seg');}).slice(0,4).map(e=>e.tagName+'.'+(e.className||'')+':'+e.textContent.trim().slice(0,25));
        const small=[...document.querySelectorAll('#main button, #main a, #main summary, #main input, #main select')].filter(e=>{const b=e.getBoundingClientRect(); return b.width>0 && (b.height<32||b.width<32);}).map(e=>(e.dataset.action||e.tagName)+':'+Math.round(e.getBoundingClientRect().height)).slice(0,8);
        return {scrollW:document.documentElement.scrollWidth, W, over, small, len:document.querySelector('#main').innerText.length}; });
      await p.addScriptTag({content:axe}); const ax = await p.evaluate(async()=>{ const res = await axe.run('#main', {runOnly:['wcag2a','wcag2aa']}); return res.violations.map(v=>`${v.id}(${v.nodes.length}): ${v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(' ; ').slice(0,120)}`); });
      console.log(`[${v}] page width ${r.scrollW}/${r.W}${r.over.length?' OVERFLOW '+r.over.join(' | '):''} · small tap targets ${r.small.length}: ${r.small.join(', ')}`);
      for (const a of ax) console.log('   axe', a);
      await p.$$eval('details', ds=>ds.forEach(d=>d.open=false));
    }
    console.log('page errors:', errs.length, errs.slice(0,2).join(' | ')); await ctx.close();
  }
  await b.close(); })();
