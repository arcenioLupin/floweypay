import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { formatFiat, formatSats } from "@/app/helpers/btcPaymentLinkHelpers";
import { StatusBadge } from "../PaymentFilters";
import { T } from "@/app/lib/i18n/T";

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
    <div
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "28px 24px",
        fontFamily: "sans-serif",
      }}
    >
      {/* Back link */}
      <Link
        href="/payments"
        style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}
      >
        <T k="detail.backToPayments" />
      </Link>

      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginTop: 16, marginBottom: 4 }}>
        {p.title ?? <T k="detail.payment" />}
      </h1>
      <p style={{ fontSize: 12, color: "#9ca3af", margin: 0, fontFamily: "monospace" }}>{p.id}</p>

      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 0 }}>
        <Field label={<T k="detail.status" />}>
          <StatusBadge status={p.status} />
        </Field>
        <Field label={<T k="detail.fiatAmount" />}>{fiatLabel}</Field>
        {p.title && <Field label={<T k="detail.product" />}>{p.title}</Field>}
        {p.message && <Field label={<T k="detail.message" />} mono>{p.message}</Field>}

        <Divider />

        <Field label={<T k="detail.btcExpected" />}>{btcExpected}</Field>
        <Field label={<T k="detail.btcReceived" />}>{btcReceived}</Field>
        <Field label={<T k="detail.btcRemaining" />}>{btcRemaining}</Field>
        {btcOverpaid && (
          <Field label={<T k="detail.btcOverpaid" />} warn>{btcOverpaid}</Field>
        )}
        <Field label={<T k="detail.confirmations" />}>
          {p.btcAmountSats
            ? `${p.btcConfirmations} / ${p.btcRequiredConfirmations}`
            : "—"}
        </Field>

        <Divider />

        <Field label={<T k="detail.btcAddress" />} mono>{p.btcAddress ?? "—"}</Field>
        <Field label={<T k="detail.network" />}>{p.btcNetwork ?? "—"}</Field>
        <Field label={<T k="detail.txid" />} mono>{p.btcTxid ?? "—"}</Field>
        <Field label={<T k="detail.detectedAt" />}>
          {p.btcDetectedAt
            ? new Date(p.btcDetectedAt).toLocaleString(locale)
            : "—"}
        </Field>

        <Divider />

        <Field label={<T k="detail.expiresAt" />}>
          {p.btcExpiresAt ? new Date(p.btcExpiresAt).toLocaleString(locale) : "—"}
        </Field>
        <Field label={<T k="detail.rateLockedAt" />}>
          {p.btcRateLockedAt ? new Date(p.btcRateLockedAt).toLocaleString(locale) : "—"}
        </Field>
        <Field label={<T k="detail.fxRateFull" />}>{p.btcFxRateBtcPerFiat ?? "—"}</Field>
        <Field label={<T k="detail.rateProvider" />}>{p.btcRateProvider ?? "—"}</Field>

        {p.paymentLinkToken && (
          <>
            <Divider />
            <Field label={<T k="detail.paymentLinkToken" />} mono>{p.paymentLinkToken}</Field>
            <Field label={<T k="detail.payerInvoice" />}>
              <Link
                href={`/pay/${p.id}`}
                style={{ color: "#2563eb", fontSize: 13 }}
              >
                <T k="detail.openInvoice" />
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
  label: React.ReactNode;
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
