-- 0023 — « Proposer plusieurs moments »: a rencontre can offer up to four possible times; each invited family ticks the ones that
-- suit it from its own page, and the host picks one (the rencontre then moves to it and the slots go).
--   encounter_slots   one row per possible time of a rencontre that is still being settled.
--   slot_votes        a tick: this invitation can make this slot. Only « can », never « cannot » (nothing to count against anyone).
-- Additive, forward-only. Per-household data: swept with the household (functions/_lib/demo.ts SWEEP_ORDER).
CREATE TABLE encounter_slots (
  id            TEXT PRIMARY KEY,
  encounter_id  TEXT NOT NULL REFERENCES encounters(id),
  starts_at     INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX encounter_slots_idx ON encounter_slots(encounter_id, starts_at);
CREATE TABLE slot_votes (
  slot_id        TEXT NOT NULL REFERENCES encounter_slots(id),
  invitation_id  TEXT NOT NULL,            -- soft ref → invitations.id
  created_at     INTEGER NOT NULL,
  PRIMARY KEY (slot_id, invitation_id)
);
