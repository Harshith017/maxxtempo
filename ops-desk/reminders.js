'use strict';
// Reminder engine. A case is "open" while it has an assignee and is not resolved/closed.
// The assignee is nudged when REMINDER_MS has passed since the later of their last activity
// and the last reminder, so the nudge repeats every 30 minutes until they start or update it.

const REMINDER_MS = (Number(process.env.REMINDER_MINUTES) || 30) * 60 * 1000;
const OPEN = ['assigned', 'in_progress', 'waiting'];

function notify(db, { userId, caseId, kind, message, now }) {
  db.prepare('INSERT INTO notifications (user_id, case_id, kind, message, created_at) VALUES (?,?,?,?,?)')
    .run(userId, caseId ?? null, kind, message, now);
  db.onNotify?.({ userId, caseId: caseId ?? null, kind, message }); // web push hook (set by server)
}

function dueCases(db, now, reminderMs = REMINDER_MS) {
  return db.prepare(`
    SELECT c.*, u.name AS assignee_name FROM cases c JOIN users u ON u.id = c.assignee_id
    WHERE c.status IN (${OPEN.map(() => '?').join(',')}) AND u.active = 1
      AND ? - MAX(c.last_activity_at, COALESCE(c.last_reminded_at, 0)) >= ?`)
    .all(...OPEN, now, reminderMs);
}

function runReminders(db, now = Date.now(), { reminderMs = REMINDER_MS, send } = {}) {
  const sent = [];
  for (const c of dueCases(db, now, reminderMs)) {
    const idle = Math.round((now - c.last_activity_at) / 60000);
    const verb = c.status === 'assigned' ? 'not started' : 'no update';
    const message = `${c.type.toUpperCase()} #${c.id} (${c.order_ref}) – ${verb} for ${idle} min. Please ${
      c.status === 'assigned' ? 'start it' : 'post an update'}.`;
    notify(db, { userId: c.assignee_id, caseId: c.id, kind: 'reminder', message, now });
    db.prepare('UPDATE cases SET last_reminded_at = ? WHERE id = ?').run(now, c.id);
    sent.push({ caseId: c.id, userId: c.assignee_id, message });
    if (send) send({ ...c, message });
  }
  return sent;
}

// Optional: also push reminders to Slack/Teams/etc. through an incoming-webhook URL.
function webhookSender(url) {
  if (!url) return null;
  return (c) => {
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `@${c.assignee_name}: ${c.message}`, assignee: c.assignee_name, caseId: c.id }),
    }).catch((e) => console.error('webhook failed:', e.message));
  };
}

module.exports = { REMINDER_MS, OPEN, notify, dueCases, runReminders, webhookSender };
