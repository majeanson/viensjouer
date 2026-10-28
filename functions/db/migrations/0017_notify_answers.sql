-- 0017 — tell the host when a family answers, only if the host asked.
--   parents.notify_answers        1 = email me when a family answers a rencontre I host (off unless ticked)
--   invitations.host_notified_at  stamped before the send: one email per invitation per ten minutes, so a family
--                                 that changes its mind three times in a minute does not mail the host three times
-- Additive, forward-only.
ALTER TABLE parents ADD COLUMN notify_answers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invitations ADD COLUMN host_notified_at INTEGER;
