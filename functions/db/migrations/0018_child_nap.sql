-- 0018 — a child's usual nap, so the new-rencontre form can offer « avant / après la sieste » at the right hour.
--   children.nap_start / nap_end   'HH:MM' (24 h, the device's wall clock), both optional; either one alone is fine
-- Additive, forward-only. Only what the parent types; the form says what skipping it costs.
ALTER TABLE children ADD COLUMN nap_start TEXT;
ALTER TABLE children ADD COLUMN nap_end TEXT;
