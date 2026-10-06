const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const stub = fs.readFileSync(__dirname + '/stub-supabase.js', 'utf8');
const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json','utf8'));
const iso = d => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); const day = i => { const d=new Date(); d.setDate(d.getDate()-i); return iso(d); };
// creatine first taken 5 days ago, 3 days ago the day was already filled and creatine unticked
const s2 = JSON.parse(JSON.stringify(seed));
for (const r of s2) if (r.collection==='days') { if (r.id===day(5)) r.data.supplements=[{id:'x', name:'Creatine', dose:'5 g', stack_id:'s1', micros:{}}]; if (r.id===day(3)) { r.data.stack_auto=true; r.data.supplements=[]; } }
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
async function open(b, seed){ const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message));
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`); await p.route(/^https:\/\/(?!cdn\.jsdelivr)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub})); await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); }); await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(1300); return {ctx,p}; }
const T = async (p,s)=>((await p.textContent(s).catch(()=>''))||'').replace(/\s+/g,' ').trim();
(async()=>{ const b=await chromium.launch();
  { const {ctx,p}=await open(b, []); ok('Setup asks for a name', !!(await p.$('[data-bind="about.name"]')));
    await p.fill('[data-bind="about.name"]','Harshith'); await p.fill('[data-bind="about.birth"]','1999-05-01'); await p.fill('[data-bind="about.height_cm"]','176'); await p.fill('[data-bind="about.weight_kg"]','74'); await p.selectOption('[data-bind="about.sex"]','male'); await p.selectOption('[data-bind="about.goal"]','maintain'); await p.click('[data-action=setupNext]'); await p.waitForTimeout(300); await p.click('[data-action=setupNext]'); await p.waitForTimeout(300);
    const fin = await p.$('[data-action=setupFinish]') || await p.$('#main button.btn:not(.ghost)'); if (fin) await fin.click(); await p.waitForTimeout(600); const fin2 = await p.$('[data-action=setupNext]'); if (fin2) await fin2.click(); await p.waitForTimeout(400);
    ok('Greeting uses the name from setup', /, Harshith/.test(await T(p,'.hello h1')), await T(p,'.hello h1')); ok('no errors (setup)', !p.errs.length, p.errs.join('|')); await ctx.close(); }
  { const {ctx,p}=await open(b, s2);
    await p.click('.gl[data-action=water] >> nth=0'); await p.waitForTimeout(200); ok('One glass reads 0.25 L', /^0\.25 of/.test(await T(p,'.goals .gt .muted')), await T(p,'.goals .gt .muted'));
    const bb = await p.$eval('.gl', e=>{const r=e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`}); ok('Glasses are 44 px tap targets', bb.startsWith('44'), bb);
    await p.click('.tab[data-view=profile]'); await p.click('[data-fold=p-supps] summary'); await p.waitForTimeout(200);
    const got = await p.evaluate(()=>null); // days aren't reachable from outside; read through Trends > Activity? use the export instead
    await p.click('[data-fold=s-data] summary'); const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=exportData]')]); const fp=__dirname+'/bk2.json'; await dl.saveAs(fp);
    const days = JSON.parse(fs.readFileSync(fp,'utf8')).docs.days; const has = (i, id) => ((days[day(i)]||{}).supplements||[]).some(x=>x.stack_id===id);
    ok('Creatine filled in from its first day', [4,2,1,0].every(i=>has(i,'s1')), [5,4,3,2,1,0].map(i=>`${i}d:${has(i,'s1')?'✓':'·'}`).join(' '));
    ok('A day where it was unticked stays unticked', !has(3,'s1'));
    ok('Vitamin D (never logged) starts today, not earlier', has(0,'s2') && !has(1,'s2'));
    const prof = JSON.parse(fs.readFileSync(fp,'utf8')).docs.profile.me; ok('Stack items now remember their start date', prof.stack.every(s=>s.since), prof.stack.map(s=>`${s.name}:${s.since}`).join(', '));
    await p.click('.tab[data-view=trends]'); await p.waitForTimeout(300);
    const lines = await p.$$eval('.wk', ws=>{ const w=ws.find(x=>/Calories eaten/.test(x.textContent)); return w?[...w.querySelectorAll('.wt')].map(x=>x.style.bottom):[]; }); ok('Calorie target line follows each day', new Set(lines).size>1, lines.join(' '));
    ok('no errors (fixes)', !p.errs.length, p.errs.join('|')); await ctx.close(); }
  console.log(out.join('\n')); await b.close(); })();
