const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const out = process.argv[2];
const stub = fs.readFileSync(__dirname + '/stub-supabase.js', 'utf8');
const iso = d => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const day = i => { const d=new Date(); d.setDate(d.getDate()-i); return iso(d); };
const profile = { name:'H', sex:'male', age:27, birth:'1999-05-01', height_cm:176, weight_kg:74, activity:'moderate', goal:'lose', goal_rate:0.5, maint_source:'auto', eat_back:true, steps_goal:10000,
  stack:[{id:'s1', name:'Creatine', dose:'5 g', micros:{}}, {id:'s2', name:'Vitamin D3', dose:'60000 IU weekly', micros:{vitamin_d_mcg:50}}], sports:{badminton:{name:'Badminton', answers:[], updated:day(3)}} };
const food = (n,k,p,c,f,meal) => ({id:n+Math.random(), name:n, quantity:'1 serving', grams:200, meal, time:'13:00', kcal:k, protein:p, carbs:c, fat:f, fiber:4, sugar:5, micros:{iron_mg:2, calcium_mg:80}, confidence:'high', source:'food-db'});
const rows = [{ collection:'profile', id:'me', data: profile }];
for (let i=6;i>=1;i--) {
  const w = 60 + (6-i)*2.5;
  const d = { date:day(i), foods:[food('Poha',350,8,60,9,'breakfast'), food('Chicken curry + rice',700,40,80,22,'lunch'), food('Dal + 2 roti',520,22,80,10,'dinner')].slice(0, i%3?3:2),
    water:[{id:'w'+i, ml:2000-i*120, time:'10:00'}], exercises:[], sports:[], weight_kg: i%2? 74.6 - (6-i)*0.12 : null,
    health:{ steps: 6000+i*900, sleep_min: 380+i*14 } };
  if (i%2===0) d.exercises = [
    {id:'e1'+i, name:'Bench Press', muscle_group:'chest', kcal:60, sets:[{weight:w,reps:8},{weight:w,reps:8},{weight:w,reps:7}]},
    {id:'e2'+i, name:'Squat', muscle_group:'legs', kcal:80, sets:[{weight:w+20,reps:5},{weight:w+20,reps:5}]},
    {id:'e3'+i, name:'Pull Up', muscle_group:'back', kcal:30, sets:[{weight:0,reps:6+(6-i)},{weight:0,reps:6}]}];
  if (i===3) d.sports = [{id:'sp1', v:2, sport:'Badminton', title:'Badminton doubles', summary:'doubles, 3 games', minutes:60, rpe:7, kcal:380}];
  rows.push({collection:'days', id:d.date, data:d});
}
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport:{width:390,height:844}, colorScheme:'dark' });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });
  await p.addInitScript(`window.__SEED__=${JSON.stringify(rows)};`);
  await p.route(/^https:\/\/(?!cdn\.jsdelivr|fonts)/, r => r.abort());
  await p.route(/cdnjs\.cloudflare\.com/, async r => { const res = await fetch(r.request().url()); r.fulfill({status:res.status, contentType:'application/javascript', body: Buffer.from(await res.arrayBuffer())}); });
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body: stub }));
  await p.route(/supabase\.co\/functions/, r => r.fulfill({ contentType:'application/json', body: JSON.stringify({ ok:true, ready:true, usage:{count:3,cap:30} }) }));
  await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(1500);
  const shot = async (name, full=true) => { await p.screenshot({ path:`${out}/${name}.png`, fullPage:full }); console.log('shot', name); };
  await p.fill('#logText', '2 roti, 1 katori dal, 200 g curd rice, 500 ml water'); await p.click('[data-action=log]'); await p.waitForTimeout(800);
  await shot('today2', false);
  await p.click('[data-fold=d-food] summary'); await p.click('[data-fold=d-quick] summary'); await p.waitForTimeout(200); await shot('today2-open');
  await p.click('#menuBtn'); await p.waitForTimeout(300); await shot('menu', false);
  await p.click('#prevDay'); await p.waitForTimeout(300); console.log('chip after prev:', await p.textContent('#dayChip'), '| menu open:', !(await p.$eval('#menu', m=>m.hidden)));
  await p.mouse.click(200, 720); await p.waitForTimeout(200); console.log('menu closed on outside tap:', await p.$eval('#menu', m=>m.hidden));
  await shot('past-day', false);
  await p.click('#dayChip'); await p.waitForTimeout(200); console.log('chip after back:', await p.textContent('#dayChip'));
  await p.click('.tab[data-view=gym]'); await p.waitForTimeout(400); await shot('train2', false);
  await p.click('.tab[data-view=profile]'); await p.waitForTimeout(400); console.log('profile settings rows:', (await p.$$eval('.fold .ttl', xs=>xs.map(x=>x.textContent))).join(', '));
  console.log('errors', errs); await b.close();
})();
