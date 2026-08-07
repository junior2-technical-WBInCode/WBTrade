-- Kolejnosc linkow polecajacych ustawiana przez partnera (przeciaganie na liscie).
-- Napisane idempotentnie — bezpieczne do uruchomienia na bazie, gdzie kolumna juz istnieje.
-- Na produkcji po zastosowaniu db push uruchom:
--   npx prisma migrate resolve --applied 20260807120000_add_referral_link_sort_order

-- AlterTable
ALTER TABLE "referral_links" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "referral_links_partner_id_sort_order_idx" ON "referral_links"("partner_id", "sort_order");
