import { prisma } from "../prisma";
import { prismaBtcNetwork } from "../env";
import { scheduleNotification } from "../notifications/notify";
import { payment_notification_event } from "@prisma/client";

export async function expireStalePayments(): Promise<number> {
  const now = new Date();
  const net = prismaBtcNetwork();

  // Collect IDs first so we can schedule notifications after the bulk update.
  const toExpire = await prisma.payments.findMany({
    where: {
      method: "BTC_ONCHAIN",
      status: "AWAITING_PAYMENT",
      btc_network: net as any,
      btc_expires_at: { not: null, lte: now },
    },
    select: { id: true },
  });

  if (toExpire.length === 0) return 0;

  const ids = toExpire.map((p) => p.id);

  const { count } = await prisma.payments.updateMany({
    where: { id: { in: ids } },
    data: { status: "EXPIRED" },
  });

  if (count > 0) {
    console.log(`[expire] expired ${count} stale payments (net=${net})`);

    for (const id of ids) {
      void scheduleNotification(
        id,
        payment_notification_event.EXPIRED
      );
    }
  }

  return count;
}
