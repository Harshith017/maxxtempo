const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const ROOT = '/home/user/fuel-lift', APP = 'https://harshith017.github.io/maxxtempo/';
const tu = JSON.parse(fs.readFileSync(__dirname+'/testuser.json','utf8')), pw = fs.readFileSync(__dirname+'/testpw','utf8').trim();
const types = {'.js':'application/javascript','.html':'text/html','.json':'application/json','.png':'image/png','.css':'text/css'};
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844} }); const p = await ctx.newPage();
  p.on('pageerror',e=>console.log('PAGEERR',e.message)); p.on('console', m=>{ if(/error|refused|CSP/i.test(m.text())) console.log('CONSOLE', m.text().slice(0,200)); });
  await p.route(/^https:\/\/harshith017\.github\.io\/maxxtempo\//, r => { let f = new URL(r.request().url()).pathname.replace('/maxxtempo/',''); if (!f) f='index.html';
    const fp = path.join(ROOT, f); if (!fs.existsSync(fp)) return r.fulfill({status:404, body:''}); r.fulfill({ status:200, contentType: types[path.extname(fp)]||'application/octet-stream', body: fs.readFileSync(fp) }); });
  await p.route(/^https:\/\/(idmvlecpdgtiyjeikphi\.supabase\.co|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com)\//, async r => { const q=r.request();
    try { const res = await fetch(q.url(), { method:q.method(), headers:q.headers(), body:q.postDataBuffer()||undefined }); const hd={}; res.headers.forEach((v,k)=>{ if(!/encoding|length/.test(k)) hd[k]=v; }); r.fulfill({status:res.status, headers:hd, body:Buffer.from(await res.arrayBuffer())}); } catch(e) { console.log('RELAYFAIL', q.url(), e.message); r.abort(); } });
  await p.route(/^wss?:/, r => r.abort());
  p.on('request', rq => { if (/functions\/v1\/claude/.test(rq.url()) && rq.method()==='POST') { const d=JSON.parse(rq.postData()||'{}'); console.log('>> REQ task', d.task, 'prompt chars', (d.prompt||'').length); } });
  p.on('response', async res => { if (/functions\/v1\/claude/.test(res.url()) && res.request().method()==='POST') { let t=''; try { t=(await res.text()).slice(0,300); } catch {} console.log('<< RES', res.status(), t); } });
  await p.goto(APP, { waitUntil:'load' }); await p.waitForTimeout(1500);
  await p.fill('#authEmail', tu.email); await p.fill('#authPass', pw); await p.click('[data-action=authPassword]'); await p.waitForTimeout(4000);
  if (!(await p.isVisible('#menuBtn'))) { await p.fill('input[type=date]', '1999-05-01').catch(()=>{});
    for (let i=0;i<8;i++){ const nx = await p.$('button:has-text("Next"), button:has-text("Finish"), button:has-text("Done"), button:has-text("Save")'); if(!nx || await p.isVisible('#menuBtn')) break; await nx.click(); await p.waitForTimeout(600); } }
  await p.waitForTimeout(1500);
  await p.fill('#logText', 'One pc of taco, grilled chicken without tomatoe salsa, one burrito without rice, lettuce, add in shredded cheese ( no sauces )');
  await p.click('[data-action=log]'); await p.waitForTimeout(60000);
  console.log('STATUS:', (await p.textContent('.status').catch(()=>''))?.slice(0,200));
  await b.close();
})();
