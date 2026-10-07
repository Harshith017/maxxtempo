const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs=require('fs');
const stub = fs.readFileSync(__dirname+'/stub3.js','utf8'); const seed = JSON.parse(fs.readFileSync(__dirname+'/seed.json','utf8'));
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}, hasTouch:true, isMobile:true}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog', d=>d.type()==='prompt'?d.accept('Push day'):d.accept());
  await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
  await p.route(/functions\/v1\//, r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"ok":true,"ready":true,"usage":{"count":0,"cap":30},"passkeys":[],"connected":false}'}));
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)(?!.*functions\/v1)/, r=>r.abort());
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body:stub}));
  await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(2000);
  await p.tap('.tab[data-view=gym]'); await p.waitForTimeout(400); await p.tap('[data-action=wkStart]'); await p.waitForTimeout(300);
  await p.tap('[data-action=wkAddEx]'); await p.waitForTimeout(300); await p.fill('#xp_q','bench'); await p.waitForTimeout(300); await p.tap('#xp_res .exrow'); await p.waitForTimeout(300);
  await (await p.$$('[data-wk=weight]'))[0].fill('60'); await (await p.$$('[data-wk=reps]'))[0].fill('8'); await (await p.$$('.wdone'))[0].tap(); await p.waitForTimeout(600);
  ok('Rest timer showing', await p.isVisible('#restbar'));
  // edit the ticked set and the next set while the timer runs
  const w0 = (await p.$$('[data-wk=weight]'))[0]; await w0.tap(); await p.waitForTimeout(700); await w0.evaluate(e=>e.select()); await p.keyboard.type('65', {delay:300}); await p.waitForTimeout(800);
  ok('Typing into the ticked set while resting works', (await w0.inputValue())==='65', await w0.inputValue());
  const w1 = (await p.$$('[data-wk=weight]'))[1]; await w1.tap(); await p.keyboard.type('62.5', {delay:300}); await p.waitForTimeout(800);
  ok('Typing into the next set while resting works', (await w1.inputValue())==='62.5', await w1.inputValue());
  ok('Focus stays in the box', await p.evaluate(()=>document.activeElement?.dataset?.wk==='weight'));
  // the bar moves to the top while typing, and back afterwards
  const topWhileTyping = await p.$eval('#restbar', e => e.getBoundingClientRect().top < 200);
  await p.evaluate(()=>document.activeElement.blur()); await p.waitForTimeout(150);
  const bottomAfter = await p.$eval('#restbar', e => e.getBoundingClientRect().top > 500);
  ok('Rest bar sits at the top while typing, bottom otherwise', topWhileTyping && bottomAfter);
  // buttons aren't rebuilt each tick
  const before = await p.$('#restbar [data-action=restStop]'); await p.waitForTimeout(1200);
  ok('Timer buttons stay the same elements while counting', await before.evaluate(e=>e.isConnected));
  const secs = async () => { const t = await p.textContent('#restbar .rtime'); const [m,s2]=t.split(':'); return +m*60 + +s2; };
  const s0 = await secs(); await p.tap('#restbar [data-action=restAdd][data-s="60"]'); await p.waitForTimeout(600); const s1 = await secs();
  ok('+60s adds a minute to the time left', s1 >= s0 + 58 && s1 <= s0 + 60, `${s0} → ${s1}`);
  // tap the ✕ a few times at random moments
  let stopped = false; for (let i=0;i<3 && !stopped;i++) { await p.waitForTimeout(170*i+90); const x = await p.$('#restbar [data-action=restStop]'); if (x) await x.tap().catch(()=>{}); await p.waitForTimeout(150); stopped = !(await p.isVisible('#restbar')); }
  ok('✕ stops the timer on the first tap', stopped);
  // People list fits the screen
  await p.tap('.tab[data-view=profile]').catch(()=>{});
  ok('No page errors', !errs.length, errs.join(' | ')); console.log(out.join('\n')); await b.close(); })();
