import { Prisma } from "@prisma/client";

type TxClient = Prisma.TransactionClient;

export type AccumulateInput = {
  paymentId: string;
  txid: string;
  voutIndex: number;
  amountSats: bigint;
  detectedAt: Date;
};

export type AccumulateResult = {
  receivedSats: bigint;
  expectedSats: bigint;
  thresholdReached: boolean;
};

/**
 * Upserts a child `payment_btc_txs` row and recalculates the aggregate
 * `btc_received_sats` on the parent payment — all inside the caller's
 * Prisma transaction so the two writes are atomic.
 */
export async function accumulatePaymentTx(
  tx: TxClient,
  input: AccumulateInput,
): Promise<AccumulateResult> {
  // Idempotent upsert keyed on (payment_id, txid, vout_index)
  await tx.payment_btc_txs.upsert({
    where: {
      payment_id_txid_vout_index: {
        payment_id: input.paymentId,
        txid: input.txid,
        vout_index: input.voutIndex,
      },
    },
    create: {
      payment_id: input.paymentId,
      txid: input.txid,
      vout_index: input.voutIndex,
      amount_sats: input.amountSats,
      detected_at: input.detectedAt,
      confirmations: 0,
    },
    update: {}, // already exists → no-op
  });

  // Recalculate aggregate from all child rows
  const agg = await tx.payment_btc_txs.aggregate({
    where: { payment_id: input.paymentId },
    _sum: { amount_sats: true },
  });

  const receivedSats: bigint = agg._sum.amount_sats ?? 0n;

  // Update parent payment atomically
  const payment = await tx.payments.update({
    where: { id: input.paymentId },
    data: {
      btc_received_sats: receivedSats,
      updated_at: new Date(),
    },
    select: { btc_amount_sats: true },
  });

  const expectedSats = payment.btc_amount_sats ?? 0n;

  return {
    receivedSats,
    expectedSats,
    thresholdReached: receivedSats >= expectedSats,
  };
}
