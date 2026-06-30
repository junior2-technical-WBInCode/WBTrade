-- Affiliate / partner (referral) program.
-- The affiliate tables were originally created in production via `prisma db push`,
-- so this migration is written idempotently (IF NOT EXISTS / guarded CREATE TYPE /
-- guarded ADD CONSTRAINT) and is safe to run on a DB that already has them.
-- On production (where the tables already exist) baseline instead:
--   npx prisma migrate resolve --applied 20260630150000_add_affiliate_program

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PartnerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'PAID', 'APPROVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PayoutType" AS ENUM ('CASH', 'COUPON');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "partner_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "referral_code" TEXT NOT NULL,
    "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING',
    "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    "sub_commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    "bank_account_number" TEXT,
    "company_name" TEXT,
    "nip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "parent_partner_id" TEXT,

    CONSTRAINT "partner_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "referral_links" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "product_id" TEXT,
    "name" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "referrals" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "partner_id" TEXT NOT NULL,
    "primary_commission" DECIMAL(10,2) NOT NULL,
    "parent_partner_id" TEXT,
    "parent_commission" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fraud_note" TEXT,
    "paid_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "referral_items" (
    "id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "referral_link_id" TEXT,
    "primary_commission_amount" DECIMAL(10,2) NOT NULL,
    "parent_commission_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "referral_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "referral_payouts" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "type" "PayoutType" NOT NULL DEFAULT 'CASH',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "invoice_url" TEXT,
    "coupon_code" TEXT,
    "notes" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "partner_profiles_user_id_key" ON "partner_profiles"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "partner_profiles_referral_code_key" ON "partner_profiles"("referral_code");
CREATE INDEX IF NOT EXISTS "partner_profiles_status_idx" ON "partner_profiles"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "referral_links_code_key" ON "referral_links"("code");
CREATE INDEX IF NOT EXISTS "referral_links_partner_id_idx" ON "referral_links"("partner_id");
CREATE INDEX IF NOT EXISTS "referral_links_product_id_idx" ON "referral_links"("product_id");
CREATE UNIQUE INDEX IF NOT EXISTS "referrals_order_id_key" ON "referrals"("order_id");
CREATE INDEX IF NOT EXISTS "referrals_partner_id_status_idx" ON "referrals"("partner_id", "status");
CREATE INDEX IF NOT EXISTS "referrals_status_paid_at_idx" ON "referrals"("status", "paid_at");
CREATE UNIQUE INDEX IF NOT EXISTS "referral_items_order_item_id_key" ON "referral_items"("order_item_id");
CREATE INDEX IF NOT EXISTS "referral_items_referral_id_idx" ON "referral_items"("referral_id");
CREATE INDEX IF NOT EXISTS "referral_payouts_partner_id_status_idx" ON "referral_payouts"("partner_id", "status");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "partner_profiles" ADD CONSTRAINT "partner_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "partner_profiles" ADD CONSTRAINT "partner_profiles_parent_partner_id_fkey" FOREIGN KEY ("parent_partner_id") REFERENCES "partner_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referrals" ADD CONSTRAINT "referrals_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referrals" ADD CONSTRAINT "referrals_parent_partner_id_fkey" FOREIGN KEY ("parent_partner_id") REFERENCES "partner_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referrals" ADD CONSTRAINT "referrals_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referral_items" ADD CONSTRAINT "referral_items_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referral_items" ADD CONSTRAINT "referral_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referral_items" ADD CONSTRAINT "referral_items_referral_link_id_fkey" FOREIGN KEY ("referral_link_id") REFERENCES "referral_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "referral_payouts" ADD CONSTRAINT "referral_payouts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
