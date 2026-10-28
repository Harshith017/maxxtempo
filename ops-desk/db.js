'use strict';
const { DatabaseSync } = require('node:sqlite');

function open(file) {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','agent')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS push_subs (
      endpoint TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('exchange','return','escalation')),
      order_ref TEXT NOT NULL,
      customer TEXT NOT NULL,
      contact TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
      status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new','assigned','in_progress','waiting','resolved','closed')),
      assignee_id INTEGER REFERENCES users(id),
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      -- last time the assignee (or an admin) did something; drives the 30-minute reminder
      last_activity_at INTEGER NOT NULL,
      last_reminded_at INTEGER,
      started_at INTEGER,
      resolved_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS cases_assignee ON cases(assignee_id, status);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY,
      case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      kind TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_case ON events(case_id, id);
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS notif_user ON notifications(user_id, read_at, id);
  `);
  return db;
}

module.exports = { open };
