-- DB-005 — Wallet audit events (append-only wallet lifecycle history)

-- CreateEnum
CREATE TYPE "wallet_audit_event_type" AS ENUM ('WALLET_CREATED', 'WALLET_ROTATED');

-- CreateEnum
CREATE TYPE "wallet_audit_actor_type" AS ENUM ('MERCHANT', 'SYSTEM', 'MIGRATION');

-- CreateTable
CREATE TABLE "wallet_audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_wallet_id" UUID NOT NULL,
    "event_type" "wallet_audit_event_type" NOT NULL,
    "actor_type" "wallet_audit_actor_type" NOT NULL,
    "actor_user_id" UUID,
    "from_wallet_version_id" UUID,
    "to_wallet_version_id" UUID,
    "reason_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_wallet_audit_wallet_id" ON "wallet_audit_events"("merchant_wallet_id");

-- AddForeignKey
ALTER TABLE "wallet_audit_events" ADD CONSTRAINT "wallet_audit_events_merchant_wallet_id_fkey" FOREIGN KEY ("merchant_wallet_id") REFERENCES "merchant_wallets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wallet_audit_events" ADD CONSTRAINT "wallet_audit_events_from_wallet_version_id_fkey" FOREIGN KEY ("from_wallet_version_id") REFERENCES "merchant_wallet_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wallet_audit_events" ADD CONSTRAINT "wallet_audit_events_to_wallet_version_id_fkey" FOREIGN KEY ("to_wallet_version_id") REFERENCES "merchant_wallet_versions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wallet_audit_events" ADD CONSTRAINT "wallet_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ----------------------------------------------------------------------------
-- Raw invariants that Prisma cannot express
-- ----------------------------------------------------------------------------

-- Event-type / version-linkage matrix:
--   WALLET_CREATED: from IS NULL, to IS NOT NULL.
--   WALLET_ROTATED: from IS NOT NULL, to IS NOT NULL, from <> to.
ALTER TABLE "wallet_audit_events"
    ADD CONSTRAINT "ck_wallet_audit_event_version_matrix"
    CHECK (
        (
            "event_type" = 'WALLET_CREATED'
            AND "from_wallet_version_id" IS NULL
            AND "to_wallet_version_id" IS NOT NULL
        )
        OR (
            "event_type" = 'WALLET_ROTATED'
            AND "from_wallet_version_id" IS NOT NULL
            AND "to_wallet_version_id" IS NOT NULL
            AND "from_wallet_version_id" <> "to_wallet_version_id"
        )
    );

-- from/to versions must belong to the same merchant_wallet_id (same lineage).
CREATE OR REPLACE FUNCTION "fn_wallet_audit_same_lineage"()
RETURNS TRIGGER AS $$
DECLARE
    from_wallet UUID;
    to_wallet UUID;
BEGIN
    IF NEW."from_wallet_version_id" IS NOT NULL THEN
        SELECT "merchant_wallet_id" INTO from_wallet
            FROM "merchant_wallet_versions"
            WHERE "id" = NEW."from_wallet_version_id";
        IF from_wallet IS DISTINCT FROM NEW."merchant_wallet_id" THEN
            RAISE EXCEPTION 'wallet_audit_events: from_wallet_version_id belongs to a different wallet lineage'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW."to_wallet_version_id" IS NOT NULL THEN
        SELECT "merchant_wallet_id" INTO to_wallet
            FROM "merchant_wallet_versions"
            WHERE "id" = NEW."to_wallet_version_id";
        IF to_wallet IS DISTINCT FROM NEW."merchant_wallet_id" THEN
            RAISE EXCEPTION 'wallet_audit_events: to_wallet_version_id belongs to a different wallet lineage'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_wallet_audit_same_lineage"
    BEFORE INSERT ON "wallet_audit_events"
    FOR EACH ROW
    EXECUTE FUNCTION "fn_wallet_audit_same_lineage"();

-- Append-only: no UPDATE, no DELETE.
CREATE OR REPLACE FUNCTION "fn_wallet_audit_append_only"()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'wallet_audit_events is append-only (% not allowed)', TG_OP
        USING ERRCODE = 'check_violation';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_wallet_audit_no_update"
    BEFORE UPDATE ON "wallet_audit_events"
    FOR EACH ROW
    EXECUTE FUNCTION "fn_wallet_audit_append_only"();

CREATE TRIGGER "trg_wallet_audit_no_delete"
    BEFORE DELETE ON "wallet_audit_events"
    FOR EACH ROW
    EXECUTE FUNCTION "fn_wallet_audit_append_only"();
