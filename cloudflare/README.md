# Cloudflare Worker relay

Some Indian networks (Jio, Airtel, ACT) block `*.supabase.co`, so the app can't sign in
or sync there. This Worker runs on Cloudflare's `workers.dev`, which isn't blocked, and
passes the app's requests on to the Supabase project.

Live at `https://maxxtempo-api.harshithhb17.workers.dev` (set as `SUPABASE_PROXY_URL` in `config.js`).

## Deploy (Cloudflare dashboard, about 3 minutes)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker**.
2. Name it `maxxtempo-api` → **Deploy**.
3. **Edit code**, delete what's there, paste all of `worker.js` → **Deploy**.
4. Under **Domains**, switch on the **Production** `workers.dev` address (it starts off).
5. Copy the Worker's address, like `https://maxxtempo-api.<your-subdomain>.workers.dev`.
6. Put it in `config.js` as `SUPABASE_PROXY_URL`, and add it (https and wss) to the
   `connect-src` and `img-src` lists in the Content-Security-Policy in `index.html`.

The free plan allows 100,000 requests a day, plenty for a small group.

Check it works: opening `https://maxxtempo-api.<your-subdomain>.workers.dev/auth/v1/health`
in a browser should show a short JSON message (an "apikey" error is fine — it means
Supabase answered through the Worker).
