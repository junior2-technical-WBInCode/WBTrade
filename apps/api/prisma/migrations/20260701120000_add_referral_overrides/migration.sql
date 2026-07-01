-- MLM: ReferralOverride table — nadprowizje wielopoziomowe.
-- Napisane idempotentnie (IF NOT EXISTS / guarded DO$$) — bezpieczne do uruchomienia
-- na bazie, gdzie tabela już istnieje lub jeszcze nie istnieje.
-- Na produkcji po zastosowaniu db push uruchom:
--   npx prisma migrate resolve --applied 20260701120000_add_referral_overrides

-- CreateTable
CREATE TABLE IF NOT EXISTS "referral_overrides" (
    "id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "referral_overrides_beneficiary_id_status_idx" ON "referral_overrides"("beneficiary_id", "status");
CREATE INDEX IF NOT EXISTS "referral_overrides_order_id_idx" ON "referral_overrides"("order_id");
CREATE INDEX IF NOT EXISTS "referral_overrides_referral_id_idx" ON "referral_overrides"("referral_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "referral_overrides" ADD CONSTRAINT "referral_overrides_referral_id_fkey"
    FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referral_overrides" ADD CONSTRAINT "referral_overrides_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referral_overrides" ADD CONSTRAINT "referral_overrides_beneficiary_id_fkey"
    FOREIGN KEY ("beneficiary_id") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
