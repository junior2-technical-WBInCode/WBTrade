-- Add hide_location flag to wholesalers: allows hiding warehouse location
-- from the storefront (location filter + product cards) without deactivating
-- the wholesaler (sync/pricing/order routing keep working).
ALTER TABLE "wholesalers" ADD COLUMN IF NOT EXISTS "hide_location" BOOLEAN NOT NULL DEFAULT false;
