"use client";

import { useState } from "react";
import Link from "next/link";
import type { PaymentRowVm, PaymentsListResponse } from "@/app/types/paymentTypes";
import { formatFiat, formatSats } from "@/app/helpers/btcPaymentLinkHelpers";
import { StatusBadge } from "./PaymentFilters";

type Props = {
  initialItems: PaymentRowVm[];
  initialNextCursor: string | null;
  searchString: string;   // passed from server so load-more includes current filters
};

export default function PaymentList({
  initialItems,
  initialNextCursor,
  searchString,
}: Props) {
  const [items, setItems] = useState<PaymentRowVm[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const base = searchString ? `${searchString}&` : "";
      const res = await fetch(`/api/payments?${base}cursor=${nextCursor}`, {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as PaymentsListResponse;
      if (data.success) {
        setItems((prev) => [...prev, ...data.items]);
        setNextCursor(data.nextCursor);
      }
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <p style={{ color: "#6b7280", fontSize: 14, marginTop: 24 }}>
        No payments found.
      </p>
    );
  }

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
              <Th>Date</Th>
              <Th>Product</Th>
              <Th>Amount</Th>
              <Th>BTC expected</Th>
              <Th>BTC received</Th>
              <Th>Status</Th>
              <Th>Confs</Th>
              <Th>Expires</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <PaymentRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            style={{
              padding: "6px 16px",
              fontSize: 13,
              border: "1px solid #d1d5db",
              borderRadius: 6,
              background: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              color: "#374151",
            }}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th style={{ padding: "6px 12px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
}

function Td({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: "8px 12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle", ...style }}>
      {children}
    </td>
  );
}

function PaymentRow({ row }: { row: PaymentRowVm }) {
  const locale = "en-US";

  const fiatLabel = (() => {
    try {
      return formatFiat(row.fiatAmountCents, row.currency, locale);
    } catch {
      return `${row.currency} ${(row.fiatAmountCents / 100).toFixed(2)}`;
    }
  })();

  const btcExpected = row.btcAmountSats != null
    ? `${formatSats(BigInt(row.btcAmountSats))} sats`
    : "—";

  const btcReceived = `${formatSats(BigInt(row.btcReceivedSats))} sats`;

  const expiresLabel = row.btcExpiresAt
    ? new Date(row.btcExpiresAt).toLocaleDateString(locale, {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

  const dateLabel = new Date(row.createdAt).toLocaleDateString(locale, {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <tr style={{ transition: "background 0.1s" }}>
      <Td><span style={{ color: "#6b7280", whiteSpace: "nowrap" }}>{dateLabel}</span></Td>
      <Td>{row.productTitle ?? <span style={{ color: "#9ca3af" }}>—</span>}</Td>
      <Td><strong>{fiatLabel}</strong></Td>
      <Td><code style={{ fontSize: 12 }}>{btcExpected}</code></Td>
      <Td><code style={{ fontSize: 12 }}>{btcReceived}</code></Td>
      <Td><StatusBadge status={row.status} /></Td>
      <Td style={{ textAlign: "center" }}>
        {row.btcAmountSats != null
          ? `${row.btcConfirmations}/${row.btcRequiredConfirmations}`
          : "—"}
      </Td>
      <Td><span style={{ fontSize: 12, color: "#6b7280" }}>{expiresLabel}</span></Td>
      <Td>
        <Link
          href={`/payments/${row.id}`}
          style={{ color: "#2563eb", fontSize: 12, whiteSpace: "nowrap" }}
        >
          View →
        </Link>
      </Td>
    </tr>
  );
}
