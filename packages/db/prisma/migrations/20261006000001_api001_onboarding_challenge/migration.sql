-- API-001 — Merchant wallet onboarding challenge (ephemeral, single-use Address #0 confirmation)
-- Additive only. Does not touch any existing table. Reuses existing enums
-- "btc_network" and "wallet_script_type" (DB-006). No backfill required.

-- CreateTable
CREATE TABLE "merchant_wallet_onboarding_challenge" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "challenge_token_hash" TEXT NOT NULL,
    "merchant_id" UUID NOT NULL,
    "descriptor" TEXT NOT NULL,
    "descriptor_checksum" TEXT NOT NULL,
    "master_fingerprint" TEXT NOT NULL,
    "derivation_path" TEXT NOT NULL,
    "network" "btc_network" NOT NULL,
    "script_type" "wallet_script_type" NOT NULL DEFAULT 'P2WPKH',
    "address0" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_wallet_onboarding_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: token hash is the single-use lookup key.
CREATE UNIQUE INDEX "merchant_wallet_onboarding_challenge_challenge_token_hash_key" ON "merchant_wallet_onboarding_challenge"("challenge_token_hash");

-- CreateIndex
CREATE INDEX "idx_onboarding_challenge_merchant_created" ON "merchant_wallet_onboarding_challenge"("merchant_id", "created_at" DESC);

-- CreateIndex: supports bounded lazy cleanup of expired rows.
CREATE INDEX "idx_onboarding_challenge_expires_at" ON "merchant_wallet_onboarding_challenge"("expires_at");

-- AddForeignKey
ALTER TABLE "merchant_wallet_onboarding_challenge" ADD CONSTRAINT "merchant_wallet_onboarding_challenge_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
