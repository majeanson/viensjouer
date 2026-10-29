-- 0022 — « Inviter dans mon cercle »: a connection invitation with no rencontre behind it.
--   circle_invites   one row per invitation: the host household and which of its children, the friend family of its book it is for, a
--                    two-word code (the same space as the rencontre codes, so one door opens both), when it stops working
--                    (14 days) and, once used, when and by whom. The code is the whole credential, behind the same rate limit and
--                    lockout as every other code. Using it links the two households (child_links) exactly like « Lier nos familles ».
-- Additive, forward-only. Per-household data: swept with the household (functions/_lib/demo.ts SWEEP_ORDER).
CREATE TABLE circle_invites (
  id                  TEXT PRIMARY KEY,
  household_id        TEXT NOT NULL,              -- soft ref → households (the host)
  child_id            TEXT NOT NULL,              -- soft ref → children (the host's child this circle is for)
  friend_family_id    TEXT NOT NULL,              -- soft ref → friend_families (the host's book entry for the invited family)
  token               TEXT NOT NULL UNIQUE,       -- two words, shared space with invitations.token
  created_at          INTEGER NOT NULL,
  expires_at          INTEGER NOT NULL,
  sent_at             INTEGER,                    -- last time it was emailed (a second send inside five minutes is refused)
  accepted_at         INTEGER,
  accepted_household  TEXT,                       -- soft ref → households (who used it)
  revoked_at          INTEGER
);
CREATE INDEX circle_invites_household_idx ON circle_invites(household_id, accepted_at, revoked_at);
