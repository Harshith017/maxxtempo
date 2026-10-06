(function(){
  const seed = window.__SEED__ || [];
  const user = { id:'u1', email:'you@example.com' };
  const session = { user, access_token:'t' };
  function q(rows){ const p = Promise.resolve({ data: rows, error: null });
    const c = { select(){return c}, eq(){return c}, order(){return c}, range(){return p}, upsert(){return Promise.resolve({error:null})}, delete(){return c}, match(){ const r=Promise.resolve({error:null, data:null}); r.maybeSingle=()=>Promise.resolve({data:null, error:null}); return r; }, then(a,b){return p.then(a,b)} }; return c; }
  window.supabase = { createClient(){ return {
    auth:{ getSession: async()=>({data:{session}}), onAuthStateChange(){ return {data:{subscription:{unsubscribe(){}}}}; }, signOut: async()=>({}) },
    from(){ return q(seed); },
    channel(){ const ch = { on(){return ch}, subscribe(cb){ cb && cb('SUBSCRIBED'); return ch; } }; return ch; },
    removeChannel(){},
  }; } };
})();
