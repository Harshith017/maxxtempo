const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub-supabase.js', 'utf8');
const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json','utf8'));
const F = {
  'archivo':    {css:'family=Archivo:wght@400;500;600;700;800', display:'"Archivo"', body:'"Archivo"', extra:'h1,h2,.brand,.nbig b,.ringc b,.stat3 b{font-stretch:112%}'},
  'bricolage':  {css:'family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Hanken+Grotesk:wght@400;500;600;700', display:'"Bricolage Grotesque"', body:'"Hanken Grotesk"', extra:''},
  'schibsted':  {css:'family=Schibsted+Grotesk:wght@400;500;600;700;800', display:'"Schibsted Grotesk"', body:'"Schibsted Grotesk"', extra:''},
  'sora':       {css:'family=Sora:wght@400;500;600;700&family=Figtree:wght@400;500;600;700', display:'"Sora"', body:'"Figtree"', extra:''},
};
(async () => {
  const b = await chromium.launch();
  for (const [name,f] of Object.entries(F)) {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, colorScheme:'light' });
    const p = await ctx.newPage();
    await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
    await p.route(/^https:\/\/(?!cdn\.jsdelivr)/, async r => { const u=r.request().url(); if (!/fonts\.(googleapis|gstatic)\.com/.test(u)) return r.abort();
      try { const res=await fetch(u, {headers:{'user-agent':r.request().headers()['user-agent']}}); const hd={}; res.headers.forEach((v,k)=>{ if(!/encoding|length/.test(k)) hd[k]=v; }); hd['access-control-allow-origin']='*'; r.fulfill({status:res.status, headers:hd, body:Buffer.from(await res.arrayBuffer())}); } catch { r.abort(); } });
    await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body: stub }));
    await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(1000);
    await p.addStyleTag({ url:`https://fonts.googleapis.com/css2?${f.css}&display=swap` });
    await p.addStyleTag({ content:`:root, :root:not([data-theme="light"]){--display:${f.display},system-ui,sans-serif;--body:${f.body},system-ui,sans-serif} ${f.extra}` });
    await p.fill('#logText', '400 g chicken breast, 3 roti, 2 cups rice, 1 katori dal, 2 bananas, 3 litres water'); await p.click('[data-action=log]'); await p.waitForTimeout(600);
    await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(400);
    console.log(name, 'loaded:', await p.evaluate(fam=>document.fonts.check(`600 16px ${fam}`), f.display));
    await p.evaluate(()=>window.scrollTo(0,0)); await p.screenshot({ path:`${__dirname}/fonts/${name}.png` });
    await ctx.close();
  }
  await b.close();
})();
