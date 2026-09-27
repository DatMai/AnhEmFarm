ALTER TABLE "order_items" ADD COLUMN "optionGroupLabel" TEXT;
ALTER TABLE "order_items" ADD COLUMN "optionLabel" TEXT;
ALTER TABLE "order_items" ADD COLUMN "selectionKey" TEXT NOT NULL DEFAULT 'none';
DROP INDEX "order_items_orderId_variantId_key";
CREATE UNIQUE INDEX "order_items_orderId_variantId_selectionKey_key" ON "order_items"("orderId", "variantId", "selectionKey");
