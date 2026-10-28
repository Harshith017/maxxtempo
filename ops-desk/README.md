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

## Config (env)
`PORT` (3000) · `REMINDER_MINUTES` (30) · `ADMIN_EMAIL` / `ADMIN_PASSWORD` (first run only) · `WEBHOOK_URL`

Data lives in `ops.db` (SQLite). Serve it over HTTPS in production.
