ALTER TABLE "cart_items" ADD COLUMN "choiceId" UUID;
ALTER TABLE "cart_items" ADD COLUMN "selectionKey" TEXT NOT NULL DEFAULT 'none';
DROP INDEX "cart_items_cartId_variantId_key";
CREATE UNIQUE INDEX "cart_items_cartId_variantId_selectionKey_key" ON "cart_items"("cartId", "variantId", "selectionKey");
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_choiceId_fkey"
    FOREIGN KEY ("choiceId") REFERENCES "product_choices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
