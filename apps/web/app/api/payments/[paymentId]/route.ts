import { NextResponse } from "next/server";
import { payment_status } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { requireUserId } from "@/app/api/_lib/auth";

export const dynamic = "force-dynamic";

const bigintMax = (a: bigint, b: bigint) => (a > b ? a : b);

const ACTIVE_STATUSES: payment_status[] = [
  payment_status.AWAITING_PAYMENT,
  payment_status.SEEN_IN_MEMPOOL,
  payment_status.CONFIRMING,
];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json(
      { success: false, message: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { paymentId } = await params;
  const now = new Date();

  const p = await prisma.payments.findFirst({
    where: {
      id: paymentId,
      creator_id: userId,   // ← IDOR guard: only the owner can fetch
    },
    select: {
      id: true,
      status: true,
      amount_cents: true,
      currency: true,

      btc_network: true,
      btc_address: true,
      btc_amount_sats: true,
      btc_received_sats: true,
      btc_confirmations: true,
      btc_required_confirmations: true,
      btc_expires_at: true,
      btc_rate_locked_at: true,
      btc_fx_rate: true,
      btc_rate_provider: true,
      btc_txid: true,
      btc_detected_at: true,

      products: {
        select: { title: true, message: true },
      },
      payment_links: {
        select: { token: true },
      },
    },
  });

  if (!p) {
    return NextResponse.json(
      { success: false, message: "PAYMENT_NOT_FOUND" },
      { status: 404 }
    );
  }

  const isTimeExpired =
    !!p.btc_expires_at && p.btc_expires_at.getTime() <= now.getTime();
  const effectiveStatus =
    isTimeExpired && ACTIVE_STATUSES.includes(p.status)
      ? payment_status.EXPIRED
      : p.status;

  return NextResponse.json(
    {
      success: true,
      data: {
        id: p.id,
        title: p.products?.title ?? null,
        message: p.products?.message ?? null,

        fiatAmountCents: p.amount_cents,
        currency: p.currency,

        btcAmountSats:
          p.btc_amount_sats != null ? p.btc_amount_sats.toString() : null,
        btcReceivedSats: (p.btc_received_sats ?? 0n).toString(),
        btcRemainingSats: bigintMax(
          0n,
          (p.btc_amount_sats ?? 0n) - (p.btc_received_sats ?? 0n)
        ).toString(),
        btcOverpaidSats: bigintMax(
          0n,
          (p.btc_received_sats ?? 0n) - (p.btc_amount_sats ?? 0n)
        ).toString(),
        btcAddress: p.btc_address ?? null,
        btcNetwork: p.btc_network ?? null,

        btcExpiresAt: p.btc_expires_at?.toISOString() ?? null,
        btcRateLockedAt: p.btc_rate_locked_at?.toISOString() ?? null,
        btcFxRateBtcPerFiat: p.btc_fx_rate?.toString() ?? null,
        btcRateProvider: p.btc_rate_provider ?? null,

        status: effectiveStatus,
        btcConfirmations: p.btc_confirmations,
        btcRequiredConfirmations: p.btc_required_confirmations,

        btcTxid: p.btc_txid ?? null,
        btcDetectedAt: p.btc_detected_at?.toISOString() ?? null,

        paymentLinkToken: p.payment_links?.token ?? null,
      },
    },
    { status: 200 }
  );
}
