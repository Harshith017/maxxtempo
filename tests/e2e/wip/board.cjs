const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub2.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const iso = d => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const today = iso(new Date()); const dow = (new Date().getDay()+6)%7; const mon = (()=>{ const d=new Date(); d.setDate(d.getDate()-dow); return iso(d); })();
const board = [
  {user_id:'a', name:'Rahul', workouts:4, protein_avg:162, protein_target:150, logged_days:5, steps:62000, steps_goal:50000, burned:2100, burn_goal:1429, score:100},
  {user_id:'b', name:'Priya', workouts:3, protein_avg:118, protein_target:110, logged_days:4, steps:51000, steps_goal:50000, burned:1500, burn_goal:1429, score:100},
  {user_id:'c', name:'Arjun', workouts:2, protein_avg:140, protein_target:160, logged_days:5, steps:30000, steps_goal:50000, burned:900, burn_goal:1429, score:77},
  {user_id:'d', name:'Sneha', workouts:1, protein_avg:90, protein_target:120, logged_days:3, score:54},
  {user_id:'e', name:'Kiran', workouts:0, protein_avg:0, protein_target:130, logged_days:0, score:0},
];
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
(async()=>{ const b=await chromium.launch();
  for (const scheme of ['light','dark']) {
  const ctx=await b.newContext({viewport:{width:390,height:844}, colorScheme:scheme}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)}; window.__BOARD__=${JSON.stringify(board)}; window.__MEMBER__={status:'approved',is_admin:true};`);
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)/, async r => { const u=r.request().url(); if (!/fonts\.(googleapis|gstatic)\.com/.test(u)) return r.abort();
    try { const res=await fetch(u,{headers:{'user-agent':r.request().headers()['user-agent']}}); const hd={}; res.headers.forEach((v,k)=>{ if(!/encoding|length/.test(k)) hd[k]=v; }); hd['access-control-allow-origin']='*'; r.fulfill({status:res.status,headers:hd,body:Buffer.from(await res.arrayBuffer())}); } catch { r.abort(); } });
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub})); await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(1300);
  await p.fill('#logText','400 g chicken breast, 3 roti'); await p.click('[data-action=log]'); await p.waitForTimeout(3500);
  await p.click('.tab[data-view=trends]'); await p.waitForTimeout(600);
  if (scheme==='light') {
    const up = await p.evaluate(()=>window.__up||[]); const mine = up[up.length-1]||{};
    ok('Your weekly row is published', mine.week===undefined ? false : true, JSON.stringify({week:mine.week, name:mine.name, workouts:mine.workouts, protein_avg:mine.protein_avg, protein_target:mine.protein_target, score:mine.score}));
    ok('Week starts on Monday', mine.week===mon, `${mine.week} vs ${mon}`);
    ok('Only weekly numbers are shared (no foods)', Object.keys(mine).sort().join(',')==='burn_goal,burned,logged_days,name,protein_avg,protein_target,score,steps,steps_goal,updated_at,user_id,week,workouts', Object.keys(mine).join(','));
    const pod = await p.$$eval('.pod .pname', xs=>xs.map(x=>x.textContent.trim())); ok('Podium shows the top 3 (2nd, 1st, 3rd)', pod.join('|')==='Priya|Rahul|Arjun', pod.join('|'));
    ok('Target-hit badges on people who hit both goals', (await p.$$('.pod .spill')).length===2);
    ok('Podium lines show steps and kcal burned', /62k steps · 2,100 kcal burned/.test(await p.textContent('.podium')), (await p.textContent('.pod.p1 .pline')));
    if (scheme==='light') await p.screenshot({path:__dirname+'/board-new.png'});
    const restClosed = await p.$eval('[data-fold=lb-rest]', d=>!d.open); ok('Everyone else starts folded', restClosed);
    await p.click('[data-fold=lb-rest] summary'); await p.waitForTimeout(150);
    ok('Everyone else lists ranks 4 and 5', /4\s*Sneha.*5\s*Kiran/s.test(await p.textContent('[data-fold=lb-rest] .fold-body')));
    await p.screenshot({path:__dirname+'/ap/board-light.png'});
    await p.uncheck('[data-action=boardToggle]'); await p.waitForTimeout(3200);
    ok('Switching off removes your row', (await p.evaluate(()=>window.__deleted||0))>0);
  } else { await p.click('[data-fold=lb-rest] summary').catch(()=>{}); await p.waitForTimeout(150); await p.screenshot({path:__dirname+'/ap/board-dark.png'}); }
  ok(`no page errors (${scheme})`, !errs.length, errs.join('|')); await ctx.close(); }
  console.log(out.join('\n')); await b.close(); })();
