-- 0010 — a picture for the rencontre, and « who is coming » shown to the invited families.
--   cover_key    R2 key of the host's cover picture (NULL = none). Optional like every photo: no bucket, no picture.
--   show_guests  1 = the invited families see the first names of the children who said yes or maybe
--                (never the ones who said no). The host can turn it off per rencontre (a paid birthday).
-- Additive, forward-only.
ALTER TABLE encounters ADD COLUMN cover_key TEXT;
ALTER TABLE encounters ADD COLUMN show_guests INTEGER NOT NULL DEFAULT 1;
