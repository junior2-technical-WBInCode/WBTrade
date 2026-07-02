-- CreateTable
CREATE TABLE "sales_rep_offer_templates" (
    "id" TEXT NOT NULL,
    "sales_rep_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discount_pct" DECIMAL(4,2) NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_rep_offer_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_rep_offer_templates_sales_rep_id_idx" ON "sales_rep_offer_templates"("sales_rep_id");

-- AddForeignKey
ALTER TABLE "sales_rep_offer_templates" ADD CONSTRAINT "sales_rep_offer_templates_sales_rep_id_fkey" FOREIGN KEY ("sales_rep_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
