-- Repair (2026-07-15, audyt V-11): enum "CouponSource" powstał na produkcji przez
-- `prisma db push` i nigdy nie został ujęty w migracji. Tworzymy go tutaj, jeśli nie
-- istnieje, aby łańcuch migracji dał się odtworzyć na pustej bazie (shadow DB).
-- Na produkcji blok jest no-opem (typ już istnieje).
DO $$ BEGIN
  CREATE TYPE "CouponSource" AS ENUM ('MANUAL', 'WELCOME_DISCOUNT', 'REFERRAL', 'CAMPAIGN', 'NEWSLETTER', 'ALL_COLLECTED_BONUS', 'LOYALTY_LEVEL_UP', 'LOYALTY_BIRTHDAY', 'LOYALTY_QUARTERLY', 'DELIVERY_DELAY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum
ALTER TYPE "CouponSource" ADD VALUE IF NOT EXISTS 'APP_DOWNLOAD';
