-- WB TRADE PARTNERS (PLAN_03): rangi, Wolumen Linii (WL), Premia Liderow.
-- Napisane idempotentnie (IF NOT EXISTS / guarded DO$$) — bezpieczne do uruchomienia
-- na bazie, gdzie obiekty juz istnieja lub jeszcze nie istnieja.
-- Na produkcji po zastosowaniu db push uruchom:
--   npx prisma migrate resolve --applied 20260709120000_add_partner_ranks_wl_leader_bonus

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PartnerRank" AS ENUM (
    'AKTYWNY_PARTNER',
    'AMBASADOR',
    'LIDER_ZESPOLU',
    'MENEDZER',
    'DYREKTOR_REGIONALNY',
    'DYREKTOR_KRAJOWY',
    'DYREKTOR_GENERALNY'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable: partner_profiles — pola rang
ALTER TABLE "partner_profiles" ADD COLUMN IF NOT EXISTS "rank" "PartnerRank" NOT NULL DEFAULT 'AKTYWNY_PARTNER';
ALTER TABLE "partner_profiles" ADD COLUMN IF NOT EXISTS "rank_confirmations" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "partner_profiles" ADD COLUMN IF NOT EXISTS "rank_achieved_at" TIMESTAMP(3);
ALTER TABLE "partner_profiles" ADD COLUMN IF NOT EXISTS "highest_rank" "PartnerRank" NOT NULL DEFAULT 'AKTYWNY_PARTNER';

CREATE INDEX IF NOT EXISTS "partner_profiles_rank_idx" ON "partner_profiles"("rank");

-- CreateTable: partner_monthly_volumes
CREATE TABLE IF NOT EXISTS "partner_monthly_volumes" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "own_sales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "level1_sales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "level2_sales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "structure_sales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_monthly_volumes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "partner_monthly_volumes_partner_id_period_key" ON "partner_monthly_volumes"("partner_id", "period");
CREATE INDEX IF NOT EXISTS "partner_monthly_volumes_period_idx" ON "partner_monthly_volumes"("period");

DO $$ BEGIN
  ALTER TABLE "partner_monthly_volumes" ADD CONSTRAINT "partner_monthly_volumes_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable: partner_line_volumes (WL)
CREATE TABLE IF NOT EXISTS "partner_line_volumes" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "line_partner_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "volume" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_line_volumes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "partner_line_volumes_partner_id_line_partner_id_period_key" ON "partner_line_volumes"("partner_id", "line_partner_id", "period");
CREATE INDEX IF NOT EXISTS "partner_line_volumes_partner_id_period_idx" ON "partner_line_volumes"("partner_id", "period");

DO $$ BEGIN
  ALTER TABLE "partner_line_volumes" ADD CONSTRAINT "partner_line_volumes_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "partner_line_volumes" ADD CONSTRAINT "partner_line_volumes_line_partner_id_fkey"
    FOREIGN KEY ("line_partner_id") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable: partner_rank_events
CREATE TABLE IF NOT EXISTS "partner_rank_events" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "from_rank" "PartnerRank" NOT NULL,
    "to_rank" "PartnerRank" NOT NULL,
    "type" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_rank_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "partner_rank_events_partner_id_period_idx" ON "partner_rank_events"("partner_id", "period");

DO $$ BEGIN
  ALTER TABLE "partner_rank_events" ADD CONSTRAINT "partner_rank_events_partner_id_fkey"
    FOREIGN KEY ("partner_id") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable: leader_bonuses (Premia Liderow)
CREATE TABLE IF NOT EXISTS "leader_bonuses" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "rank" "PartnerRank" NOT NULL,
    "base_pct" DECIMAL(5,3) NOT NULL,
    "wl_addon_pct" DECIMAL(5,3) NOT NULL DEFAULT 0,
    "share_pct" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leader_bonuses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "leader_bonuses_beneficiary_id_status_idx" ON "leader_bonuses"("beneficiary_id", "status");
CREATE INDEX IF NOT EXISTS "leader_bonuses_order_id_idx" ON "leader_bonuses"("order_id");
CREATE INDEX IF NOT EXISTS "leader_bonuses_referral_id_idx" ON "leader_bonuses"("referral_id");

DO $$ BEGIN
  ALTER TABLE "leader_bonuses" ADD CONSTRAINT "leader_bonuses_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "leader_bonuses" ADD CONSTRAINT "leader_bonuses_referral_id_fkey"
    FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "leader_bonuses" ADD CONSTRAINT "leader_bonuses_beneficiary_id_fkey"
    FOREIGN KEY ("beneficiary_id") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
