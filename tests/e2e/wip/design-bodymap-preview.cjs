// Body map preview: light and dark, a busy week and a light one. node bmprev2.cjs [out.png] [width]
const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
const js = fs.readFileSync(__dirname + '/bm.js', 'utf8');
const out = process.argv[2] || 'bm2.png', W = +(process.argv[3] || 380);
const css = `
.light{--bm-skin:#EFEAE5;--bm-skin-hi:#F8F5F2;--bm-muscle:#E2DCD6;--bm-groove:#C3BAB2;--bm-line:rgba(70,52,40,.30);--bm-fib:rgba(70,52,40,.16);
  --bm-heat-1:#FDBA74;--bm-heat-2:#F97316;--bm-heat-3:#C2410C;--ink-3:#6B6B70;background:#fff}
.dark{--bm-skin:#2E2E33;--bm-skin-hi:#3A3A40;--bm-muscle:#3B3B41;--bm-groove:#1A1A1E;--bm-line:rgba(0,0,0,.55);--bm-fib:rgba(0,0,0,.28);
  --bm-heat-1:#8A2E0D;--bm-heat-2:#E5560B;--bm-heat-3:#FF8A3D;--ink-3:#98989F;background:#1C1C1E}
body{margin:0;display:flex;flex-wrap:wrap;font-family:-apple-system,sans-serif} .p{padding:16px;width:${W}px}
.bodymap{width:100%;display:block}
.bodymap .groove{fill:var(--bm-groove);stroke:var(--bm-line);stroke-width:.8}
.bodymap .bskin{stroke:var(--bm-line);stroke-width:.7}
.bodymap .mline{fill:none;stroke:var(--bm-line);stroke-width:.6}
.bodymap .fib{fill:none;stroke:var(--bm-fib);stroke-width:.4;stroke-linecap:round}
.bodymap .crease{fill:none;stroke:var(--bm-line);stroke-width:.7}
.bodymap .nohit{pointer-events:none}
.bodymap .knee{fill:var(--bm-muscle);stroke:var(--bm-line);stroke-width:.6}
.bodymap .bmlbl{font-size:14px;font-weight:600;fill:var(--ink-3)}`;
const full = { chest: 7, back: 10, shoulders: 8, biceps: 3, triceps: 3, forearms: 2, quads: 4, hamstrings: 3, glutes: 3, calves: 4, core: 1 };
const sparse = { chest: 8, shoulders: 4, triceps: 3 };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: (W + 32) * 4, height: 600 }, deviceScaleFactor: 2 });
  await p.setContent(`<style>${css}</style><div class="p light" id="a"></div><div class="p light" id="b"></div><div class="p dark" id="c"></div><div class="p dark" id="d"></div><script>${js}
  const titleCase=s=>s[0].toUpperCase()+s.slice(1), n0=v=>Math.round(v);
  a.innerHTML=bodyMap(${JSON.stringify(full)}); b.innerHTML=bodyMap(${JSON.stringify(sparse)}); c.innerHTML=bodyMap(${JSON.stringify(full)}); d.innerHTML=bodyMap(${JSON.stringify(sparse)});</script>`);
  await p.waitForTimeout(300); await p.screenshot({ path: __dirname + '/' + out, fullPage: true }); await b.close();
})();
