-- Adds terms_accepted_at to partner_profiles: records when a partner confirmed
-- having read the "Warunki Współpracy" (Program Partnerski) document before
-- registering, required by the registration UI flow.
ALTER TABLE "partner_profiles" ADD COLUMN IF NOT EXISTS "terms_accepted_at" TIMESTAMP(3);
