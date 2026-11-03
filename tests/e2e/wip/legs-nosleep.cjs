/* Sleep is gone from the app, and legs are split into quads, hamstrings, glutes and calves
   (older logs that say "legs" are sorted by exercise name). */
const { chromium } = require('playwright'); const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub3.js', 'utf8');
const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json', 'utf8'));
const out = []; const ok = (n, p, i = '') => out.push(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport:{ width:390, height:844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(`(() => { const d = new Date(), t = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    window.__SEED__ = ${JSON.stringify(seed)}.concat([{collection:'days', id:t, data:{date:t, foods:[], water:[], weight_kg:null,
      health:{steps:6000, sleep_min:420, bed_time:'23:30', wake_time:'06:30'},
      exercises:[{id:'a', name:'Lying Leg Curl', muscle_group:'legs', sets:[{weight:40,reps:10},{weight:40,reps:10}]},
                 {id:'b', name:'Back Squat', muscle_group:'legs', sets:[{weight:100,reps:5}]},
                 {id:'c', name:'Standing Calf Raise', muscle_group:'legs', sets:[{weight:60,reps:12}]}]}}]); })();`);
  await p.route(/functions\/v1\/claude/, r => r.fulfill({ status:200, contentType:'application/json', headers:{ 'access-control-allow-origin':'*' }, body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30}}' }));
  await p.route(/functions\/v1\/(?!claude)/, r => r.fulfill({ status:200, contentType:'application/json', headers:{ 'access-control-allow-origin':'*' }, body:'{"ok":true,"passkeys":[],"connected":false}' }));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r => r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body:stub }));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html');
    r.fulfill({ status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-[^"]*"/g, '') }); });
  await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(3000);
  const txt = async () => (await p.textContent('body')).replace(/\s+/g, ' ');

  const today = await txt();
  ok('Today has steps but no sleep', /Steps/.test(today) && !/sleep|slept/i.test(today), (today.match(/.{40}sleep.{40}/i)||[''])[0]);

  await p.click('.tab[data-view=gym]'); await p.waitForTimeout(800);
  const gym = await txt();
  ok('Old "legs" logs show as hamstrings, quads and calves', /Lying Leg Curl.{0,20}hamstrings/i.test(gym) && /Back Squat.{0,20}quads/i.test(gym) && /Standing Calf Raise.{0,20}calves/i.test(gym) && !/\blegs\b/.test(gym),
    (gym.match(/Lying Leg Curl.{0,40}/)||[''])[0]);

  await p.click('.tab[data-view=trends]'); await p.waitForTimeout(1000);
  ok('Trends has no sleep', !/sleep/i.test(await txt()));
  ok('Trends body map and bars have quads, hamstrings and calves', await p.evaluate(() => ['Quads','Hamstrings','Calves'].every(m => [...document.querySelectorAll('title')].some(t => t.textContent.startsWith(m+':')))));
  ok('No "Legs" bar left', !/\bLegs\b/.test(await p.textContent('.musclebars').catch(()=>'')), await p.textContent('.musclebars').catch(()=>'no bars'));
  await p.click('.tab[data-view=profile]'); await p.waitForTimeout(800);
  ok('Profile has no sleep', !/sleep|slept/i.test(await txt()));
  ok('No page errors', !errs.length, errs.join(' | '));
  console.log(out.join('\n')); await b.close();
})();
