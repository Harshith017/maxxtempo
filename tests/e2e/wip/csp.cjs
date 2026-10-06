const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const relay = async r => { try { const req=r.request(); const res = await fetch(req.url(), { method:req.method(), headers:req.headers(), body:req.postDataBuffer()||undefined }); const h={}; res.headers.forEach((v,k)=>{ if(!/content-encoding|content-length|transfer-encoding/.test(k)) h[k]=v; }); r.fulfill({status:res.status, headers:h, body:Buffer.from(await res.arrayBuffer())}); } catch(e){ r.abort(); } };
(async () => {
  const b = await chromium.launch(); const out=[]; const ok=(n,p,i='')=>out.push(`${p?'PASS':'FAIL'}  ${n}${i?'  — '+i:''}`);
  const ctx = await b.newContext({ viewport:{width:390,height:844} }); const p = await ctx.newPage();
  const csp=[], errs=[]; p.on('console', m => { if (/Content Security Policy|integrity/i.test(m.text())) csp.push(m.text().slice(0,160)); }); p.on('pageerror', e=>errs.push(e.message));
  await p.route(/^https:\/\//, relay);
  await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(2500);
  ok('Real Supabase library loads with its integrity hash', await p.evaluate(()=>!!window.supabase));
  ok('Sign-in screen renders', /Sign in|email/i.test(await p.textContent('#main')));
  ok('Archivo font loads', await p.evaluate(async()=>{ await document.fonts.ready; return document.fonts.check('16px Archivo'); }));
  ok('Face ID library loads (pinned + hash)', await p.evaluate(async()=>{ try { await new Promise((res,rej)=>{ const el=document.createElement('script'); el.src='https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@14.0.0/dist/bundle/index.umd.min.js'; el.integrity='sha384-06g944bCm8L/wG3i0Q8PdB8jccE4GdpHdNCa1tJY8eMqoP3GIHGJdL6B5lD5OMGD'; el.crossOrigin='anonymous'; el.onload=res; el.onerror=rej; document.head.appendChild(el); }); return !!window.SimpleWebAuthnBrowser; } catch { return false; } }));
  ok('Tampered library is refused', await p.evaluate(async()=>{ try { await new Promise((res,rej)=>{ const el=document.createElement('script'); el.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; el.integrity='sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; el.crossOrigin='anonymous'; el.onload=res; el.onerror=rej; document.head.appendChild(el); }); return false; } catch { return !window.XLSX; } }));
  ok('Inline script injection is blocked', await p.evaluate(()=>{ const s=document.createElement('script'); s.textContent='window.__pwn=1'; document.head.appendChild(s); return !window.__pwn; }));
  ok('Script from a foreign site is blocked', await p.evaluate(()=>new Promise(r=>{ const s=document.createElement('script'); s.src='https://evil.example.com/x.js'; s.onload=()=>r(false); s.onerror=()=>r(true); document.head.appendChild(s); })));
  // Breach check through the sign-up form
  await p.click('text=Create account').catch(()=>{}); await p.waitForTimeout(300);
  await p.fill('#authEmail','nobody-test@example.com'); await p.fill('#authPass','password123');
  const btn = await p.$('[data-action=authSignUp]'); if (btn) await btn.click(); await p.waitForTimeout(2500);
  const msg = await p.textContent('#main'); ok('Breached password is rejected at sign-up', /data breach/.test(msg), (msg.match(/That password[^.]*\./)||[''])[0]);
  const good = await p.evaluate(()=>fetch('https://api.pwnedpasswords.com/range/ABCDE').then(r=>r.ok));
  ok('Breach lookup reachable under CSP', good);
  ok('No CSP / integrity violations for the app\'s own resources', !csp.filter(c=>!/evil\.example|AAAAAAAA|__pwn|inline/i.test(c)).length, csp.join(' | '));
  ok('No page errors', !errs.length, errs.join(' | '));
  console.log(out.join('\n')); await b.close();
})();
