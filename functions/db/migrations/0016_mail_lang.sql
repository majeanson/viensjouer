-- 0016 — the language a person reads their email in. Learned, never asked: it is the language their own device
-- sent (X-Lang) the last time they answered a link (friend_families.lang) or saved their profile (parents.lang).
-- NULL = unknown: the sender's language is used, then French. Additive, forward-only.
ALTER TABLE friend_families ADD COLUMN lang TEXT;
ALTER TABLE parents ADD COLUMN lang TEXT;
