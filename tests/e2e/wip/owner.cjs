const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const stub = fs.readFileSync(__dirname + '/stub2.js', 'utf8'); const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json','utf8'));
const ok=(n,p,i='')=>console.log(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
const members = (mainIsMe) => [
  {user_id:'u1',email:'you@example.com',name:'Harshith B',provider:'email',status:'approved',is_admin:true,primary_owner:mainIsMe,requested_at:'2026-09-26T10:00:00Z',decided_at:'2026-09-26T10:00:00Z'},
  {user_id:'o2',email:'main@example.com',name:'Main Owner',provider:'email',status:'approved',is_admin:true,primary_owner:!mainIsMe,requested_at:'2026-09-25T10:00:00Z',decided_at:'2026-09-25T10:00:00Z'},
  {user_id:'n1',email:'rakshithkumar12321@gmail.com',name:'rakshithkumar12321@gmail.com',provider:'email',status:'approved',is_admin:false,primary_owner:false,requested_at:'2026-09-27T08:00:00Z',decided_at:'2026-09-27T09:00:00Z'}];
async function open(b, ms){ const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message)); p.on('dialog',d=>d.accept());
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)}; window.__MEMBER__={status:'approved',is_admin:true}; window.__MEMBERS__=${JSON.stringify(ms)};`);
  await p.route(/functions\/v1\//, r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true,"passkeys":[]}'}));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(1500);
  await p.click('.tab[data-view=profile]'); await p.waitForTimeout(300); await p.click('[data-fold=s-people] summary'); await p.waitForTimeout(500); return {ctx,p}; }
const T = async (p,s)=>((await p.textContent(s).catch(()=>''))||'').replace(/\s+/g,' ').trim();
(async()=>{ const b=await chromium.launch();
  { const {ctx,p} = await open(b, members(true)); const t = await T(p,'[data-fold=s-people] .fold-body');
    ok('Roles shown: owner (you), co-owner', /Harshith B owner \(you\)/.test(t) && /Main Owner co-owner/.test(t), t.slice(0,160));
    ok('Main owner can make a member co-owner', !!(await p.$('[data-action=memberAdmin][data-id=n1][data-on="1"]')));
    ok('…and remove a co-owner', !!(await p.$('[data-action=memberAdmin][data-id=o2][data-on="0"]')));
    ok('No Password or Remove buttons on owners', !(await p.$('[data-action=tempPw][data-id=o2]')) && !(await p.$('[data-action=memberSet][data-id=o2]')));
    await p.click('[data-action=memberAdmin][data-id=n1]'); await p.waitForTimeout(500);
    const rpc = await p.evaluate(()=>window.__rpc.slice(-1)[0]);
    ok('Make co-owner calls set_member_admin', rpc && rpc[0]==='set_member_admin' && rpc[1].p_user==='n1' && rpc[1].p_admin===true, JSON.stringify(rpc));
    ok('Rakshith now shows as co-owner', /rakshithkumar12321@gmail\.com co-owner/.test(await T(p,'[data-fold=s-people] .fold-body')));
    const over = await p.$$eval('[data-fold=s-people] .item', (xs) => { const panel = document.querySelector('[data-fold=s-people]').getBoundingClientRect(); return xs.filter(x => [...x.querySelectorAll('button')].some(bt => bt.getBoundingClientRect().right > panel.right + 1)).length; });
    ok('Every button fits inside the panel', over === 0, String(over));
    ok('Page doesn’t scroll sideways', await p.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
    await (await p.$('[data-fold=s-people]')).screenshot({path:__dirname+'/people.png'});
    ok('no errors', !p.errs.length, p.errs.join('|')); await ctx.close(); }
  { const {ctx,p} = await open(b, members(false));
    ok('A co-owner can’t add or remove co-owners', !(await p.$('[data-action=memberAdmin]')));
    ok('…but can still give a member a temporary password and remove them', !!(await p.$('[data-action=tempPw][data-id=n1]')) && !!(await p.$('[data-action=memberSet][data-id=n1]')));
    ok('…and can’t touch the main owner', !(await p.$('[data-action=tempPw][data-id=o2]')) && !(await p.$('[data-action=memberSet][data-id=o2]')));
    ok('no errors', !p.errs.length, p.errs.join('|')); await ctx.close(); }
  await b.close(); })();
