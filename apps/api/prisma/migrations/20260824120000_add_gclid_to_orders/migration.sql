-- Google Ads click-id (gclid) attribution, read from the _gcl_aw cookie at checkout.
-- Purely additive/informational: both columns nullable, no existing rows touched,
-- no existing columns modified. Idempotent (IF NOT EXISTS) to match this project's
-- migration convention (see 20260807120000_add_referral_link_sort_order).
--
-- Rollback (manual — Prisma has no down-migration runner):
--   ALTER TABLE "orders" DROP COLUMN IF EXISTS "gclid";
--   ALTER TABLE "orders" DROP COLUMN IF EXISTS "gclid_captured_at";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "gclid" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "gclid_captured_at" TIMESTAMP(3);
