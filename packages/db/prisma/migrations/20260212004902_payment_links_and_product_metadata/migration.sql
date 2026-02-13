-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "payment_link_id" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "metadata_json" JSONB;

-- CreateTable
CREATE TABLE "payment_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "creator_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_links_token_key" ON "payment_links"("token");

-- CreateIndex
CREATE INDEX "idx_payment_links_creator_active" ON "payment_links"("creator_id", "active");

-- CreateIndex
CREATE INDEX "idx_payment_links_product_id" ON "payment_links"("product_id");

-- CreateIndex
CREATE INDEX "idx_payment_links_creator_id" ON "payment_links"("creator_id");

-- CreateIndex
CREATE INDEX "idx_payments_payment_link_id" ON "payments"("payment_link_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_link_id_fkey" FOREIGN KEY ("payment_link_id") REFERENCES "payment_links"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
