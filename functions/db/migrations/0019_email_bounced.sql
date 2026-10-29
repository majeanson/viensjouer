-- 0019 — which friend email did not arrive (Resend's bounce / spam-complaint webhook, functions/api/resend-webhook.ts).
--   friend_families.email_bounced_at   when Resend last said « bounced » or « complained » for this address; NULL = no news.
--                                      Editing the address clears it.
-- Additive, forward-only. A stamp, never the message.
ALTER TABLE friend_families ADD COLUMN email_bounced_at INTEGER;
