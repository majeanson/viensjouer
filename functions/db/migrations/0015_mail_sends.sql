-- 0015 — a ledger of the emails a household has sent, so the sender address cannot be used as a relay.
-- One row per mail the host's actions caused (invitation, window, update, thank-you); counted over the
-- last 24 h against MAIL_DAILY_CAP (functions/_lib/mailBudget.ts) and purged by the hourly cron after
-- two days. Holds a household and a time, never an address or a body.
-- Additive, forward-only.
CREATE TABLE mail_sends (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL,        -- soft ref: households.id
  created_at    INTEGER NOT NULL
);
CREATE INDEX mail_sends_household ON mail_sends (household_id, created_at);
