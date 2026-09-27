CREATE TABLE "product_choice_groups" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_choice_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_choices" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortPosition" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_choices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_choice_groups_productId_key" ON "product_choice_groups"("productId");
CREATE INDEX "product_choices_groupId_sortPosition_id_idx" ON "product_choices"("groupId", "sortPosition", "id");
CREATE INDEX "product_choices_groupId_active_sortPosition_id_idx" ON "product_choices"("groupId", "active", "sortPosition", "id");

ALTER TABLE "product_choice_groups" ADD CONSTRAINT "product_choice_groups_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_choices" ADD CONSTRAINT "product_choices_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "product_choice_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
