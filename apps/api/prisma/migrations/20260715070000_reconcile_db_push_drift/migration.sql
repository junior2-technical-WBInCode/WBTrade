-- Reconcile (2026-07-15, audyt V-11): produkcja byla stawiana przez `prisma db push`,
-- wiec czesc obiektow schematu nigdy nie trafila do migracji. Ta migracja domyka
-- roznice (diff: baza-po-replayu-migracji -> schema.prisma), dzieki czemu
-- `prisma migrate dev` znow dziala (shadow DB odtwarza pelny schemat).
--
-- WAZNE - PRODUKCJA: schemat juz tam istnieje. NIE wykonywac tej migracji na prodzie;
-- oznaczyc jako zastosowana:
--   npx prisma migrate resolve --applied 20260715070000_reconcile_db_push_drift
--
-- Nowe/odtwarzane srodowiska wykonuja ja normalnie przez `migrate deploy`.

-- CreateEnum
CREATE TYPE "CarouselMode" AS ENUM ('MANUAL', 'SEMI_AUTOMATIC', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE');

-- CreateEnum
CREATE TYPE "B2bStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "NewsletterCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PriceChangeSource" AS ENUM ('ADMIN', 'API', 'BASELINKER', 'IMPORT', 'SCRIPT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "LoyaltyLevel" AS ENUM ('NOWY_KLIENT', 'BRAZOWY', 'SREBRNY', 'ZLOTY', 'PLATYNOWY', 'DIAMENTOWY', 'VIP');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('NEW', 'RECEIVED', 'APPROVED', 'REFUND_SENT', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'MULTIPLIER');

-- CreateEnum
CREATE TYPE "SaleCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignScope" AS ENUM ('ALL', 'CATEGORY', 'WAREHOUSE', 'SELECTED', 'TAG');

-- AlterEnum
ALTER TYPE "BaselinkerSyncType" ADD VALUE 'PRICE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'AWAITING_CONFIRMATION';
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "TicketCategory" ADD VALUE 'RETURN';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'B2B_PARTNER';

-- DropIndex
DROP INDEX "security_audit_logs_ip_address_idx";

-- AlterTable
ALTER TABLE "addresses" ADD COLUMN     "company_name" TEXT,
ADD COLUMN     "nip" TEXT,
ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "baselinker_sync_logs" ADD COLUMN     "changed_skus" JSONB,
ADD COLUMN     "items_changed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "baselinker_category_path" TEXT;

-- AlterTable
ALTER TABLE "coupons" ADD COLUMN     "couponSource" "CouponSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "requires_auth" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "restricted_to_email" TEXT,
ADD COLUMN     "single_use_per_user" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "add_to_collective_invoice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "b2b_shipping_label" TEXT,
ADD COLUMN     "baselinker_order_id" TEXT,
ADD COLUMN     "baselinker_synced_at" TIMESTAMP(3),
ADD COLUMN     "billing_company_name" TEXT,
ADD COLUMN     "billing_nip" TEXT,
ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "collective_invoice_date" TIMESTAMP(3),
ADD COLUMN     "collective_invoice_number" TEXT,
ADD COLUMN     "coupon_code" TEXT,
ADD COLUMN     "courier_code" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "delivery_delay_notified_at" TIMESTAMP(3),
ADD COLUMN     "delivery_status" TEXT,
ADD COLUMN     "delivery_status_updated_at" TIMESTAMP(3),
ADD COLUMN     "estimated_delivery_date" TIMESTAMP(3),
ADD COLUMN     "guest_email" TEXT,
ADD COLUMN     "guest_first_name" TEXT,
ADD COLUMN     "guest_last_name" TEXT,
ADD COLUMN     "guest_phone" TEXT,
ADD COLUMN     "invoice_number" TEXT,
ADD COLUMN     "invoice_url" TEXT,
ADD COLUMN     "is_business_order" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_payment_reminder_at" TIMESTAMP(6),
ADD COLUMN     "order_label" TEXT,
ADD COLUMN     "package_shipping" JSONB,
ADD COLUMN     "payment_reminder_count" INTEGER DEFAULT 0,
ADD COLUMN     "pending_cancellation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pending_cancellation_at" TIMESTAMP(3),
ADD COLUMN     "refund_number" TEXT,
ADD COLUMN     "refund_reason" TEXT,
ADD COLUMN     "refund_requested_at" TIMESTAMP(3),
ADD COLUMN     "tracking_link" TEXT,
ADD COLUMN     "want_invoice" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "lowest_price_30_days" DECIMAL(10,2),
ADD COLUMN     "lowest_price_30_days_at" TIMESTAMP(3),
ADD COLUMN     "purchase_price" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "average_rating" DECIMAL(2,1),
ADD COLUMN     "lowest_price_30_days" DECIMAL(10,2),
ADD COLUMN     "lowest_price_30_days_at" TIMESTAMP(3),
ADD COLUMN     "manufacturer_id" TEXT,
ADD COLUMN     "popularity_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "purchase_price" DECIMAL(10,2),
ADD COLUMN     "review_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sales_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "refresh_tokens" DROP COLUMN "ip_address";

-- AlterTable
ALTER TABLE "security_audit_logs" DROP COLUMN "ip_address";

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "guest_name" TEXT,
ADD COLUMN     "guest_phone" TEXT,
ADD COLUMN     "return_number" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "auth_provider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "b2b_approved_at" TIMESTAMP(3),
ADD COLUMN     "b2b_approved_by" TEXT,
ADD COLUMN     "b2b_notes" TEXT,
ADD COLUMN     "b2b_price_multiplier" DECIMAL(4,2),
ADD COLUMN     "b2b_status" "B2bStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "b2b_wholesaler_rules" JSONB DEFAULT '{}',
ADD COLUMN     "company_city" TEXT,
ADD COLUMN     "company_country" TEXT DEFAULT 'PL',
ADD COLUMN     "company_name" TEXT,
ADD COLUMN     "company_postal_code" TEXT,
ADD COLUMN     "company_street" TEXT,
ADD COLUMN     "date_of_birth" TIMESTAMP(3),
ADD COLUMN     "email_verification_expires" TIMESTAMP(3),
ADD COLUMN     "email_verification_token" TEXT,
ADD COLUMN     "google_id" TEXT,
ADD COLUMN     "nip" TEXT,
ALTER COLUMN "password" DROP NOT NULL;

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "safety_info" TEXT,
    "eu_rep_name" TEXT,
    "eu_rep_address" TEXT,
    "eu_rep_email" TEXT,
    "baselinker_manufacturer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_usages" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_id" TEXT,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_lists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_items" (
    "id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_campaigns" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "NewsletterCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_for" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "opened_count" INTEGER NOT NULL DEFAULT 0,
    "clicked_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscriptions" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "subscribed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),

    CONSTRAINT "newsletter_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "old_price" DECIMAL(10,2) NOT NULL,
    "new_price" DECIMAL(10,2) NOT NULL,
    "source" "PriceChangeSource" NOT NULL,
    "changed_by" TEXT,
    "reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_delay_alerts" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),
    "message_type" TEXT,
    "custom_message" TEXT,
    "sent_by" TEXT,

    CONSTRAINT "delivery_delay_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'DELIVERY_DELAY',
    "includes_discount" BOOLEAN NOT NULL DEFAULT false,
    "discount_percent" INTEGER,
    "discount_valid_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carousels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'star',
    "color" TEXT NOT NULL DEFAULT 'from-orange-500 to-red-600',
    "mode" "CarouselMode" NOT NULL DEFAULT 'AUTOMATIC',
    "product_limit" INTEGER NOT NULL DEFAULT 20,
    "category_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "product_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pinned_product_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "auto_source" TEXT,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carousels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_loyalty" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "level" "LoyaltyLevel" NOT NULL DEFAULT 'NOWY_KLIENT',
    "total_spent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "qualifying_order_count" INTEGER NOT NULL DEFAULT 0,
    "permanent_discount" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "free_shipping_threshold" DECIMAL(10,2),
    "last_level_up_at" TIMESTAMP(3),
    "last_birthday_coupon_year" INTEGER,
    "last_quarterly_coupon_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_loyalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_history" (
    "id" TEXT NOT NULL,
    "user_loyalty_id" TEXT NOT NULL,
    "previous_level" "LoyaltyLevel" NOT NULL,
    "new_level" "LoyaltyLevel" NOT NULL,
    "total_spent_at" DECIMAL(12,2) NOT NULL,
    "triggered_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_unmatched" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chatbot_unmatched_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_requests" (
    "id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'NEW',
    "type" "TicketCategory" NOT NULL,
    "reason" TEXT NOT NULL,
    "refund_amount" DECIMAL(10,2),
    "refund_date" TIMESTAMP(3),
    "admin_notes" TEXT,
    "rejection_reason" TEXT,
    "closed_at" TIMESTAMP(3),
    "closed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "return_request_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discount_type" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "discount_value" DECIMAL(10,2) NOT NULL,
    "round_to_99" BOOLEAN NOT NULL DEFAULT false,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "status" "SaleCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scope" "CampaignScope" NOT NULL DEFAULT 'ALL',
    "scope_value" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stackable_with_coupons" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_campaign_products" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "original_price" DECIMAL(10,2) NOT NULL,
    "original_compare_at_price" DECIMAL(10,2),
    "sale_price" DECIMAL(10,2) NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_campaign_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_price_monitors" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "alert_on_increase" BOOLEAN NOT NULL DEFAULT true,
    "alert_on_decrease" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_price_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_price_alerts" (
    "id" TEXT NOT NULL,
    "monitor_id" TEXT NOT NULL,
    "old_price" DECIMAL(10,2) NOT NULL,
    "new_price" DECIMAL(10,2) NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_price_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_slug_key" ON "manufacturers"("slug");

-- CreateIndex
CREATE INDEX "coupon_usages_user_id_idx" ON "coupon_usages"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_usages_coupon_id_user_id_key" ON "coupon_usages"("coupon_id", "user_id");

-- CreateIndex
CREATE INDEX "shopping_lists_user_id_idx" ON "shopping_lists"("user_id");

-- CreateIndex
CREATE INDEX "shopping_list_items_list_id_idx" ON "shopping_list_items"("list_id");

-- CreateIndex
CREATE INDEX "shopping_list_items_product_id_idx" ON "shopping_list_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_list_items_list_id_product_id_key" ON "shopping_list_items"("list_id", "product_id");

-- CreateIndex
CREATE INDEX "newsletter_campaigns_sent_at_idx" ON "newsletter_campaigns"("sent_at");

-- CreateIndex
CREATE INDEX "newsletter_campaigns_status_idx" ON "newsletter_campaigns"("status");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscriptions_email_key" ON "newsletter_subscriptions"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscriptions_token_key" ON "newsletter_subscriptions"("token");

-- CreateIndex
CREATE INDEX "newsletter_subscriptions_email_idx" ON "newsletter_subscriptions"("email");

-- CreateIndex
CREATE INDEX "newsletter_subscriptions_is_verified_idx" ON "newsletter_subscriptions"("is_verified");

-- CreateIndex
CREATE INDEX "price_history_product_id_changed_at_idx" ON "price_history"("product_id", "changed_at");

-- CreateIndex
CREATE INDEX "price_history_variant_id_changed_at_idx" ON "price_history"("variant_id", "changed_at");

-- CreateIndex
CREATE INDEX "price_history_changed_at_idx" ON "price_history"("changed_at");

-- CreateIndex
CREATE INDEX "price_history_source_idx" ON "price_history"("source");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "user_notifications_user_id_is_read_idx" ON "user_notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "user_notifications_created_at_idx" ON "user_notifications"("created_at");

-- CreateIndex
CREATE INDEX "delivery_delay_alerts_status_idx" ON "delivery_delay_alerts"("status");

-- CreateIndex
CREATE INDEX "delivery_delay_alerts_order_id_idx" ON "delivery_delay_alerts"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_slug_key" ON "email_templates"("slug");

-- CreateIndex
CREATE INDEX "email_templates_category_idx" ON "email_templates"("category");

-- CreateIndex
CREATE INDEX "email_templates_is_active_idx" ON "email_templates"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "carousels_slug_key" ON "carousels"("slug");

-- CreateIndex
CREATE INDEX "carousels_sort_order_idx" ON "carousels"("sort_order");

-- CreateIndex
CREATE INDEX "carousels_is_active_is_visible_idx" ON "carousels"("is_active", "is_visible");

-- CreateIndex
CREATE UNIQUE INDEX "user_loyalty_user_id_key" ON "user_loyalty"("user_id");

-- CreateIndex
CREATE INDEX "user_loyalty_level_idx" ON "user_loyalty"("level");

-- CreateIndex
CREATE INDEX "user_loyalty_total_spent_idx" ON "user_loyalty"("total_spent");

-- CreateIndex
CREATE INDEX "loyalty_history_user_loyalty_id_idx" ON "loyalty_history"("user_loyalty_id");

-- CreateIndex
CREATE INDEX "loyalty_history_created_at_idx" ON "loyalty_history"("created_at");

-- CreateIndex
CREATE INDEX "chatbot_unmatched_count_idx" ON "chatbot_unmatched"("count");

-- CreateIndex
CREATE INDEX "chatbot_unmatched_created_at_idx" ON "chatbot_unmatched"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_return_number_key" ON "return_requests"("return_number");

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_ticket_id_key" ON "return_requests"("ticket_id");

-- CreateIndex
CREATE INDEX "return_requests_order_id_idx" ON "return_requests"("order_id");

-- CreateIndex
CREATE INDEX "return_requests_ticket_id_idx" ON "return_requests"("ticket_id");

-- CreateIndex
CREATE INDEX "return_requests_status_idx" ON "return_requests"("status");

-- CreateIndex
CREATE INDEX "return_requests_type_idx" ON "return_requests"("type");

-- CreateIndex
CREATE INDEX "return_requests_created_at_idx" ON "return_requests"("created_at");

-- CreateIndex
CREATE INDEX "return_items_return_request_id_idx" ON "return_items"("return_request_id");

-- CreateIndex
CREATE INDEX "return_items_order_item_id_idx" ON "return_items"("order_item_id");

-- CreateIndex
CREATE INDEX "sale_campaigns_status_idx" ON "sale_campaigns"("status");

-- CreateIndex
CREATE INDEX "sale_campaigns_starts_at_ends_at_idx" ON "sale_campaigns"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "sale_campaign_products_campaign_id_idx" ON "sale_campaign_products"("campaign_id");

-- CreateIndex
CREATE INDEX "sale_campaign_products_product_id_idx" ON "sale_campaign_products"("product_id");

-- CreateIndex
CREATE INDEX "sale_campaign_products_variant_id_idx" ON "sale_campaign_products"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_campaign_products_campaign_id_product_id_variant_id_key" ON "sale_campaign_products"("campaign_id", "product_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_price_monitors_product_id_key" ON "product_price_monitors"("product_id");

-- CreateIndex
CREATE INDEX "product_price_monitors_product_id_idx" ON "product_price_monitors"("product_id");

-- CreateIndex
CREATE INDEX "product_price_alerts_monitor_id_idx" ON "product_price_alerts"("monitor_id");

-- CreateIndex
CREATE INDEX "product_price_alerts_created_at_idx" ON "product_price_alerts"("created_at");

-- CreateIndex
CREATE INDEX "coupons_user_id_idx" ON "coupons"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_baselinker_order_id_key" ON "orders"("baselinker_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_refund_number_key" ON "orders"("refund_number");

-- CreateIndex
CREATE INDEX "products_manufacturer_id_idx" ON "products"("manufacturer_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_return_number_key" ON "support_tickets"("return_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_verification_token_key" ON "users"("email_verification_token");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "shopping_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_delay_alerts" ADD CONSTRAINT "delivery_delay_alerts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_loyalty" ADD CONSTRAINT "user_loyalty_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_history" ADD CONSTRAINT "loyalty_history_user_loyalty_id_fkey" FOREIGN KEY ("user_loyalty_id") REFERENCES "user_loyalty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_campaign_products" ADD CONSTRAINT "sale_campaign_products_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "sale_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_campaign_products" ADD CONSTRAINT "sale_campaign_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_campaign_products" ADD CONSTRAINT "sale_campaign_products_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_price_monitors" ADD CONSTRAINT "product_price_monitors_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_price_alerts" ADD CONSTRAINT "product_price_alerts_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "product_price_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

