const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub5.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
const now = Date.now();
const FEED = { feed_posts:[{id:'f1', user_id:'u2', name:'Ravi', date:'2026-10-04', created_at:new Date(now-3*3600e3).toISOString(), workout:{title:'Leg day', minutes:62, sets:14, volume:8420, exercises:[{name:'Back squat', sets:4, best:'100 kg × 5'},{name:'Leg press', sets:3, best:'180 kg × 10'}], prs:['Back squat: 100 kg × 5']}},
  {id:'old', user_id:'u3', name:'Old', date:'2026-08-01', created_at:new Date(now-40*864e5).toISOString(), workout:{title:'Ancient', minutes:30, sets:3, volume:1, exercises:[]}}],
  feed_likes:[{post_id:'f1', user_id:'u3', name:'Meera'}] };
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog', d=>d.accept());
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)}; window.__FEED__=${JSON.stringify(FEED)};`);
  await p.route(/functions\/v1\//, r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}'}));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2000);
  await p.click('.tab[data-view=trends]'); await p.waitForTimeout(600);
  const f = async () => (await p.textContent('section[aria-label="Workout feed"]')).replace(/\s+/g,' ');
  let t = await f();
  ok('Friend’s workout in feed', /Ravi/.test(t) && /Leg day/.test(t) && /4 × Back squat/.test(t) && /100 kg × 5/.test(t) && /🏆/.test(t), t.slice(0,220));
  ok('Old posts (30+ days) left out', !/Ancient/.test(t));
  ok('No likes or comments', !(await p.$('section[aria-label="Workout feed"] textarea, section[aria-label="Workout feed"] input[type=text], [data-action=feedLike]')) && !/comment|like|♡|♥/i.test(t.replace(/Show my finished workouts here[^]*$/,'')));
  ok('Nothing to take off on a friend’s workout', !(await p.$('[data-action=feedDel][data-id=f1]')));
  // finish a workout in Train → posted
  await p.click('.tab[data-view=gym]'); await p.waitForTimeout(400);
  await p.click('[data-action=wkStart]'); await p.waitForTimeout(300);
  await p.click('[data-action=wkAddEx]'); await p.waitForTimeout(300); await p.fill('#xp_q','bench'); await p.waitForTimeout(300); await p.click('#xp_res .exrow'); await p.waitForTimeout(300);
  await (await p.$$('[data-wk=weight]'))[0].fill('60'); await (await p.$$('[data-wk=reps]'))[0].fill('8'); await (await p.$$('.wdone'))[0].click(); await p.waitForTimeout(200);
  await p.click('[data-action=wkFinish]'); await p.waitForTimeout(800); await p.click('#ws_ok');
  const posted = await p.evaluate(()=>window.__feed.feed_posts.find(x=>x.user_id==='u1'));
  ok('Finished workout posted', posted && posted.workout.exercises[0].best==='60 kg × 8' && posted.workout.sets===1, JSON.stringify(posted&&posted.workout));
  await p.click('.tab[data-view=trends]'); await p.waitForTimeout(600);
  t = await f(); ok('Own post first, with Remove', t.indexOf('(you)') < t.indexOf('Ravi') && !!(await p.$('[data-action=feedDel]')));
  
  await (await p.$('section[aria-label="Workout feed"]')).screenshot({path:__dirname+'/feed-panel.png'});
  await p.click('[data-action=feedDel]'); await p.waitForTimeout(400);
  ok('Own post removed', !(await p.evaluate(()=>window.__feed.feed_posts.some(x=>x.user_id==='u1'))) && !/\(you\)/.test(await f()));
  // turn sharing off → next workout not posted
  await p.uncheck('[data-action=feedToggle]'); await p.waitForTimeout(300);
  await p.click('.tab[data-view=gym]'); await p.waitForTimeout(400);
  await p.click('[data-action=wkStart]'); await p.waitForTimeout(300);
  await p.click('[data-action=wkAddEx]'); await p.waitForTimeout(300); await p.fill('#xp_q','bench'); await p.waitForTimeout(300); await p.click('#xp_res .exrow'); await p.waitForTimeout(300);
  await (await p.$$('.wdone'))[0].click(); await p.click('[data-action=wkFinish]'); await p.waitForTimeout(800); await p.click('#ws_ok');
  ok('Sharing off: not posted', !(await p.evaluate(()=>window.__feed.feed_posts.some(x=>x.user_id==='u1'))));
  await p.click('.tab[data-view=trends]'); await p.waitForTimeout(400);
  await p.click('[data-action=toggleHide][data-key=feed]'); await p.waitForTimeout(200);
  ok('Feed can be hidden', !/Ravi/.test(await f()));
  await p.click('[data-action=toggleHide][data-key=feed]');
  const wide = await p.evaluate(()=>document.documentElement.scrollWidth <= innerWidth); ok('No horizontal scroll', wide);
  ok('No page errors', !errs.length, errs.join(' | ')); console.log(out.join('\n')); await b.close(); })();
