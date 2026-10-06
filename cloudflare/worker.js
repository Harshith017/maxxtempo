/* MaxxTempo API relay (Cloudflare Worker).
   Some Indian networks (Jio, Airtel, ACT) block *.supabase.co by DNS. The app talks to
   this Worker on *.workers.dev instead, and the Worker passes each request on to the
   Supabase project unchanged: sign-in, the database, storage, edge functions and the
   realtime websocket. It only forwards to this one project and only these paths. */
const UPSTREAM = 'https://idmvlecpdgtiyjeikphi.supabase.co';
const PATHS = /^\/(auth|rest|storage|realtime|functions)\/v1(\/|$)/;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!PATHS.test(url.pathname)) return new Response('Not found', { status: 404 });
    const target = UPSTREAM + url.pathname + url.search;
    // Websockets (realtime) and normal requests both go through as they are.
    return fetch(new Request(target, request));
  },
};
