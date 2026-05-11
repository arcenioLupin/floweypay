import { prisma } from "../prisma";
import { decodeRawTx } from "../btc/decodeRawTx";
import { accumulatePaymentTx } from "../btc/paymentAccumulator";
import { hasWatchedAddress } from "../watchlist";
import { prismaBtcNetwork } from "../env";


export async function handleRawTxMessage(payload: Buffer) {
  const { txid, outputs } = decodeRawTx(payload);

  const net = prismaBtcNetwork();
  const normalize = (s: string) => s.trim().toLowerCase();

  const hits = outputs.filter((o) => hasWatchedAddress(normalize(o.address)));
  if (hits.length === 0) return;

  const seenAt = new Date();

  // Group hits by address so we process all outputs for a given payment together
  const hitsByAddr = new Map<string, typeof hits>();
  for (const hit of hits) {
    const addr = normalize(hit.address);
    const list = hitsByAddr.get(addr) ?? [];
    list.push(hit);
    hitsByAddr.set(addr, list);
  }

  for (const [addr, addrHits] of hitsByAddr) {
    // Find the most recent active payment for this address + network
    // AWAITING_PAYMENT: respect expiration
    // SEEN_IN_MEMPOOL / CONFIRMING: record overpayment tx for traceability
    const p = await prisma.payments.findFirst({
      where: {
        method: "BTC_ONCHAIN",
        btc_network: net as any,
        btc_address: addr,
        OR: [
          {
            status: "AWAITING_PAYMENT" as any,
            btc_expires_at: null,
          },
          {
            status: "AWAITING_PAYMENT" as any,
            btc_expires_at: { gt: seenAt },
          },
          {
            status: { in: ["SEEN_IN_MEMPOOL", "CONFIRMING"] as any },
          },
        ],
      },
      orderBy: { created_at: "desc" },
      select: { id: true, btc_amount_sats: true, btc_detected_at: true, status: true },
    });

    if (!p) continue;

    // Accumulate all outputs for this payment inside a single transaction
    let result = { receivedSats: 0n, expectedSats: 0n, thresholdReached: false };

    await prisma.$transaction(async (tx) => {
      for (const hit of addrHits) {
        result = await accumulatePaymentTx(tx, {
          paymentId: p.id,
          txid,
          voutIndex: hit.voutIndex,
          amountSats: hit.valueSats,
          detectedAt: seenAt,
        });
      }

      // Status transitions only for AWAITING_PAYMENT
      if (p.status === "AWAITING_PAYMENT") {
        if (result.thresholdReached) {
          await tx.payments.update({
            where: { id: p.id },
            data: {
              status: "SEEN_IN_MEMPOOL",
              btc_txid: txid,
              btc_detected_at: p.btc_detected_at ?? seenAt,
              btc_confirmations: 0,
            },
          });
        } else if (!p.btc_detected_at) {
          // First partial: record detection time but stay AWAITING_PAYMENT
          await tx.payments.update({
            where: { id: p.id },
            data: { btc_detected_at: seenAt },
          });
        }
      }
      // For SEEN_IN_MEMPOOL / CONFIRMING: accumulation already done, no status change
    });

    const tag =
      p.status !== "AWAITING_PAYMENT"
        ? "overpayment"
        : result.thresholdReached
          ? "complete"
          : "partial";
    console.log(
      `[rawtx] ${tag} payment=${p.id} addr=${addr} received=${result.receivedSats.toString()}/${result.expectedSats.toString()} txid=${txid.slice(0, 10)}…`
    );
  }
}
