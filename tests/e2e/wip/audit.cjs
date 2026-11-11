/* Audit changes: today's routine first, rep ranges + go-up hint, per-dumbbell label, edit a
   workout's time, same-point comparison, fasting goal, group food review, Group tab, Undo,
   exercise libraries loaded only when needed. */
const { chromium } = require('playwright'); const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub3.js', 'utf8')
  .replace("from(t){ return t==='shared_foods'", "from(t){ return t==='group_foods' ? q(window.__GROUP__||[]) : t==='shared_foods'");
const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json', 'utf8'));
const out = []; const ok = (n, p, i = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const GROUP = [{ key:'mess-dal', name:'Mess dal', aliases:[], units:{}, verified:false, per:{ kcal:120, protein:7, carbs:15, fat:3, micros:{} } }];
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport:{ width:390, height:844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const exReq = []; p.on('request', r => { if (/data\/ex-/.test(r.url())) exReq.push(r.url()); });
  await p.addInitScript(`(() => { const d = new Date(), pad=n=>String(n).padStart(2,'0'), day = o => { const x = new Date(d.getTime()-o*864e5); return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate()); };
    const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], t = day(0), y = day(2);
    window.__GROUP__ = ${JSON.stringify(GROUP)};
    window.__SEED__ = ${JSON.stringify(seed)}.filter(x => x.collection!=='days' && x.collection!=='profile').concat([
      ...${JSON.stringify(seed)}.filter(x => x.collection==='profile').map(x => ({...x, data:{...x.data, fast_goal_h:16}})),
      {collection:'routines', id:'r1', data:{id:'r1', name:WD[d.getDay()]+' · Pull', exercises:[
        {name:'Lat Pulldown', group:'back', sets:3, reps:8, reps_max:10, weight:60, warmups:0},
        {name:'Dumbbell Row', group:'back', sets:3, reps:8, reps_max:10, weight:25, warmups:0}]}},
      {collection:'routines', id:'r2', data:{id:'r2', name:'Other day', days:[(d.getDay()+3)%7], exercises:[{name:'Chest Press', group:'chest', sets:3, reps:8, weight:60}]}},
      {collection:'days', id:y, data:{date:y, foods:[], water:[], exercises:[
        {id:'p1', name:'Lat Pulldown', muscle_group:'back', sets:[{weight:60,reps:10},{weight:60,reps:10},{weight:60,reps:10}], time:'18:00', source:'workout', workout_id:'wy', kcal:40},
        {id:'p2', name:'Dumbbell Row', muscle_group:'back', sets:[{weight:25,reps:9},{weight:25,reps:8},{weight:25,reps:7}], time:'18:00', source:'workout', workout_id:'wy', kcal:40}],
        workouts:[{id:'wy', name:'Pull', started:new Date(d.getTime()-2*864e5).toISOString(), minutes:50, exercises:2, sets:6, volume:2400}]}},
      {collection:'days', id:t, data:{date:t, water:[], foods:[{id:'f1', name:'Poha', quantity:'1 plate', grams:200, meal:'', time:pad(Math.max(0,d.getHours()-3))+':00', kcal:350, protein:8, carbs:60, fat:9, fiber:4, sugar:5, micros:{}, confidence:'high', source:'food-db'}],
        exercises:[{id:'a', name:'Lat Pulldown', muscle_group:'back', sets:[{weight:60,reps:10},{weight:60,reps:10},{weight:60,reps:10},{weight:60,reps:10}], time:'09:00', source:'workout', workout_id:'w1', kcal:40},
                   {id:'b', name:'Face Pull', muscle_group:'shoulders', sets:[{weight:30,reps:12},{weight:30,reps:12}], time:'09:00', source:'workout', workout_id:'w1', kcal:40}],
        workouts:[{id:'w1', name:'Pull', started:new Date(d.getTime()-3*36e5).toISOString(), minutes:139, exercises:2, sets:6, volume:3120}]}}]);
    try{ localStorage.setItem('fl:folds','["s-sports","p-goals"]'); }catch{} })();`);
  await p.route(/functions\/v1\//, r => r.fulfill({ status:200, contentType:'application/json', headers:{ 'access-control-allow-origin':'*' }, body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}' }));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body:stub }));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html');
    r.fulfill({ status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-[^"]*"/g, '') }); });
  await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(3000);
  const txt = async () => (await p.textContent('body')).replace(/\s+/g, ' ');

  ok('Exercise libraries not loaded on Today', exReq.length === 0, exReq.join(' '));
  const t0 = await txt();
  ok('Fasting goal bar under Since last meal', /Fasting: 3h \d\dm/.test(t0) && /to your 16 h goal/.test(t0), (t0.match(/Fasting.{0,80}/)||[''])[0]);
  ok('Meal chips sit on one row', await p.$eval('.mealpick', el => { const tops = [...el.querySelectorAll('.mchip')].map(c => c.getBoundingClientRect().top); return Math.max(...tops) - Math.min(...tops) < 2; }));

  await p.click('.tab[data-view=gym]'); await p.waitForTimeout(1500);
  ok('Exercise libraries load on Train', exReq.length === 3, String(exReq.length));
  const g = await txt();
  ok("Today's routine shown first with a Start button", /Today’s routine ?\w{3} · Pull/.test(g) && await p.$('.rt-today [data-action=wkStartRoutine][data-id=r1]') !== null, (g.match(/Today’s routine.{0,40}/)||[''])[0]);
  ok('Comparison is against the same point last week', /against the same point last week/.test(g));
  ok('Gym session shows its time with Edit time', /2 h 19 min Edit time/.test(g), (g.match(/Gym session.{0,60}/)||[''])[0]);

  // edit the workout time: 139 -> 60 min, calories re-shared by sets
  await p.click('[data-action=wkEditTime]'); await p.waitForTimeout(300);
  await p.fill('[data-wt="0"]', '60'); await p.click('#wtform button[type=submit]'); await p.waitForTimeout(600);
  const g2 = await txt();
  const kc = await p.$$eval('.act .item .kc, .act .kc', els => els.map(e => e.textContent.replace(/\s+/g,' ').trim()));
  ok('Workout time edited to 60 min', /Gym session.{0,30}1 h 00 min/.test(g2), (g2.match(/Gym session.{0,40}/)||[''])[0]);
  ok('Exercise with more sets gets more calories', (() => { const n = kc.map(x => parseInt(x)).filter(Number.isFinite); return n.length >= 3 && n[1] > n[2]; })(), kc.join(' | '));

  // start today's routine: go-up hint on Lat Pulldown (hit 10 on every set), stay on Dumbbell Row
  await p.click('.rt-today [data-action=wkStartRoutine]'); await p.waitForTimeout(700);
  const w = await txt();
  ok('Rep range shown', /Target 8–10 reps/.test(w));
  ok('Go up one step after hitting the top', /hit 10 reps on every set at 60 kg, so this starts at 65 kg/.test(w) && await p.inputValue('[data-wk=weight][data-ex="0"][data-set="0"]') === '65', (w.match(/Last time.{0,80}/)||[''])[0]);
  ok('Stay when a set fell below the range', /fell below 8 reps at 25 kg/.test(w));
  ok('Dumbbell column says kg each', await p.$$eval('.wkgrid', gs => gs[1] && /kg each/.test(gs[1].textContent) && !/kg each/.test(gs[0].textContent)));

  // remove an exercise: no confirm, Undo brings it back
  let dialogs = 0; p.on('dialog', d => { dialogs++; d.dismiss(); });
  await p.click('[data-action=wkRemoveEx][data-ex="1"]'); await p.waitForTimeout(300);
  const removed = !(await txt()).includes('fell below 8 reps');
  await p.click('#undoBtn'); await p.waitForTimeout(300);
  ok('Remove exercise uses Undo, not a pop-up', dialogs === 0 && removed && (await txt()).includes('fell below 8 reps'));
  await p.click('[data-action=wkDiscard]'); await p.waitForTimeout(300);
  ok('Discard uses Undo', dialogs === 0 && await p.$('.wklive') === null && await p.$('#undoBtn') !== null);

  // routine editor: range text and weekday chips
  await p.click('[data-action=routineEdit][data-id=r1]'); await p.waitForTimeout(400);
  ok('Routine editor shows the range and its day', await p.inputValue('[data-rt=reps][data-i="0"]') === '8–10' && await p.$eval('#rt_days', el => el.querySelectorAll('input:checked').length === 1));
  await p.fill('[data-rt=reps][data-i="1"]', '10-12'); await p.click('#rtform button[type=submit]'); await p.waitForTimeout(400);
  await p.click('[data-action=routineEdit][data-id=r1]'); await p.waitForTimeout(400);
  ok('Saving a typed range keeps it', await p.inputValue('[data-rt=reps][data-i="1"]') === '10–12' && await p.$eval('#rt_days', el => el.querySelectorAll('input:checked').length === 1));
  await p.click('#rt_cancel'); await p.waitForTimeout(200);

  // Group tab has the leaderboard; Trends does not
  await p.click('.tab[data-view=trends]'); await p.waitForTimeout(600);
  const tr = await txt();
  await p.click('.tab[data-view=group]'); await p.waitForTimeout(800);
  const gr = await txt();
  ok('Leaderboard and feed moved to the Group tab', !/leaderboard/i.test(tr) && /This week’s leaderboard/.test(gr) && /Workout feed/.test(gr));

  // group food review
  await p.click('.tab[data-view=profile]'); await p.waitForTimeout(600);
  const rv = await p.$('[data-action=groupFoodsOpen]');
  if (rv) { await rv.click(); await p.waitForTimeout(400); }
  ok('Group food list can be reviewed', !!rv && /Mess dal/.test(await p.textContent('#dlg')) && await p.$('[data-gfix="mess-dal"]') !== null);
  if (rv) { await p.click('[data-gfix="mess-dal"]'); await p.waitForTimeout(300); ok('Fix form opens with its values', await p.inputValue('[data-gk=kcal]') === '120'); await p.click('#gfx_back'); await p.click('#gf_close'); }
  ok('Fasting goal setting present', await p.$('#pf_fast') !== null && await p.inputValue('#pf_fast') === '16');

  ok('No page errors', !errs.length, errs.join(' | '));
  console.log(out.join('\n')); await b.close();
})();
