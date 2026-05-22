import { prisma } from "../prisma";
import { prismaBtcNetwork } from "../env";
import { rpcCall } from "../btc/rpc";
import { completingSubsetMinConf } from "../btc/completingSubset";
import { scheduleNotification } from "../notifications/notify";
import { payment_notification_event } from "@prisma/client";

type GetBlockVerbosity1 = {
  hash: string;
  height: number;
  tx: string[]; // txids
};

let isHandling = false;
let lastBestHash: string | null = null;
let lastBlockHeight: number | null = null;

export function getLastBlockHeight(): number | null {
  return lastBlockHeight;
}

export async function handleRawBlockMessage(_payload: Buffer) {
  if (isHandling) return;
  isHandling = true;

  try {
    const bestHash = await rpcCall<string>("getbestblockhash");
    if (bestHash === lastBestHash) return;
    lastBestHash = bestHash;

    const block = await rpcCall<GetBlockVerbosity1>("getblock", [bestHash, 1]);
    lastBlockHeight = block.height;
    const txSet = new Set(block.tx);

    const net = prismaBtcNetwork();

    // Include AWAITING_PAYMENT so partial-tx confirmations are tracked (Fix 1).
    // Only fetch payments that actually have child txs.
    const rows = await prisma.payments.findMany({
      where: {
        method: "BTC_ONCHAIN",
        btc_network: net as any,
        status: { in: ["AWAITING_PAYMENT", "SEEN_IN_MEMPOOL", "CONFIRMING"] as any },
        payment_btc_txs: { some: {} },
      },
      select: {
        id: true,
        status: true,
        btc_amount_sats: true,
        btc_required_confirmations: true,
        payment_btc_txs: {
          select: {
            id: true,
            txid: true,
            amount_sats: true,
            confirmations: true,
            detected_at: true,
          },
        },
      },
      take: 5000,
    });

    let updated = 0;

    for (const p of rows) {
      const childTxs = p.payment_btc_txs;
      if (childTxs.length === 0) continue;

      // Step 1: Update child tx confirmations regardless of payment status
      let anyChildUpdated = false;

      for (const child of childTxs) {
        let newConf = child.confirmations;

        if (child.confirmations === 0) {
          if (txSet.has(child.txid)) {
            newConf = 1;
          }
        } else {
          newConf = child.confirmations + 1;
        }

        if (newConf !== child.confirmations) {
          await prisma.payment_btc_txs.update({
            where: { id: child.id },
            data: { confirmations: newConf },
          });
          child.confirmations = newConf; // update in-memory for subset calc
          anyChildUpdated = true;
        }
      }

      if (!anyChildUpdated) continue;
      updated++;

      // Step 2: Payment-level status only for post-threshold payments.
      // AWAITING_PAYMENT = threshold not reached; child confs tracked above, nothing else to do.
      if (p.status === "AWAITING_PAYMENT") continue;

      // Step 3: Compute payment-level confirmations from the completing subset only (Fix 3).
      // Extra overpayment txs are excluded so they don't drag down the count.
      const expectedSats = p.btc_amount_sats ?? 0n;
      const required = p.btc_required_confirmations ?? 1;

      const minConf = completingSubsetMinConf(childTxs, expectedSats);
      if (minConf == null) continue;

      const newStatus = minConf >= required ? "CONFIRMED" : minConf >= 1 ? "CONFIRMING" : p.status;

      if (newStatus !== p.status || minConf > 0) {
        await prisma.payments.update({
          where: { id: p.id },
          data: {
            btc_confirmations: minConf,
            status: newStatus as any,
          },
        });

        if (newStatus !== p.status && newStatus === "CONFIRMED") {
          void scheduleNotification(
            p.id,
            payment_notification_event.CONFIRMED
          );
        }
      }
    }

    console.log(
      `[block] height=${block.height} txs=${block.tx.length} updated=${updated} net=${net}`
    );
  } finally {
    isHandling = false;
  }
}