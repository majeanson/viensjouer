-- 0020 — four small, additive things.
--   friend_families.nap_start / nap_end   a friend child's usual nap as the HOST knows it ('HH:MM', optional): the new-rencontre
--                                         form offers times that clear every picked child's nap
--   friend_families.mail_stopped_at       the family asked to receive no more email from the app (the "ne plus recevoir" link
--                                         in every mail to them, CASL); nothing is sent to them while it is set
--   parents.weekly_digest / digest_at     opt-in Monday email of the week ahead; digest_at stamps the last one sent
--   cron_beats(name, at)                  the hourly cron stamps when it last ran, so /api/health can say if it stopped
-- Forward-only. No household data in cron_beats.
ALTER TABLE friend_families ADD COLUMN nap_start TEXT;
ALTER TABLE friend_families ADD COLUMN nap_end TEXT;
ALTER TABLE friend_families ADD COLUMN mail_stopped_at INTEGER;
ALTER TABLE parents ADD COLUMN weekly_digest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE parents ADD COLUMN digest_at INTEGER;
CREATE TABLE cron_beats (
  name TEXT PRIMARY KEY,
  at   INTEGER NOT NULL
);
