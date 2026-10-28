-- 0014 — the host's own gentle reminder, off unless asked for.
--   parents.remind_host        1 = send me one email on the eve of a rencontre I host
--   encounters.host_reminded_at stamped before the send so the hourly cron never doubles up
-- Additive, forward-only.
ALTER TABLE parents ADD COLUMN remind_host INTEGER NOT NULL DEFAULT 0;
ALTER TABLE encounters ADD COLUMN host_reminded_at INTEGER;
