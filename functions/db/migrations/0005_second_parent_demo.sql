-- 0005 — Phase 5: the second parent of a household, and the try-it door.

-- « Inviter l'autre parent » — a one-use, seven-day link that adds a second parent (own
-- email, own password) to THIS household. Stored raw like a reply code: the host re-copies
-- the same link until it is used or dies. `used_at` makes it single-use.
CREATE TABLE parent_invites (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  token         TEXT NOT NULL UNIQUE,
  created_by    TEXT NOT NULL,                 -- soft ref → parents.email
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  used_at       INTEGER
);
CREATE INDEX parent_invites_household_idx ON parent_invites(household_id);

-- 'real' | 'demo'. A demo household is a throwaway sandbox (« Essayer sans compte »): a
-- real seeded household with a real session, swept after 24 h (functions/_lib/demo.ts),
-- never able to send mail.
ALTER TABLE households ADD COLUMN kind TEXT NOT NULL DEFAULT 'real';
CREATE INDEX households_kind_idx ON households(kind, created_at);
