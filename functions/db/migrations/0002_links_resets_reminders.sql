-- 0002 — Phase 2, « the link »: a family that answered creates its own account from the
-- reply page, and the two children become LINKED; the reminder the invited parent asked
-- for; password reset. Additive, forward-only.

-- Where an account came from — the reciprocity door is the only growth path, so it is
-- worth being able to count it (never shown to a household; a number for the operator).
ALTER TABLE parents ADD COLUMN origin TEXT NOT NULL DEFAULT 'signup'; -- 'signup' | 'reply'

-- The bilateral link: child A (household A) ↔ child B (household B). Either side can cut
-- it; `revoked_at` hides the other family from the circle immediately, both ways. Soft
-- refs on purpose: deleting a child never cascades into the other household's rows.
CREATE TABLE child_links (
  id            TEXT PRIMARY KEY,
  household_a   TEXT NOT NULL,   -- soft ref → households
  child_a       TEXT NOT NULL,   -- soft ref → children (of household_a)
  household_b   TEXT NOT NULL,
  child_b       TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  revoked_at    INTEGER,
  revoked_by    TEXT             -- soft ref → households: who cut it
);
CREATE INDEX child_links_a_idx ON child_links(household_a, revoked_at);
CREATE INDEX child_links_b_idx ON child_links(household_b, revoked_at);

-- The book entry learns which CHILD on the other side it is (linked_household_id was
-- there from 0001), and the friend's birthdate — the one date a parent wants to know.
ALTER TABLE friend_families ADD COLUMN linked_child_id TEXT;   -- soft ref → children (other household)
ALTER TABLE friend_families ADD COLUMN child_birthdate TEXT;   -- 'YYYY-MM-DD', optional

-- The ONE reminder: `remind_at` (0001) is when; `reminded_at` says it went out, so the
-- hourly cron never sends twice.
ALTER TABLE invitations ADD COLUMN reminded_at INTEGER;

-- « Mot de passe oublié » — the token travels only in the email; the row keeps its hash.
CREATE TABLE password_resets (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,      -- soft ref → parents.email
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX password_resets_email_idx ON password_resets(email, used_at);
