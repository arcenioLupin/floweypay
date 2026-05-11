import { prisma } from "./prisma";
import { prismaBtcNetwork } from "./env";

let watched = new Set<string>();

const normalize = (s: string) => s.trim().toLowerCase();

export function hasWatchedAddress(addr: string) {
  return watched.has(normalize(addr));
}

export async function refreshWatchlist() {
  const now = new Date();
  const net = prismaBtcNetwork();

  const rows = await prisma.payments.findMany({
    where: {
      method: "BTC_ONCHAIN",
      btc_network: net as any,
      btc_address: { not: null },
      OR: [
        // Awaiting: respect expiration
        { status: "AWAITING_PAYMENT" as any, btc_expires_at: null },
        { status: "AWAITING_PAYMENT" as any, btc_expires_at: { gt: now } },
        // Post-threshold: watch for overpayment traceability
        { status: { in: ["SEEN_IN_MEMPOOL", "CONFIRMING"] as any } },
      ],
    },
    select: { btc_address: true },
    take: 5000,
  });

  watched = new Set(
    rows
      .map((r) => r.btc_address)
      .filter((x): x is string => !!x && x.trim().length > 0)
      .map(normalize)
  );

  return watched.size;
}