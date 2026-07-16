-- Revert of the partner terms-acceptance feature: the column is no longer used
-- by the application (referral registration no longer records acceptance).
ALTER TABLE "partner_profiles" DROP COLUMN IF EXISTS "terms_accepted_at";
