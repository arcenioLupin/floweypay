import { Suspense } from "react";
import { headers } from "next/headers";
import type { Metadata } from "next";
import type { PaymentsListResponse } from "@/app/types/paymentTypes";
import PaymentList from "./PaymentList";
import PaymentFilters from "./PaymentFilters";

export const metadata: Metadata = { title: "Payments" };

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[]>>;
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

export default async function PaymentsPage({ searchParams }: Props) {
  const sp = await searchParams;

  // Reconstruct search string from searchParams (server-side)
  const p = new URLSearchParams();
  for (const [key, val] of Object.entries(sp)) {
    if (Array.isArray(val)) {
      val.forEach((v) => p.append(key, v));
    } else {
      p.set(key, val);
    }
  }
  // Remove cursor from server-render params (first page)
  p.delete("cursor");
  const searchString = p.toString();

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "development" ? "http" : "https";
  const baseUrl = `${proto}://${host}`;

  const data = await fetchPayments(searchString, baseUrl);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px", fontFamily: "sans-serif" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
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
  );
}
