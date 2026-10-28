-- 0006 — who an invitation is FOR. A paid birthday wants only the real friend; a park meet-up
-- welcomes the whole family, siblings included. `scope` is decided per invitation (one
-- family can be « friend only » while another is « whole family »), with the rencontre's
-- default used when a family is added later. Additive, forward-only.
--   'friend' → the invited child only
--   'family' → the whole family (siblings welcome)
ALTER TABLE invitations ADD COLUMN scope TEXT NOT NULL DEFAULT 'family';
ALTER TABLE encounters ADD COLUMN default_scope TEXT NOT NULL DEFAULT 'family';
