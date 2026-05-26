import { Suspense } from "react";
import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { KpiCard } from "./components/KpiCard";
import { DailyChart } from "./components/DailyChart";
import { DashboardDateFilters } from "./components/DashboardDateFilters";
import { formatSats } from "@/app/helpers/btcPaymentLinkHelpers";
import type { DashboardStats } from "@/app/api/dashboard/stats/route";
import type { DailyChartRow } from "@/app/api/dashboard/chart/daily/route";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[]>>;
};

// ─── Fetchers ────────────────────────────────────────────────────────────────

async function fetchStats(
  qs: string,
  baseUrl: string,
  cookie: string
): Promise<DashboardStats | null> {
  const url = qs
    ? `${baseUrl}/api/dashboard/stats?${qs}`
    : `${baseUrl}/api/dashboard/stats`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { success: boolean; stats: DashboardStats };
    return data.success ? data.stats : null;
  } catch {
    return null;
  }
}

async function fetchDailyChart(
  qs: string,
  baseUrl: string,
  cookie: string
): Promise<DailyChartRow[]> {
  const url = qs
    ? `${baseUrl}/api/dashboard/chart/daily?${qs}`
    : `${baseUrl}/api/dashboard/chart/daily`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { success: boolean; days: DailyChartRow[] };
    return data.success ? (data.days ?? []) : [];
  } catch {
    return [];
  }
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** Format an integer cent value as a plain decimal string (e.g. 123456 → "1,234.56"). */
function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage({ searchParams }: Props) {
  const sp = await searchParams;

  // Rebuild query string from searchParams (excluding cursor, page-specific keys).
  const p = new URLSearchParams();
  for (const [key, val] of Object.entries(sp)) {
    if (Array.isArray(val)) {
      val.forEach((v) => p.append(key, v));
    } else {
      p.set(key, val);
    }
  }
  const qs = p.toString();

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "development" ? "http" : "https";
  const baseUrl = `${proto}://${host}`;
  const cookie = h.get("cookie") ?? "";

  const [stats, days] = await Promise.all([
    fetchStats(qs, baseUrl, cookie),
    fetchDailyChart(qs, baseUrl, cookie),
  ]);

  // Derived display values — all safe to compute with null stats.
  const confirmedRevenue = stats
    ? formatCents(stats.confirmedRevenueCents)
    : "—";
  const confirmedSats =
    stats != null
      ? `${formatSats(BigInt(stats.confirmedBtcReceivedSats))} sats`
      : "—";
  const conversionLabel = stats ? formatPercent(stats.conversionRate) : "—";
  const conversionSub =
    stats && stats.totalStarted > 0
      ? `${stats.confirmedPaymentsCount} of ${stats.totalStarted} started`
      : undefined;

  return (
    <div
      style={{
        padding: "28px 32px",
        fontFamily: "sans-serif",
      }}
    >
      {/* Header ------------------------------------------------------------ */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#111827",
              margin: 0,
            }}
          >
            Overview
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "#6b7280",
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            BTC on-chain payment metrics
          </p>
        </div>

        {/* Date filters — client component, needs Suspense */}
        <Suspense fallback={null}>
          <DashboardDateFilters />
        </Suspense>
      </header>

      {/* KPI Cards ---------------------------------------------------------- */}
      <div className="fp-kpi-grid">
        <KpiCard
          label="Confirmed Revenue"
          value={confirmedRevenue}
          sub="fiat · cents ÷ 100"
          accent
        />
        <KpiCard
          label="Confirmed Payments"
          value={stats?.confirmedPaymentsCount ?? "—"}
        />
        <KpiCard
          label="BTC Received"
          value={confirmedSats}
          sub="confirmed only"
        />
        <KpiCard
          label="Active Invoices"
          value={stats?.activeInvoicesCount ?? "—"}
          sub="awaiting · mempool · confirming"
        />
        <KpiCard
          label="Expired"
          value={stats?.expiredPaymentsCount ?? "—"}
        />
        <KpiCard
          label="Conversion Rate"
          value={conversionLabel}
          sub={conversionSub}
        />
      </div>

      {/* Daily Chart -------------------------------------------------------- */}
      <div style={{ marginBottom: 32 }}>
        <DailyChart days={days} />
      </div>

      {/* Payments link ------------------------------------------------------ */}
      <div
        style={{
          borderTop: "1px solid #f3f4f6",
          paddingTop: 20,
        }}
      >
        <Link
          href="/payments"
          style={{ fontSize: 14, color: "#2563eb", fontWeight: 500 }}
        >
          View all payments →
        </Link>
      </div>
    </div>
  );
}
