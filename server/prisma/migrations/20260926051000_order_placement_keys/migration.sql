CREATE TABLE "order_placement_keys" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "requestDigest" TEXT NOT NULL,
  "orderId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_placement_keys_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_placement_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "order_placement_keys_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "order_placement_keys_userId_key_key" ON "order_placement_keys"("userId", "key");
INSERT INTO "order_placement_keys" ("id", "userId", "key", "requestDigest", "orderId")
SELECT gen_random_uuid(), "userId", "idempotencyKey", "requestDigest", "id" FROM "orders";
