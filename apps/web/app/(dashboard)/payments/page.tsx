import { Suspense } from "react";
import { headers } from "next/headers";
import type { Metadata } from "next";
import type { PaymentsListResponse } from "@/app/types/paymentTypes";
import PaymentList from "./PaymentList";
import PaymentFilters from "./PaymentFilters";
import { PaymentDetailPanel } from "./PaymentDetailPanel";

export const metadata: Metadata = { title: "Payments" };

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[]>>;
};

// ─── Shared detail type (matches /api/payments/[id] response) ─────────────

export type DetailData = {
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

async function fetchPayments(
  searchString: string,
  baseUrl: string
): Promise<PaymentsListResponse> {
  const url = searchString
    ? `${baseUrl}/api/payments?${searchString}`
    : `${baseUrl}/api/payments`;

  const h = await headers();
  const cookie = h.get("cookie") ?? "";

  const res = await fetch(url, {
    method: "GET",
    headers: { cookie },
    cache: "no-store",
  });

  if (!res.ok) {
    return { success: true, items: [], nextCursor: null };
  }

  return res.json() as Promise<PaymentsListResponse>;
}

async function fetchDetail(
  paymentId: string,
  baseUrl: string,
  cookie: string
): Promise<DetailData | null> {
  const res = await fetch(`${baseUrl}/api/payments/${paymentId}`, {
    method: "GET",
    headers: { cookie },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { success: boolean; data?: DetailData };
  return data.success && data.data ? data.data : null;
}

export default async function PaymentsPage({ searchParams }: Props) {
  const sp = await searchParams;

  // Extract selected detail ID (do not pass to payments API)
  const selectedId =
    typeof sp.detail === "string" && sp.detail.length > 0 ? sp.detail : null;

  // Build filter search string (excluding 'detail' and 'cursor')
  const p = new URLSearchParams();
  for (const [key, val] of Object.entries(sp)) {
    if (key === "detail" || key === "cursor") continue;
    if (Array.isArray(val)) {
      val.forEach((v) => p.append(key, v));
    } else {
      p.set(key, val);
    }
  }
  const searchString = p.toString();

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "development" ? "http" : "https";
  const baseUrl = `${proto}://${host}`;
  const cookie = h.get("cookie") ?? "";

  const [data, detail] = await Promise.all([
    fetchPayments(searchString, baseUrl),
    selectedId ? fetchDetail(selectedId, baseUrl, cookie) : Promise.resolve(null),
  ]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        fontFamily: "sans-serif",
      }}
    >
      {/* ── Left: list ──────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, padding: "28px 24px" }}>
        <header style={{ marginBottom: 20 }}>
          <h1
            style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}
          >
            Payments
          </h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            {data.items.length} record{data.items.length !== 1 ? "s" : ""} shown
            {data.nextCursor ? " · more available" : ""}
          </p>
        </header>

        {/* Filters need useSearchParams — wrap in Suspense */}
        <Suspense fallback={null}>
          <PaymentFilters />
        </Suspense>

        <PaymentList
          key={searchString}
          initialItems={data.items}
          initialNextCursor={data.nextCursor}
          searchString={searchString}
        />
      </div>

      {/* ── Right: detail panel (desktop only, inline) ── */}
      {detail && <PaymentDetailPanel data={detail} />}
    </div>
  );
}
