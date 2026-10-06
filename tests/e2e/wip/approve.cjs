const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const stub = fs.readFileSync(__dirname + '/stub2.js', 'utf8');
const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json','utf8'));
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
async function open(b, init, {flags=false, signedOut=false, scheme='light'}={}){
  const ctx=await b.newContext({viewport:{width:390,height:844}, colorScheme:scheme}); const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message)); p.on('dialog',d=>d.accept());
  await p.addInitScript(init);
  await p.route(/^https:\/\/(?!cdn\.jsdelivr)/, async r => { const u=r.request().url(); if (!/fonts\.(googleapis|gstatic)\.com/.test(u)) return r.abort();
    try { const res=await fetch(u,{headers:{'user-agent':r.request().headers()['user-agent']}}); const hd={}; res.headers.forEach((v,k)=>{ if(!/encoding|length/.test(k)) hd[k]=v; }); hd['access-control-allow-origin']='*'; r.fulfill({status:res.status,headers:hd,body:Buffer.from(await res.arrayBuffer())}); } catch { r.abort(); } });
  let body = stub; if (signedOut) body = body.replace("getSession: async()=>({data:{session}})", "getSession: async()=>({data:{session:null}})");
  await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r=>r.fulfill({contentType:'application/javascript', body})); await p.route(/localhost:8765\/(index\.html)?(\?.*)?$/, async r => { const res = await fetch('http://localhost:8765/index.html'); r.fulfill({status:200, contentType:'text/html', body:(await res.text()).replace(/ integrity="sha384-Rj26[^"]*"/,'')}); });
  if (flags) await p.route(/config\.js/, async r => { const t = fs.readFileSync('/home/user/fuel-lift/config.js','utf8').replace('GOOGLE_SIGN_IN: false','GOOGLE_SIGN_IN: true'); r.fulfill({contentType:'application/javascript', body:t}); });
  await p.goto('http://localhost:8765/',{waitUntil:'load'}); await p.waitForTimeout(1300); return {ctx,p}; }
const T = async (p,s)=>((await p.textContent(s).catch(()=>''))||'').replace(/\s+/g,' ').trim();
(async()=>{ const b=await chromium.launch();
  // sign-in screen
  { const {ctx,p}=await open(b, `window.__SEED__=[];`, {flags:true, signedOut:true});
    ok('Sign-in shows Face ID and Google, no Apple', !!(await p.$('[data-action=faceIdSignIn]')) && !!(await p.$('[data-p=google]')) && !(await p.$('[data-p=apple]')));
    await p.click('[data-p=google]'); await p.waitForTimeout(200); ok('Google button starts Google sign-in', (await p.evaluate(()=>window.__oauth?.provider))==='google');
    await p.reload(); await p.waitForTimeout(1000); await p.screenshot({path:__dirname+'/ap/signin.png'}); ok('no errors (sign-in)', !p.errs.length, p.errs.join('|')); await ctx.close(); }
  { const {ctx,p}=await open(b, `window.__SEED__=[];`, {flags:false, signedOut:true}); ok('Google stays hidden until switched on', !(await p.$('[data-p=google]'))); await ctx.close(); }
  // new person waiting
  { const {ctx,p}=await open(b, `window.__SEED__=[]; window.__MEMBER__={status:'pending'}; window.__USER__={id:'n1',email:'friend@gmail.com',user_metadata:{full_name:'Rahul K'}};`);
    const h = await T(p,'#main'); ok('New person sees the waiting screen', /Thanks, Rahul/.test(h) && /approves/.test(h), h.slice(0,90));
    ok('Tabs are hidden while waiting', await p.$eval('.tabs', e=>e.hidden)); await p.screenshot({path:__dirname+'/ap/waiting.png'});
    await p.evaluate(()=>{ window.__MEMBER__.status='approved'; }); await p.click('[data-action=recheckMember]'); await p.waitForTimeout(700);
    const after = await T(p,'#main'); ok('After approval, Check again opens the app (setup for a new person)', /Set up|Log food/.test(after) && !/Thanks/.test(after), after.slice(0,70)); ok('no errors (waiting)', !p.errs.length, p.errs.join('|')); await ctx.close(); }
  // declined
  { const {ctx,p}=await open(b, `window.__SEED__=[]; window.__MEMBER__={status:'declined'}; window.__USER__={id:'n2',email:'x@gmail.com',user_metadata:{}};`);
    ok('Declined person sees "not approved"', /(not|isn’t) approved/i.test(await T(p,'#main'))); await ctx.close(); }
  // owner approves someone
  { const members = [{user_id:'u1',email:'you@example.com',name:'Harshith B',provider:'email',status:'approved',is_admin:true,requested_at:'2026-09-26T10:00:00Z',decided_at:'2026-09-26T10:00:00Z'},
                     {user_id:'n1',email:'friend@gmail.com',name:'Rahul K',provider:'google',status:'pending',is_admin:false,requested_at:'2026-09-27T08:00:00Z',decided_at:null}];
    const {ctx,p}=await open(b, `window.__SEED__=${JSON.stringify(seed)}; window.__MEMBER__={status:'approved',is_admin:true}; window.__MEMBERS__=${JSON.stringify(members)};`);
    ok('Owner sees a banner on Today', /1 person is waiting/.test(await T(p,'.banner')), await T(p,'.banner'));
    await p.screenshot({path:__dirname+'/ap/banner.png'});
    await p.click('.banner [data-action=reviewPeople]'); await p.waitForTimeout(500);
    ok('Review opens People & approvals', /Rahul K/.test(await T(p,'[data-fold=s-people] .fold-body')));
    await p.evaluate(()=>document.querySelector('[data-fold=s-people]').scrollIntoView()); await p.screenshot({path:__dirname+'/ap/people.png'});
    await p.click('[data-action=memberSet][data-s=approved]'); await p.waitForTimeout(400);
    ok('Approve calls the database', JSON.stringify(await p.evaluate(()=>window.__rpc))===JSON.stringify([['set_member_status',{p_user:'n1',p_status:'approved'}]]));
    ok('Rahul moves to Approved', /Approved.*Rahul K/.test(await T(p,'[data-fold=s-people] .fold-body')));
    ok('Owner cannot remove themselves', (await p.$$('[data-fold=s-people] [data-action=memberSet][data-id=u1]')).length===0);
    ok('no errors (owner)', !p.errs.length, p.errs.join('|')); await ctx.close(); }
  // not-owner does not see approvals
  { const {ctx,p}=await open(b, `window.__SEED__=${JSON.stringify(seed)}; window.__MEMBER__={status:'approved',is_admin:false};`);
    await p.click('.tab[data-view=profile]'); ok('Regular users do not see People & approvals', !(await p.$('[data-fold=s-people]'))); await ctx.close(); }
  console.log(out.join('\n')); await b.close(); })();
