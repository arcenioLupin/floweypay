-- DB-004 — Payment reconciliation (lazy 1:1) + append-only reconciliation audit

-- CreateEnum
CREATE TYPE "btc_observation_status" AS ENUM ('MEMPOOL', 'CONFIRMED', 'REORG_REVERTED', 'CONFLICTED');

-- CreateEnum
CREATE TYPE "reconciliation_timing_class" AS ENUM ('ON_TIME', 'LATE', 'INDETERMINATE');

-- CreateEnum
CREATE TYPE "reconciliation_amount_class" AS ENUM ('UNDERPAID', 'EXACT', 'OVERPAID');

-- CreateEnum
CREATE TYPE "reconciliation_status" AS ENUM ('REVIEW_REQUIRED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "reconciliation_action" AS ENUM (
    'DETECTED',
    'CONFIRMED',
    'ACCEPTED',
    'REJECTED',
    'NOTE_ADDED',
    'EXTERNAL_REFUND_RECORDED',
    'REORG_REVERTED',
    'REOPENED'
);

-- CreateEnum
CREATE TYPE "reconciliation_actor_type" AS ENUM ('MERCHANT', 'SYSTEM');

-- AlterTable: additive on-chain observation evidence. Legacy rows keep NULL.
ALTER TABLE "payment_btc_txs" ADD COLUMN "first_seen_at" TIMESTAMPTZ(6);
ALTER TABLE "payment_btc_txs" ADD COLUMN "first_seen_source" TEXT;
ALTER TABLE "payment_btc_txs" ADD COLUMN "block_hash" TEXT;
ALTER TABLE "payment_btc_txs" ADD COLUMN "block_height" BIGINT;
ALTER TABLE "payment_btc_txs" ADD COLUMN "observation_status" "btc_observation_status";

-- CreateIndex: DB-004 D9 — global outpoint identity across all payments.
CREATE UNIQUE INDEX "uq_payment_btc_txs_txid_vout" ON "payment_btc_txs"("txid", "vout_index");

-- CreateTable
CREATE TABLE "payment_reconciliation" (
    "payment_id" UUID NOT NULL,
    "timing_class" "reconciliation_timing_class" NOT NULL,
    "amount_class" "reconciliation_amount_class" NOT NULL,
    "reconciliation_status" "reconciliation_status" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "business_first_seen_at" TIMESTAMPTZ(6),
    "lock_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_reconciliation_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "reconciliation_audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "action" "reconciliation_action" NOT NULL,
    "actor_type" "reconciliation_actor_type" NOT NULL,
    "actor_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_reconciliation_audit_payment_id" ON "reconciliation_audit_events"("payment_id");

-- AddForeignKey: PK = FK enforces lazy 1:1 with the payment.
ALTER TABLE "payment_reconciliation" ADD CONSTRAINT "payment_reconciliation_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reconciliation_audit_events" ADD CONSTRAINT "reconciliation_audit_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment_reconciliation"("payment_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reconciliation_audit_events" ADD CONSTRAINT "reconciliation_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ----------------------------------------------------------------------------
-- Raw invariants that Prisma cannot express
-- ----------------------------------------------------------------------------

-- Outpoint financial identity is immutable once observed.
CREATE OR REPLACE FUNCTION "fn_payment_btc_txs_immutable"()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW."txid" IS DISTINCT FROM OLD."txid")
        OR (NEW."vout_index" IS DISTINCT FROM OLD."vout_index")
        OR (NEW."amount_sats" IS DISTINCT FROM OLD."amount_sats")
    THEN
        RAISE EXCEPTION 'payment_btc_txs: immutable outpoint/amount changed (id=%)', OLD."id"
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_payment_btc_txs_immutable"
    BEFORE UPDATE ON "payment_btc_txs"
    FOR EACH ROW
    EXECUTE FUNCTION "fn_payment_btc_txs_immutable"();

-- Reconciliation audit trail is append-only: no UPDATE, no DELETE.
CREATE OR REPLACE FUNCTION "fn_reconciliation_audit_append_only"()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'reconciliation_audit_events is append-only (% not allowed)', TG_OP
        USING ERRCODE = 'check_violation';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_reconciliation_audit_no_update"
    BEFORE UPDATE ON "reconciliation_audit_events"
    FOR EACH ROW
    EXECUTE FUNCTION "fn_reconciliation_audit_append_only"();

CREATE TRIGGER "trg_reconciliation_audit_no_delete"
    BEFORE DELETE ON "reconciliation_audit_events"
    FOR EACH ROW
    EXECUTE FUNCTION "fn_reconciliation_audit_append_only"();
