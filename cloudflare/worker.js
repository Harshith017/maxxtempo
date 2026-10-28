/* MaxxTempo API relay (Cloudflare Worker).
   Some Indian networks (Jio, Airtel, ACT) block *.supabase.co by DNS. The app talks to
   this Worker on *.workers.dev instead, and the Worker passes each request on to the
   Supabase project unchanged: sign-in, the database, storage, edge functions and the
   realtime websocket. It only forwards to these two projects and only these paths:
   /...      → MaxxTempo's project
   /ops/...  → the Ops Desk project (ops-desk/) */
const UPSTREAM = 'https://idmvlecpdgtiyjeikphi.supabase.co';
const OPS_UPSTREAM = 'https://ugplpkclluoqfvuadwam.supabase.co';
const PATHS = /^\/(auth|rest|storage|realtime|functions)\/v1(\/|$)/;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const ops = url.pathname.startsWith('/ops/');
    const pathname = ops ? url.pathname.slice(4) : url.pathname;
    if (!PATHS.test(pathname)) return new Response('Not found', { status: 404 });
    const target = (ops ? OPS_UPSTREAM : UPSTREAM) + pathname + url.search;
    // Websockets (realtime) and normal requests go through as they are, plus the caller's
    // address so the access function can limit sign-up requests per address.
    const fwd = new Request(target, request);
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) fwd.headers.set('X-Client-IP', ip);
    return fetch(fwd);
  },
};
