-- 0008 — editing a rencontre, and showing the families WHAT changed. Every edit that actually changes
-- something writes one row per changed field, so an invited parent who opens the page later sees
-- « Heure : 10 h → 11 h » instead of wondering. Additive, forward-only.
--
-- `old_value` / `new_value` are display values as text (times as unix seconds, formatted by the reader in
-- its own language). The ADDRESS is deliberately never stored here: the row says « the address changed »
-- (both values NULL) and the page shows the new one only to a family that already said yes.
CREATE TABLE encounter_changes (
  id            TEXT PRIMARY KEY,
  encounter_id  TEXT NOT NULL REFERENCES encounters(id),
  field         TEXT NOT NULL,        -- title | starts_at | ends_at | place | address | note | gift | status
  old_value     TEXT,
  new_value     TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX encounter_changes_idx ON encounter_changes(encounter_id, created_at);
