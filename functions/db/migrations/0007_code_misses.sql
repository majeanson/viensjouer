-- 0007 — a lockout for guessing share-link codes. A code is two plain words (≈ 22 bits), which is
-- short on purpose; what makes that safe is that an address gets only a few WRONG guesses an hour.
-- One counter row per (hashed address, hour). The address is stored only as a salted hash and the
-- rows are deleted after two hours, so this table never holds a person — it is not household data.
CREATE TABLE code_misses (
  ip_hash  TEXT NOT NULL,
  bucket   INTEGER NOT NULL,        -- unix hour (seconds / 3600)
  n        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, bucket)
);
