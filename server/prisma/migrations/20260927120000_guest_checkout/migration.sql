CREATE TABLE "guest_sessions" (
  "id" UUID NOT NULL,
  "digest" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guest_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "guest_sessions_digest_key" ON "guest_sessions"("digest");
CREATE INDEX "guest_sessions_expiresAt_idx" ON "guest_sessions"("expiresAt");

ALTER TABLE "checkout_quotes" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "checkout_quotes" ADD COLUMN "guestSessionId" UUID;
ALTER TABLE "checkout_quotes" ADD COLUMN "guestEmail" TEXT;
ALTER TABLE "checkout_quotes" ADD CONSTRAINT "checkout_quotes_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "guest_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checkout_quotes" ADD CONSTRAINT "checkout_quotes_owner_check" CHECK (("userId" IS NOT NULL AND "guestSessionId" IS NULL AND "guestEmail" IS NULL) OR ("userId" IS NULL AND "guestSessionId" IS NOT NULL AND "guestEmail" IS NOT NULL));
CREATE INDEX "checkout_quotes_guestSessionId_expiresAt_idx" ON "checkout_quotes"("guestSessionId", "expiresAt");

ALTER TABLE "orders" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "orders" ADD COLUMN "guestSessionId" UUID;
ALTER TABLE "orders" ADD COLUMN "guestEmail" TEXT;
ALTER TABLE "orders" ADD CONSTRAINT "orders_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "guest_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_owner_check" CHECK ("userId" IS NOT NULL OR ("guestSessionId" IS NOT NULL AND "guestEmail" IS NOT NULL));
CREATE INDEX "orders_guestSessionId_createdAt_idx" ON "orders"("guestSessionId", "createdAt");
CREATE INDEX "orders_guestEmail_userId_idx" ON "orders"("guestEmail", "userId");

ALTER TABLE "order_events" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "inventory_movements" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "actorId" DROP NOT NULL;

CREATE TABLE "guest_placement_keys" (
  "id" UUID NOT NULL,
  "guestSessionId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "requestDigest" TEXT NOT NULL,
  "orderId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guest_placement_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "guest_placement_keys_guestSessionId_key_key" ON "guest_placement_keys"("guestSessionId", "key");
ALTER TABLE "guest_placement_keys" ADD CONSTRAINT "guest_placement_keys_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "guest_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guest_placement_keys" ADD CONSTRAINT "guest_placement_keys_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
