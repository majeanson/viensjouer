-- 0012 — a picture for each child and each parent (optional, like every photo). The browser sends a small
-- square JPEG; the key points at it in R2. NULL = the initial on the colour. Additive, forward-only.
ALTER TABLE children ADD COLUMN photo_key TEXT;
ALTER TABLE parents ADD COLUMN photo_key TEXT;
