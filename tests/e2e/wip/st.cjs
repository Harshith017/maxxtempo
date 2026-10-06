const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub-supabase.js', 'utf8');
const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json','utf8'));
(async () => {
  const b = await chromium.launch();
  for (const scheme of ['light','dark']) {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, colorScheme:scheme });
    const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
    await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
    await p.route(/^https:\/\/(?!cdn\.jsdelivr|fonts)/, r => r.abort());
    await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body: stub }));
    await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(1200);
    await p.fill('#logText', '400 g chicken breast, 3 roti, 2 cups rice, 1 katori dal, 2 bananas, 3 litres water'); await p.click('[data-action=log]'); await p.waitForTimeout(700);
    console.log(scheme, 'status:', await p.textContent('#logStatus'));
    await p.evaluate(()=>window.scrollTo(0,0)); await p.screenshot({ path:`${__dirname}/st/today-${scheme}.png` });
    await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)); await p.waitForTimeout(150); await p.screenshot({ path:`${__dirname}/st/today-bottom-${scheme}.png` });
    await p.click('.tab[data-view=trends]'); await p.waitForTimeout(300);
    await p.click('[data-fold=t-targets] summary').catch(()=>{}); await p.click('[data-fold=t-micros] summary').catch(()=>{}); await p.waitForTimeout(200);
    await p.screenshot({ path:`${__dirname}/st/trends-${scheme}.png`, fullPage:true });
    console.log(scheme, 'errors', errs); await ctx.close();
  }
  await b.close();
})();
