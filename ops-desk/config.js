/* Ops Desk settings. Both values are safe to publish: the anon key only works together with
   the database's row-level security. Supabase → Project Settings → API. */
window.OPS_CONFIG = {
  SUPABASE_URL: 'https://ugplpkclluoqfvuadwam.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVncGxwa2NsbHVvcWZ2dWFkd2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNzYxMTQsImV4cCI6MjEwODc1MjExNH0.W_mDrk5FF7V0L8oYY_4Wph11iL1XQYwXW2BafR48Zr4',
  // The Cloudflare Worker relay (../cloudflare/worker.js). Some Indian networks block supabase.co;
  // when the direct address doesn't answer, the app goes through this instead.
  SUPABASE_PROXY_URL: 'https://maxxtempo-api.harshithhb17.workers.dev/ops',
};
