import { payment_status, Prisma } from "@prisma/client";
import type { PaymentRowVm } from "@/app/types/paymentTypes";

export const ACTIVE_STATUSES: payment_status[] = [
  payment_status.AWAITING_PAYMENT,
  payment_status.SEEN_IN_MEMPOOL,
  payment_status.CONFIRMING,
];

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function computeEffectiveStatus(
  status: payment_status,
  btcExpiresAt: Date | null,
  now: Date
): string {
  const isExpired =
    btcExpiresAt != null && btcExpiresAt.getTime() <= now.getTime();
  if (isExpired && ACTIVE_STATUSES.includes(status)) {
    return payment_status.EXPIRED;
  }
  return status;
}

/**
 * Translates a list of *effective* statuses into a Prisma WHERE clause.
 *
 * Active-lifecycle statuses (AWAITING_PAYMENT / SEEN_IN_MEMPOOL / CONFIRMING)
 * must exclude rows that are effectively expired (btc_expires_at <= now).
 * The virtual EXPIRED status must include both DB-EXPIRED rows AND active-lifecycle
 * rows whose btc_expires_at has passed (i.e. the worker may not have swept them yet).
 */
export function buildStatusWhereClause(
  statuses: payment_status[],
  now: Date
): Prisma.paymentsWhereInput {
  const conditions: Prisma.paymentsWhereInput[] = [];

  for (const s of statuses) {
    if (ACTIVE_STATUSES.includes(s)) {
      // Only rows that have NOT yet expired
      conditions.push({
        status: s,
        OR: [{ btc_expires_at: null }, { btc_expires_at: { gt: now } }],
      });
    } else if (s === payment_status.EXPIRED) {
      // Rows already written as EXPIRED by the worker
      conditions.push({ status: payment_status.EXPIRED });
      // Rows still stored as active-lifecycle but past their expiry clock
      conditions.push({
        status: { in: ACTIVE_STATUSES },
        btc_expires_at: { lte: now },
      });
    } else {
      // CONFIRMED, FAILED, PENDING — no expiry semantics
      conditions.push({ status: s });
    }
  }

  return { OR: conditions };
}

export function parseStatusFilter(raw: string | null): payment_status[] | undefined {
  if (!raw) return undefined;
  const candidates = raw.split(",").map((s) => s.trim().toUpperCase());
  const valid = candidates.filter((s): s is payment_status =>
    Object.values(payment_status).includes(s as payment_status)
  );
  return valid.length > 0 ? valid : undefined;
}

export function parseLimitParam(raw: string | null): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
}

export type PaymentListRow = {
  id: string;
  created_at: Date;
  status: payment_status;
  amount_cents: number;
  currency: string;
  btc_amount_sats: bigint | null;
  btc_received_sats: bigint;
  btc_confirmations: number;
  btc_required_confirmations: number;
  btc_expires_at: Date | null;
  products: { title: string } | null;
  payment_links: { token: string } | null;
};

export function mapRowToPaymentRowVm(
  row: PaymentListRow,
  now: Date
): PaymentRowVm {
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    status: computeEffectiveStatus(row.status, row.btc_expires_at, now),
    productTitle: row.products?.title ?? null,
    fiatAmountCents: row.amount_cents,
    currency: row.currency,
    btcAmountSats: row.btc_amount_sats != null ? row.btc_amount_sats.toString() : null,
    btcReceivedSats: (row.btc_received_sats ?? 0n).toString(),
    btcConfirmations: row.btc_confirmations,
    btcRequiredConfirmations: row.btc_required_confirmations,
    btcExpiresAt: row.btc_expires_at?.toISOString() ?? null,
    paymentLinkToken: row.payment_links?.token ?? null,
  };
}
