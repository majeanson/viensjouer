-- 0024 — Two children can host one rencontre (« Léa et Noé vous invitent »).
--   encounters.co_child_id   the second hosting child (soft ref → children.id), NULL when one child hosts. The first stays child_id.
-- Additive, forward-only. Part of the encounter row: swept and purged with it.
ALTER TABLE encounters ADD COLUMN co_child_id TEXT;
