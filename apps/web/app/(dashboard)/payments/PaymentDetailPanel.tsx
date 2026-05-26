"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatFiat, formatSats } from "@/app/helpers/btcPaymentLinkHelpers";
import { StatusBadge } from "./PaymentFilters";
import type { DetailData } from "./page";

export function PaymentDetailPanel({ data: p }: { data: DetailData }) {
  const router = useRouter();
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
  const btcOverpaid =
    BigInt(p.btcOverpaidSats) > 0n
      ? `${formatSats(BigInt(p.btcOverpaidSats))} sats`
      : null;

  return (
    <aside className="fp-detail-panel">
      {/* Sticky header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "#fff",
          zIndex: 1,
          padding: "14px 20px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
          Details
        </span>
        <button
          type="button"
          onClick={() => router.push("/payments")}
          aria-label="Close"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 6,
            color: "#6b7280",
            display: "flex",
            alignItems: "center",
          }}
        >
          <svg
            width="16"
            height="16"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 20px" }}>
        {/* Title + ID */}
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#111827",
              margin: "0 0 4px",
            }}
          >
            {p.title ?? "Payment"}
          </h2>
          <span
            style={{
              fontSize: 11,
              color: "#9ca3af",
              fontFamily: "monospace",
            }}
          >
            {p.id}
          </span>
        </div>

        {/* Field rows */}
        <PanelField label="Status">
          <StatusBadge status={p.status} />
        </PanelField>
        <PanelField label="Fiat amount">{fiatLabel}</PanelField>
        {p.message && <PanelField label="Message">{p.message}</PanelField>}

        <PanelDivider />

        <PanelField label="BTC expected">{btcExpected}</PanelField>
        <PanelField label="BTC received">{btcReceived}</PanelField>
        <PanelField label="BTC remaining">{btcRemaining}</PanelField>
        {btcOverpaid && (
          <PanelField label="BTC overpaid" warn>
            {btcOverpaid}
          </PanelField>
        )}
        <PanelField label="Confirmations">
          {p.btcAmountSats
            ? `${p.btcConfirmations} / ${p.btcRequiredConfirmations}`
            : "—"}
        </PanelField>

        <PanelDivider />

        <PanelField label="BTC address" mono>{p.btcAddress ?? "—"}</PanelField>
        <PanelField label="Network">{p.btcNetwork ?? "—"}</PanelField>
        <PanelField label="Txid" mono>{p.btcTxid ?? "—"}</PanelField>
        <PanelField label="Detected at">
          {p.btcDetectedAt
            ? new Date(p.btcDetectedAt).toLocaleString(locale)
            : "—"}
        </PanelField>

        <PanelDivider />

        <PanelField label="Expires at">
          {p.btcExpiresAt
            ? new Date(p.btcExpiresAt).toLocaleString(locale)
            : "—"}
        </PanelField>
        <PanelField label="Rate locked at">
          {p.btcRateLockedAt
            ? new Date(p.btcRateLockedAt).toLocaleString(locale)
            : "—"}
        </PanelField>
        <PanelField label="FX rate">{p.btcFxRateBtcPerFiat ?? "—"}</PanelField>
        <PanelField label="Rate provider">{p.btcRateProvider ?? "—"}</PanelField>

        {p.paymentLinkToken && (
          <>
            <PanelDivider />
            <PanelField label="Invoice">
              <Link
                href={`/pay/${p.id}`}
                style={{ color: "#2563eb", fontSize: 13 }}
              >
                Open invoice →
              </Link>
            </PanelField>
          </>
        )}
      </div>
    </aside>
  );
}

function PanelField({
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "130px 1fr",
        gap: 8,
        padding: "7px 0",
        borderBottom: "1px solid #f9fafb",
        alignItems: "start",
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "#6b7280",
          fontWeight: 500,
          paddingTop: 1,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: warn ? "#c2410c" : "#111827",
          fontFamily: mono ? "monospace" : "inherit",
          wordBreak: "break-all",
        }}
      >
        {children}
      </span>
    </div>
  );
}

function PanelDivider() {
  return <div style={{ height: 8 }} />;
}
