-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "btc_fx_rate" DECIMAL(18,8),
ADD COLUMN     "btc_rate_locked_at" TIMESTAMPTZ(6),
ADD COLUMN     "btc_rate_provider" TEXT;

-- CreateIndex
CREATE INDEX "idx_payments_btc_rate_locked_at" ON "payments"("btc_rate_locked_at");
