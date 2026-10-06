const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const names = require('./topnames.json');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage(); await p.goto('about:blank');
  const r = await p.evaluate(ns => ns.map(n => { const d = Object.getOwnPropertyDescriptor(window, n); const inProto = !d && (n in window); return {n, own: !!d, conf: d ? d.configurable : null, inProto}; }).filter(x => x.own || x.inProto), names);
  console.log(JSON.stringify(r)); await b.close(); })();
