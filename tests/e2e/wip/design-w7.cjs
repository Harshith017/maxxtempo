// Screenshots of the 7-day charts and the Today ring, and a tap-tooltip check.
const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub3.js', 'utf8'); const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: scheme });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
    await p.route(/functions\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r => r.abort());
    await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType: 'application/javascript', body: stub }));
    await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({ status: 200, contentType: 'text/html', body: (await res.text()).replace(/ integrity="sha384-[^"]*"/, '') }); });
    await p.goto('http://localhost:8765/', { waitUntil: 'load' }); await p.waitForTimeout(2000);
    await p.tap('.tab[data-view=trends]'); await p.waitForTimeout(400);
    const panels = await p.$$('section.panel.wk');
    await panels[0].scrollIntoViewIfNeeded(); const wb = await panels[0].$$('.wb'); await wb[2].tap(); await p.waitForTimeout(200);
    const tipTxt = await p.evaluate(() => { const t = document.getElementById('tip'); return t.hidden ? '(hidden)' : t.textContent; });
    console.log(scheme, 'tap tip:', tipTxt);
    await p.screenshot({ path: `${__dirname}/w7-${scheme}.png` });
    await panels[1].screenshot({ path: `${__dirname}/w7b-${scheme}.png` });
    await p.tap('.tab[data-view=today]'); await p.waitForTimeout(300);
    const ring = await p.$('.nring-top'); await ring.screenshot({ path: `${__dirname}/ring-${scheme}.png` });
    await ctx.close();
  }
  console.log(errs.join('|')); await b.close();
})();
