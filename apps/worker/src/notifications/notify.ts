import { payment_notification_event } from "@prisma/client";
import { prisma } from "../prisma";

/**
 * Schedule a notification for the creator of a payment.
 *
 * - Resolves the creator email from the payment row.
 * - Inserts a PENDING row into payment_notifications.
 * - Idempotent: the DB unique constraint on (payment_id, event) means a
 *   second call for the same event is a no-op (upsert with empty update).
 * - Never throws — logs the error and returns so callers stay unblocked.
 */
export async function scheduleNotification(
  paymentId: string,
  event: payment_notification_event
): Promise<void> {
  try {
    const payment = await prisma.payments.findUnique({
      where: { id: paymentId },
      select: {
        users_payments_creator_idTousers: { select: { email: true } },
      },
    });

    if (!payment) {
      console.warn(`[notify] payment not found: ${paymentId}`);
      return;
    }

    const recipient = payment.users_payments_creator_idTousers.email;

    await prisma.payment_notifications.upsert({
      where:  { payment_id_event: { payment_id: paymentId, event } },
      create: { payment_id: paymentId, event, recipient },
      update: {}, // row already exists — do nothing
    });

    console.log(`[notify] scheduled event=${event} payment=${paymentId} to=${recipient}`);
  } catch (err) {
    // Intentionally non-throwing: a scheduling failure must not crash the ZMQ
    // message loop. The payment state transition already happened; the
    // dispatch job will pick up the row on the next tick if it was partially
    // written, and the DB unique constraint prevents duplicates.
    console.error(`[notify] failed to schedule event=${event} payment=${paymentId}:`, err);
  }
}
