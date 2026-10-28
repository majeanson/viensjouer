-- 0009 — an optional map link for a rencontre (Google Maps or any other map app). It rides with the
-- address's privacy: for a park (a public place) every invited family sees it; for a home or a
-- birthday venue only a family that said yes does. Additive, forward-only.
ALTER TABLE encounters ADD COLUMN map_url TEXT;
