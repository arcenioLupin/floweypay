-- DB-002 — Custody discriminator on payments + address allocation ledger

-- CreateEnum
CREATE TYPE "receiving_model" AS ENUM ('SHARED_CUSTODIAL', 'NON_CUSTODIAL_DERIVED');

-- AlterTable: additive discriminator with an explicit, one-time backfill.
-- No permanent DEFAULT: future rows must classify receiving_model explicitly,
-- so an omitted value fails loudly instead of silently defaulting to legacy.
ALTER TABLE "payments"
    ADD COLUMN "receiving_model" "receiving_model";

-- Backfill: every pre-existing payment used the shared custodial pool.
UPDATE "payments" SET "receiving_model" = 'SHARED_CUSTODIAL' WHERE "receiving_model" IS NULL;

-- Enforce presence going forward without leaving a permanent default.
ALTER TABLE "payments" ALTER COLUMN "receiving_model" SET NOT NULL;

-- CreateTable
CREATE TABLE "wallet_address_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wallet_version_id" UUID NOT NULL,
    "derivation_index" BIGINT NOT NULL,
    "btc_address" TEXT NOT NULL,
    "network" "btc_network" NOT NULL,
    "payment_id" UUID,
    "burn_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_at" TIMESTAMPTZ(6),

    CONSTRAINT "wallet_address_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_allocations_version_id" ON "wallet_address_allocations"("wallet_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_allocations_version_index" ON "wallet_address_allocations"("wallet_version_id", "derivation_index");

-- CreateIndex: DB-002 D8 — global address uniqueness on allocations ONLY.
CREATE UNIQUE INDEX "uq_allocations_btc_address" ON "wallet_address_allocations"("btc_address");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_address_allocations_payment_id_key" ON "wallet_address_allocations"("payment_id");

-- AddForeignKey
ALTER TABLE "wallet_address_allocations" ADD CONSTRAINT "wallet_address_allocations_wallet_version_id_fkey" FOREIGN KEY ("wallet_version_id") REFERENCES "merchant_wallet_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wallet_address_allocations" ADD CONSTRAINT "wallet_address_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ----------------------------------------------------------------------------
-- Raw invariants that Prisma cannot express
-- ----------------------------------------------------------------------------

-- BIP32 non-hardened index range: 0 <= index < 2^31.
ALTER TABLE "wallet_address_allocations"
    ADD CONSTRAINT "ck_allocations_derivation_index_range"
    CHECK ("derivation_index" >= 0 AND "derivation_index" < 2147483648);

-- Exactly one of payment_id / burn_reason is set (attributed XOR burned).
ALTER TABLE "wallet_address_allocations"
    ADD CONSTRAINT "ck_allocations_attributed_xor_burned"
    CHECK (("payment_id" IS NOT NULL) <> ("burn_reason" IS NOT NULL));

-- Every allocation is terminal at INSERT (ATTRIBUTED xor BURNED); there is no
-- RESERVED/PENDING state. All persisted business fields are immutable afterward:
-- BURNED can never become ATTRIBUTED, and a payment never moves between allocations.
CREATE OR REPLACE FUNCTION "fn_allocations_immutable"()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW."wallet_version_id" IS DISTINCT FROM OLD."wallet_version_id")
        OR (NEW."derivation_index" IS DISTINCT FROM OLD."derivation_index")
        OR (NEW."btc_address" IS DISTINCT FROM OLD."btc_address")
        OR (NEW."network" IS DISTINCT FROM OLD."network")
        OR (NEW."payment_id" IS DISTINCT FROM OLD."payment_id")
        OR (NEW."burn_reason" IS DISTINCT FROM OLD."burn_reason")
        OR (NEW."assigned_at" IS DISTINCT FROM OLD."assigned_at")
    THEN
        RAISE EXCEPTION 'wallet_address_allocations: row is terminal and immutable (id=%)', OLD."id"
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_allocations_immutable"
    BEFORE UPDATE ON "wallet_address_allocations"
    FOR EACH ROW
    EXECUTE FUNCTION "fn_allocations_immutable"();

-- receiving_model is immutable once a payment row exists (created after backfill).
CREATE OR REPLACE FUNCTION "fn_payments_receiving_model_immutable"()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW."receiving_model" IS DISTINCT FROM OLD."receiving_model") THEN
        RAISE EXCEPTION 'payments: receiving_model is immutable (id=%)', OLD."id"
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_payments_receiving_model_immutable"
    BEFORE UPDATE ON "payments"
    FOR EACH ROW
    EXECUTE FUNCTION "fn_payments_receiving_model_immutable"();
