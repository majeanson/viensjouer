-- 0013 — the rencontre's message board: pin a message, take your own back, and know whose it is.
--   pinned         1 = kept at the top (the host pins « on se retrouve à la fontaine »)
--   deleted_at     soft delete: the host removes any message, a family removes its own
--   invitation_id  soft ref → invitations.id of the family that wrote it (NULL for the host and old rows)
-- Additive, forward-only.
ALTER TABLE encounter_messages ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE encounter_messages ADD COLUMN deleted_at INTEGER;
ALTER TABLE encounter_messages ADD COLUMN invitation_id TEXT;
