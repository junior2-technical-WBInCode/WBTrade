-- Re-add users.last_login_ip.
-- A previous migration (20260225120000_remove_last_login_ip) dropped this column, but
-- schema.prisma still declares `lastLoginIp` and the code writes it on every login
-- (auth.service.secure.ts) and reads it for the referral anti-fraud IP check
-- (referral.service.ts / referral-fraud.service.ts). Without the column those queries
-- fail at runtime. This restores schema/DB consistency.
-- (RODO note: storing last-login IP is a deliberate decision tied to the affiliate
--  anti-fraud Phase-2 check.)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_ip" TEXT;
