-- 0025 — Shared circles (« Les amis du parc »): three families or more who chose, each on its own, to be in one named circle.
-- Decided with Marc (2026-11-02): any member can invite a family of their own book, the family accepts on its own (a code, never a
-- shared class-wide one); members see each other's FIRST NAMES only (parent and child: no face, no email, no phone); a circle lets a
-- member invite the whole circle to a rencontre; being in a circle never links two families (child_links stays a one-to-one choice).
--   shared_circles          the circle: a name any member may change. created_by is who started it, nothing more (no owner powers).
--   shared_circle_members   one row per household in a circle, with WHICH of its children the circle is for. left_at = gone.
--   circle_invites.shared_circle_id   set: this code joins that shared circle instead of linking two families (same door, same TTL).
--   friend_families.shared_circle_id / member_household_id / member_child_id
--                           set: a HIDDEN book entry that exists only because both households are in that circle, so a member can be
--                           invited like any family. Never listed in « Amis », carries no email or phone (mail goes to the account's
--                           own address, looked up at send time, with no Reply-To). Soft-deleted when either household leaves.
-- Additive, forward-only. Per-household data: swept with the household (functions/_lib/demo.ts SWEEP_ORDER).
CREATE TABLE shared_circles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,                 -- « Les amis du parc »
  created_by  TEXT NOT NULL,                 -- soft ref → households
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER                        -- set when the last member leaves
);
CREATE TABLE shared_circle_members (
  id            TEXT PRIMARY KEY,
  circle_id     TEXT NOT NULL REFERENCES shared_circles(id),
  household_id  TEXT NOT NULL,               -- soft ref → households
  child_id      TEXT NOT NULL,               -- soft ref → children (of household_id)
  invited_by    TEXT,                        -- soft ref → households; NULL for the one who started it
  joined_at     INTEGER NOT NULL,
  left_at       INTEGER
);
CREATE INDEX shared_circle_members_circle_idx ON shared_circle_members(circle_id, left_at);
CREATE INDEX shared_circle_members_household_idx ON shared_circle_members(household_id, left_at);
ALTER TABLE circle_invites ADD COLUMN shared_circle_id TEXT;      -- soft ref → shared_circles
ALTER TABLE friend_families ADD COLUMN shared_circle_id TEXT;     -- soft ref → shared_circles
ALTER TABLE friend_families ADD COLUMN member_household_id TEXT;  -- soft ref → households (the member this hidden entry stands for)
ALTER TABLE friend_families ADD COLUMN member_child_id TEXT;      -- soft ref → children (of member_household_id)
CREATE INDEX friend_families_member_idx ON friend_families(member_household_id, deleted_at);
