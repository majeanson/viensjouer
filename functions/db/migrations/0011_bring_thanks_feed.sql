-- 0011 — « À apporter », « Dire merci », and the host's calendar feed. Additive, forward-only.
--   bring_items   what the families bring to a rencontre. The host adds a line (« la collation »), a family that
--                 said yes or maybe takes it (the parent's first name is shown with it) or adds its own.
--   thanked_at    the one thank-you message sent after a rencontre (NULL = not yet).
--   cal_token     the secret in the host's calendar feed URL (NULL = no feed). Rotating it kills the old link.
CREATE TABLE bring_items (
  id             TEXT PRIMARY KEY,
  encounter_id   TEXT NOT NULL REFERENCES encounters(id),
  label          TEXT NOT NULL,
  claimed_by     TEXT,            -- soft ref → invitations.id of the family bringing it (NULL = nobody yet)
  claimed_label  TEXT,            -- that parent's first name, as shown
  added_by       TEXT NOT NULL,   -- 'host' | 'guest'
  created_at     INTEGER NOT NULL
);
CREATE INDEX bring_items_idx ON bring_items(encounter_id, created_at);
ALTER TABLE encounters ADD COLUMN thanked_at INTEGER;
ALTER TABLE households ADD COLUMN cal_token TEXT;
CREATE UNIQUE INDEX households_cal_token_idx ON households(cal_token) WHERE cal_token IS NOT NULL;
