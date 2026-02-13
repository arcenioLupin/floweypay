-- CreateEnum
CREATE TYPE "btc_network" AS ENUM ('MAINNET', 'TESTNET', 'SIGNET', 'REGTEST');

-- AlterEnum
ALTER TYPE "payment_method" ADD VALUE 'BTC_ONCHAIN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "payment_status" ADD VALUE 'AWAITING_PAYMENT';
ALTER TYPE "payment_status" ADD VALUE 'SEEN_IN_MEMPOOL';
ALTER TYPE "payment_status" ADD VALUE 'CONFIRMING';
ALTER TYPE "payment_status" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "btc_address" TEXT,
ADD COLUMN     "btc_amount_sats" BIGINT,
ADD COLUMN     "btc_confirmations" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "btc_detected_at" TIMESTAMPTZ(6),
ADD COLUMN     "btc_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "btc_network" "btc_network",
ADD COLUMN     "btc_required_confirmations" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "btc_txid" TEXT;

-- CreateIndex
CREATE INDEX "idx_payments_btc_address" ON "payments"("btc_address");

-- CreateIndex
CREATE INDEX "idx_payments_btc_txid" ON "payments"("btc_txid");

-- CreateIndex
CREATE INDEX "idx_payments_btc_expires_at" ON "payments"("btc_expires_at");

-- CreateIndex
CREATE INDEX "idx_payments_status_btc_expires_at" ON "payments"("status", "btc_expires_at");
