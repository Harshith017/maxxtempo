const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const ROOT = '/home/user/fuel-lift', APP = 'https://harshith017.github.io/maxxtempo/';
const tu = JSON.parse(fs.readFileSync(__dirname+'/testuser.json','utf8')), pw = fs.readFileSync(__dirname+'/testpw','utf8').trim();
const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
const types = {'.js':'application/javascript','.html':'text/html','.json':'application/json','.png':'image/png','.css':'text/css'};
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844} }); const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
  // serve this checkout at the real address, so the passkey belongs to harshith017.github.io
  await p.route(/^https:\/\/harshith017\.github\.io\/maxxtempo\//, r => { let f = new URL(r.request().url()).pathname.replace('/maxxtempo/',''); if (!f) f='index.html';
    const fp = path.join(ROOT, f); if (!fs.existsSync(fp)) return r.fulfill({status:404, body:''}); r.fulfill({ status:200, contentType: types[path.extname(fp)]||'application/octet-stream', body: fs.readFileSync(fp) }); });
  await p.route(/^https:\/\/(idmvlecpdgtiyjeikphi\.supabase\.co|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com)\//, async r => { const q=r.request();
    try { const res = await fetch(q.url(), { method:q.method(), headers:q.headers(), body:q.postDataBuffer()||undefined }); const hd={}; res.headers.forEach((v,k)=>{ if(!/encoding|length/.test(k)) hd[k]=v; }); r.fulfill({status:res.status, headers:hd, body:Buffer.from(await res.arrayBuffer())}); } catch(e) { r.abort(); } });
  await p.route(/^wss?:/, r => r.abort());
  p.on('response', async res => { if (/functions\/v1\/passkey|auth\/v1\/verify/.test(res.url())) { let t=''; try { t=(await res.text()).slice(0,160); } catch {} const req=res.request(); let a=''; try { a=JSON.parse(req.postData()||'{}').action||''; } catch {} console.log('  >>', res.status(), res.url().replace(/^.*\/(functions|auth)/,'/$1'), a, t.replace(/"token_hash":"[^"]+"/,'"token_hash":"…"')); } });
  const cdp = await ctx.newCDPSession(p); await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options:{ protocol:'ctap2', transport:'internal', hasResidentKey:true, hasUserVerification:true, isUserVerified:true, automaticPresenceSimulation:true } });
  await p.goto(APP, { waitUntil:'load' }); await p.waitForTimeout(1500);
  ok('Sign-in screen offers Face ID', !!(await p.$('[data-action=faceIdSignIn]')));
  // 1. no passkey yet: Face ID sign-in explains what to do
  await p.click('[data-action=faceIdSignIn]'); await p.waitForTimeout(2500);
  ok('Without a passkey, Face ID explains to sign in first', /isn’t set up|cancelled/.test(await p.textContent('.status')), (await p.textContent('.status')).slice(0,90));
  // 2. sign in with password, turn on Face ID
  await p.fill('#authEmail', tu.email); await p.fill('#authPass', pw); await p.click('[data-action=authPassword]'); await p.waitForTimeout(4000);
  const main = (await p.textContent('#main')).replace(/\s+/g,' ');
  ok('Approved test user gets into the app', /Set up|Log food/.test(main), main.slice(0,60));
  if (await p.$('[data-action=setupSkip]')) { await p.click('[data-action=setupSkip]'); await p.waitForTimeout(800); }
  if (!(await p.isVisible('#menuBtn'))) { await p.fill('input[type=date]', '1999-05-01').catch(()=>{});
    for (let i=0;i<8;i++){ const nx = await p.$('button:has-text("Next"), button:has-text("Finish"), button:has-text("Done"), button:has-text("Save")'); if(!nx || await p.isVisible('#menuBtn')) break; await nx.click(); await p.waitForTimeout(400); } }
  console.log('so far:\n' + out.join('\n'));
  await p.click('#menuBtn'); await p.waitForTimeout(1500);
  ok('Settings has the Face ID section', /Sign in with/i.test(await p.textContent('#menuPk')));
  await p.click('#menuPk [data-action=faceIdSetup]'); await p.waitForTimeout(5000);
  const creds = (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials;
  ok('Turning on Face ID creates a passkey for harshith017.github.io', creds.length===1 && creds[0].rpId==='harshith017.github.io', `${creds.length} credential(s), rpId ${creds[0]?.rpId}`);
  const listed = (await p.textContent('#menuPk')).replace(/\s+/g,' ');
  ok('Settings lists the new passkey', /added/.test(listed), listed.slice(0,120));
  // 3. sign out, sign back in with Face ID
  await p.click('#menuBody [data-action=signOut]'); await p.waitForTimeout(3000);
  ok('Signed out', !!(await p.$('[data-action=faceIdSignIn]')));
  await p.click('[data-action=faceIdSignIn]'); await p.waitForTimeout(5000);
  const back = (await p.textContent('#main')).replace(/\s+/g,' ');
  console.log('  status after Face ID:', await p.textContent('.status').catch(()=>'-')); ok('Sign in with Face ID works (no password)', /Log food|Set up|Good (morning|afternoon|evening)/.test(back), back.slice(0,70));
  ok('no page errors', !errs.length, errs.join(' | '));
  fs.writeFileSync(__dirname+'/pke2e-cred.json', JSON.stringify({authenticatorId, n:creds.length}));
  await p.screenshot({ path: __dirname+'/ap/faceid-in.png' });
  // 4. keep the browser's passkey, but decline the account, then try again
  fs.writeFileSync(__dirname+'/pke2e-state.json', JSON.stringify(await ctx.storageState()));
  console.log(out.join('\n'));
  // hand the credential to the next step
  const all = (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials; fs.writeFileSync(__dirname+'/pke2e-creds.json', JSON.stringify(all));
  await b.close();
})();
