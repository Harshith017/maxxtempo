const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub3.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const pad=n=>String(n).padStart(2,'0'), d=new Date(), today=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
// Today: Yoga Bar logged before the fix (all its sugar stored as added), tea with sugar from the AI, plain dal.
seed.push({collection:'days', id:today, data:{date:today, foods:[
  {id:'y1', name:'Yoga Bar High Protein Oats Dark Chocolate', quantity:'50 g', grams:50, meal:'breakfast', time:'08:00', kcal:182, protein:13, carbs:28.7, fat:3, fiber:5.6, sugar:7.95, added_sugar:7.95, micros:{}, confidence:'high', source:'food-db'},
  {id:'t1', name:'Tea with milk & sugar', quantity:'1 cup', grams:150, meal:'snack', time:'16:00', kcal:90, protein:2, carbs:14, fat:3, fiber:0, sugar:12, added_sugar:9, micros:{}, confidence:'medium', source:'text'},
  {id:'j1', name:'Pineapple Juice (Unsweetened, No Added Sugar)', quantity:'1 glass', grams:250, meal:'snack', time:'11:00', kcal:132, protein:1, carbs:32, fat:0, fiber:0.5, sugar:25, added_sugar:25, micros:{}, confidence:'medium', source:'text'},
  {id:'d1', name:'Dal', quantity:'1 katori', grams:150, meal:'lunch', time:'13:00', kcal:180, protein:10, carbs:25, fat:4, fiber:6, sugar:2, micros:{}, confidence:'high', source:'food-db'},
], water:[], exercises:[]}, updated_at:new Date().toISOString()});
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/functions\/v1\//, r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}'}));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2000);
  const row = async () => (await p.textContent('[data-action=sugarWhy]')).replace(/\s+/g,' ');
  ok('Old Yoga Bar entry no longer counts; only the tea\'s 9 g', /Added sugar\s*9 \/ ≤/.test(await row()), await row());
  await p.tap('[data-action=sugarWhy]'); await p.waitForTimeout(300);
  const why = (await p.textContent('.sugwhy')).replace(/\s+/g,' ');
  ok('Tapping shows where it came from: just the tea', /Tea with milk & sugar\s*9(\.0)? g/.test(why) && !/Yoga|Dal|Pineapple/.test(why), why);
  await p.screenshot({path:__dirname+'/sugar.png', clip:{x:0,y:150,width:390,height:600}});
  await p.tap('[data-action=sugarWhy]'); await p.waitForTimeout(200);
  ok('Tapping again hides it', !(await p.$('.sugwhy')));
  // log it fresh: still 0 added
  await p.fill('#logText', '50 g yoga bar oats'); await p.click('[data-action=log]'); await p.waitForTimeout(1500);
  ok('Newly logged Yoga Bar adds no sugar', /Added sugar\s*9 \/ ≤/.test(await row()), await row());
  // a real sweet still counts
  await p.fill('#logText', '1 gulab jamun'); await p.click('[data-action=log]'); await p.waitForTimeout(1500);
  ok('Gulab jamun still counts as added sugar', !/Added sugar\s*9 \/ ≤/.test(await row()), await row());
  ok('No page errors', !errs.length, errs.join(' | '));
  console.log(out.join('\n')); await b.close(); })();
