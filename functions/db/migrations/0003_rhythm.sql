-- 0003 — Phase 3, « the rhythm »: a weekly meet-up that repeats, « une fenêtre ouverte »
-- (we are free Sunday afternoon — to chosen families, expires by itself), and groups (the
-- daycare class). Additive, forward-only. Still nothing countable: no attendance tally,
-- no streak of weeks — each occurrence is answered on its own, and a series is only the
-- thread that lets a family see them together.

-- A recurring rencontre is N ordinary rencontres sharing a series_id: each has its own
-- invitations, its own answer, its own cancel. (Materialised at creation, ≤ 12 weeks,
-- wall-clock time computed in the host's browser so DST cannot shift it.)
ALTER TABLE encounters ADD COLUMN series_id TEXT;
CREATE INDEX encounters_series_idx ON encounters(series_id, starts_at);

-- Groups — a host's own way to invite many families at once. Private to the household;
-- the other families never see that a group exists. (`groups` is a SQLite keyword, hence
-- the prefix.)
CREATE TABLE friend_groups (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  name          TEXT NOT NULL,                 -- « La garderie »
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
CREATE INDEX friend_groups_household_idx ON friend_groups(household_id);

CREATE TABLE friend_group_members (
  group_id          TEXT NOT NULL REFERENCES friend_groups(id),
  friend_family_id  TEXT NOT NULL,             -- soft ref → friend_families
  PRIMARY KEY (group_id, friend_family_id)
);

-- « Une fenêtre ouverte » — an offer of time, not a plan. It dies at ends_at.
CREATE TABLE open_windows (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  child_id      TEXT NOT NULL,                 -- soft ref → children
  starts_at     INTEGER NOT NULL,
  ends_at       INTEGER NOT NULL,
  note          TEXT,
  created_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
CREATE INDEX open_windows_household_idx ON open_windows(household_id, ends_at);

-- One addressee of a window and the link that reaches them (same 8-char paper code, at
-- /w/<code>). reply: NULL | 'yes' (« on se voit ! ») | 'no'.
CREATE TABLE window_targets (
  id                TEXT PRIMARY KEY,
  window_id         TEXT NOT NULL REFERENCES open_windows(id),
  friend_family_id  TEXT NOT NULL,             -- soft ref → friend_families
  token             TEXT NOT NULL UNIQUE,
  reply             TEXT,
  reply_note        TEXT,
  reply_at          INTEGER,
  created_at        INTEGER NOT NULL
);
CREATE INDEX window_targets_window_idx ON window_targets(window_id);
