import { prisma } from "../prisma";
import { decodeRawTx } from "../btc/decodeRawTx";
import { hasWatchedAddress } from "../watchlist";
import { envNetwork } from "../env";

function prismaBtcNetwork() {
  const n = (envNetwork() ?? "").toLowerCase();
  if (n === "regtest") return "REGTEST";
  if (n === "signet") return "SIGNET";
  if (n === "testnet") return "TESTNET";
  return "MAINNET";
}


export async function handleRawTxMessage(payload: Buffer) {
  const { txid, outputs } = decodeRawTx(payload);

  const net = prismaBtcNetwork();
  const normalize = (s: string) => s.trim().toLowerCase();

  // Encuentra outputs que apunten a direcciones que estamos esperando
  const hits = outputs.filter((o) => hasWatchedAddress(normalize(o.address)));
  if (hits.length === 0) return;

  const seenAt = new Date();

  for (const hit of hits) {
    const addr = normalize(hit.address);

    // buscamos el payment más reciente con esa dirección (y misma red)
    const p = await prisma.payments.findFirst({
      where: {
        method: "BTC_ONCHAIN",
        status: "AWAITING_PAYMENT",
        btc_network: net as any,
        btc_address: addr,
      },
      orderBy: { created_at: "desc" },
    });

    if (!p) continue;

    // opcional (recomendado): validar monto si lo tienes
    if (p.btc_amount_sats != null) {
      const expected = p.btc_amount_sats; // ✅ ya es bigint en Prisma
      if (hit.valueSats < expected) {
        continue;
      }
    }

    await prisma.payments.update({
      where: { id: p.id },
      data: {
        status: "SEEN_IN_MEMPOOL",
        btc_txid: txid,
        btc_detected_at: seenAt,
        btc_confirmations: 0,
      },
    });

    console.log(
      `[rawtx] match payment=${p.id} addr=${addr} sats=${hit.valueSats.toString()} txid=${txid.slice(0, 10)}…`
    );
  }
}
