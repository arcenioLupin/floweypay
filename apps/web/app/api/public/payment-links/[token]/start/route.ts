import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { Prisma, payment_status } from "@prisma/client";
import {
  allocateBtcAddress,
  calcSatsFromFiat,
  getBtcNetwork,
  getRateLockMinutes,
  getRequiredConfirmations,
  isSupportedCurrency,
  normalizeCurrency,
  validateAmountCents,
  validateSats,
} from "@/app/api/_lib/btc";
import { getRateWithFallback } from "@/app/api/_lib/btcRateService";

const ACTIVE_STATUSES: payment_status[] = [
  payment_status.AWAITING_PAYMENT,
  payment_status.SEEN_IN_MEMPOOL,
  payment_status.CONFIRMING,
];

const RETRYABLE_PRISMA_CODES = new Set(["P2034"]);
const MAX_RETRIES = 3;

function errorJson(code: string, status: number) {
  return NextResponse.json({ success: false, message: code }, { status });
}

function isRetryableTxError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_PRISMA_CODES.has(err.code);
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("deadlock") || msg.includes("could not serialize");
  }

  return false;
}

async function findActivePayment(paymentLinkId: string, now: Date) {
  return prisma.payments.findFirst({
    where: {
      payment_link_id: paymentLinkId,
      status: { in: ACTIVE_STATUSES },
      btc_expires_at: { gt: now },
    },
    orderBy: { created_at: "desc" },
    select: { id: true },
  });
}


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

  const currency = normalizeCurrency(link.products.currency);
  if (!isSupportedCurrency(currency)) {
    return errorJson("BTC_UNSUPPORTED_CURRENCY", 400);
  }

  const amountValidationError = validateAmountCents(link.products.amount_cents);
  if (amountValidationError) {
    const code = amountValidationError;
    return errorJson(code, 400);
  }

  // Reuse active invoice first; this preserves existing lock/rate values.
  const existing = await findActivePayment(link.id, now);

  if (existing?.id) {
    return NextResponse.json(
      { success: true, data: { paymentId: existing.id, reused: true } },
      { status: 200 }
    );
  }

  // Create new invoice with locked rate/address.
  const network = getBtcNetwork();
  const lockMin = getRateLockMinutes();
  const expiresAt = new Date(now.getTime() + lockMin * 60_000);

  let fx: Awaited<ReturnType<typeof getRateWithFallback>>;
  try {
    fx = await getRateWithFallback(currency);
  } catch (err) {
    const code = err instanceof Error ? err.message : "BTC_RATE_UNAVAILABLE";
    if (code === "BTC_RATE_PROVIDER_UNAVAILABLE") {
      console.error("[start] Production rate provider unavailable. Configure BTC_RATE_PROVIDER and disable mocks.");
      return errorJson(code, 503);
    }
    return errorJson("BTC_RATE_UNAVAILABLE", 503);
  }

  const sats = calcSatsFromFiat(link.products.amount_cents, fx.rate);
  const satsValidationError = validateSats(sats);
  if (satsValidationError) {
    return errorJson(satsValidationError, 400);
  }

  let address = "";
  try {
    address = await allocateBtcAddress(network);
  } catch (err) {
    const code = err instanceof Error ? err.message : "BTC_ADDRESS_SOURCE_UNAVAILABLE";
    if (code === "BTC_ADDRESS_SOURCE_UNAVAILABLE") {
      console.error("[start] BTC address source unavailable. Configure BTC_ADDRESS_SOURCE for production.");
      return errorJson(code, 503);
    }
    if (code === "BTC_ADDRESS_INVALID_FOR_NETWORK") {
      return errorJson(code, 400);
    }
    return errorJson("BTC_ADDRESS_SOURCE_UNAVAILABLE", 503);
  }

  // Serialize active invoice creation for (payment_link_id + active window) to prevent duplicates.
  let paymentId: string | null = null;
  let reused = false;
  const windowBucket = Math.floor(now.getTime() / (lockMin * 60_000));
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const lockKey = `${link.id}:${windowBucket}`;
        // hashtextextended(text, bigint) -> bigint
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

        const active = await tx.payments.findFirst({
          where: {
            payment_link_id: link.id,
            status: { in: ACTIVE_STATUSES },
            btc_expires_at: { gt: now },
          },
          orderBy: { created_at: "desc" },
          select: { id: true },
        });

        if (active?.id) {
          return { paymentId: active.id, reused: true };
        }

        const created = await tx.payments.create({
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
            btc_required_confirmations: getRequiredConfirmations(),
            btc_expires_at: expiresAt,

            btc_fx_rate: fx.rate,
            btc_rate_locked_at: now,
            btc_rate_provider: fx.provider,
          },
          select: { id: true },
        });

        return { paymentId: created.id, reused: false };
      });

      paymentId = result.paymentId;
      reused = result.reused;
      break;
    } catch (err) {
      if (!isRetryableTxError(err) || attempt === MAX_RETRIES) {
        throw err;
      }
    }
  }

  if (!paymentId) {
    return errorJson("BTC_INVOICE_CREATE_FAILED", 500);
  }

  return NextResponse.json(
    { success: true, data: { paymentId, reused } },
    { status: reused ? 200 : 201 }
  );
}
