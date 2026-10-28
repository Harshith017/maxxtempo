# Ops Desk

Track **exchanges, returns and escalations**. Admins assign cases; assignees are nudged **every 30 minutes** until they start the case or post an update.

No dependencies; needs Node 22.13+ (uses the built-in SQLite).

```bash
cd ops-desk
ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='choose-one' npm start   # http://localhost:3000
npm test
```

First run creates the admin account (a password is printed if you don't set one). Add teammates under **Team**.

## How it works
- **Roles**: admins assign/reassign, see the Overview (workload + overdue) and manage the team. Agents create cases, work the ones assigned to them, and can comment on any case.
- **Lifecycle**: new → assigned → in progress ⇄ waiting → resolved/closed. Every change lands in the case timeline.
- **Reminders**: a check runs every minute. An open case (assigned / in progress / waiting) whose assignee hasn't started it or posted a note/status change for 30 min gets a notification, then again every 30 min. Starting, posting an update or changing status resets the clock; resolving/closing stops it. Admin comments don't reset it. Deactivated users get none.
- **Where reminders show up**: the bell in the app (polled every 20 s, plus a toast and a browser notification if allowed; the tab must be open). Set `WEBHOOK_URL` to also POST each reminder (`{text, assignee, caseId}`) to a Slack/Teams incoming webhook, which reaches people with the tab closed.

## Phone and Windows app
Ops Desk is an installable web app (PWA) with real push notifications, so reminders arrive even when it's closed.
- **Android** (Chrome): open the site, tap **Install** in the banner (or ⋮ → *Install app*), then tap **Turn on alerts**.
- **Windows** (Edge or Chrome): open the site, click **Install** in the banner (or the install icon in the address bar), then **Turn on alerts**. It gets its own window and Start-menu entry.
- Each person turns alerts on once per device. Tapping a notification opens that case.
- Push and installation need the site on **HTTPS** (`localhost` is exempt for testing). Put it behind any HTTPS host or reverse proxy (Caddy, nginx, Cloudflare Tunnel, Render, Fly…). Keys are generated on first run and stored in `ops.db`; set `VAPID_SUBJECT=mailto:you@company.com` for the contact address push services expect.

## Config (env)
`PORT` (3000) · `REMINDER_MINUTES` (30) · `ADMIN_EMAIL` / `ADMIN_PASSWORD` (first run only) · `WEBHOOK_URL` · `VAPID_SUBJECT`

Data lives in `ops.db` (SQLite). Serve it over HTTPS in production.
