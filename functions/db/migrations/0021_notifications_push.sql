-- 0021 — notifications: what a signed-in parent is told, in the app and (when they allow it) on their phone.
--   notifications        one row per parent per event: « Marc t'invite », « Rencontre annulée », « Léa : oui », a reminder. The text is
--                        written in the recipient's language when the row is made. read_at: the parent saw it in the app.
--                        pushed_at: the service worker already showed it as a notification (so it never shows twice).
--   push_subscriptions   one row per device that allowed notifications (Web Push: the endpoint the browser gave us). Nothing else is
--                        kept: the push carries no text, the phone asks the server what is new.
-- Forward-only. Both are per-household data: swept with the household (functions/_lib/demo.ts SWEEP_ORDER), notifications also
-- purged after 30 days (functions/_lib/lifecycle.ts).
CREATE TABLE notifications (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,                 -- soft ref → parents.email (the recipient)
  household_id TEXT NOT NULL,                 -- soft ref → households (the recipient's)
  kind         TEXT NOT NULL,                 -- 'invited' | 'changed' | 'cancelled' | 'postponed' | 'answered' | 'reminder' | 'test'
  title        TEXT NOT NULL,
  body         TEXT,
  url          TEXT,                          -- where a tap goes (a path inside the app)
  created_at   INTEGER NOT NULL,
  read_at      INTEGER,
  pushed_at    INTEGER
);
CREATE INDEX notifications_email_idx ON notifications(email, read_at, created_at);

CREATE TABLE push_subscriptions (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,                 -- soft ref → parents.email
  household_id TEXT NOT NULL,                 -- soft ref → households
  endpoint     TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL,
  last_ok_at   INTEGER
);
CREATE INDEX push_subscriptions_email_idx ON push_subscriptions(email);
