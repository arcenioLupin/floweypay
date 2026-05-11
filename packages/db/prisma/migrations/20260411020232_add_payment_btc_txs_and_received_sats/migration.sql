-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "btc_received_sats" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "payment_btc_txs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "txid" TEXT NOT NULL,
    "vout_index" INTEGER NOT NULL,
    "amount_sats" BIGINT NOT NULL,
    "detected_at" TIMESTAMPTZ(6) NOT NULL,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_btc_txs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_payment_btc_txs_payment_id" ON "payment_btc_txs"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payment_btc_txs_pid_txid_vout" ON "payment_btc_txs"("payment_id", "txid", "vout_index");

-- AddForeignKey
ALTER TABLE "payment_btc_txs" ADD CONSTRAINT "payment_btc_txs_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
