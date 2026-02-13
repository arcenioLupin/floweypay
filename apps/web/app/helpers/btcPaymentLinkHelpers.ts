import { BtcNetwork, PaymentLinkVM, PaymentStatus, InvoiceVm } from "@/app/types/paymentTypes";

const pad2 = (n: number) => String(n).padStart(2, "0");

export function formatCountdown(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${pad2(mm)}:${pad2(ss)}`;
}

export function formatFiat(amountCents: number, currency: string, locale: string) {
  const amount = amountCents / 100;
  const cur = (currency ?? "USD").trim().toUpperCase();

  try {
    const s = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cur,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

    return s.replace(/\u00A0/g, " ");
  } catch {
    return `${cur} ${amount.toFixed(2)}`;
  }
}

export function satsToBtcString(sats: bigint) {
  const BTC_SATS = 100_000_000n;
  const intPart = sats / BTC_SATS;
  const fracPart = sats % BTC_SATS;
  return `${intPart}.${fracPart.toString().padStart(8, "0")}`;
}

export function formatSats(sats: bigint) {
  const s = sats.toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function statusStepIndex(status: PaymentStatus) {
  switch (status) {
    case "AWAITING_PAYMENT":
      return 1;
    case "SEEN_IN_MEMPOOL":
      return 2;
    case "CONFIRMING":
      return 3;
    case "CONFIRMED":
      return 4;
    case "EXPIRED":
    case "FAILED":
      return 0;
    default:
      return 1;
  }
}

export function networkKey(n: BtcNetwork) {
  return `network_${n}`;
}

export function buildBitcoinUri(address: string, sats: bigint) {
  const btcAmountBtc = satsToBtcString(sats);
  return `bitcoin:${address}?amount=${btcAmountBtc}`;
}

export function formatExpiresLabel(iso: string, locale: string) {
  const d = new Date(iso);

  const s = new Intl.DateTimeFormat(locale, {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);

  return s.replace(/\u00A0/g, " ");
}

function normalizeStatus(raw: string): PaymentStatus {
  const s = (raw ?? "").toUpperCase().trim();

  const allowed: PaymentStatus[] = [
    "AWAITING_PAYMENT",
    "SEEN_IN_MEMPOOL",
    "CONFIRMING",
    "CONFIRMED",
    "EXPIRED",
    "FAILED",
    // 👇 opcional recomendado: si tu API puede devolverlo
    // "PENDING",
  ];

  if ((allowed as string[]).includes(s)) return s as PaymentStatus;

  if (process.env.NODE_ENV !== "production") {
    throw new Error(`PAYMENT_STATUS_INVALID:${s}`);
  }

  return "AWAITING_PAYMENT";
}

function normalizeNetwork(raw: string): BtcNetwork {
  const s = (raw ?? "").toUpperCase().trim();
  const allowed: BtcNetwork[] = ["MAINNET", "TESTNET", "SIGNET", "REGTEST"];

  if ((allowed as string[]).includes(s)) return s as BtcNetwork;

  if (process.env.NODE_ENV !== "production") {
    throw new Error(`BTC_NETWORK_INVALID:${s}`);
  }

  return "SIGNET";
}


function parseSatsToBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("INVALID_SATS");
    if (!Number.isInteger(value)) throw new Error("INVALID_SATS");
    if (value < 0) throw new Error("INVALID_SATS");
    return BigInt(value);
  }

  if (typeof value === "string") {
    const s = value.trim().replace(/,/g, ""); // por si viene "345,678"
    if (!/^\d+$/.test(s)) throw new Error("INVALID_SATS");
    return BigInt(s);
  }

  throw new Error("INVALID_SATS");
}



/**
 * Mapea lo que devuelve el API (InvoiceVm) al VM que usa la UI (PaymentLinkVM).
 * Si faltan campos críticos, lanzamos error para que el hook marque "error".
 */
export function invoiceToPaymentLinkVM(inv: InvoiceVm): PaymentLinkVM {
  if (!inv?.id) throw new Error("INVOICE_INVALID");
  if (inv.fiatAmountCents == null) throw new Error("INVOICE_INVALID");

  // ✅ 1) Normalizar currency (y validar)
  const currency = inv.currency?.trim().toUpperCase();
  if (!currency) throw new Error("INVOICE_INVALID");

  if (!inv.btcAmountSats) throw new Error("INVOICE_MISSING_BTC");
  if (!inv.btcAddress) throw new Error("INVOICE_MISSING_BTC");
  if (!inv.btcNetwork) throw new Error("INVOICE_MISSING_BTC");
  if (!inv.btcExpiresAt) throw new Error("INVOICE_MISSING_EXPIRES");

  // ✅ 2) Validar que btcExpiresAt sea una fecha parseable
  if (Number.isNaN(Date.parse(inv.btcExpiresAt))) {
    throw new Error("INVOICE_MISSING_EXPIRES");
  }

  return {
    id: inv.id,
    title: inv.title ?? undefined,
    message: inv.message ?? undefined,

    fiatAmountCents: inv.fiatAmountCents,
    currency, // ✅ usar la normalizada

    btcAmountSats: parseSatsToBigInt(inv.btcAmountSats),
    btcAddress: inv.btcAddress,
    btcNetwork: normalizeNetwork(inv.btcNetwork),

    btcExpiresAt: inv.btcExpiresAt,
    btcRateLockedAt: inv.btcRateLockedAt ?? undefined,
    btcFxRateBtcPerFiat: inv.btcFxRateBtcPerFiat ?? undefined,
    btcRateProvider: inv.btcRateProvider ?? undefined,

    status: normalizeStatus(inv.status),
    btcConfirmations: inv.btcConfirmations ?? 0,
    btcRequiredConfirmations: inv.btcRequiredConfirmations ?? 1,

    btcTxid: inv.btcTxid ?? undefined,
    btcDetectedAt: inv.btcDetectedAt ?? undefined,
    paymentLinkToken: inv.paymentLinkToken ?? undefined,
  };
}

