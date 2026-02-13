import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { payment_status } from "@prisma/client";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES: payment_status[] = [
  payment_status.AWAITING_PAYMENT,
  payment_status.SEEN_IN_MEMPOOL,
  payment_status.CONFIRMING,
];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ paymentId: string }>  }
) {
   const { paymentId } = await params; // ✅ FIX
  const now = new Date();

  const p = await prisma.payments.findFirst({
    where: { id: paymentId },
    select: {
      id: true,
      status: true,
      amount_cents: true,
      currency: true,

      btc_network: true,
      btc_address: true,
      btc_amount_sats: true,
      btc_confirmations: true,
      btc_required_confirmations: true,
      btc_expires_at: true,
      btc_rate_locked_at: true,
      btc_fx_rate: true,
      btc_rate_provider: true,
      btc_txid: true,
      btc_detected_at: true,

      products: {
        select: {
          title: true,
          message: true,
        },
      },

      payment_links: {
        select: {
          token: true,
        },
      },
    },
  });

  if (!p) {
    return NextResponse.json(
      { success: false, message: "PAYMENT_NOT_FOUND" },
      { status: 404 }
    );
  }

  const isTimeExpired = !!p.btc_expires_at && p.btc_expires_at.getTime() <= now.getTime();
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

        btcAmountSats: p.btc_amount_sats != null ? p.btc_amount_sats.toString() : null,
        btcAddress: p.btc_address ?? null,
        btcNetwork: p.btc_network ?? null,

        btcExpiresAt: p.btc_expires_at?.toISOString() ?? null,
        btcRateLockedAt: p.btc_rate_locked_at?.toISOString() ?? null,
        btcFxRateBtcPerFiat: p.btc_fx_rate?.toString() ?? null,
        btcRateProvider: p.btc_rate_provider ?? null,

        status: effectiveStatus,
        btcConfirmations: p.btc_confirmations,
        btcRequiredConfirmations: p.btc_required_confirmations,

        // opcional tech
        btcTxid: p.btc_txid ?? null,
        btcDetectedAt: p.btc_detected_at?.toISOString() ?? null,

        // para regenerar invoice luego
        paymentLinkToken: p.payment_links?.token ?? null,
      },
    },
    { status: 200 }
  );
}
