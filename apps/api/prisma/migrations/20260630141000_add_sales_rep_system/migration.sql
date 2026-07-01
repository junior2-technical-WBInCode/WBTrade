-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'HANDLOWIEC';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "sales_rep_id" TEXT,
ADD COLUMN     "rep_discount_pct" DECIMAL(4,2);

-- CreateEnum
CREATE TYPE "SalesRepCommissionStatus" AS ENUM ('PENDING', 'PAID', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesRepPayoutStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');

-- CreateTable
CREATE TABLE "sales_rep_commissions" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sales_rep_id" TEXT NOT NULL,
    "status" "SalesRepCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "base" DECIMAL(10,2) NOT NULL,
    "discount_pct" DECIMAL(4,2) NOT NULL,
    "commission_pct" DECIMAL(4,2) NOT NULL,
    "commission_amount" DECIMAL(10,2) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_rep_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_rep_payouts" (
    "id" TEXT NOT NULL,
    "sales_rep_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "SalesRepPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "invoice_url" TEXT,
    "notes" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_rep_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_rep_commissions_order_id_key" ON "sales_rep_commissions"("order_id");

-- CreateIndex
CREATE INDEX "sales_rep_commissions_sales_rep_id_status_idx" ON "sales_rep_commissions"("sales_rep_id", "status");

-- CreateIndex
CREATE INDEX "sales_rep_commissions_status_paid_at_idx" ON "sales_rep_commissions"("status", "paid_at");

-- CreateIndex
CREATE INDEX "sales_rep_payouts_sales_rep_id_status_idx" ON "sales_rep_payouts"("sales_rep_id", "status");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sales_rep_id_fkey" FOREIGN KEY ("sales_rep_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_rep_commissions" ADD CONSTRAINT "sales_rep_commissions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_rep_commissions" ADD CONSTRAINT "sales_rep_commissions_sales_rep_id_fkey" FOREIGN KEY ("sales_rep_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_rep_payouts" ADD CONSTRAINT "sales_rep_payouts_sales_rep_id_fkey" FOREIGN KEY ("sales_rep_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
