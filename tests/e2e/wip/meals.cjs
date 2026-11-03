/* No automatic meal; optional meal chips; untagged food grouped; time since last meal above Quick add. */
const { chromium } = require('playwright'); const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub3.js', 'utf8'); const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json', 'utf8'));
const out = []; const ok = (n, p, i = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport:{ width:390, height:844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(`(() => { const d = new Date(Date.now()-3*3600e3-25*60e3), pad=n=>String(n).padStart(2,'0'), t = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    window.__SEED__ = ${JSON.stringify(seed)}.concat([{collection:'days', id:t, data:{date:t, water:[], exercises:[], weight_kg:null,
      foods:[{id:'p1', name:'Poha', quantity:'1 plate', grams:200, meal:'breakfast', time:pad(d.getHours())+':'+pad(d.getMinutes()), kcal:350, protein:8, carbs:60, fat:9, fiber:4, sugar:5, micros:{}, confidence:'high', source:'food-db'},
             {id:'p2', name:'Black coffee', quantity:'1 cup', grams:240, meal:'', time:pad(d.getHours())+':'+pad(d.getMinutes()), kcal:2, protein:0, carbs:0, fat:0, fiber:0, sugar:0, micros:{}, confidence:'high', source:'food-db'}]}}]);
    try{localStorage.setItem('fl:folds','["d-food"]')}catch{} })();`);
  await p.route(/functions\/v1\//, r => r.fulfill({ status:200, contentType:'application/json', headers:{ 'access-control-allow-origin':'*' }, body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}' }));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body:stub }));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html');
    r.fulfill({ status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-[^"]*"/g, '') }); });
  await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(2500);
  const since = (await p.textContent('#sinceMeal').catch(()=>'')).replace(/\s+/g,' ');
  ok('Since-last-meal line shows Poha ~3h 25m (coffee ignored)', /Since last meal: 3h 2[45]m/.test(since) && /Poha/.test(since), since);
  ok('Five optional meal chips, none picked', await p.$$eval('[data-action=logMeal]', xs => xs.length===5 && xs.every(x=>x.getAttribute('aria-pressed')==='false') && xs.map(x=>x.textContent).join()==='Breakfast,Brunch,Lunch,Snack,Dinner'));
  // log with no meal picked
  await p.fill('#logText', '2 boiled eggs'); await p.click('[data-action=log]'); await p.waitForTimeout(1200);
  let food = (await p.textContent('[aria-label="What I ate"]')).replace(/\s+/g,' ');
  ok('Food logged with no meal goes under "No meal tag"', /No meal tag.*(Boiled )?egg/i.test(food), food.slice(0,200));
  // pick Lunch, log
  await p.click('[data-action=logMeal][data-m=lunch]');
  ok('Chip toggles on', await p.getAttribute('[data-action=logMeal][data-m=lunch]', 'aria-pressed') === 'true');
  await p.fill('#logText', '1 banana'); await p.click('[data-action=log]'); await p.waitForTimeout(1200);
  food = (await p.textContent('[aria-label="What I ate"]')).replace(/\s+/g,' ');
  ok('Picked meal is used, then cleared', /Lunch.*banana/i.test(food) && await p.getAttribute('[data-action=logMeal][data-m=lunch]', 'aria-pressed') === 'false', food.slice(0,240));
  ok('Since-last-meal updates to the new food', /Since last meal: just now · Banana/.test((await p.textContent('#sinceMeal')).replace(/\s+/g,' ')), await p.textContent('#sinceMeal'));
  await p.screenshot({ path: process.env.SHOT || '/tmp/meals.png', fullPage:false });
  ok('No page errors', !errs.length, errs.join(' | '));
  console.log(out.join('\n')); await b.close();
})();
