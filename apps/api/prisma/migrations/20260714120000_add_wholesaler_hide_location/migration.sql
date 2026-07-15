-- Repair (2026-07-15, audyt V-11): tabela "wholesalers" powstała na produkcji przez
-- `prisma db push` i nie było jej w żadnej migracji. Tworzymy ją warunkowo, aby łańcuch
-- migracji dał się odtworzyć na pustej bazie (shadow DB). Na produkcji to no-op.
CREATE TABLE IF NOT EXISTS "wholesalers" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baselinker_inventory_id" TEXT,
    "prefix" TEXT NOT NULL DEFAULT '',
    "sku_prefix" TEXT,
    "location" TEXT,
    "warehouse_display_name" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "color" TEXT NOT NULL DEFAULT '#6b7280',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "skip_in_sync" BOOLEAN NOT NULL DEFAULT false,
    "has_price_rules" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wholesalers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wholesalers_key_key" ON "wholesalers"("key");
CREATE UNIQUE INDEX IF NOT EXISTS "wholesalers_baselinker_inventory_id_key" ON "wholesalers"("baselinker_inventory_id");
CREATE INDEX IF NOT EXISTS "wholesalers_is_active_idx" ON "wholesalers"("is_active");
CREATE INDEX IF NOT EXISTS "wholesalers_sort_order_idx" ON "wholesalers"("sort_order");

-- Add hide_location flag to wholesalers: allows hiding warehouse location
-- from the storefront (location filter + product cards) without deactivating
-- the wholesaler (sync/pricing/order routing keep working).
ALTER TABLE "wholesalers" ADD COLUMN IF NOT EXISTS "hide_location" BOOLEAN NOT NULL DEFAULT false;
