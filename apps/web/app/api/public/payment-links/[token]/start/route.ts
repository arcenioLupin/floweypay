import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { payment_status } from "@prisma/client";


// ✅ ajusta el path/nombre según tu archivo real:
// - si se llama btcs.ts => "@/app/api/_lib/btcs"
// - si se llama btc.ts  => "@/app/api/_lib/btc"
import {
  getBtcNetwork,
  getRateLockMinutes,
  generateMockAddress,
  getMockFxRateBtcPerFiat,
  calcSatsFromFiat,
} from "@/app/api/_lib/btc";

const ACTIVE_STATUSES: payment_status[] = [
  payment_status.AWAITING_PAYMENT,
  payment_status.SEEN_IN_MEMPOOL,
  payment_status.CONFIRMING,
];


export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }>}
) {
  const { token } =  await params;

  console.log("[start] token:", token);

  const now = new Date();

  // 1) Buscar link + producto
  const link = await prisma.payment_links.findFirst({
    where: { token, active: true },
    select: {
      id: true,
      creator_id: true,
      product_id: true,
      products: {
        select: {
          id: true,
          title: true,
          message: true,
          amount_cents: true,
          currency: true,
          active: true,
        },
      },
    },
  });

  if (!link?.products?.id || !link.products.active) {
    return NextResponse.json(
      { success: false, message: "PAYMENT_LINK_NOT_FOUND" },
      { status: 404 }
    );
  }

  console.log("[start] link id:", link?.id, "product:", link?.product_id);


  // 2) Reusar invoice si existe uno activo y no expirado
  const existing = await prisma.payments.findFirst({
    where: {
      payment_link_id: link.id,
      status: { in: ACTIVE_STATUSES }, // Prisma enum typing a veces es picky
      btc_expires_at: { gt: now },
    },
    orderBy: { created_at: "desc" },
    select: { id: true },
  });

  if (existing?.id) {
    return NextResponse.json(
      { success: true, data: { paymentId: existing.id, reused: true } },
      { status: 200 }
    );
  }

  // 3) Crear invoice nuevo (rate lock + sats + address mock)
  const network = getBtcNetwork();
  const lockMin = getRateLockMinutes();
  const expiresAt = new Date(now.getTime() + lockMin * 60_000);

  const currency = link.products.currency.toUpperCase();
  const fx = getMockFxRateBtcPerFiat(currency); // { rate: "0.00002345", provider: "mock" }
  const sats = calcSatsFromFiat(link.products.amount_cents, fx.rate);
  const address = generateMockAddress(network);

  const payment = await prisma.payments.create({
    data: {
      product_id: link.products.id,
      creator_id: link.creator_id,
      payment_link_id: link.id,

      method: "BTC_ONCHAIN",
      status: "AWAITING_PAYMENT",

      amount_cents: link.products.amount_cents,
      currency,

      btc_network: network,
      btc_address: address,
      btc_amount_sats: sats,
      btc_confirmations: 0,
      btc_required_confirmations: 1,
      btc_expires_at: expiresAt,

      btc_fx_rate: fx.rate, // Decimal => string OK
      btc_rate_locked_at: now,
      btc_rate_provider: fx.provider,
    },
    select: { id: true },
  });

  return NextResponse.json(
    { success: true, data: { paymentId: payment.id, reused: false } },
    { status: 201 }
  );
}
