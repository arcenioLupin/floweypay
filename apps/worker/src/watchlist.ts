import { prisma } from "./prisma";
import { envNetwork } from "./env";

let watched = new Set<string>();

const normalize = (s: string) => s.trim().toLowerCase();

function prismaBtcNetwork() {
  const n = (envNetwork() ?? "").toLowerCase();
  if (n === "regtest") return "REGTEST";
  if (n === "signet") return "SIGNET";
  if (n === "testnet") return "TESTNET";
  return "MAINNET";
}

export function hasWatchedAddress(addr: string) {
  return watched.has(normalize(addr));
}

export async function refreshWatchlist() {
  const now = new Date();
  const net = prismaBtcNetwork();

  const rows = await prisma.payments.findMany({
    where: {
      method: "BTC_ONCHAIN",
      status: "AWAITING_PAYMENT",
      btc_network: net as any,
      btc_address: { not: null },
      OR: [{ btc_expires_at: null }, { btc_expires_at: { gt: now } }],
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