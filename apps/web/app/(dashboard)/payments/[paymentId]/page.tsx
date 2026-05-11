import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { formatFiat, formatSats } from "@/app/helpers/btcPaymentLinkHelpers";

export const metadata: Metadata = { title: "Payment Detail" };

export const dynamic = "force-dynamic";

type DetailData = {
  id: string;
  status: string;
  title: string | null;
  message: string | null;
  fiatAmountCents: number;
  currency: string;
  btcAmountSats: string | null;
  btcReceivedSats: string;
  btcRemainingSats: string;
  btcOverpaidSats: string;
  btcAddress: string | null;
  btcNetwork: string | null;
  btcExpiresAt: string | null;
  btcRateLockedAt: string | null;
  btcFxRateBtcPerFiat: string | null;
  btcRateProvider: string | null;
  btcConfirmations: number;
  btcRequiredConfirmations: number;
  btcTxid: string | null;
  btcDetectedAt: string | null;
  paymentLinkToken: string | null;
};

type Props = {
  params: Promise<{ paymentId: string }>;
};

async function fetchDetail(
  paymentId: string,
  baseUrl: string,
  cookie: string
): Promise<{ success: boolean; data?: DetailData }> {
  const res = await fetch(`${baseUrl}/api/payments/${paymentId}`, {
    method: "GET",
    headers: { cookie },
    cache: "no-store",
  });
  if (!res.ok) return { success: false };
  return res.json();
}

export default async function PaymentDetailPage({ params }: Props) {
  const { paymentId } = await params;

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "development" ? "http" : "https";
  const baseUrl = `${proto}://${host}`;
  const cookie = h.get("cookie") ?? "";

  const result = await fetchDetail(paymentId, baseUrl, cookie);

  if (!result.success || !result.data) {
    notFound();
  }

  const p = result.data;
  const locale = "en-US";

  const fiatLabel = (() => {
    try {
      return formatFiat(p.fiatAmountCents, p.currency, locale);
    } catch {
      return `${p.currency} ${(p.fiatAmountCents / 100).toFixed(2)}`;
    }
  })();

  const btcExpected = p.btcAmountSats
    ? `${formatSats(BigInt(p.btcAmountSats))} sats`
    : "—";
  const btcReceived = `${formatSats(BigInt(p.btcReceivedSats))} sats`;
  const btcRemaining = `${formatSats(BigInt(p.btcRemainingSats))} sats`;
  const btcOverpaid = BigInt(p.btcOverpaidSats) > 0n
    ? `${formatSats(BigInt(p.btcOverpaidSats))} sats`
    : null;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px", fontFamily: "sans-serif" }}>
      <Link
        href="/payments"
        style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}
      >
        ← Back to payments
      </Link>

      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginTop: 16, marginBottom: 4 }}>
        {p.title ?? "Payment"}
      </h1>
      <p style={{ fontSize: 12, color: "#9ca3af", margin: 0, fontFamily: "monospace" }}>{p.id}</p>

      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 0 }}>
        <Field label="Status">
          <StatusBadge status={p.status} />
        </Field>
        <Field label="Fiat amount">{fiatLabel}</Field>
        {p.title && <Field label="Product">{p.title}</Field>}
        {p.message && <Field label="Message" mono>{p.message}</Field>}

        <Divider />

        <Field label="BTC expected">{btcExpected}</Field>
        <Field label="BTC received">{btcReceived}</Field>
        <Field label="BTC remaining">{btcRemaining}</Field>
        {btcOverpaid && (
          <Field label="BTC overpaid" warn>{btcOverpaid}</Field>
        )}
        <Field label="Confirmations">
          {p.btcAmountSats
            ? `${p.btcConfirmations} / ${p.btcRequiredConfirmations}`
            : "—"}
        </Field>

        <Divider />

        <Field label="BTC address" mono>{p.btcAddress ?? "—"}</Field>
        <Field label="Network">{p.btcNetwork ?? "—"}</Field>
        <Field label="Txid" mono>{p.btcTxid ?? "—"}</Field>
        <Field label="Detected at">
          {p.btcDetectedAt
            ? new Date(p.btcDetectedAt).toLocaleString(locale)
            : "—"}
        </Field>

        <Divider />

        <Field label="Expires at">
          {p.btcExpiresAt ? new Date(p.btcExpiresAt).toLocaleString(locale) : "—"}
        </Field>
        <Field label="Rate locked at">
          {p.btcRateLockedAt ? new Date(p.btcRateLockedAt).toLocaleString(locale) : "—"}
        </Field>
        <Field label="FX rate (BTC/fiat)">{p.btcFxRateBtcPerFiat ?? "—"}</Field>
        <Field label="Rate provider">{p.btcRateProvider ?? "—"}</Field>

        {p.paymentLinkToken && (
          <>
            <Divider />
            <Field label="Payment link token" mono>{p.paymentLinkToken}</Field>
            <Field label="Payer invoice">
              <Link
                href={`/pay/${p.id}`}
                style={{ color: "#2563eb", fontSize: 13 }}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open invoice ↗
              </Link>
            </Field>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  mono,
  warn,
  children,
}: {
  label: string;
  mono?: boolean;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "160px 1fr",
      gap: 8,
      padding: "8px 0",
      borderBottom: "1px solid #f9fafb",
      alignItems: "start",
    }}>
      <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500, paddingTop: 1 }}>
        {label}
      </span>
      <span style={{
        fontSize: 13,
        color: warn ? "#c2410c" : "#111827",
        fontFamily: mono ? "monospace" : "inherit",
        wordBreak: "break-all",
      }}>
        {children}
      </span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 8 }} />;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    PENDING:          { bg: "#f3f4f6", color: "#374151" },
    AWAITING_PAYMENT: { bg: "#eff6ff", color: "#1d4ed8" },
    SEEN_IN_MEMPOOL:  { bg: "#fefce8", color: "#92400e" },
    CONFIRMING:       { bg: "#fff7ed", color: "#c2410c" },
    CONFIRMED:        { bg: "#f0fdf4", color: "#15803d" },
    EXPIRED:          { bg: "#f9fafb", color: "#9ca3af" },
    FAILED:           { bg: "#fef2f2", color: "#dc2626" },
  };
  const c = colors[status] ?? { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{
      display: "inline-block",
      background: c.bg,
      color: c.color,
      borderRadius: 4,
      padding: "2px 8px",
      fontSize: 12,
      fontWeight: 600,
    }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
