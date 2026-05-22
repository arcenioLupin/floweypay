import { payment_notification_event, payment_notification_status } from "@prisma/client";
import { prisma } from "../prisma";
import { sendEmail } from "./mailer";
import {
  buildSeenInMempoolTemplate,
  buildConfirmedTemplate,
  buildExpiredTemplate,
  type SeenInMempoolContext,
  type ConfirmedContext,
  type ExpiredContext,
} from "./templates";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE   = 50;
const MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Template dispatch
// ---------------------------------------------------------------------------

type PaymentRow = {
  amount_cents:             number;
  currency:                 string;
  btc_amount_sats:          bigint | null;
  btc_confirmations:        number;
  payer_name:               string | null;
  payer_email:              string | null;
  products:                 { title: string };
};

function buildTemplate(
  event: payment_notification_event,
  p:     PaymentRow
): { subject: string; text: string; html: string } {
  switch (event) {
    case payment_notification_event.SEEN_IN_MEMPOOL: {
      const ctx: SeenInMempoolContext = {
        amountCents:   p.amount_cents,
        currency:      p.currency,
        btcAmountSats: p.btc_amount_sats,
        payerName:     p.payer_name,
        payerEmail:    p.payer_email,
        productTitle:  p.products.title,
      };
      const { subject, text, html } = buildSeenInMempoolTemplate(ctx);
      return { subject, text, html };
    }

    case payment_notification_event.CONFIRMED: {
      const ctx: ConfirmedContext = {
        amountCents:      p.amount_cents,
        currency:         p.currency,
        btcAmountSats:    p.btc_amount_sats,
        btcConfirmations: p.btc_confirmations,
        payerName:        p.payer_name,
        payerEmail:       p.payer_email,
        productTitle:     p.products.title,
      };
      const { subject, text, html } = buildConfirmedTemplate(ctx);
      return { subject, text, html };
    }

    case payment_notification_event.EXPIRED: {
      const ctx: ExpiredContext = {
        amountCents:   p.amount_cents,
        currency:      p.currency,
        btcAmountSats: p.btc_amount_sats,
        productTitle:  p.products.title,
      };
      const { subject, text, html } = buildExpiredTemplate(ctx);
      return { subject, text, html };
    }
  }
}

// ---------------------------------------------------------------------------
// Dispatch loop
// ---------------------------------------------------------------------------

/**
 * Fetch up to BATCH_SIZE pending notifications and attempt to send each one.
 *
 * - One failure does not abort the rest of the batch.
 * - Marks SENT on success; increments attempts on failure.
 * - Marks FAILED permanently after MAX_ATTEMPTS.
 * - updated_at is managed automatically by Prisma (@updatedAt in schema).
 * - Safe for repeated execution (idempotent).
 */
export async function sendPendingNotifications(): Promise<void> {
  const rows = await prisma.payment_notifications.findMany({
    where: {
      status:   payment_notification_status.PENDING,
      attempts: { lt: MAX_ATTEMPTS },
    },
    include: {
      payments: {
        select: {
          amount_cents:              true,
          currency:                  true,
          btc_amount_sats:           true,
          btc_confirmations:         true,
          payer_name:                true,
          payer_email:               true,
          products: { select: { title: true } },
        },
      },
    },
    orderBy: { created_at: "asc" },
    take:    BATCH_SIZE,
  });

  if (rows.length === 0) return;

  console.log(`[notifications] dispatching ${rows.length} pending notification(s)`);

  for (const notif of rows) {
    try {
      const { subject, text, html } = buildTemplate(notif.event, notif.payments);

      await sendEmail({ to: notif.recipient, subject, text, html });

      await prisma.payment_notifications.update({
        where: { id: notif.id },
        data: {
          status:  payment_notification_status.SENT,
          sent_at: new Date(),
        },
      });

      console.log(
        `[notifications] sent event=${notif.event} to=${notif.recipient} payment=${notif.payment_id}`
      );
    } catch (err) {
      const nextAttempts = notif.attempts + 1;
      const nextStatus   = nextAttempts >= MAX_ATTEMPTS
        ? payment_notification_status.FAILED
        : payment_notification_status.PENDING;

      await prisma.payment_notifications.update({
        where: { id: notif.id },
        data: {
          status:     nextStatus,
          attempts:   nextAttempts,
          last_error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        },
      });

      console.warn(
        `[notifications] attempt ${nextAttempts}/${MAX_ATTEMPTS} failed` +
        ` event=${notif.event} payment=${notif.payment_id}:`,
        err
      );
    }
  }
}
