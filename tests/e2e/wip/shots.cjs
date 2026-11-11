/* Screenshots of the main screens in light and dark, with realistic data. Usage: node shots.cjs <outdir> [tag] */
const { chromium } = require('playwright'); const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub3.js', 'utf8'); const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json', 'utf8'));
const out = process.argv[2] || '/tmp', tag = process.argv[3] || 'shot';
(async () => {
  const b = await chromium.launch();
  for (const theme of ['light', 'dark']) {
    const p = await (await b.newContext({ viewport:{ width:390, height:844 }, deviceScaleFactor:2, colorScheme:theme })).newPage();
    p.on('pageerror', e => console.log('PAGEERROR', e.message));
    await p.addInitScript(`(() => { const d = new Date(), pad=n=>String(n).padStart(2,'0'), day = o => { const x = new Date(d.getTime()-o*864e5); return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate()); };
      const F = (id,name,q,g,meal,time,kcal,p,c,f) => ({id,name,quantity:q,grams:g,meal,time,kcal,protein:p,carbs:c,fat:f,fiber:3,sugar:4,micros:{},confidence:'high',source:'food-db'});
      const E = (id,name,g,sets) => ({id,name,muscle_group:g,sets,time:'18:20',source:'workout',workout_id:'w1',kcal:40});
      const mk = (o, k) => ({collection:'days', id:day(o), data:{date:day(o), weight_kg:null, health:{steps:5200+o*900, active_kcal:380},
        water:[{id:'w'+o,ml:1500,time:'10:00'}],
        foods:[F('a'+o,'Masala oats','1 bowl',250,'breakfast','08:40',310,11,48,8),F('b'+o,'Chicken breast','150 g',150,'lunch','13:30',248,46,0,5),F('c'+o,'Cooked rice','200 g',200,'lunch','13:30',260,5,56,1),F('d'+o,'Whey protein','1 scoop',30,'',pad(Math.max(0,d.getHours()-2))+':10',120,24,3,1)].slice(0,k),
        workouts: o%2===0 ? [{id:'w1',name:'Tue · Pull (back)',started:new Date(d.getTime()-o*864e5).toISOString(),minutes:62,exercises:3,sets:9,volume:6200+o*150}] : [],
        exercises: o%2===0 ? [E('x1','Lat Pulldown','back',[{weight:50+o,reps:10},{weight:55+o,reps:9},{weight:60+o,reps:8}]),E('x2','Dumbbell Row','back',[{weight:25,reps:10},{weight:27.5,reps:8},{weight:30,reps:8}]),E('x3','Shoulder Shrug','shoulders',[{weight:70,reps:12},{weight:70,reps:13},{weight:80,reps:15}])] : []}});
      window.__SEED__ = ${JSON.stringify(seed)}.filter(x => x.collection!=='days').concat([0,1,2,3,4,5,6,8,10,12].map(o => mk(o, 4)));
      try{ localStorage.setItem('mt:theme','${theme}'); localStorage.setItem('fl:folds','["d-food","g-settings"]'); }catch{} })();`);
    await p.route(/functions\/v1\//, r => r.fulfill({ status:200, contentType:'application/json', headers:{ 'access-control-allow-origin':'*' }, body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}' }));
    await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!fonts\.)(?!.*functions\/v1)/, r => r.abort());
    await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body:stub }));
    await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html');
      r.fulfill({ status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-[^"]*"/g, '') }); });
    await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(3000);
    for (const v of ['today','gym','trends','profile']) {
      await p.click(`.tab[data-view=${v}]`); await p.waitForTimeout(900);
      await p.screenshot({ path:`${out}/${tag}-${theme}-${v}.png`, fullPage:true });
    }
    if (theme==='light') { await p.click('.tab[data-view=gym]'); await p.waitForTimeout(400); const s = await p.$('[data-action=wkStartRoutine],[data-action=wkStart]'); if (s) { await s.click(); await p.waitForTimeout(700); await p.screenshot({ path:`${out}/${tag}-${theme}-workout.png`, fullPage:true }); } }
    await p.close();
  }
  await b.close();
})();
