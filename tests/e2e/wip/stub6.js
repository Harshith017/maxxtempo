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
  window.supabase = { createClient(){ return {
    auth:{ getSession: async()=>({data:{session: window.__NOSESSION__ ? null : session}}), signInWithPassword: async(c)=>{ window.__signin=c; return {error: window.__NETERR__ ? {name:"AuthRetryableFetchError", message:"Failed to fetch", status:0} : window.__PWERR__ ? {message:"Invalid login credentials"} : null}; }, onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; }, signOut: async()=>({}), signInWithOAuth: async(o)=>{ window.__oauth=o; return {error:null}; } },
    from(t){ return t==='shared_foods' ? q([], window.__SHARED__||null) : t==='members' ? q(members, member) : t==='leaderboard' ? q(window.__BOARD__||[]) : q(seed); },
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
