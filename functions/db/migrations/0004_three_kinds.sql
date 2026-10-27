-- 0004 — Phase 4, « the three kinds, finished »: the home card (what the other parent is
-- too polite to ask), the birthday's RSVP + gift wish, the park's « on y est », the relais
-- note after a drop-off, and souvenirs (a photo back to the families who were there).
-- Additive, forward-only.

-- Park: the host taps « On y est » on the day; the invited families see since when.
-- NULL = not (yet) there. Only settable around the rencontre itself (_lib/encounters.ts hereAllowed).
ALTER TABLE encounters ADD COLUMN here_at INTEGER;

-- Birthday RSVP: how many adults stay and how many children come. NULL = not said.
ALTER TABLE invitations ADD COLUMN adults INTEGER;
ALTER TABLE invitations ADD COLUMN kids INTEGER;

-- The home card — written ONCE per household, shown on every invitation to a home
-- rencontre (dog · pool · screens · nut-free · a free line). `details` is a fixed-shape
-- JSON object validated on write (_lib/encounters.ts cleanHomeCard); '{}' = never filled.
CREATE TABLE home_cards (
  household_id  TEXT PRIMARY KEY REFERENCES households(id),
  details       TEXT NOT NULL DEFAULT '{}',
  updated_at    INTEGER NOT NULL
);

-- « Fiche de relais » — after a drop-off, a few words back to that family: the nap, what
-- they ate, a mood word, a line. One per invitation, optional, and it EXPIRES (a week):
-- it is a message, not a record of a child.
CREATE TABLE relais (
  id             TEXT PRIMARY KEY,
  invitation_id  TEXT NOT NULL UNIQUE REFERENCES invitations(id),
  nap            TEXT,
  ate            TEXT,
  mood           TEXT,
  note           TEXT,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL
);

-- Souvenirs — a photo of the day, back to the families who said yes. Stored in R2 under
-- `media_key`, with the `media_kind` + `media_key` pair the sibling apps use (the pair is
-- set together or not at all). The host or any family that said yes may add one; the host
-- may delete any, a family only its own... in v1 only the host deletes.
CREATE TABLE souvenirs (
  id            TEXT PRIMARY KEY,
  encounter_id  TEXT NOT NULL REFERENCES encounters(id),
  media_kind    TEXT NOT NULL DEFAULT 'image',
  media_key     TEXT NOT NULL,
  author_kind   TEXT NOT NULL,                 -- 'host' | 'guest'
  author_label  TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
CREATE INDEX souvenirs_encounter_idx ON souvenirs(encounter_id, created_at);
