-- CreateEnum
CREATE TYPE "payment_notification_event" AS ENUM ('SEEN_IN_MEMPOOL', 'CONFIRMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "payment_notification_status" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "payment_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "event" "payment_notification_event" NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "payment_notification_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_payment_notifications_pid_event" ON "payment_notifications"("payment_id", "event");

-- CreateIndex
CREATE INDEX "idx_payment_notifications_status_created" ON "payment_notifications"("status", "created_at");

-- AddForeignKey
ALTER TABLE "payment_notifications" ADD CONSTRAINT "payment_notifications_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
