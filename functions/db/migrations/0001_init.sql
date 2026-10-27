-- Viens jouer — initial schema. Forward-only, additive, filename-locked (wrangler tracks
-- applied state by filename — never rename this once it has run). Timestamps are unix
-- seconds (INTEGER). Conventions carried from Babillard: created_at / updated_at /
-- deleted_at, `kind` for a sub-type, `status` for workflow state, `position` for order,
-- `colour` spelled that way, JSON columns NOT NULL with a '{}'/'[]' default, soft refs
-- commented.
--
-- Deliberately ABSENT: no points, streaks, badges, scores or ranks — nothing that turns
-- seeing a friend into a number (calm-tenets.test.ts scans every migration for them).

-- ============================================================================
-- Tenancy — one household = one family = one tenant.
-- ============================================================================
CREATE TABLE households (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,                       -- « Les Tremblay »
  tz          TEXT NOT NULL DEFAULT 'America/Toronto',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- The parents of ONE household. Both parents of a toddler host, so this is many-per-
-- household from day one. session_version: bumping it signs every device out.
CREATE TABLE parents (
  email           TEXT PRIMARY KEY,
  household_id    TEXT NOT NULL REFERENCES households(id),
  display_name    TEXT NOT NULL,                   -- « Marc »
  password_hash   TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL
);
CREATE INDEX parents_household_idx ON parents(household_id);

-- ============================================================================
-- Children — the people the whole app is about, who never use it.
-- ============================================================================
CREATE TABLE children (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),
  first_name    TEXT NOT NULL,
  birthdate     TEXT,                              -- 'YYYY-MM-DD', optional; drives « 3 ans »
  colour        TEXT NOT NULL DEFAULT '#f2a03d',
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
CREATE INDEX children_household_idx ON children(household_id);

-- ============================================================================
-- The book — « les familles amies ». A friend's family as THIS household knows it:
-- the other parent's name and channel, the friend's first name, what to know.
-- Filled from a reply, then prefilled on the next invite. Private to the owner.
-- ============================================================================
CREATE TABLE friend_families (
  id                   TEXT PRIMARY KEY,
  household_id         TEXT NOT NULL REFERENCES households(id),  -- the OWNER of this entry
  parent_name          TEXT NOT NULL,                             -- « Julie »
  email                TEXT,
  phone                TEXT,
  child_first_name     TEXT NOT NULL,                             -- « Léa »
  allergies            TEXT,                                      -- free text, what to avoid
  notes                TEXT,                                      -- « ils ont un chien »
  -- Soft ref, no FK: set when that family creates its own account and the link becomes
  -- bilateral (phase 2). Deleting either household never cascades the other's book.
  linked_household_id  TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  deleted_at           INTEGER
);
CREATE INDEX friend_families_household_idx ON friend_families(household_id);

-- ============================================================================
-- Rencontres — THE one object. A park meet-up, a play-date at home, a birthday.
-- ============================================================================
CREATE TABLE encounters (
  id            TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES households(id),           -- the host
  child_id      TEXT NOT NULL,                                     -- soft ref → children: whose rencontre
  kind          TEXT NOT NULL,                                     -- 'park' | 'home' | 'birthday'
  title         TEXT NOT NULL,                                     -- « Au parc Lafontaine »
  starts_at     INTEGER NOT NULL,
  ends_at       INTEGER,
  place         TEXT,                                              -- the park, « chez nous »
  address       TEXT,                                              -- shown to a family only on YES
  note          TEXT,                                              -- what to bring, nap window
  details       TEXT NOT NULL DEFAULT '{}',                        -- JSON, kind-specific (phase 3)
  status        TEXT NOT NULL DEFAULT 'proposed',                  -- 'proposed' | 'confirmed' | 'cancelled'
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
CREATE INDEX encounters_household_idx ON encounters(household_id, starts_at);

-- One invited family on one rencontre, and the link that reaches them. `token` is the
-- capability itself (32 random chars), stored RAW on purpose: the host copies the same
-- link again next week, and hashing it would force a rotation that kills the one already
-- texted. Scoped to one card and one family; dead once the rencontre is past or
-- cancelled (functions/api/r/*). Same trust model as a share-by-id link.
CREATE TABLE invitations (
  id                TEXT PRIMARY KEY,
  encounter_id      TEXT NOT NULL REFERENCES encounters(id),
  friend_family_id  TEXT NOT NULL,                                 -- soft ref → friend_families
  token             TEXT NOT NULL UNIQUE,
  reply             TEXT,                                          -- NULL | 'yes' | 'no' | 'maybe'
  reply_note        TEXT,
  reply_at          INTEGER,
  remind_at         INTEGER,                                       -- the ONE reminder, if asked (phase 2)
  sent_at           INTEGER,                                       -- last email send, NULL = copy-link only
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX invitations_encounter_idx ON invitations(encounter_id);

-- The tiny thread on a card, both sides. author_kind 'host' | 'guest'; author_label is
-- the name shown (the parent's display name, or the invited parent's typed name).
CREATE TABLE encounter_messages (
  id            TEXT PRIMARY KEY,
  encounter_id  TEXT NOT NULL REFERENCES encounters(id),
  author_kind   TEXT NOT NULL,
  author_label  TEXT NOT NULL,
  text          TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX encounter_messages_encounter_idx ON encounter_messages(encounter_id, created_at);
