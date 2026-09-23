-- DB-001 — Merchant wallet + immutable descriptor version lineage
-- Non-custodial custody root. Additive: no existing table is altered.

-- CreateEnum
CREATE TYPE "wallet_lifecycle" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "wallet_script_type" AS ENUM ('P2WPKH');

-- CreateTable
CREATE TABLE "merchant_wallets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "merchant_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_wallet_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_wallet_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "descriptor" TEXT NOT NULL,
    "descriptor_checksum" TEXT NOT NULL,
    "master_fingerprint" TEXT NOT NULL,
    "derivation_path" TEXT NOT NULL,
    "network" "btc_network" NOT NULL,
    "script_type" "wallet_script_type" NOT NULL DEFAULT 'P2WPKH',
    "lifecycle" "wallet_lifecycle" NOT NULL DEFAULT 'ACTIVE',
    "activated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "merchant_wallet_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchant_wallets_merchant_id_key" ON "merchant_wallets"("merchant_id");

-- CreateIndex
CREATE INDEX "idx_wallet_versions_wallet_id" ON "merchant_wallet_versions"("merchant_wallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_wallet_versions_wallet_version" ON "merchant_wallet_versions"("merchant_wallet_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "uq_wallet_versions_descriptor" ON "merchant_wallet_versions"("descriptor");

-- AddForeignKey
ALTER TABLE "merchant_wallets" ADD CONSTRAINT "merchant_wallets_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "merchant_wallet_versions" ADD CONSTRAINT "merchant_wallet_versions_merchant_wallet_id_fkey" FOREIGN KEY ("merchant_wallet_id") REFERENCES "merchant_wallets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ----------------------------------------------------------------------------
-- Raw invariants that Prisma cannot express
-- ----------------------------------------------------------------------------

-- At most one ACTIVE version per wallet (partial unique index).
CREATE UNIQUE INDEX "uq_wallet_versions_one_active"
    ON "merchant_wallet_versions" ("merchant_wallet_id")
    WHERE ("lifecycle" = 'ACTIVE');

-- version must be positive.
ALTER TABLE "merchant_wallet_versions"
    ADD CONSTRAINT "ck_wallet_versions_version_positive"
    CHECK ("version" > 0);

-- master_fingerprint is exactly 8 lowercase hex chars.
ALTER TABLE "merchant_wallet_versions"
    ADD CONSTRAINT "ck_wallet_versions_fingerprint_format"
    CHECK ("master_fingerprint" ~ '^[0-9a-f]{8}$');

-- Lifecycle <-> retired_at consistency:
--   RETIRED requires retired_at NOT NULL; ACTIVE requires retired_at NULL.
ALTER TABLE "merchant_wallet_versions"
    ADD CONSTRAINT "ck_wallet_versions_lifecycle_retired_at"
    CHECK (
        ("lifecycle" = 'RETIRED' AND "retired_at" IS NOT NULL)
        OR ("lifecycle" = 'ACTIVE' AND "retired_at" IS NULL)
    );

-- retired_at cannot precede activation.
ALTER TABLE "merchant_wallet_versions"
    ADD CONSTRAINT "ck_wallet_versions_retired_after_activated"
    CHECK ("retired_at" IS NULL OR "retired_at" >= "activated_at");

-- Immutability trigger: cryptographic identity of a version is append-only.
-- Only the one-way lifecycle transition ACTIVE -> RETIRED (with retired_at)
-- and updated_at may change after insert. RETIRED -> ACTIVE is forbidden.
CREATE OR REPLACE FUNCTION "fn_wallet_versions_immutable"()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW."merchant_wallet_id" IS DISTINCT FROM OLD."merchant_wallet_id")
        OR (NEW."version" IS DISTINCT FROM OLD."version")
        OR (NEW."descriptor" IS DISTINCT FROM OLD."descriptor")
        OR (NEW."descriptor_checksum" IS DISTINCT FROM OLD."descriptor_checksum")
        OR (NEW."master_fingerprint" IS DISTINCT FROM OLD."master_fingerprint")
        OR (NEW."derivation_path" IS DISTINCT FROM OLD."derivation_path")
        OR (NEW."network" IS DISTINCT FROM OLD."network")
        OR (NEW."script_type" IS DISTINCT FROM OLD."script_type")
        OR (NEW."activated_at" IS DISTINCT FROM OLD."activated_at")
    THEN
        RAISE EXCEPTION 'merchant_wallet_versions: immutable column changed (id=%)', OLD."id"
            USING ERRCODE = 'check_violation';
    END IF;

    -- Lifecycle is one-way: once RETIRED it can never return to ACTIVE.
    IF (OLD."lifecycle" = 'RETIRED' AND NEW."lifecycle" <> 'RETIRED') THEN
        RAISE EXCEPTION 'merchant_wallet_versions: lifecycle is one-way, RETIRED -> % is forbidden (id=%)', NEW."lifecycle", OLD."id"
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_wallet_versions_immutable"
    BEFORE UPDATE ON "merchant_wallet_versions"
    FOR EACH ROW
    EXECUTE FUNCTION "fn_wallet_versions_immutable"();
