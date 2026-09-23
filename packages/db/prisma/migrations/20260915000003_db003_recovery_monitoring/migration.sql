-- DB-003 — Recovery state + descriptor monitoring (1:1 with wallet version)

-- CreateEnum
CREATE TYPE "recovery_state" AS ENUM ('RECOVERY_REQUIRED', 'RECONCILING', 'READY', 'RECOVERY_FAILED');

-- CreateEnum: CLOSED vocabulary (DB-003). Physically restricted.
CREATE TYPE "recovery_state_reason" AS ENUM (
    'INITIAL_ESTABLISHMENT',
    'DB_RESTORE',
    'HWM_INCONSISTENCY',
    'CORE_STATE_LOST',
    'MONITORING_INSUFFICIENT',
    'RECONCILE_INTERRUPTED'
);

-- CreateEnum
CREATE TYPE "monitoring_status" AS ENUM ('PENDING', 'VERIFIED', 'STALE', 'ERROR');

-- CreateTable
CREATE TABLE "merchant_wallet_recovery_state" (
    "wallet_version_id" UUID NOT NULL,
    "recovery_state" "recovery_state" NOT NULL DEFAULT 'RECOVERY_REQUIRED',
    "state_reason" "recovery_state_reason" NOT NULL DEFAULT 'INITIAL_ESTABLISHMENT',
    "state_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciliation_started_at" TIMESTAMPTZ(6),
    "lock_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "merchant_wallet_recovery_state_pkey" PRIMARY KEY ("wallet_version_id")
);

-- CreateTable
CREATE TABLE "merchant_wallet_descriptor_monitoring" (
    "wallet_version_id" UUID NOT NULL,
    "monitoring_status" "monitoring_status" NOT NULL DEFAULT 'PENDING',
    "monitored_through_index" BIGINT,
    "last_verified_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "lock_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "merchant_wallet_descriptor_monitoring_pkey" PRIMARY KEY ("wallet_version_id")
);

-- AddForeignKey: PK = FK enforces strict 1:1 with the wallet version.
ALTER TABLE "merchant_wallet_recovery_state" ADD CONSTRAINT "merchant_wallet_recovery_state_wallet_version_id_fkey" FOREIGN KEY ("wallet_version_id") REFERENCES "merchant_wallet_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "merchant_wallet_descriptor_monitoring" ADD CONSTRAINT "merchant_wallet_descriptor_monitoring_wallet_version_id_fkey" FOREIGN KEY ("wallet_version_id") REFERENCES "merchant_wallet_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
