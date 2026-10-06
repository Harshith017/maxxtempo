(function(){
  const seed = window.__SEED__ || [];
  const member = window.__MEMBER__ || {status:'approved', is_admin:true};
  const members = window.__MEMBERS__ || [];
  window.__rpc = [];
  const user = window.__USER__ || { id:'u1', email:'you@example.com', user_metadata:{full_name:'Harshith B'} };
  const session = { user, access_token:'t' };
  function q(rows, one){ const res = { data: rows, error: null };
    const c = { select(){return c}, eq(){return c}, order(){return c}, in(){return c}, limit(){return c}, range(){return Promise.resolve(res)},
      maybeSingle(){ return Promise.resolve({data: one, error:null}); }, upsert(x){ (window.__up=window.__up||[]).push(x); return Promise.resolve({error:null}); }, delete(){ window.__deleted=(window.__deleted||0)+1; return c; }, match(){ const r=Promise.resolve({error:null, data:null}); r.maybeSingle=()=>Promise.resolve({data:null, error:null}); return r; }, then(a,b){return Promise.resolve(res).then(a,b)} }; return c; }
  window.__feed = window.__FEED__ || { feed_posts:[], feed_likes:[] };
  function fq(t){ const st = window.__feed; let filt = () => true, op = 'select', payload = null;
    const run = () => { if (op==='insert') { const row = t==='feed_posts' ? {id:'p'+Math.random().toString(36).slice(2,8), user_id:user.id, created_at:new Date().toISOString(), ...payload} : {user_id:user.id, ...payload}; st[t].push(row); return {data:row, error:null}; }
      if (op==='delete') { st[t] = st[t].filter(r=>!filt(r)); return {data:null, error:null}; }
      return {data: st[t].filter(filt).slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))), error:null}; };
    const and = f => { const g = filt; filt = r => g(r) && f(r); };
    const c = { select(){return c}, order(){return c}, limit(){return c}, single(){ return Promise.resolve(run()); },
      gte(k,v){ and(r=>String(r[k])>=v); return c; }, in(k,v){ and(r=>v.includes(r[k])); return c; }, eq(k,v){ and(r=>r[k]===v); return Promise.resolve(run()); },
      match(o){ and(r=>Object.entries(o).every(([k,v])=>r[k]===v)); return Promise.resolve(run()); },
      insert(x){ op='insert'; payload=x; return c; }, delete(){ op='delete'; return c; }, then(a,b){ return Promise.resolve(run()).then(a,b); } };
    return c; }
  window.supabase = { createClient(){ return {
    auth:{ getSession: async()=>({data:{session}}), onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; }, signOut: async()=>({}), signInWithOAuth: async(o)=>{ window.__oauth=o; return {error:null}; } },
    from(t){ if (t==='feed_posts' || t==='feed_likes') return fq(t); return t==='shared_foods' ? q([], window.__SHARED__||null) : t==='members' ? q(members, member) : t==='leaderboard' ? q(window.__BOARD__||[]) : q(seed); },
    rpc: async (fn, args) => { window.__rpc.push([fn,args]); const m = members.find(x=>x.user_id===args.p_user); if (m) m.status=args.p_status; return {error:null}; },
    storage:{ from(){ window.__files = window.__files || []; return {
      list: async () => ({data: window.__files.map(f=>({name:f.split('/').pop()})), error:null}),
      createSignedUrls: async (paths) => ({data: paths.map(p=>({signedUrl:'data:image/gif;base64,R0lGODlhAQABAAAAACw='})), error:null}),
      upload: async (path) => { window.__files.unshift(path); return {error:null}; },
      remove: async (paths) => { window.__files = window.__files.filter(f=>!paths.includes(f)); return {error:null}; } }; } },
    channel(){ const ch = { on(){return ch}, subscribe(cb){ cb && cb('SUBSCRIBED'); return ch; } }; return ch; },
    removeChannel(){},
  }; } };
})();
