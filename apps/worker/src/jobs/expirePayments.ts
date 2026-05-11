import { prisma } from "../prisma";
import { prismaBtcNetwork } from "../env";

export async function expireStalePayments(): Promise<number> {
  const now = new Date();
  const net = prismaBtcNetwork();

  const { count } = await prisma.payments.updateMany({
    where: {
      method: "BTC_ONCHAIN",
      status: "AWAITING_PAYMENT",
      btc_network: net as any,
      btc_expires_at: { not: null, lte: now },
    },
    data: {
      status: "EXPIRED",
    },
  });

  if (count > 0) {
    console.log(`[expire] expired ${count} stale payments (net=${net})`);
  }

  return count;
}
