# Ops Desk

Track **exchanges, returns and escalations** for the ops team. Admins assign cases; whoever has a case gets an alert **every 30 minutes** until they start it or post an update.

Built like MaxxTempo: a static app on GitHub Pages, with Supabase for sign-in, data and the reminder schedule.

- **App**: https://harshith017.github.io/maxxtempo/ops-desk/
- **Database**: Supabase project `ops-desk` (`ugplpkclluoqfvuadwam`, Mumbai, free plan)

## Using it
- **Admins** create cases, assign or reassign them, see the Overview (who has what, what's overdue), and manage the team under **Team**: add people with a temporary password, switch roles, disable accounts, set a new password when someone forgets theirs.
- **Agents** log new cases, work the ones assigned to them (Start → Waiting on customer → Resolve), and can comment on any case.
- Everyone signs in with email and password. On first sign-in (or after an admin resets it) they choose their own password.
- Each case moves new → assigned → in progress ⇄ waiting → resolved/closed, and every step is kept in its timeline.

## Reminders
- Every 20 seconds the database checks for open cases (assigned / in progress / waiting) whose assignee hasn't started them or posted an update for 30 minutes. It sends a reminder, then another every 30 minutes until they act.
- Starting the case, posting a note or changing its status resets the clock; resolving or closing stops it. An admin commenting doesn't reset it. Disabled people get nothing.
- Reminders and new assignments arrive as phone/PC notifications (even with the app closed) once that person taps **Turn on alerts** on each device, and always in the 🔔 list inside the app.
- To change the interval: Supabase → Table Editor → `ops_config` → `reminder_minutes`.

## Install on phones and PCs
- **Android** (Chrome): open the link → **Install** in the banner (or ⋮ → *Install app*) → **Turn on alerts**.
- **Windows** (Edge or Chrome): open the link → **Install** (banner or the icon in the address bar) → **Turn on alerts**.
- **iPhone** (iOS 16.4+): Share → *Add to Home Screen*, open it from the home screen, then **Turn on alerts**.

## Networks that block supabase.co (Jio, Airtel, ACT)
The app tries Supabase directly and falls back to the Cloudflare relay (`../cloudflare/worker.js`, which now also forwards `/ops/...` to this project). After this is merged, paste the new `worker.js` into the existing `maxxtempo-api` Worker in Cloudflare (Workers & Pages → maxxtempo-api → Edit code → paste → Deploy).

## Files
- `index.html`, `app.js`, `style.css`: the app; `config.js`: project address and public key
- `sw.js`, `manifest.webmanifest`, `icon-*`: installable app + notifications
- `supabase/schema.sql`: tables, access rules, case actions and the reminder schedule (safe to run again)
- `supabase/functions/ops/`: the server function (team accounts, sending notifications); `webpush.ts` is checked by `node --experimental-strip-types --test supabase/functions/ops/webpush.test.ts`

## Security
- Row-level security on every table; cases can only be changed through database functions that check who's asking (only admins assign; only the assignee or an admin updates).
- No public sign-up: accounts are created only by an admin through the server function.
- `config.js` holds only the public anon key. The service key stays inside Supabase.
